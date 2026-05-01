import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []
const tasksTable = 'tasks'

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT, priority TEXT DEFAULT 'medium', assigned_to TEXT, created_at INTEGER DEFAULT 1, updated_at INTEGER DEFAULT 1, project_id INTEGER, project_ticket_no INTEGER, resolution TEXT, error_message TEXT, tags TEXT DEFAULT '[]', metadata TEXT DEFAULT '{}', workspace_id INTEGER, workflow_template_id INTEGER, workflow_template_slug TEXT, parent_task_id INTEGER);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT (unixepoch()));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?, ?)').run('Start', 'Prompt', 'start', 'builder', JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }), 'next')
  db.prepare(`INSERT INTO ${tasksTable} (id, title, status, priority, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, ?, 1, 1, ?)`).run('Parent', 'failed', 'high', JSON.stringify({ ok: true }), 'start')
  return db
}

function mockDeps(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn(), createNotification: vi.fn(), ensureTaskSubscription: vi.fn() } }))
  vi.doMock('@/lib/auth', () => ({ requireRole: vi.fn(() => ({ user: { username: 'operator' } })) }))
  vi.doMock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1 })),
    workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
    workspaceScopeError: vi.fn(() => null),
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: false } } }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
}

function insertActivity(db: Database.Database, taskId: number, data: Record<string, unknown>) {
  db.prepare('INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .run('task_pipeline_advancement', 'task', taskId, 'task-pipeline', 'activity', JSON.stringify(data))
}

function snapshot(db: Database.Database) {
  return {
    status: db.prepare('SELECT status FROM tasks WHERE id = 100').get(),
    activityCount: db.prepare('SELECT COUNT(*) AS count FROM activities').get(),
    successorCount: db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get(),
  }
}

async function postRetry(db: Database.Database, body: Record<string, unknown> = { action: 'retry_chain_advancement' }) {
  mockDeps(db)
  const { POST } = await import('@/app/api/tasks/[id]/route')
  return POST(new NextRequest('http://localhost/api/tasks/100', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: '100' }) })
}

describe('retry_chain_advancement conflicts', () => {
  it('rejects ineligible tasks with a side-effect-free retry_not_eligible conflict', async () => {
    const db = createDb()
    const before = snapshot(db)

    const response = await postRetry(db)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'retry_conflict', retry_rejection_reason: 'retry_not_eligible' })
    expect(snapshot(db)).toEqual(before)
  })

  it('fails closed when the selected latest eligible activity lacks template provenance, even with drift confirmation', async () => {
    const db = createDb()
    insertActivity(db, 100, { reason_code: 'task_pipeline_output_invalid', trigger: 'detail_task_update' })
    const before = snapshot(db)

    const response = await postRetry(db, { action: 'retry_chain_advancement', confirm_template_drift: true })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.retry_rejection_reason).toBe('retry_template_provenance_missing')
    expect(snapshot(db)).toEqual(before)
  })

  it('does not accept an activity_id override to replay an older eligible activity', async () => {
    const db = createDb()
    insertActivity(db, 100, {
      reason_code: 'task_pipeline_output_missing',
      trigger: 'detail_task_update',
      template_provenance: { output_schema_sha256: 'older', routing_rules_sha256: 'older', next_template_slug_sha256: 'older' },
    })
    insertActivity(db, 100, { reason_code: 'task_pipeline_output_invalid', trigger: 'detail_task_update' })
    const before = snapshot(db)

    const response = await postRetry(db, { action: 'retry_chain_advancement', activity_id: 1, confirm_template_drift: true })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.retry_rejection_reason).toBe('retry_not_eligible')
    expect(snapshot(db)).toEqual(before)
  })
})
