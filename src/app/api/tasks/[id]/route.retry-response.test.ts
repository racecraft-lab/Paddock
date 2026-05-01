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
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT, workspace_id INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT, priority TEXT DEFAULT 'medium', assigned_to TEXT, created_by TEXT, created_at INTEGER DEFAULT 1, updated_at INTEGER DEFAULT 1, project_id INTEGER, project_ticket_no INTEGER, resolution TEXT, error_message TEXT, tags TEXT DEFAULT '[]', metadata TEXT DEFAULT '{}', workspace_id INTEGER, workflow_template_id INTEGER, workflow_template_slug TEXT, parent_task_id INTEGER, root_task_id INTEGER, chain_id TEXT, chain_stage INTEGER);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT (unixepoch()));
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?, ?)').run('Start', 'Prompt', 'start', 'builder', JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }), 'next')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 1, ?, ?)').run('Next', 'Next prompt', 'next', 'builder')
  db.prepare(`INSERT INTO ${tasksTable} (title, status, priority, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug) VALUES (?, ?, ?, 10, ?, 1, 1, ?)`).run('Parent', 'done', 'high', JSON.stringify({ ok: 'bad' }), 'start')
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

describe('retry_chain_advancement response contract', () => {
  it('returns normal task detail data plus bounded chain_retry and audited recovery metadata', async () => {
    const db = createDb()
    mockDeps(db)
    const { advanceTaskChain } = await import('@/lib/task-dispatch')
    advanceTaskChain({ taskId: 1, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
    db.prepare('UPDATE tasks SET resolution = ? WHERE id = 1').run(JSON.stringify({ ok: true }))
    const { POST } = await import('@/app/api/tasks/[id]/route')

    const response = await POST(new NextRequest('http://localhost/api/tasks/1', { method: 'POST', body: JSON.stringify({ action: 'retry_chain_advancement' }) }), { params: Promise.resolve({ id: '1' }) })
    const body = await response.json()
    const serialized = JSON.stringify(body)
    const recovery = db.prepare("SELECT data FROM activities WHERE json_extract(data, '$.reason_code') = 'task_pipeline_retry_chain_advancement' ORDER BY id DESC LIMIT 1").get() as { data: string }
    const recoveryData = JSON.parse(recovery.data)

    expect(response.status).toBe(200)
    expect(body.task).toMatchObject({ id: 1, status: 'done', tags: [], metadata: expect.any(Object) })
    expect(body.chain_retry).toEqual({
      recovery_class: 'failed_parent',
      retry_attempt: 1,
      recovery_outcome: 'successor_created',
      successor_task_id: expect.any(Number),
      chain_terminated: false,
      idempotent_successor: false,
    })
    expect(serialized).not.toContain('corrected_output')
    expect(serialized).not.toContain('parsed_output')
    expect(serialized).not.toContain('routing_trace')
    expect(recoveryData).toMatchObject({
      reason_code: 'task_pipeline_retry_chain_advancement',
      previous_reason_code: 'task_pipeline_output_invalid',
      recovery_class: 'failed_parent',
      recovery_action: 'retry_chain_advancement',
      recovery_outcome: 'successor_created',
      retry_attempt: 1,
      corrected_resolution_sha256: expect.any(String),
      template_drift_confirmed: false,
    })
    expect(JSON.stringify(recoveryData)).not.toContain('"ok":true')
  })
})
