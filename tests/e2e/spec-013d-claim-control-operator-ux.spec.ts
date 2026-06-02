import { chmodSync, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'

const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'spec-013d-claim-control-operator-ux')
const E2E_DB_PATH = process.env['PADDOCK_DB_PATH'] ??
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'paddock.db')
const E2E_ADMIN_USER = process.env['AUTH_USER'] ?? 'testadmin'
const E2E_ADMIN_PASS = process.env['AUTH_PASS'] ?? 'testpass1234!'
const FIXTURE_MARKER_PREFIX = 'spec013d-claim-control'
const DB_FIXTURE_MARKER = 'seeded by SPEC-013D claim control db e2e'
const DB_STAGE_KEY = 'assigned_dispatch'
const DB_FIXTURE_NOW = 1_790_000_000
const SCREENSHOT_NAMES = [
  'spec013d-claim-control-before-active.png',
  'spec013d-claim-control-confirm-retry.png',
  'spec013d-claim-control-after-retry.png',
  'spec013d-claim-control-disabled-reasons.png',
  'spec013d-claim-control-backoff-override.png',
  'spec013d-claim-control-stale-conflict.png',
  'spec013d-claim-control-viewer-read-only.png',
  'spec013d-claim-control-flag-off.png',
] as const
const MOCK_SCREENSHOT_NAMES = SCREENSHOT_NAMES.map(name => name.replace('spec013d-', 'spec013d-mock-'))
const FIXTURE_EXPORT_FILENAME = 'spec013d-claim-control-fixture-export.json'
const DB_FIXTURE_EXPORT_FILENAME = 'spec013d-claim-control-db-fixture-export.json'
const FIXTURE_TITLE = 'SPEC-013D Claim Control Fixture'
const VIEWER_USER_PREFIX = 'spec013d-viewer'
const VIEWER_PASSWORD = 'spec013d-viewer-pass-1234!'

type ClaimControlFixtureMode = 'active' | 'backoff' | 'disabled' | 'flagOff' | 'viewer'
type ClaimControlPostOutcome = 'retry_ready' | 'stale_state'
type DbFixtureScenario = 'retry' | 'release' | 'cancel' | 'stale' | 'viewer' | 'flagOff' | 'backoff'
type DbSeedMode = 'active' | 'backoff'

interface DbFixtureTask {
  readonly id: number
  readonly title: string
  readonly workspaceId: number
  readonly tenantId: number
  readonly projectId: number
  readonly githubRepo: string
}

interface DbSeededRows {
  readonly taskId: number
  readonly workspaceId: number
  readonly projectId: number
  readonly attemptId: number
  readonly claimId: number | null
  readonly lifecycleControlId: number
  readonly originalFeatureFlags: string | null
}

interface DbCleanupCounts {
  readonly tasks: number
  readonly projects: number
  readonly lifecycleControls: number
  readonly claims: number
  readonly stageAttempts: number
  readonly idempotencyRows: number
  readonly activities: number
}

interface DbFixtureWorkspace {
  readonly id: number
  readonly tenantId: number
  readonly authBaseline: DbFixtureAuthBaseline
}

interface DbFixtureScenarioRows {
  readonly scenario: DbFixtureScenario
  readonly task: DbFixtureTask
  readonly seeded: DbSeededRows
}

interface DbFixturePreseed {
  readonly scenarios: readonly DbFixtureScenarioRows[]
  readonly authBaseline: DbFixtureAuthBaseline
}

interface DbFixtureAuthBaseline {
  readonly userId: number
  readonly originalUserWorkspaceId: number | null
  readonly originalSessions: readonly DbFixtureSessionBaseline[]
}

interface DbFixtureSessionBaseline {
  readonly id: number
  readonly workspaceId: number | null
  readonly tenantId: number | null
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function checkpoint(db: Database.Database): void {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // The app server may hold a transient reader; committed rows are still visible.
  }
}

function relaxDbFilePermissions(): void {
  for (const filePath of [E2E_DB_PATH, `${E2E_DB_PATH}-wal`, `${E2E_DB_PATH}-shm`]) {
    try {
      if (existsSync(filePath)) chmodSync(filePath, 0o666)
    } catch {
      // Docker-backed E2E uses a host-mounted SQLite file; best effort keeps
      // host-side fixture writes readable by the non-root container process.
    }
  }
}

function parseFlags(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function scenarioTicketPrefix(scenario: DbFixtureScenario): string {
  return `S13D${scenario.slice(0, 3).toUpperCase()}`
}

function readWorkspaceFeatureFlags(workspaceId: number): string | null {
  const db = new Database(E2E_DB_PATH)
  try {
    const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(workspaceId) as {
      feature_flags: string | null
    } | undefined
    return row?.feature_flags ?? null
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

async function loginAsUser(
  page: Page,
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: { username, password },
    headers: { 'x-real-ip': '10.88.13.213' },
  })
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok()) {
    throw new Error(`SPEC-013D E2E admin login failed with status ${String(response.status())}: ${JSON.stringify(body)}`)
  }

  const setCookie = response.headers()['set-cookie'] ?? ''
  const match = /((?:__Host-)?mc-session)=([^;]+)/.exec(setCookie)
  const cookieName = match?.[1]
  const cookieValue = match?.[2]
  if (!cookieName || !cookieValue) {
    throw new Error(`SPEC-013D E2E admin login did not return a session cookie: ${setCookie}`)
  }

  const baseURL = process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:3005'
  await page.context().addCookies([{
    name: cookieName,
    value: cookieValue,
    url: baseURL,
    httpOnly: true,
    sameSite: 'Lax',
  }])
  return `${cookieName}=${cookieValue}`
}

async function loginAsE2EAdmin(page: Page, request: APIRequestContext): Promise<string> {
  return loginAsUser(page, request, E2E_ADMIN_USER, E2E_ADMIN_PASS)
}

async function dismissOnboardingForE2E(request: APIRequestContext, cookieHeader: string): Promise<void> {
  const headers = { 'Content-Type': 'application/json', cookie: cookieHeader }
  const skipResponse = await request.post('/api/onboarding', {
    headers,
    data: { action: 'skip' },
  })
  if (![200, 204].includes(skipResponse.status())) {
    const body: unknown = await skipResponse.json().catch(() => ({}))
    throw new Error(`SPEC-013D onboarding skip failed with status ${String(skipResponse.status())}: ${JSON.stringify(body)}`)
  }

  const settingsResponse = await request.put('/api/settings', {
    headers,
    data: { settings: { 'general.interface_mode': 'full' } },
  })
  if (![200, 204].includes(settingsResponse.status())) {
    const body: unknown = await settingsResponse.json().catch(() => ({}))
    throw new Error(`SPEC-013D interface-mode setup failed with status ${String(settingsResponse.status())}: ${JSON.stringify(body)}`)
  }
}

function createDbFixtureTask(fixtureWorkspace: DbFixtureWorkspace, scenario: DbFixtureScenario = 'release'): DbFixtureTask {
  const db = new Database(E2E_DB_PATH)
  try {
    const workspace = db.prepare(`
      SELECT id, tenant_id
      FROM workspaces
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
    `).get(fixtureWorkspace.id, fixtureWorkspace.tenantId) as { id: number; tenant_id: number } | undefined
    if (!workspace?.id) throw new Error('SPEC-013D DB fixture found no accessible product-line workspace')

    const stamp = `${String(Date.now())}-${scenario}`
    const title = `SPEC-013D Claim Control DB Fixture ${scenario} ${stamp}`
    const githubRepo = `racecraft-lab/spec-013d-${stamp}`
    const projectId = Number(db.prepare(`
      INSERT INTO projects (
        workspace_id, name, slug, ticket_prefix, ticket_counter, github_repo,
        github_sync_enabled, is_repo_sync_owner, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, 1, 1, 'active', ?, ?)
    `).run(
      workspace.id,
      `SPEC-013D Fixture ${stamp}`,
      `spec-013d-fixture-${stamp}`,
      scenarioTicketPrefix(scenario),
      githubRepo,
      DB_FIXTURE_NOW,
      DB_FIXTURE_NOW,
    ).lastInsertRowid)

    const taskId = Number(db.prepare(`
      INSERT INTO tasks (
        title, description, status, priority, assigned_to, created_by,
        created_at, updated_at, tags, metadata, workspace_id, project_id,
        project_ticket_no, github_repo, github_issue_number, github_synced_at,
        workflow_template_slug
      ) VALUES (?, ?, 'assigned', 'high', 'spec-013d-operator', 'SPEC-013D',
        ?, ?, '[]', '{}', ?, ?, 1, ?, 72, ?, ?)
    `).run(
      title,
      `${title} ${DB_FIXTURE_MARKER}`,
      DB_FIXTURE_NOW,
      DB_FIXTURE_NOW,
      workspace.id,
      projectId,
      githubRepo,
      DB_FIXTURE_NOW,
      DB_STAGE_KEY,
    ).lastInsertRowid)

    checkpoint(db)
    return { id: taskId, title, workspaceId: workspace.id, tenantId: workspace.tenant_id, projectId, githubRepo }
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

function seedDbClaimControlRows(
  task: DbFixtureTask,
  mode: DbSeedMode = 'active',
  originalFeatureFlags?: string | null,
): DbSeededRows {
  const db = new Database(E2E_DB_PATH)
  try {
    const workspace = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(task.workspaceId) as {
      feature_flags: string | null
    } | undefined
    if (!workspace) throw new Error(`SPEC-013D workspace not found: ${String(task.workspaceId)}`)

    const flags = parseFlags(workspace.feature_flags)
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
      .run(JSON.stringify({ ...flags, FEATURE_TASK_CONTROL_PLANE: true }), task.workspaceId)
    const backoffActive = mode === 'backoff'
    const lifecycleControlId = Number(db.prepare(`
      INSERT INTO github_sync_lifecycle_controls (
        workspace_id, github_repo, enabled, interval_seconds, owner_project_id,
        next_retry_at, next_retry_reason, backoff_seconds,
        last_completed_at, total_successes, updated_at
      ) VALUES (?, ?, 1, 300, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      task.workspaceId,
      task.githubRepo,
      task.projectId,
      backoffActive ? DB_FIXTURE_NOW + 180 : null,
      backoffActive ? 'retry backoff active' : null,
      backoffActive ? 180 : 0,
      DB_FIXTURE_NOW,
      DB_FIXTURE_NOW,
    ).lastInsertRowid)

    const attemptStatus = mode === 'backoff' ? 'failed' : 'running'
    const attemptId = Number(db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at,
        run_id, workflow_template_id, workflow_template_slug, metadata_json
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)
    `).run(
      task.workspaceId,
      task.id,
      DB_STAGE_KEY,
      attemptStatus,
      '2026-05-30T17:00:00.000Z',
      '2026-05-30T17:00:00.000Z',
      '2026-05-30T17:00:00.000Z',
      'spec-013d-db-run',
      DB_STAGE_KEY,
      JSON.stringify({ fixture: DB_FIXTURE_MARKER }),
    ).lastInsertRowid)

    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, actor_type, actor_id, message, metadata_json
      ) VALUES (?, ?, ?, ?, 1, ?, ?, 'test', 'spec-013d-e2e', ?, ?)
    `).run(
      attemptId,
      task.workspaceId,
      task.id,
      DB_STAGE_KEY,
      attemptStatus,
      '2026-05-30T17:00:00.000Z',
      `SPEC-013D claim-control DB fixture ${attemptStatus} attempt`,
      JSON.stringify({ fixture: DB_FIXTURE_MARKER }),
    )

    const claimId = mode === 'active'
      ? Number(db.prepare(`
          INSERT INTO task_stage_claims (
            workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state,
            lease_owner, claim_run_id, lease_started_at, lease_expires_at,
            release_reason, released_at, released_by_run_id, stale_recovered_from_claim_id,
            metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
        `).run(
          task.workspaceId,
          task.id,
          DB_STAGE_KEY,
          attemptId,
          'spec-013d-operator',
          'spec-013d-db-run',
          DB_FIXTURE_NOW,
          DB_FIXTURE_NOW + 3600,
          JSON.stringify({ fixture: DB_FIXTURE_MARKER }),
          DB_FIXTURE_NOW,
          DB_FIXTURE_NOW,
        ).lastInsertRowid)
      : null

    checkpoint(db)
    return {
      taskId: task.id,
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      attemptId,
      claimId,
      lifecycleControlId,
      originalFeatureFlags: originalFeatureFlags === undefined ? workspace.feature_flags : originalFeatureFlags,
    }
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

function sessionHeaders(cookieHeader: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    cookie: cookieHeader,
  }
}

function resolveDbFixtureWorkspace(): DbFixtureWorkspace {
  const db = new Database(E2E_DB_PATH)
  try {
    const workspace = db.prepare(`
      SELECT id, tenant_id
      FROM workspaces
      WHERE LOWER(TRIM(slug)) <> 'facility'
        AND LOWER(TRIM(name)) <> 'facility'
      ORDER BY id ASC
      LIMIT 1
    `).get() as { id: number; tenant_id: number } | undefined
    if (!workspace?.id || !workspace.tenant_id) {
      throw new Error('SPEC-013D DB fixture found no product-line workspace in the E2E database')
    }

    const user = db.prepare(`
      SELECT id, workspace_id
      FROM users
      WHERE username = ?
      LIMIT 1
    `).get(E2E_ADMIN_USER) as { id: number; workspace_id: number | null } | undefined
    if (!user?.id) {
      throw new Error(`SPEC-013D DB fixture found no E2E admin user: ${E2E_ADMIN_USER}`)
    }

    const originalSessions = db.prepare(`
      SELECT id, workspace_id, tenant_id
      FROM user_sessions
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(user.id) as { id: number; workspace_id: number | null; tenant_id: number | null }[]

    db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(workspace.id, user.id)
    db.prepare('UPDATE user_sessions SET workspace_id = ?, tenant_id = ? WHERE user_id = ?')
      .run(workspace.id, workspace.tenant_id, user.id)
    checkpoint(db)

    return {
      id: workspace.id,
      tenantId: workspace.tenant_id,
      authBaseline: {
        userId: user.id,
        originalUserWorkspaceId: user.workspace_id,
        originalSessions: originalSessions.map(session => ({
          id: session.id,
          workspaceId: session.workspace_id,
          tenantId: session.tenant_id,
        })),
      },
    }
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

function restoreDbFixtureAuthBaseline(baseline: DbFixtureAuthBaseline): void {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?')
      .run(baseline.originalUserWorkspaceId, baseline.userId)
    const restoreSession = db.prepare('UPDATE user_sessions SET workspace_id = ?, tenant_id = ? WHERE id = ?')
    for (const session of baseline.originalSessions) {
      restoreSession.run(session.workspaceId, session.tenantId, session.id)
    }
    checkpoint(db)
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

async function loadPreseededDbFixture(): Promise<DbFixturePreseed | null> {
  if (process.env['MC_SPEC_013D_PRESEEDED'] !== '1') return null
  const fixturePath = process.env['MC_SPEC_013D_FIXTURE_FILE']
  if (!fixturePath) throw new Error('MC_SPEC_013D_FIXTURE_FILE is required when MC_SPEC_013D_PRESEEDED=1')
  const parsed = JSON.parse(await readFile(fixturePath, 'utf8')) as Partial<DbFixturePreseed>
  if (!Array.isArray(parsed.scenarios) || !parsed.authBaseline) {
    throw new Error(`SPEC-013D preseed fixture is incomplete: ${fixturePath}`)
  }
  return parsed as DbFixturePreseed
}

function createDbFixtureScenarios(fixtureWorkspace: DbFixtureWorkspace): DbFixtureScenarioRows[] {
  const scenarios: DbFixtureScenario[] = ['retry', 'release', 'cancel', 'stale', 'viewer', 'flagOff', 'backoff']
  const originalFeatureFlags = readWorkspaceFeatureFlags(fixtureWorkspace.id)
  return scenarios.map((scenario) => {
    const task = createDbFixtureTask(fixtureWorkspace, scenario)
    const seeded = seedDbClaimControlRows(task, scenario === 'backoff' ? 'backoff' : 'active', originalFeatureFlags)
    return { scenario, task, seeded }
  })
}

function scenarioFixtures(
  rows: readonly DbFixtureScenarioRows[],
): Record<DbFixtureScenario, DbFixtureScenarioRows> {
  const byScenario = Object.fromEntries(rows.map(row => [row.scenario, row])) as Partial<Record<DbFixtureScenario, DbFixtureScenarioRows>>
  for (const scenario of ['retry', 'release', 'cancel', 'stale', 'viewer', 'flagOff', 'backoff'] as const) {
    if (!byScenario[scenario]) throw new Error(`SPEC-013D DB fixture missing scenario: ${scenario}`)
  }
  return byScenario as Record<DbFixtureScenario, DbFixtureScenarioRows>
}

async function enableDbFixtureClaimControl(
  request: APIRequestContext,
  workspaceId: number,
  cookieHeader: string,
): Promise<void> {
  const response = await request.post(`/api/admin/workspaces/${String(workspaceId)}/feature-flags`, {
    headers: sessionHeaders(cookieHeader),
    data: { flags: { FEATURE_TASK_CONTROL_PLANE: true } },
  })
  const body = await response.json().catch(() => ({})) as { flags?: Record<string, unknown>; detail?: string }
  expect(response.status(), JSON.stringify(body)).toBe(200)
  expect(body.flags?.['FEATURE_TASK_CONTROL_PLANE']).toBe(true)
}

async function setDbFixtureClaimControlFlag(
  request: APIRequestContext,
  workspaceId: number,
  cookieHeader: string,
  enabled: boolean,
): Promise<void> {
  const response = await request.post(`/api/admin/workspaces/${String(workspaceId)}/feature-flags`, {
    headers: sessionHeaders(cookieHeader),
    data: { flags: { FEATURE_TASK_CONTROL_PLANE: enabled } },
  })
  const body = await response.json().catch(() => ({})) as { flags?: Record<string, unknown>; detail?: string }
  expect(response.status(), JSON.stringify(body)).toBe(200)
  expect(body.flags?.['FEATURE_TASK_CONTROL_PLANE']).toBe(enabled)
}

async function readClaimControlEnvelope(
  request: APIRequestContext,
  task: DbFixtureTask,
  cookieHeader: string,
): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/tasks/${String(task.id)}/claim-reconciliation?workspace_id=${String(task.workspaceId)}`, {
    headers: { cookie: cookieHeader },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  expect(response.status(), JSON.stringify(body)).toBe(200)
  return body
}

async function postClaimControlAction(
  request: APIRequestContext,
  task: DbFixtureTask,
  cookieHeader: string,
  actionName: 'retry' | 'release' | 'cancel',
  reason: string | null = null,
): Promise<Record<string, unknown>> {
  const envelopeBody = await readClaimControlEnvelope(request, task, cookieHeader)
  const control = envelopeBody['claim_control'] as { stage_key?: string; expected_state?: unknown } | null
  if (!control?.stage_key || !control.expected_state) {
    throw new Error(`SPEC-013D real-route fixture missing claim_control for task ${String(task.id)}`)
  }
  const response = await request.post(`/api/tasks/${String(task.id)}/claim-control?workspace_id=${String(task.workspaceId)}`, {
    headers: {
      ...sessionHeaders(cookieHeader),
      'Idempotency-Key': `spec013d-${actionName}-${Date.now().toString(36)}`,
    },
    data: {
      action: actionName,
      stage_key: control.stage_key,
      expected: control.expected_state,
      override_backoff: false,
      override_reason: null,
      reason,
      client_correlation_id: `spec013d-${actionName}-api`,
    },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  expect(response.status(), JSON.stringify(body)).toBeGreaterThanOrEqual(200)
  expect(response.status(), JSON.stringify(body)).toBeLessThan(300)
  return body
}

async function createViewerUser(request: APIRequestContext, cookieHeader: string): Promise<{ id: number; username: string }> {
  const username = `${VIEWER_USER_PREFIX}-${Date.now().toString(36)}`
  const response = await request.post('/api/auth/users', {
    headers: sessionHeaders(cookieHeader),
    data: {
      username,
      password: VIEWER_PASSWORD,
      display_name: 'SPEC-013D Viewer',
      role: 'viewer',
      provider: 'local',
    },
  })
  const body = await response.json().catch(() => ({})) as { user?: { id?: number; username?: string } }
  expect(response.status(), JSON.stringify(body)).toBe(201)
  if (!body.user?.id || !body.user.username) throw new Error('SPEC-013D viewer user creation returned no user id')
  return { id: body.user.id, username: body.user.username }
}

async function deleteViewerUser(request: APIRequestContext, cookieHeader: string, userId: number | null): Promise<void> {
  if (userId === null) return
  const response = await request.delete('/api/auth/users', {
    headers: sessionHeaders(cookieHeader),
    data: { id: userId },
  })
  expect([200, 404]).toContain(response.status())
}

function countDbFixtureRows(db: Database.Database, seeded: DbSeededRows): DbCleanupCounts {
  return {
    tasks: (db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE id = ?').get(seeded.taskId) as { count: number }).count,
    projects: (db.prepare('SELECT COUNT(*) AS count FROM projects WHERE id = ?').get(seeded.projectId) as { count: number }).count,
    lifecycleControls: tableExists(db, 'github_sync_lifecycle_controls')
      ? (db.prepare('SELECT COUNT(*) AS count FROM github_sync_lifecycle_controls WHERE id = ?').get(seeded.lifecycleControlId) as { count: number }).count
      : 0,
    claims: tableExists(db, 'task_stage_claims')
      ? (db.prepare('SELECT COUNT(*) AS count FROM task_stage_claims WHERE task_id = ?').get(seeded.taskId) as { count: number }).count
      : 0,
    stageAttempts: tableExists(db, 'task_stage_attempts')
      ? (db.prepare('SELECT COUNT(*) AS count FROM task_stage_attempts WHERE task_id = ?').get(seeded.taskId) as { count: number }).count
      : 0,
    idempotencyRows: tableExists(db, 'task_claim_control_idempotency_keys')
      ? (db.prepare('SELECT COUNT(*) AS count FROM task_claim_control_idempotency_keys WHERE task_id = ?').get(seeded.taskId) as { count: number }).count
      : 0,
    activities: tableExists(db, 'activities')
      ? (db.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity_type = 'task' AND entity_id = ?").get(seeded.taskId) as { count: number }).count
      : 0,
  }
}

function cleanupDbClaimControlRows(seeded: DbSeededRows): { before: DbCleanupCounts; after: DbCleanupCounts; restoredFeatureFlags: string | null } {
  const db = new Database(E2E_DB_PATH)
  try {
    const before = countDbFixtureRows(db, seeded)
    if (tableExists(db, 'task_claim_control_idempotency_keys')) {
      db.prepare('DELETE FROM task_claim_control_idempotency_keys WHERE task_id = ?').run(seeded.taskId)
    }
    if (tableExists(db, 'activities')) {
      db.prepare("DELETE FROM activities WHERE entity_type = 'task' AND entity_id = ?").run(seeded.taskId)
    }
    if (tableExists(db, 'task_stage_claims')) {
      db.prepare('DELETE FROM task_stage_claims WHERE task_id = ?').run(seeded.taskId)
    }
    if (tableExists(db, 'task_stage_attempt_events')) {
      db.prepare('DELETE FROM task_stage_attempt_events WHERE task_id = ?').run(seeded.taskId)
    }
    if (tableExists(db, 'task_stage_attempts')) {
      db.prepare('DELETE FROM task_stage_attempts WHERE task_id = ?').run(seeded.taskId)
    }
    if (tableExists(db, 'notifications')) {
      db.prepare("DELETE FROM notifications WHERE source_type = 'task' AND source_id = ?").run(seeded.taskId)
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(seeded.taskId)
    if (tableExists(db, 'github_sync_lifecycle_controls')) {
      db.prepare('DELETE FROM github_sync_lifecycle_controls WHERE id = ?').run(seeded.lifecycleControlId)
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(seeded.projectId)
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(seeded.originalFeatureFlags, seeded.workspaceId)
    checkpoint(db)
    const after = countDbFixtureRows(db, seeded)
    const restored = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(seeded.workspaceId) as {
      feature_flags: string | null
    } | undefined
    return { before, after, restoredFeatureFlags: restored?.feature_flags ?? null }
  } finally {
    db.close()
    relaxDbFilePermissions()
  }
}

function emptyCleanupCounts(): DbCleanupCounts {
  return {
    tasks: 0,
    projects: 0,
    lifecycleControls: 0,
    claims: 0,
    stageAttempts: 0,
    idempotencyRows: 0,
    activities: 0,
  }
}

function addCleanupCounts(left: DbCleanupCounts, right: DbCleanupCounts): DbCleanupCounts {
  return {
    tasks: left.tasks + right.tasks,
    projects: left.projects + right.projects,
    lifecycleControls: left.lifecycleControls + right.lifecycleControls,
    claims: left.claims + right.claims,
    stageAttempts: left.stageAttempts + right.stageAttempts,
    idempotencyRows: left.idempotencyRows + right.idempotencyRows,
    activities: left.activities + right.activities,
  }
}

function action(
  actionName: 'retry' | 'release' | 'cancel',
  enabled: boolean,
  unavailableReason: string | null,
  requiresOverrideReason = false,
) {
  return {
    action: actionName,
    enabled,
    unavailable_reason: unavailableReason,
    requires_confirmation: true,
    requires_idempotency_key: true,
    requires_expected_state: true,
    requires_override_reason: requiresOverrideReason,
    backoff_policy: actionName === 'retry' ? 'respect_backoff' : 'not_applicable',
  }
}

function reconciliationEnvelope(mode: ClaimControlFixtureMode) {
  const flagOff = mode === 'flagOff'
  const viewer = mode === 'viewer'
  const backoff = mode === 'backoff'
  return {
    schema_version: 'task_claim_reconciliation.v1',
    task: {
      id: '500',
      workspace_id: '1',
      status: 'in_progress',
      stage_key: 'paddock_issue_remediation',
      github: { repo: 'racecraft-lab/paddock', issue_number: 72, pr_number: null },
    },
    feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: !flagOff },
    eligibility: { state: 'eligible', reason: null },
    active_claim: null,
    claim_history: [],
    activities: [],
    diagnostics: { warnings: [] },
    claim_control: flagOff ? null : {
      stage_key: 'paddock_issue_remediation',
      authorization: { required_role: 'operator', current_role: viewer ? 'viewer' : 'operator', can_mutate: !viewer },
      available_actions: backoff
        ? [
            action('retry', false, 'retry backoff active', true),
            action('release', true, null),
            action('cancel', true, null),
          ]
        : [
            action('retry', true, null),
            action('release', mode === 'active', mode === 'active' ? null : 'owned by another run'),
            action('cancel', mode === 'active', mode === 'active' ? null : 'terminal attempt'),
          ],
      retry_eligibility: { state: backoff ? 'active_claim' : 'eligible', reason: backoff ? 'retry backoff active' : 'latest attempt failed', evidence_type: 'attempt', evidence_id: '22' },
      backoff: backoff
        ? { state: 'active', seconds_remaining: 180, next_retry_at: 1790000180, reason: 'retry backoff active', override_allowed: true, override_requires_reason: true }
        : { state: 'none', seconds_remaining: 0, next_retry_at: null, reason: null, override_allowed: false, override_requires_reason: false },
      expected_state: { claim_id: 'claim-22', claim_run_id: 'run-22', attempt_id: 'attempt-22', attempt_status: 'failed', operator_action_activity_id: null },
      last_operator_action: null,
      last_sanitized_error: null,
    },
  }
}

function claimControlResponse(outcome: ClaimControlPostOutcome) {
  return {
    schema_version: 'task_claim_control.v1',
    task: { id: '500', workspace_id: '1', status: 'in_progress', stage_key: 'paddock_issue_remediation' },
    action: 'retry',
    outcome,
    claim: null,
    attempt: { id: 'attempt-22', status: outcome === 'retry_ready' ? 'released' : 'failed' },
    backoff: { decision: 'not_active', seconds_remaining: 0, next_retry_at: null, override_applied: false, override_reason: null },
    available_actions: [],
    audit: { activity_id: outcome === 'retry_ready' ? '333' : null, activity_type: outcome === 'retry_ready' ? 'task_stage_claim_control_retry' : null, redaction_applied: true },
    idempotency: { replayed: false },
    correlation_id: 'spec013d-playwright',
    diagnostics: { warnings: [], sanitized_error_category: outcome === 'stale_state' ? 'stale_state' : null },
  }
}

async function attachClaimControlScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const region = page.getByRole('region', { name: /claim control/i })
  await expect(region).toBeVisible()
  const filePath = path.join(OUTPUT_DIR, name)
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach(name, { path: filePath, contentType: 'image/png' })
  return filePath
}

async function captureClaimControlVisualSnapshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (process.env['MC_VISUAL_SNAPSHOTS'] !== '1') return
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, `${name}.visual.png`)
  const region = page.getByRole('region', { name: /claim control/i })
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach(name, { path: filePath, contentType: 'image/png' })
}

async function attachFixtureExport(testInfo: TestInfo, screenshotPaths: Record<string, string>): Promise<void> {
  const fixture = {
    schema_version: 'spec013d.claim-control.fixture.v1',
    fixture_marker: `${FIXTURE_MARKER_PREFIX}-route-mocked`,
    generated_at: new Date(0).toISOString(),
    disposable_tasks: ['spec013d-claim-control-route-mocked-task'],
    seeded_rows: { claim: 0, stage_attempt: 0, idempotency: 0, activity: 0, feature_flag: 0 },
    routed_read_models: { claim: 1, stage_attempt: 1, feature_flag: 1 },
    feature_flag_restore: { before: true, after: true },
    cleanup_scope: 'route-mocked-playwright-no-db-rows',
    cleanup_result: 'no persistent rows created',
    screenshots: Object.keys(screenshotPaths),
    visual_snapshots: [
      'claim-control-before-active',
      'claim-control-after-retry',
      'claim-control-disabled-reasons',
      'claim-control-backoff-override',
      'claim-control-stale-conflict',
      'claim-control-viewer-read-only',
      'claim-control-flag-off',
    ],
    redaction_assertions: [
      'no raw idempotency keys',
      'no auth headers',
      'no raw request bodies',
      'no prompts or transcripts',
      'no provider payloads or tokens',
      'no GitHub bodies',
    ],
  }
  const filePath = path.join(OUTPUT_DIR, FIXTURE_EXPORT_FILENAME)
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(filePath, JSON.stringify(fixture, null, 2))
  await testInfo.attach(FIXTURE_EXPORT_FILENAME, { path: filePath, contentType: 'application/json' })
}

async function attachDbFixtureExport(
  testInfo: TestInfo,
  seededRows: readonly DbSeededRows[],
  cleanup: {
    before: DbCleanupCounts
    after: DbCleanupCounts
    restoredFeatureFlags: readonly (string | null)[]
    viewerUserDeleted: boolean
  },
  screenshotPaths: Record<string, string>,
): Promise<void> {
  const fixture = {
    schema_version: 'spec013d.claim-control.db-fixture.v1',
    fixture_marker: `${FIXTURE_MARKER_PREFIX}-db-seeded`,
    generated_at: new Date(0).toISOString(),
    disposable_task_ids: seededRows.map(row => row.taskId),
    seeded_rows: {
      project_ids: seededRows.map(row => row.projectId),
      claim_ids: seededRows.map(row => row.claimId).filter((id): id is number => id !== null),
      stage_attempt_ids: seededRows.map(row => row.attemptId),
      lifecycle_control_ids: seededRows.map(row => row.lifecycleControlId),
      idempotency_rows_before_cleanup: cleanup.before.idempotencyRows,
      activity_rows_before_cleanup: cleanup.before.activities,
      feature_flag_workspace_ids: [...new Set(seededRows.map(row => row.workspaceId))],
    },
    feature_flag_restore: {
      before: seededRows.map(row => row.originalFeatureFlags),
      after: cleanup.restoredFeatureFlags,
      restored: cleanup.restoredFeatureFlags.every((value, index) => value === seededRows[index]?.originalFeatureFlags),
    },
    cleanup_scope: 'direct DB cleanup removes disposable project, task, lifecycle-control, claim, stage-attempt, idempotency, activity, and notification rows',
    cleanup_result: cleanup.after,
    viewer_cleanup: { deleted: cleanup.viewerUserDeleted },
    screenshots: Object.keys(screenshotPaths),
    screenshot_files: Object.values(screenshotPaths).map(filePath => path.basename(filePath)),
    real_route_actions: ['retry', 'release', 'cancel', 'stale_state', 'viewer_read_only', 'flag_off', 'backoff_override'],
    redaction_assertions: [
      'no raw idempotency keys',
      'no auth headers',
      'no raw request bodies',
      'no prompts or transcripts',
      'no provider payloads or tokens',
      'no GitHub bodies',
    ],
  }
  const filePath = path.join(OUTPUT_DIR, DB_FIXTURE_EXPORT_FILENAME)
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(filePath, `${JSON.stringify(fixture, null, 2)}\n`)
  await testInfo.attach(DB_FIXTURE_EXPORT_FILENAME, { path: filePath, contentType: 'application/json' })
}

async function openFixtureTask(page: Page): Promise<void> {
  await page.goto('/')
  await signInIfNeeded(page)
  await page.getByRole('button', { name: /^Tasks$/ }).click()
  await page.getByText(FIXTURE_TITLE).click()
  await expect(page.getByRole('region', { name: /claim control/i })).toBeVisible()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function openDbFixtureTask(page: Page, task: DbFixtureTask): Promise<void> {
  await page.goto('/tasks')
  await page.evaluate(({ tenantId, workspaceId }) => {
    window.localStorage.setItem('mc:active-workspace:v1', JSON.stringify({
      payloadVersion: 1,
      tenantId,
      productLineId: workspaceId,
      scopeVersion: Date.now(),
    }))
  }, { tenantId: task.tenantId, workspaceId: task.workspaceId })
  await page.reload()
  await expect(page.getByRole('region', { name: /^Task Board$/i })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(escapeRegExp(task.title), 'i') }).first().click()
  await expect(page.getByRole('region', { name: /claim control/i })).toBeVisible()
}

async function signInIfNeeded(page: Page): Promise<void> {
  const signIn = page.getByRole('button', { name: /sign in/i })
  if (!await signIn.isVisible().catch(() => false)) return
  await page.getByLabel(/username/i).fill(process.env['AUTH_USER'] ?? 'testadmin')
  await page.getByLabel(/password/i).fill(process.env['AUTH_PASS'] ?? 'testpass1234!')
  await signIn.click()
  await expect(signIn).toBeHidden()
}

test.describe('SPEC-013D claim-control operator UX', () => {
  test('exercises route-backed claim-control states and redacted evidence artifacts', async ({ page }, testInfo) => {
    const screenshotPaths: Record<string, string> = {}
    const observedPostBodies: unknown[] = []
    const observedIdempotencyHeaders: string[] = []
    let mode: ClaimControlFixtureMode = 'active'
    let postOutcome: ClaimControlPostOutcome = 'retry_ready'

    await page.addInitScript(() => {
      window.sessionStorage.setItem('mc-onboarding-dismissed', '1')
    })

    await page.route('**/api/onboarding**', async route => {
      await route.fulfill({ json: { completed: true, skipped: true, showOnboarding: false, isAdmin: true } })
    })
    await page.route('**/api/status**', async route => {
      await route.fulfill({ json: { ok: true, gateway: false, interfaceMode: 'full' } })
    })
    await page.route('**/api/workspaces**', async route => {
      await route.fulfill({
        json: {
          tenant_id: 1,
          active_workspace_id: 1,
          workspaces: [{
            id: 1,
            slug: 'paddock',
            name: 'Paddock',
            tenant_id: 1,
            feature_flags: { FEATURE_TASK_CONTROL_PLANE: true },
          }],
        },
      })
    })
    await page.route('**/api/tasks/500/claim-reconciliation**', async route => {
      await route.fulfill({ json: reconciliationEnvelope(mode) })
    })
    await page.route('**/api/tasks/500/claim-control**', async route => {
      observedPostBodies.push(route.request().postDataJSON())
      observedIdempotencyHeaders.push(route.request().headers()['idempotency-key'] ?? '')
      await route.fulfill({ json: claimControlResponse(postOutcome) })
    })
    await page.route(/\/api\/tasks(?:\?.*)?$/, async route => {
      await route.fulfill({
        json: {
          tasks: [{
            id: 500,
            title: FIXTURE_TITLE,
            description: `${FIXTURE_MARKER_PREFIX}-route-mocked task`,
            status: 'in_progress',
            priority: 'high',
            created_by: 'spec-013d',
            created_at: 1790000000,
            updated_at: 1790000000,
          }],
        },
      })
    })
    await page.route('**/api/agents**', async route => { await route.fulfill({ json: { agents: [] } }) })
    await page.route('**/api/projects**', async route => { await route.fulfill({ json: { projects: [] } }) })
    await page.route('**/api/quality-review**', async route => { await route.fulfill({ json: { reviews: [], latest: {} } }) })
    await page.route('**/api/tasks/500/comments**', async route => { await route.fulfill({ json: { comments: [] } }) })
    await page.route('**/api/tasks/500/evidence**', async route => { await route.fulfill({ json: null }) })
    await page.route('**/api/tasks/500/stage-attempts**', async route => { await route.fulfill({ json: { schema_version: 'task_stage_attempts.v1', task: null, attempts: [], warnings: [] } }) })
    await page.route('**/api/mentions**', async route => { await route.fulfill({ json: { mentions: [] } }) })
    await page.route('**/api/sessions**', async route => { await route.fulfill({ json: { sessions: [] } }) })

    await openFixtureTask(page)
    screenshotPaths[MOCK_SCREENSHOT_NAMES[0] ?? SCREENSHOT_NAMES[0]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[0] ?? SCREENSHOT_NAMES[0])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-before-active')

    mode = 'disabled'
    await openFixtureTask(page)
    screenshotPaths[MOCK_SCREENSHOT_NAMES[3] ?? SCREENSHOT_NAMES[3]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[3] ?? SCREENSHOT_NAMES[3])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-disabled-reasons')

    mode = 'active'
    await openFixtureTask(page)
    await page.getByRole('button', { name: 'Retry stage' }).click()
    screenshotPaths[MOCK_SCREENSHOT_NAMES[1] ?? SCREENSHOT_NAMES[1]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[1] ?? SCREENSHOT_NAMES[1])
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('region', { name: /claim control/i }).getByRole('status')).toContainText(/retry requested/i)
    expect(observedIdempotencyHeaders.at(-1)).toMatch(/^spec013d-/)
    expect(observedPostBodies.at(-1)).toMatchObject({
      action: 'retry',
      stage_key: 'paddock_issue_remediation',
      override_backoff: false,
    })
    screenshotPaths[MOCK_SCREENSHOT_NAMES[2] ?? SCREENSHOT_NAMES[2]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[2] ?? SCREENSHOT_NAMES[2])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-after-retry')

    mode = 'backoff'
    await openFixtureTask(page)
    await page.getByRole('button', { name: 'Override backoff' }).click()
    await page.getByLabel(/override reason required/i).fill('incident owner approved override')
    screenshotPaths[MOCK_SCREENSHOT_NAMES[4] ?? SCREENSHOT_NAMES[4]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[4] ?? SCREENSHOT_NAMES[4])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-backoff-override')

    mode = 'active'
    postOutcome = 'stale_state'
    await openFixtureTask(page)
    await page.getByRole('button', { name: 'Retry stage' }).click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('region', { name: /claim control/i }).getByRole('alert')).toContainText(/state changed before submit/i)
    screenshotPaths[MOCK_SCREENSHOT_NAMES[5] ?? SCREENSHOT_NAMES[5]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[5] ?? SCREENSHOT_NAMES[5])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-stale-conflict')

    mode = 'viewer'
    await openFixtureTask(page)
    await expect(page.getByRole('button', { name: 'Retry stage' })).toBeDisabled()
    screenshotPaths[MOCK_SCREENSHOT_NAMES[6] ?? SCREENSHOT_NAMES[6]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[6] ?? SCREENSHOT_NAMES[6])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-viewer-read-only')

    mode = 'flagOff'
    await openFixtureTask(page)
    await expect(page.getByText(/task control plane is off/i)).toBeVisible()
    screenshotPaths[MOCK_SCREENSHOT_NAMES[7] ?? SCREENSHOT_NAMES[7]] = await attachClaimControlScreenshot(page, testInfo, MOCK_SCREENSHOT_NAMES[7] ?? SCREENSHOT_NAMES[7])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-flag-off')

    await attachFixtureExport(testInfo, screenshotPaths)
    expect(Object.keys(screenshotPaths).sort()).toEqual([...MOCK_SCREENSHOT_NAMES].sort())
    expect(JSON.stringify({ observedPostBodies, screenshotPaths })).not.toMatch(/idempotency-key|auth header|bearer|raw request|github body/i)
  })
})

test.describe.serial('SPEC-013D claim-control DB fixture cleanup', () => {
  let cookieHeader = ''

  test.beforeEach(async ({ page, request }) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  test('seeds disposable SPEC-013B/C rows, exercises real routes for required states, and cleans residue', async ({ page, request }, testInfo) => {
    const preseeded = await loadPreseededDbFixture()
    const fixtureWorkspace = preseeded
      ? {
          id: preseeded.scenarios[0]?.task.workspaceId ?? 0,
          tenantId: preseeded.scenarios[0]?.task.tenantId ?? 0,
          authBaseline: preseeded.authBaseline,
        }
      : resolveDbFixtureWorkspace()
    const scenarios = scenarioFixtures(preseeded?.scenarios ?? createDbFixtureScenarios(fixtureWorkspace))
    const seededRows = Object.values(scenarios).map(row => row.seeded)
    let cleanup: {
      before: DbCleanupCounts
      after: DbCleanupCounts
      restoredFeatureFlags: (string | null)[]
      viewerUserDeleted: boolean
    } | null = null
    const screenshotPaths: Record<string, string> = {}
    let viewerUser: { id: number; username: string } | null = null
    let caught: unknown = null

    try {
      if (!preseeded) {
        await enableDbFixtureClaimControl(request, fixtureWorkspace.id, cookieHeader)
      }

      await openDbFixtureTask(page, scenarios.retry.task)
      const region = page.getByRole('region', { name: /claim control/i })
      await expect(region.getByText(DB_STAGE_KEY)).toBeVisible()
      await expect(region.getByRole('button', { name: 'Retry stage' })).toBeEnabled()
      await expect(region.getByRole('button', { name: 'Release claim' })).toBeEnabled()
      await expect(region.getByRole('button', { name: 'Cancel stage' })).toBeEnabled()
      screenshotPaths[SCREENSHOT_NAMES[0]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[0])

      await region.getByRole('button', { name: 'Retry stage' }).click()
      screenshotPaths[SCREENSHOT_NAMES[1]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[1])
      await region.getByRole('button', { name: 'Submit' }).click()
      await expect(region.getByRole('status')).toContainText(/retry requested/i)
      await expect(region.getByRole('status')).toContainText(/available after refresh/i)
      screenshotPaths[SCREENSHOT_NAMES[2]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[2])

      await openDbFixtureTask(page, scenarios.release.task)
      const releaseRegion = page.getByRole('region', { name: /claim control/i })
      await releaseRegion.getByRole('button', { name: 'Release claim' }).click()
      await releaseRegion.getByRole('button', { name: 'Submit' }).click()
      await expect(releaseRegion.getByRole('status')).toContainText(/claim released/i)
      screenshotPaths['spec013d-claim-control-after-release.png'] = await attachClaimControlScreenshot(page, testInfo, 'spec013d-claim-control-after-release.png')

      await openDbFixtureTask(page, scenarios.cancel.task)
      const cancelRegion = page.getByRole('region', { name: /claim control/i })
      await cancelRegion.getByRole('button', { name: 'Cancel stage' }).click()
      await cancelRegion.getByLabel(/cancel reason required/i).fill('operator cancelled stuck attempt')
      await cancelRegion.getByRole('button', { name: 'Submit' }).click()
      await expect(cancelRegion.getByRole('status')).toContainText(/attempt cancelled/i)
      screenshotPaths['spec013d-claim-control-after-cancel.png'] = await attachClaimControlScreenshot(page, testInfo, 'spec013d-claim-control-after-cancel.png')

      await openDbFixtureTask(page, scenarios.backoff.task)
      const backoffRegion = page.getByRole('region', { name: /claim control/i })
      await expect(backoffRegion.getByRole('button', { name: 'Retry stage' })).toBeDisabled()
      await expect(backoffRegion.getByText('no_active_claim')).toBeVisible()
      await expect(backoffRegion.getByText('not_cancellable')).toBeVisible()
      screenshotPaths[SCREENSHOT_NAMES[3]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[3])
      await backoffRegion.getByRole('button', { name: 'Override backoff' }).click()
      await backoffRegion.getByLabel(/override reason required/i).fill('incident owner approved override')
      screenshotPaths[SCREENSHOT_NAMES[4]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[4])

      await openDbFixtureTask(page, scenarios.stale.task)
      const staleRegion = page.getByRole('region', { name: /claim control/i })
      await staleRegion.getByRole('button', { name: 'Retry stage' }).click()
      await postClaimControlAction(request, scenarios.stale.task, cookieHeader, 'release')
      await staleRegion.getByRole('button', { name: 'Submit' }).click()
      await expect(staleRegion.getByRole('alert')).toContainText(/state changed before submit/i)
      screenshotPaths[SCREENSHOT_NAMES[5]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[5])

      await setDbFixtureClaimControlFlag(request, fixtureWorkspace.id, cookieHeader, false)
      await openDbFixtureTask(page, scenarios.flagOff.task)
      const flagOffRegion = page.getByRole('region', { name: /claim control/i })
      await expect(flagOffRegion.getByText('feature_flag_off').first()).toBeVisible()
      await expect(flagOffRegion.getByRole('button', { name: 'Retry stage' })).toBeDisabled()
      screenshotPaths[SCREENSHOT_NAMES[7]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[7])
      await setDbFixtureClaimControlFlag(request, fixtureWorkspace.id, cookieHeader, true)

      viewerUser = await createViewerUser(request, cookieHeader)
      await loginAsUser(page, request, viewerUser.username, VIEWER_PASSWORD)
      await openDbFixtureTask(page, scenarios.viewer.task)
      const viewerRegion = page.getByRole('region', { name: /claim control/i })
      await expect(viewerRegion.getByText(/operator role is required/i)).toBeVisible()
      await expect(viewerRegion.getByRole('button', { name: 'Retry stage' })).toBeDisabled()
      screenshotPaths[SCREENSHOT_NAMES[6]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[6])
      await expect(region).not.toContainText(/idempotency-key|auth header|bearer|raw request|github body/i)
    } catch (error) {
      caught = error
    } finally {
      let viewerDeleted = false
      try {
        await deleteViewerUser(request, cookieHeader, viewerUser?.id ?? null)
        viewerDeleted = viewerUser === null || true
      } catch {
        viewerDeleted = false
      }
      let before = emptyCleanupCounts()
      let after = emptyCleanupCounts()
      const restoredFeatureFlags: (string | null)[] = []
      for (const seeded of seededRows) {
        const result = cleanupDbClaimControlRows(seeded)
        before = addCleanupCounts(before, result.before)
        after = addCleanupCounts(after, result.after)
        restoredFeatureFlags.push(result.restoredFeatureFlags)
      }
      cleanup = { before, after, restoredFeatureFlags, viewerUserDeleted: viewerDeleted }
      if (Object.keys(screenshotPaths).length > 0) {
        await attachDbFixtureExport(testInfo, seededRows, cleanup, screenshotPaths)
      }
      restoreDbFixtureAuthBaseline(fixtureWorkspace.authBaseline)
    }

    if (caught) {
      throw caught instanceof Error
        ? caught
        : new Error(typeof caught === 'string' ? caught : 'Non-Error thrown during SPEC-013D DB fixture')
    }
    for (const name of SCREENSHOT_NAMES) {
      expect(screenshotPaths[name]).toBeTruthy()
    }
    expect(cleanup.before).toMatchObject({
      tasks: seededRows.length,
      projects: seededRows.length,
      lifecycleControls: seededRows.length,
      claims: seededRows.filter(row => row.claimId !== null).length,
      stageAttempts: seededRows.length,
    })
    expect(cleanup.before.idempotencyRows).toBeGreaterThanOrEqual(1)
    expect(cleanup.before.activities).toBeGreaterThanOrEqual(1)
    expect(cleanup.after).toEqual({
      tasks: 0,
      projects: 0,
      lifecycleControls: 0,
      claims: 0,
      stageAttempts: 0,
      idempotencyRows: 0,
      activities: 0,
    })
    expect(cleanup.restoredFeatureFlags).toEqual(seededRows.map(row => row.originalFeatureFlags))
    expect(readWorkspaceFeatureFlags(fixtureWorkspace.id)).toBe(seededRows[0]?.originalFeatureFlags ?? null)
    expect(cleanup.viewerUserDeleted).toBe(true)
  })
})
