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
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT, workspace_id INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT, priority TEXT DEFAULT 'medium', assigned_to TEXT, project_id INTEGER, project_ticket_no INTEGER, resolution TEXT, error_message TEXT, tags TEXT DEFAULT '[]', metadata TEXT DEFAULT '{}', workspace_id INTEGER, workflow_template_id INTEGER, workflow_template_slug TEXT, parent_task_id INTEGER, root_task_id INTEGER, chain_id TEXT, chain_stage INTEGER);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT (unixepoch()));
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('Start', 'Prompt', 'start', 'builder', 'missing')
  db.prepare(`INSERT INTO ${tasksTable} (id, title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, 1, 1, ?)`).run('Parent', 'done', 'high', 'start')
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

async function postRetry(body: Record<string, unknown> = { action: 'retry_chain_advancement' }) {
  const { POST } = await import('@/app/api/tasks/[id]/route')
  const response = await POST(new NextRequest('http://localhost/api/tasks/100', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: '100' }) })
  return { response, body: await response.json() }
}

describe('retry_chain_advancement terminal and idempotent outcomes', () => {
  it('terminates after retry when routing no longer selects a successor, then rejects later retry as not eligible', async () => {
    const db = createDb()
    mockDeps(db)
    const { advanceTaskChain } = await import('@/lib/task-dispatch')
    advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
    db.prepare('UPDATE workflow_templates SET next_template_slug = NULL WHERE id = 1').run()

    const first = await postRetry({ action: 'retry_chain_advancement', confirm_template_drift: true })
    const second = await postRetry({ action: 'retry_chain_advancement', confirm_template_drift: true })

    expect(first.response.status).toBe(200)
    expect(first.body.chain_retry).toMatchObject({
      recovery_outcome: 'chain_terminated',
      successor_task_id: null,
      chain_terminated: true,
      idempotent_successor: false,
    })
    expect(second.response.status).toBe(409)
    expect(second.body.retry_rejection_reason).toBe('retry_not_eligible')
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 0 })
  })

  it('returns successor_already_exists when a successor already exists after the selected stall', async () => {
    const db = createDb()
    mockDeps(db)
    const { advanceTaskChain } = await import('@/lib/task-dispatch')
    advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
    db.prepare(`INSERT INTO ${tasksTable} (id, title, status, priority, project_id, workspace_id, parent_task_id) VALUES (200, ?, ?, ?, 10, 1, 100)`).run('Existing', 'assigned', 'high')

    const result = await postRetry()

    expect(result.response.status).toBe(200)
    expect(result.body.chain_retry).toMatchObject({
      recovery_outcome: 'successor_already_exists',
      successor_task_id: 200,
      chain_terminated: false,
      idempotent_successor: true,
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 1 })
  })
})
