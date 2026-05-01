import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []
const tasksTable = 'tasks'

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(outputFailure = true): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT, priority TEXT DEFAULT 'medium', assigned_to TEXT, project_id INTEGER, resolution TEXT, error_message TEXT, tags TEXT DEFAULT '[]', metadata TEXT DEFAULT '{}', workspace_id INTEGER, workflow_template_id INTEGER, workflow_template_slug TEXT, parent_task_id INTEGER);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT (unixepoch()));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  if (outputFailure) {
    db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?, ?)').run('Start', 'Prompt', 'start', 'builder', JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }), null)
    db.prepare(`INSERT INTO ${tasksTable} (id, title, status, priority, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, ?, 1, 1, ?)`).run('Parent', 'done', 'high', JSON.stringify({ ok: 'bad' }), 'start')
  } else {
    db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('Start', 'Prompt', 'start', 'builder', 'missing')
    db.prepare(`INSERT INTO ${tasksTable} (id, title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, 1, 1, ?)`).run('Parent', 'done', 'high', 'start')
  }
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

async function retry() {
  const { POST } = await import('@/app/api/tasks/[id]/route')
  const response = await POST(new NextRequest('http://localhost/api/tasks/100', { method: 'POST', body: JSON.stringify({ action: 'retry_chain_advancement' }) }), { params: Promise.resolve({ id: '100' }) })
  return response.json()
}

describe('retry_chain_advancement repeated unresolved attempts', () => {
  it('allows repeated validation retries without a hard cap while output remains invalid', async () => {
    const db = createDb(true)
    mockDeps(db)
    const { advanceTaskChain } = await import('@/lib/task-dispatch')
    advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(await retry()).toMatchObject({ chain_retry: { retry_attempt: 1, recovery_outcome: 'output_still_invalid' } })
    expect(await retry()).toMatchObject({ chain_retry: { retry_attempt: 2, recovery_outcome: 'output_still_invalid' } })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 0 })
  })

  it('allows repeated stalled retries without a hard cap while the stall remains unresolved', async () => {
    const db = createDb(false)
    mockDeps(db)
    const { advanceTaskChain } = await import('@/lib/task-dispatch')
    advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(await retry()).toMatchObject({ chain_retry: { retry_attempt: 1, recovery_outcome: 'stall_persisted' } })
    expect(await retry()).toMatchObject({ chain_retry: { retry_attempt: 2, recovery_outcome: 'stall_persisted' } })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 0 })
  })
})
