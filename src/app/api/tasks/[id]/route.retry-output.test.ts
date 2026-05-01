import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []
const tasksTable = 'tasks'
let validatedBody: unknown

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  validatedBody = undefined
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
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT,
      task_prompt TEXT,
      workspace_id INTEGER,
      slug TEXT,
      agent_role TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      assigned_to TEXT,
      created_by TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1,
      completed_at INTEGER,
      project_id INTEGER,
      project_ticket_no INTEGER,
      resolution TEXT,
      error_message TEXT,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER
    );
    CREATE TABLE quality_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, reviewer TEXT, status TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT 1);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT (unixepoch()));
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug)
    VALUES (1, 'Start', 'Start prompt', 1, 'start', 'builder', ?, 'next')
  `).run(JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }))
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role)
    VALUES (2, 'Next', 'Next prompt', 1, 'next', 'builder')
  `).run()
  return db
}

function addParent(db: Database.Database, status: string, resolution: string | null): number {
  const result = db.prepare(`
    INSERT INTO ${tasksTable} (title, description, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'desc', ?, 'high', 'builder', 10, ?, 1, 1, 'start')
  `).run(status, resolution)
  const id = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO quality_reviews (task_id, reviewer, status, workspace_id) VALUES (?, ?, ?, 1)').run(id, 'aegis', 'approved')
  return id
}

function mockDeps(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: {
      logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
        db.prepare('INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
      }),
      createNotification: vi.fn(),
      ensureTaskSubscription: vi.fn(),
    },
  }))
  vi.doMock('@/lib/auth', () => ({ requireRole: vi.fn(() => ({ user: { username: 'operator', display_name: 'Operator' } })) }))
  vi.doMock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
  vi.doMock('@/lib/validation', () => ({
    validateBody: vi.fn(async () => ({ data: validatedBody })),
    updateTaskSchema: {},
  }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1 })),
    workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
    workspaceScopeError: vi.fn(() => null),
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/mentions', () => ({ resolveMentionRecipients: vi.fn(() => ({ recipients: [], unresolved: [] })) }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: false } } }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
}

function request(method: string, taskId: number, body?: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${taskId}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function seedOutputFailure(parentId: number) {
  const { advanceTaskChain } = await import('@/lib/task-dispatch')
  advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
}

describe('retry_chain_advancement output recovery', () => {
  it('does not rerun advancement for an ordinary failed-to-done detail update', async () => {
    const db = createDb()
    const parentId = addParent(db, 'failed', JSON.stringify({ ok: true }))
    mockDeps(db)
    validatedBody = { status: 'done' }
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(request('PUT', parentId), { params: Promise.resolve({ id: String(parentId) }) })

    expect(response.status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(parentId)).toEqual({ count: 0 })
  })

  it('revalidates corrected failed-parent output and creates a successor only through explicit retry', async () => {
    const db = createDb()
    const parentId = addParent(db, 'done', JSON.stringify({ ok: 'bad' }))
    mockDeps(db)
    await seedOutputFailure(parentId)
    db.prepare('UPDATE tasks SET resolution = ? WHERE id = ?').run(JSON.stringify({ ok: true }), parentId)
    const { POST } = await import('@/app/api/tasks/[id]/route')

    const response = await POST(request('POST', parentId, { action: 'retry_chain_advancement' }), { params: Promise.resolve({ id: String(parentId) }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.chain_retry).toMatchObject({
      recovery_class: 'failed_parent',
      retry_attempt: 1,
      recovery_outcome: 'successor_created',
      successor_task_id: expect.any(Number),
      chain_terminated: false,
      idempotent_successor: false,
    })
    expect(db.prepare('SELECT status FROM tasks WHERE id = ?').get(parentId)).toEqual({ status: 'done' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(parentId)).toEqual({ count: 1 })
  })

  it('keeps a failed parent failed when corrected output is still invalid', async () => {
    const db = createDb()
    const parentId = addParent(db, 'done', null)
    mockDeps(db)
    await seedOutputFailure(parentId)
    const { POST } = await import('@/app/api/tasks/[id]/route')

    const response = await POST(request('POST', parentId, { action: 'retry_chain_advancement' }), { params: Promise.resolve({ id: String(parentId) }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.chain_retry).toMatchObject({
      recovery_class: 'failed_parent',
      retry_attempt: 1,
      recovery_outcome: 'output_still_invalid',
      successor_task_id: null,
      chain_terminated: false,
      idempotent_successor: false,
    })
    expect(db.prepare('SELECT status FROM tasks WHERE id = ?').get(parentId)).toEqual({ status: 'failed' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(parentId)).toEqual({ count: 0 })
  })
})
