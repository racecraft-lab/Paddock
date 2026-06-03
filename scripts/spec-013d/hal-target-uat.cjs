#!/usr/bin/env node

const path = require('node:path')
const { createHash, randomBytes } = require('node:crypto')

const DB_PATH = process.env.PADDOCK_DB_PATH || '/home/fredrick-gabelmann/paddock-data/paddock.db'
const APP_ROOT = process.env.PADDOCK_APP_ROOT || '/home/fredrick-gabelmann/paddock'
const BASE_URL = process.env.PADDOCK_BASE_URL || 'http://127.0.0.1:3000'
const Database = require(path.join(APP_ROOT, 'node_modules/better-sqlite3'))
const STAGE_KEY = 'assigned_dispatch'
const RUN_ID = process.env.SPEC_013D_UAT_RUN_ID || new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const MARKER = `SPEC-013D-HAL-UAT-${RUN_ID}`
const NOW = Math.floor(Date.now() / 1000)
const NOW_ISO = new Date().toISOString()

const scenarios = [
  'retry',
  'release',
  'cancel',
  'stale',
  'flag-off',
  'backoff',
]

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields }))
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
}

function columnExists(db, tableName, columnName) {
  try {
    return (db.prepare(`PRAGMA table_info(${tableName})`).all()).some((column) => column.name === columnName)
  } catch {
    return false
  }
}

function legacySessionHash(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

async function request(auth, method, route, body, idempotencyKey) {
  const headers = {
    'accept': 'application/json',
  }
  if (auth?.kind === 'session') {
    headers.cookie = `mc-session=${encodeURIComponent(auth.token)}`
  } else if (auth?.apiKey) {
    headers['x-api-key'] = auth.apiKey
  }
  const init = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey
  const response = await fetch(`${BASE_URL}${route}`, init)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { parse_error: true, text: text.slice(0, 200) }
  }
  return { status: response.status, json }
}

function assert(condition, message, detail) {
  if (!condition) {
    const suffix = detail === undefined ? '' : `: ${JSON.stringify(detail)}`
    throw new Error(`${message}${suffix}`)
  }
}

function action(readModel, action) {
  return readModel?.claim_control?.available_actions?.find((item) => item.action === action)
}

function expectedState(readModel) {
  const expected = readModel?.claim_control?.expected_state
  assert(expected && typeof expected === 'object', 'missing expected_state', readModel)
  return expected
}

function sanitized(value) {
  const text = JSON.stringify(value)
  return !text.includes('API_KEY=')
    && !text.includes('AUTH_SECRET=')
    && !text.includes('op://')
    && !text.includes('OPENCLAW_GATEWAY_TOKEN')
}

function insertWorkspace(db, defaultWorkspace) {
  const slug = `spec-013d-hal-uat-${RUN_ID.toLowerCase()}`
  const flags = JSON.stringify({
    FEATURE_WORKSPACE_SWITCHER: true,
    FEATURE_TASK_CONTROL_PLANE: true,
  })
  const columns = ['slug', 'name', 'tenant_id', 'created_at', 'updated_at']
  const values = [slug, `SPEC-013D HAL UAT ${RUN_ID}`, defaultWorkspace.tenant_id, NOW, NOW]
  if (columnExists(db, 'workspaces', 'feature_flags')) {
    columns.splice(3, 0, 'feature_flags')
    values.splice(3, 0, flags)
  }
  const placeholders = columns.map(() => '?').join(', ')
  const result = db.prepare(`INSERT INTO workspaces (${columns.join(', ')}) VALUES (${placeholders})`).run(...values)
  return { id: Number(result.lastInsertRowid), slug, flags }
}

function insertTemporaryOperatorSession(db, workspaceId, tenantId) {
  assert(tableExists(db, 'users'), 'users table not found')
  assert(tableExists(db, 'user_sessions'), 'user_sessions table not found')

  const username = `${MARKER.toLowerCase()}-operator`
  const userColumns = ['username', 'display_name', 'password_hash', 'role', 'workspace_id', 'created_at', 'updated_at']
  const userValues = [
    username,
    `${MARKER} Operator`,
    `${MARKER}-not-a-login-password-hash`,
    'operator',
    workspaceId,
    NOW,
    NOW,
  ]
  if (columnExists(db, 'users', 'provider')) {
    userColumns.push('provider')
    userValues.push('local')
  }
  if (columnExists(db, 'users', 'is_approved')) {
    userColumns.push('is_approved')
    userValues.push(1)
  }
  const user = db.prepare(`
    INSERT INTO users (${userColumns.join(', ')})
    VALUES (${userColumns.map(() => '?').join(', ')})
  `).run(...userValues)
  const userId = Number(user.lastInsertRowid)

  const token = randomBytes(32).toString('hex')
  const sessionColumns = ['token', 'user_id', 'expires_at', 'created_at', 'workspace_id']
  const sessionValues = [legacySessionHash(token), userId, NOW + 3600, NOW, workspaceId]
  if (columnExists(db, 'user_sessions', 'tenant_id')) {
    sessionColumns.push('tenant_id')
    sessionValues.push(tenantId)
  }
  if (columnExists(db, 'user_sessions', 'ip_address')) {
    sessionColumns.push('ip_address')
    sessionValues.push('127.0.0.1')
  }
  if (columnExists(db, 'user_sessions', 'user_agent')) {
    sessionColumns.push('user_agent')
    sessionValues.push(MARKER)
  }
  const session = db.prepare(`
    INSERT INTO user_sessions (${sessionColumns.join(', ')})
    VALUES (${sessionColumns.map(() => '?').join(', ')})
  `).run(...sessionValues)
  return { kind: 'session', userId, sessionId: Number(session.lastInsertRowid), token }
}

function insertProject(db, workspaceId, scenario) {
  const repo = `racecraft-lab/spec-013d-hal-${RUN_ID}-${scenario.replace(/[^a-z0-9]/gi, '')}`
  const slug = `spec-013d-hal-${RUN_ID}-${scenario.replace(/[^a-z0-9]/gi, '')}`
  const result = db.prepare(`
    INSERT INTO projects (
      workspace_id, name, slug, ticket_prefix, ticket_counter, github_repo,
      github_sync_enabled, is_repo_sync_owner, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, 1, 1, 'active', ?, ?)
  `).run(
    workspaceId,
    `${MARKER} ${scenario}`,
    slug,
    `U${String(scenario.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()).padEnd(3, 'X')}`,
    repo,
    NOW,
    NOW,
  )
  return { id: Number(result.lastInsertRowid), repo }
}

function insertTask(db, workspaceId, projectId, repo, scenario) {
  const result = db.prepare(`
    INSERT INTO tasks (
      title, description, status, priority, assigned_to, created_by,
      created_at, updated_at, tags, metadata, workspace_id, project_id,
      project_ticket_no, github_repo, github_issue_number, github_synced_at,
      workflow_template_slug
    ) VALUES (?, ?, 'assigned', 'high', 'hal-uat-operator', 'SPEC-013D',
      ?, ?, '[]', '{}', ?, ?, 1, ?, 72, ?, ?)
  `).run(
    `${MARKER} ${scenario}`,
    `${MARKER} disposable fixture for ${scenario}`,
    NOW,
    NOW,
    workspaceId,
    projectId,
    repo,
    NOW,
    STAGE_KEY,
  )
  return Number(result.lastInsertRowid)
}

function insertLifecycle(db, workspaceId, projectId, repo, scenario) {
  if (!tableExists(db, 'github_sync_lifecycle_controls')) return null
  const backoff = scenario === 'backoff'
  const result = db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, owner_project_id,
      next_retry_at, next_retry_reason, backoff_seconds,
      last_completed_at, total_successes, updated_at
    ) VALUES (?, ?, 1, 300, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    workspaceId,
    repo,
    projectId,
    backoff ? NOW + 900 : null,
    backoff ? `${MARKER} retry backoff active` : null,
    backoff ? 900 : 0,
    NOW,
    NOW,
  )
  return Number(result.lastInsertRowid)
}

function insertAttempt(db, workspaceId, taskId, scenario) {
  const failedRetry = scenario === 'backoff'
  const status = failedRetry ? 'failed' : 'running'
  const result = db.prepare(`
    INSERT INTO task_stage_attempts (
      workspace_id, task_id, stage_key, attempt_number, status,
      created_at, updated_at, started_at, completed_at, archived_at,
      run_id, workflow_template_id, workflow_template_slug, metadata_json
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
  `).run(
    workspaceId,
    taskId,
    STAGE_KEY,
    status,
    NOW_ISO,
    NOW_ISO,
    NOW_ISO,
    failedRetry ? NOW_ISO : null,
    `${MARKER}-${scenario}-run`,
    STAGE_KEY,
    JSON.stringify({ marker: MARKER, scenario }),
  )
  const attemptId = Number(result.lastInsertRowid)
  if (tableExists(db, 'task_stage_attempt_events')) {
    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, actor_type, actor_id, message, metadata_json
      ) VALUES (?, ?, ?, ?, 1, ?, ?, 'test', ?, ?, ?)
    `).run(
      attemptId,
      workspaceId,
      taskId,
      STAGE_KEY,
      status,
      NOW_ISO,
      MARKER,
      `${MARKER} ${scenario} ${status}`,
      JSON.stringify({ marker: MARKER, scenario }),
    )
  }
  return attemptId
}

function insertClaim(db, workspaceId, taskId, attemptId, scenario) {
  if (scenario === 'backoff') return null
  const result = db.prepare(`
    INSERT INTO task_stage_claims (
      workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state,
      lease_owner, claim_run_id, lease_started_at, lease_expires_at,
      release_reason, released_at, released_by_run_id, stale_recovered_from_claim_id,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
  `).run(
    workspaceId,
    taskId,
    STAGE_KEY,
    attemptId,
    'hal-uat-operator',
    `${MARKER}-${scenario}-run`,
    NOW,
    NOW + 3600,
    JSON.stringify({ marker: MARKER, scenario }),
    NOW,
    NOW,
  )
  return Number(result.lastInsertRowid)
}

function seedFixtures(db) {
  const defaultWorkspace = db.prepare(`
    SELECT id, tenant_id, feature_flags
    FROM workspaces
    ORDER BY CASE WHEN slug = 'default' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get()
  assert(defaultWorkspace?.id, 'default workspace not found')
  const workspace = insertWorkspace(db, defaultWorkspace)
  const auth = insertTemporaryOperatorSession(db, workspace.id, defaultWorkspace.tenant_id)
  const tasks = {}
  for (const scenario of scenarios) {
    const project = insertProject(db, workspace.id, scenario)
    const taskId = insertTask(db, workspace.id, project.id, project.repo, scenario)
    const lifecycleControlId = insertLifecycle(db, workspace.id, project.id, project.repo, scenario)
    const attemptId = insertAttempt(db, workspace.id, taskId, scenario)
    const claimId = insertClaim(db, workspace.id, taskId, attemptId, scenario)
    tasks[scenario] = { id: taskId, projectId: project.id, repo: project.repo, attemptId, claimId, lifecycleControlId }
  }
  return {
    defaultWorkspace: { id: defaultWorkspace.id },
    auth,
    workspace,
    tasks,
  }
}

function cleanup(db, fixture) {
  if (!fixture?.workspace?.id) {
    return { skipped: true }
  }
  const workspaceId = fixture.workspace.id
  const deletions = {}
  const deleteIfExists = (table, sql, params) => {
    if (!tableExists(db, table)) return
    deletions[table] = db.prepare(sql).run(...params).changes
  }

  deleteIfExists('task_claim_control_idempotency_keys', 'DELETE FROM task_claim_control_idempotency_keys WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('user_sessions', 'DELETE FROM user_sessions WHERE workspace_id = ? OR user_agent = ?', [workspaceId, MARKER])
  deleteIfExists('users', 'DELETE FROM users WHERE workspace_id = ? AND username = ?', [workspaceId, `${MARKER.toLowerCase()}-operator`])
  deleteIfExists('agent_api_keys', 'DELETE FROM agent_api_keys WHERE workspace_id = ? OR created_by = ?', [workspaceId, MARKER])
  deleteIfExists('task_stage_attempt_events', 'DELETE FROM task_stage_attempt_events WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('task_stage_claims', 'DELETE FROM task_stage_claims WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('task_stage_attempts', 'DELETE FROM task_stage_attempts WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('github_sync_lifecycle_runs', 'DELETE FROM github_sync_lifecycle_runs WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('github_sync_lifecycle_controls', 'DELETE FROM github_sync_lifecycle_controls WHERE workspace_id = ?', [workspaceId])
  deleteIfExists('activities', 'DELETE FROM activities WHERE workspace_id = ? OR data LIKE ?', [workspaceId, `%${MARKER}%`])
  deleteIfExists('tasks', 'DELETE FROM tasks WHERE workspace_id = ? OR title LIKE ?', [workspaceId, `%${MARKER}%`])
  deleteIfExists('projects', 'DELETE FROM projects WHERE workspace_id = ? OR slug LIKE ?', [workspaceId, `%${RUN_ID}%`])
  deleteIfExists('agents', 'DELETE FROM agents WHERE workspace_id = ? AND name = ?', [workspaceId, `${MARKER}-operator`])
  deleteIfExists('workspaces', 'DELETE FROM workspaces WHERE id = ? OR slug = ?', [workspaceId, fixture.workspace.slug])
  return deletions
}

function cleanupCounts(db, fixture) {
  if (!fixture?.workspace?.id) return {}
  const workspaceId = fixture.workspace.id
  const counts = {}
  const countIfExists = (table, sql, params) => {
    if (!tableExists(db, table)) return
    counts[table] = db.prepare(sql).get(...params).count
  }
  countIfExists('workspaces', 'SELECT COUNT(*) AS count FROM workspaces WHERE id = ? OR slug = ?', [workspaceId, fixture.workspace.slug])
  countIfExists('user_sessions', 'SELECT COUNT(*) AS count FROM user_sessions WHERE workspace_id = ? OR user_agent = ?', [workspaceId, MARKER])
  countIfExists('users', 'SELECT COUNT(*) AS count FROM users WHERE workspace_id = ? AND username = ?', [workspaceId, `${MARKER.toLowerCase()}-operator`])
  countIfExists('agents', 'SELECT COUNT(*) AS count FROM agents WHERE workspace_id = ? AND name = ?', [workspaceId, `${MARKER}-operator`])
  countIfExists('agent_api_keys', 'SELECT COUNT(*) AS count FROM agent_api_keys WHERE workspace_id = ? OR created_by = ?', [workspaceId, MARKER])
  countIfExists('projects', 'SELECT COUNT(*) AS count FROM projects WHERE workspace_id = ? OR slug LIKE ?', [workspaceId, `%${RUN_ID}%`])
  countIfExists('tasks', 'SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ? OR title LIKE ?', [workspaceId, `%${MARKER}%`])
  countIfExists('task_stage_attempts', 'SELECT COUNT(*) AS count FROM task_stage_attempts WHERE workspace_id = ?', [workspaceId])
  countIfExists('task_stage_attempt_events', 'SELECT COUNT(*) AS count FROM task_stage_attempt_events WHERE workspace_id = ?', [workspaceId])
  countIfExists('task_stage_claims', 'SELECT COUNT(*) AS count FROM task_stage_claims WHERE workspace_id = ?', [workspaceId])
  countIfExists('task_claim_control_idempotency_keys', 'SELECT COUNT(*) AS count FROM task_claim_control_idempotency_keys WHERE workspace_id = ?', [workspaceId])
  countIfExists('github_sync_lifecycle_controls', 'SELECT COUNT(*) AS count FROM github_sync_lifecycle_controls WHERE workspace_id = ?', [workspaceId])
  countIfExists('github_sync_lifecycle_runs', 'SELECT COUNT(*) AS count FROM github_sync_lifecycle_runs WHERE workspace_id = ?', [workspaceId])
  countIfExists('activities', 'SELECT COUNT(*) AS count FROM activities WHERE workspace_id = ? OR data LIKE ?', [workspaceId, `%${MARKER}%`])
  return counts
}

async function getClaim(auth, taskId, workspaceId) {
  const response = await request(auth, 'GET', `/api/tasks/${taskId}/claim-reconciliation?workspace_id=${workspaceId}`)
  assert(response.status === 200, 'claim-reconciliation GET failed', { taskId, status: response.status, body: response.json })
  assert(response.json?.schema_version === 'task_claim_reconciliation.v1', 'unexpected claim-reconciliation schema', response.json)
  assert(sanitized(response.json), 'claim-reconciliation response leaked sensitive content')
  return response.json
}

async function postControl(auth, taskId, workspaceId, body, keySuffix) {
  const response = await request(
    auth,
    'POST',
    `/api/tasks/${taskId}/claim-control`,
    { ...body, workspace_id: workspaceId },
    `${MARKER}-${keySuffix}`,
  )
  assert(sanitized(response.json), 'claim-control response leaked sensitive content')
  return response
}

async function chooseAuth(fixture) {
  const taskId = fixture.tasks.release.id
  const response = await request(
    fixture.auth,
    'GET',
    `/api/tasks/${taskId}/claim-reconciliation?workspace_id=${fixture.workspace.id}`,
  )
  if (response.status === 200 && response.json?.schema_version === 'task_claim_reconciliation.v1') {
    log('auth_session_accepted', { user_id: fixture.auth.userId, session_id: fixture.auth.sessionId })
    return fixture.auth
  }
  throw new Error(`temporary operator session was not accepted by ${BASE_URL}: ${JSON.stringify({ status: response.status, body: response.json })}`)
}

async function runAssertions(db, auth, fixture) {
  const workspaceId = fixture.workspace.id
  const evidence = []

  const retryRead = await getClaim(auth, fixture.tasks.retry.id, workspaceId)
  assert(retryRead.claim_control.authorization.can_mutate === true, 'retry can_mutate was false')
  assert(action(retryRead, 'retry')?.enabled === true, 'retry action was not enabled', action(retryRead, 'retry'))
  const retry = await postControl(auth, fixture.tasks.retry.id, workspaceId, {
    action: 'retry',
    stage_key: STAGE_KEY,
    expected: expectedState(retryRead),
    override_backoff: false,
    reason: 'HAL target UAT retry',
    client_correlation_id: `${MARKER}-retry`,
  }, 'retry')
  assert(retry.status === 200 && retry.json?.outcome === 'retry_ready', 'retry did not return retry_ready', retry)
  evidence.push({ scenario: 'retry', status: retry.status, outcome: retry.json.outcome, activity_id: retry.json.activity_id ?? retry.json.audit?.activity_id ?? null })

  const releaseRead = await getClaim(auth, fixture.tasks.release.id, workspaceId)
  assert(action(releaseRead, 'release')?.enabled === true, 'release action was not enabled', action(releaseRead, 'release'))
  const release = await postControl(auth, fixture.tasks.release.id, workspaceId, {
    action: 'release',
    stage_key: STAGE_KEY,
    expected: expectedState(releaseRead),
    override_backoff: false,
    reason: 'HAL target UAT release',
    client_correlation_id: `${MARKER}-release`,
  }, 'release')
  assert(release.status === 200 && release.json?.outcome === 'released', 'release did not return released', release)
  evidence.push({ scenario: 'release', status: release.status, outcome: release.json.outcome, activity_id: release.json.activity_id ?? release.json.audit?.activity_id ?? null })

  const cancelRead = await getClaim(auth, fixture.tasks.cancel.id, workspaceId)
  assert(action(cancelRead, 'cancel')?.enabled === true, 'cancel action was not enabled', action(cancelRead, 'cancel'))
  const cancel = await postControl(auth, fixture.tasks.cancel.id, workspaceId, {
    action: 'cancel',
    stage_key: STAGE_KEY,
    expected: expectedState(cancelRead),
    override_backoff: false,
    reason: 'HAL target UAT cancel',
    client_correlation_id: `${MARKER}-cancel`,
  }, 'cancel')
  assert(cancel.status === 200 && cancel.json?.outcome === 'cancelled', 'cancel did not return cancelled', cancel)
  evidence.push({ scenario: 'cancel', status: cancel.status, outcome: cancel.json.outcome, activity_id: cancel.json.activity_id ?? cancel.json.audit?.activity_id ?? null })

  const staleRead = await getClaim(auth, fixture.tasks.stale.id, workspaceId)
  const staleExpected = { ...expectedState(staleRead), claim_run_id: `${MARKER}-wrong-run` }
  const stale = await postControl(auth, fixture.tasks.stale.id, workspaceId, {
    action: 'release',
    stage_key: STAGE_KEY,
    expected: staleExpected,
    override_backoff: false,
    reason: 'HAL target UAT stale expected state',
    client_correlation_id: `${MARKER}-stale`,
  }, 'stale')
  assert(stale.status === 409 && stale.json?.outcome === 'stale_state', 'stale state did not return stale_state', stale)
  evidence.push({ scenario: 'stale_state', status: stale.status, outcome: stale.json.outcome, category: stale.json.diagnostics?.sanitized_error_category ?? null })

  const backoffRead = await getClaim(auth, fixture.tasks.backoff.id, workspaceId)
  assert(backoffRead.claim_control.backoff.state === 'active', 'backoff read model was not active', backoffRead.claim_control.backoff)
  assert(action(backoffRead, 'retry')?.requires_override_reason === true, 'backoff retry did not require override reason', action(backoffRead, 'retry'))
  const backoffBlocked = await postControl(auth, fixture.tasks.backoff.id, workspaceId, {
    action: 'retry',
    stage_key: STAGE_KEY,
    expected: expectedState(backoffRead),
    override_backoff: false,
    reason: 'HAL target UAT respect backoff',
    client_correlation_id: `${MARKER}-backoff-blocked`,
  }, 'backoff-blocked')
  assert(backoffBlocked.status === 200 && backoffBlocked.json?.outcome === 'retry_backoff_active', 'backoff did not block retry', backoffBlocked)
  const backoffOverrideRead = await getClaim(auth, fixture.tasks.backoff.id, workspaceId)
  assert(backoffOverrideRead.claim_control.backoff.state === 'active', 'backoff was not active before override', backoffOverrideRead.claim_control.backoff)
  const backoffOverride = await postControl(auth, fixture.tasks.backoff.id, workspaceId, {
    action: 'retry',
    stage_key: STAGE_KEY,
    expected: expectedState(backoffOverrideRead),
    override_backoff: true,
    override_reason: 'HAL target UAT override backoff',
    reason: 'HAL target UAT override backoff',
    client_correlation_id: `${MARKER}-backoff-override`,
  }, 'backoff-override')
  assert(backoffOverride.status === 200 && backoffOverride.json?.outcome === 'retry_ready', 'backoff override did not return retry_ready', backoffOverride)
  evidence.push({
    scenario: 'backoff',
    blocked_status: backoffBlocked.status,
    blocked_outcome: backoffBlocked.json.outcome,
    override_status: backoffOverride.status,
    override_outcome: backoffOverride.json.outcome,
    override_applied: backoffOverride.json.backoff?.override_applied ?? null,
  })

  const disabledFlags = JSON.stringify({ FEATURE_WORKSPACE_SWITCHER: true, FEATURE_TASK_CONTROL_PLANE: false })
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(disabledFlags, workspaceId)
  const flagOffRead = await getClaim(auth, fixture.tasks['flag-off'].id, workspaceId)
  assert(flagOffRead.feature_flag?.enabled === false, 'flag-off read model did not show disabled flag', flagOffRead.feature_flag)
  assert(flagOffRead.claim_control.authorization.can_mutate === false, 'flag-off can_mutate was true')
  const flagOff = await postControl(auth, fixture.tasks['flag-off'].id, workspaceId, {
    action: 'release',
    stage_key: STAGE_KEY,
    expected: expectedState(flagOffRead),
    override_backoff: false,
    reason: 'HAL target UAT flag-off',
    client_correlation_id: `${MARKER}-flag-off`,
  }, 'flag-off')
  assert(flagOff.status === 403 && flagOff.json?.outcome === 'flag_off', 'flag-off did not return flag_off', flagOff)
  evidence.push({ scenario: 'flag_off', status: flagOff.status, outcome: flagOff.json.outcome, can_mutate: flagOffRead.claim_control.authorization.can_mutate })

  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(fixture.workspace.flags, workspaceId)
  const postOverride = db.prepare(`
    SELECT next_retry_at, next_retry_reason, backoff_seconds
    FROM github_sync_lifecycle_controls
    WHERE workspace_id = ? AND github_repo = ?
  `).get(workspaceId, fixture.tasks.backoff.repo)
  assert(postOverride?.next_retry_at === null && postOverride?.backoff_seconds === 0, 'backoff override did not clear lifecycle control', postOverride)

  return evidence
}

async function main() {
  log('uat_start', { marker: MARKER, base_url: BASE_URL, db_path: DB_PATH })
  const db = new Database(DB_PATH)
  let fixture = null
  let evidence = []
  try {
    fixture = db.transaction(() => seedFixtures(db))()
    log('fixture_seeded', {
      workspace_id: fixture.workspace.id,
      task_ids: Object.fromEntries(Object.entries(fixture.tasks).map(([name, row]) => [name, row.id])),
    })
    const auth = await chooseAuth(fixture)
    evidence = await runAssertions(db, auth, fixture)
    const deletions = db.transaction(() => cleanup(db, fixture))()
    const counts = cleanupCounts(db, fixture)
    assert(Object.values(counts).every((count) => count === 0), 'cleanup left fixture rows', counts)
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      db.pragma('wal_checkpoint(PASSIVE)')
    }
    log('uat_passed', { evidence, cleanup: { deletions, counts } })
  } catch (error) {
    let cleanupResult = null
    let counts = null
    try {
      cleanupResult = db.transaction(() => cleanup(db, fixture))()
      counts = cleanupCounts(db, fixture)
    } catch (cleanupError) {
      cleanupResult = { error: cleanupError.message }
    }
    log('uat_failed', {
      message: error.message,
      cleanup: cleanupResult,
      cleanup_counts: counts,
    })
    process.exitCode = 1
  } finally {
    db.close()
  }
}

main()
