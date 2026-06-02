#!/usr/bin/env node
/**
 * SPEC-008 — host-side e2e seeder.
 *
 * Mirrors `scripts/seed-e2e-spec-007.cjs`: opens the Docker-mounted
 * SQLite database (path supplied via `PADDOCK_DB_PATH`) and
 * provisions a baseline `spec-008-fixture` workspace + agents +
 * default WIP / budget / blackout / override policy rows + sample
 * dispositions/artifacts/dispatch+decision rows so the SPEC-008
 * Governance tab has live data to render before the per-test
 * `/api/admin/spec-008/seed-fixture` POST creates additional
 * randomized workspaces.
 *
 * Anchor every timestamp to `Date.now()` (not a fixed historical
 * value) so live-window APIs (last 7d, last 24h) keep these rows in
 * range as the wall clock advances. This is the same fix iteration 4
 * applied to `seed-e2e-spec-007.cjs`.
 */

const Database = require('better-sqlite3')

const dbPath = process.env.PADDOCK_DB_PATH
if (!dbPath) {
  console.error('PADDOCK_DB_PATH is required')
  process.exit(1)
}

const NOW_SECONDS = Math.floor(Date.now() / 1000)
const NOW_ISO = new Date().toISOString()

const FIXTURE = {
  workspace: { name: 'SPEC-008 Fixture', slug: 'spec-008-fixture' },
  project: { name: 'SPEC-008 Fixture Project', ticketPrefix: 'S8F' },
  agents: [
    'spec-008-aegis',
    'spec-008-agent-0',
    'spec-008-agent-1',
    'spec-008-agent-2',
  ],
}

const ALL_RC_FACTORY_FLAGS_ON = {
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_GLOBAL_AEGIS: true,
  FEATURE_TASK_PIPELINES: true,
  FEATURE_TWO_STEP_TERMINAL: true,
  FEATURE_AREA_LABEL_ROUTING: true,
  FEATURE_DISPOSITION_LOGGING: true,
  FEATURE_TASK_ARTIFACTS: true,
  FEATURE_RESOURCE_GOVERNANCE: true,
  FEATURE_OPENCLAW_HEALTH_COSTS: true,
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
}

function columnsFor(db, table) {
  if (!tableExists(db, table)) return new Set()
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name))
}

function insertRow(db, table, values) {
  const columns = columnsFor(db, table)
  const entries = Object.entries(values).filter(([column]) => columns.has(column))
  if (entries.length === 0) throw new Error(`No insertable columns found for ${table}`)
  const names = entries.map(([column]) => column)
  const info = db.prepare(`
    INSERT INTO ${table} (${names.join(', ')})
    VALUES (${names.map(() => '?').join(', ')})
  `).run(...entries.map(([, value]) => value))
  return Number(info.lastInsertRowid)
}

function placeholders(values) {
  return values.map(() => '?').join(', ')
}

function selectIdsWhereIn(db, table, column, values) {
  if (values.length === 0 || !tableExists(db, table)) return []
  return db
    .prepare(`SELECT id FROM ${table} WHERE ${column} IN (${placeholders(values)})`)
    .all(...values)
    .map((row) => row.id)
}

function deleteWhereIn(db, table, column, values) {
  if (values.length === 0 || !tableExists(db, table)) return
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(values)})`).run(...values)
}

function mergeFeatureFlags(raw, updates) {
  let flags = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) flags = parsed
    } catch {
      flags = {}
    }
  }
  return JSON.stringify({ ...flags, ...updates })
}

function resetFixture(db) {
  const workspaceIds = selectIdsWhereIn(db, 'workspaces', 'slug', [FIXTURE.workspace.slug])
  const taskIds = selectIdsWhereIn(db, 'tasks', 'workspace_id', workspaceIds)

  // Delete in FK-respecting order.
  deleteWhereIn(db, 'task_artifacts', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'task_dispositions', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'task_subscriptions', 'task_id', taskIds)
  deleteWhereIn(db, 'comments', 'task_id', taskIds)
  deleteWhereIn(db, 'quality_reviews', 'task_id', taskIds)
  deleteWhereIn(db, 'tasks', 'id', taskIds)
  deleteWhereIn(db, 'agents', 'name', FIXTURE.agents)
  deleteWhereIn(db, 'agents', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'projects', 'workspace_id', workspaceIds)
  if (tableExists(db, 'resource_overrides') && workspaceIds.length > 0) {
    db.prepare(
      `DELETE FROM resource_overrides
       WHERE scope_kind='workspace' AND scope_id IN (${placeholders(workspaceIds)})`
    ).run(...workspaceIds)
  }
  deleteWhereIn(db, 'resource_policies', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'aegis_emergency_reserves', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'aegis_fallback_activity', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'workspaces', 'id', workspaceIds)
}

function createWorkspace(db) {
  const id = insertRow(db, 'workspaces', {
    name: FIXTURE.workspace.name,
    slug: FIXTURE.workspace.slug,
    tenant_id: 1,
    feature_flags: mergeFeatureFlags(null, {
      ...ALL_RC_FACTORY_FLAGS_ON,
      spec_008_e2e_fixture: true,
    }),
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
  return id
}

function createProject(db, workspaceId) {
  return insertRow(db, 'projects', {
    workspace_id: workspaceId,
    name: FIXTURE.project.name,
    slug: FIXTURE.workspace.slug,
    ticket_prefix: FIXTURE.project.ticketPrefix,
    ticket_counter: 2,
    status: 'active',
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
}

function createAgents(db, workspaceId) {
  const ids = []
  // Emergency-eligible Aegis singleton.
  ids.push(insertRow(db, 'agents', {
    name: FIXTURE.agents[0],
    role: 'reviewer',
    status: 'offline',
    scope: 'global',
    workspace_id: workspaceId,
    config: JSON.stringify({ e2e_fixture: 'spec-008', emergency_eligible: true }),
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  }))
  // Three generic agents.
  for (let i = 1; i < FIXTURE.agents.length; i += 1) {
    ids.push(insertRow(db, 'agents', {
      name: FIXTURE.agents[i],
      role: 'tester',
      status: 'offline',
      scope: 'workspace',
      workspace_id: workspaceId,
      config: JSON.stringify({ e2e_fixture: 'spec-008' }),
      created_at: NOW_SECONDS,
      updated_at: NOW_SECONDS,
    }))
  }
  return ids
}

function createTask(db, workspaceId, projectId, title, agentName, ticketNo) {
  return insertRow(db, 'tasks', {
    title,
    description: `${title} seeded by SPEC-008 e2e fixture`,
    priority: 'medium',
    status: 'inbox',
    project_id: projectId,
    project_ticket_no: ticketNo,
    assigned_to: agentName,
    created_by: 'e2e',
    workspace_id: workspaceId,
    tags: JSON.stringify(['spec-008']),
    metadata: JSON.stringify({ e2e_fixture: 'spec-008' }),
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
}

function seedResourcePolicies(db, workspaceId, agentIds) {
  if (!tableExists(db, 'resource_policies')) return 0
  const stmt = db.prepare(`
    INSERT INTO resource_policies
      (workspace_id, agent_id, policy_type, limit_kind, limit_value,
       enforcement, soft_threshold_pct, hard_threshold_pct, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `)
  let n = 0
  // Default WIP policies — agent and workspace.
  if (agentIds.length > 0) {
    stmt.run(workspaceId, agentIds[0], 'wip_limit', 'concurrent_tasks', 1, 'defer', 80, 100)
    n += 1
  }
  stmt.run(workspaceId, null, 'wip_limit', 'concurrent_tasks', 5, 'block_dispatch', 80, 100)
  n += 1
  // Default daily USD budget.
  stmt.run(workspaceId, null, 'budget', 'usd_daily', 25.0, 'defer', 80, 100)
  n += 1
  // One weekly blackout window.
  const blackoutSchedule = JSON.stringify({
    timezone: 'America/Chicago',
    weekly: [{ day: 'Sun', start: '22:00', end: '06:00' }],
  })
  db.prepare(`
    INSERT INTO resource_policies
      (workspace_id, policy_type, limit_kind, limit_value, enforcement,
       timezone, schedule_json, enabled)
    VALUES (?, 'blackout', 'weekly_window', 1, 'block_dispatch', 'America/Chicago', ?, 1)
  `).run(workspaceId, blackoutSchedule)
  n += 1
  return n
}

function seedOverrideGrant(db, workspaceId) {
  if (!tableExists(db, 'resource_overrides')) return 0
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    INSERT INTO resource_overrides
      (scope_kind, scope_id, granted_amount, granted_unit, reason, actor,
       idempotency_key, granted_at, expires_at)
    VALUES ('workspace', ?, 50.0, 'usd', ?, 'admin', ?, ?, ?)
  `).run(
    workspaceId,
    'spec-008 e2e fixture seed',
    `spec-008-fixture-${workspaceId}-${Date.now()}`,
    NOW_ISO,
    expiresAt,
  )
  return 1
}

function seedDispositions(db, workspaceId, taskId, agentIds) {
  if (!tableExists(db, 'task_dispositions') || !taskId || agentIds.length === 0) return 0
  const stmt = db.prepare(`
    INSERT INTO task_dispositions
      (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  // Two sample disposition rows for diagnostic-feed pagination smoke.
  stmt.run(taskId, 'merged', null, agentIds[1] ?? agentIds[0], NOW_SECONDS - 60, workspaceId)
  stmt.run(taskId, 'closed', 'spec-008 sample', agentIds[1] ?? agentIds[0], NOW_SECONDS - 30, workspaceId)
  return 2
}

function seedDecisionEvents(db, workspaceId, agentIds) {
  if (!tableExists(db, 'resource_policy_events') || agentIds.length === 0) return 0
  const stmt = db.prepare(`
    INSERT INTO resource_policy_events
      (policy_id, agent_id, decision, reason, observed_value, limit_value, metadata)
    VALUES (NULL, ?, ?, ?, ?, ?, ?)
  `)
  let n = 0
  // Sample dispatch + decision rows for the diagnostic feed pagination tests.
  // We push more than one page-worth so cursor advance is exercised.
  for (let i = 0; i < 30; i += 1) {
    const decision = i % 3 === 0 ? 'allow' : i % 3 === 1 ? 'defer' : 'block'
    const reason = i % 3 === 0
      ? `dispatch_emit_fixture_${i}`
      : i % 3 === 1
        ? `wip_exceeded_${i}`
        : `budget_exceeded_${i}`
    stmt.run(
      agentIds[i % agentIds.length],
      decision,
      reason,
      i,
      i + 1,
      JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true, idx: i }),
    )
    n += 1
  }
  return n
}

function seedAegisReserve(db, workspaceId) {
  if (!tableExists(db, 'aegis_emergency_reserves')) return 0
  db.prepare(`
    INSERT INTO aegis_emergency_reserves
      (workspace_id, usd_remaining, tokens_remaining, usd_seed, tokens_seed, last_replenished_at)
    VALUES (?, 50.0, 10000, 50.0, 10000, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id) DO NOTHING
  `).run(workspaceId)
  return 1
}

function enableSpec008Flag(db) {
  // Per the resolveFlag pitfall in CLAUDE.md: env vars cannot opt a
  // workspace IN. We must persist on the workspaces row.
  const rows = db.prepare('SELECT id, feature_flags FROM workspaces').all()
  const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
  for (const row of rows) {
    update.run(
      mergeFeatureFlags(row.feature_flags, {
        ...ALL_RC_FACTORY_FLAGS_ON,
      }),
      row.id,
    )
  }
}

const db = new Database(dbPath)

try {
  if (!tableExists(db, 'workspaces')) {
    throw new Error(`No workspaces table found in ${dbPath}; start the e2e app once before seeding`)
  }
  db.pragma('busy_timeout = 5000')

  const summary = db.transaction(() => {
    resetFixture(db)
    enableSpec008Flag(db)

    const workspaceId = createWorkspace(db)
    const projectId = createProject(db, workspaceId)
    const agentIds = createAgents(db, workspaceId)
    const taskId = createTask(db, workspaceId, projectId, 'SPEC-008 fixture task 0', FIXTURE.agents[0], 1)

    const policyCount = seedResourcePolicies(db, workspaceId, agentIds)
    const overrideCount = seedOverrideGrant(db, workspaceId)
    const dispoCount = seedDispositions(db, workspaceId, taskId, agentIds)
    const decisionCount = seedDecisionEvents(db, workspaceId, agentIds)
    const reserveCount = seedAegisReserve(db, workspaceId)

    return { workspaceId, agentCount: agentIds.length, policyCount, overrideCount, dispoCount, decisionCount, reserveCount }
  })()

  db.pragma('wal_checkpoint(TRUNCATE)')
  console.log(`[e2e-docker] seeded SPEC-008 fixture: ${JSON.stringify(summary)}`)
} finally {
  db.close()
}
