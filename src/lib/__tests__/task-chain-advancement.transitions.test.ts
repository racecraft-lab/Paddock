import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []
let validatedBody: unknown

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  validatedBody = undefined
  vi.doUnmock('@/lib/task-dispatch')
  vi.resetModules()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER, scope TEXT DEFAULT 'workspace', status TEXT DEFAULT 'online', config TEXT);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT, workspace_id INTEGER);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT,
      task_prompt TEXT,
      workspace_id INTEGER,
      slug TEXT,
      agent_role TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      resolution TEXT,
      assigned_to TEXT,
      created_by TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1,
      completed_at INTEGER,
      project_id INTEGER,
      project_ticket_no INTEGER,
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
    CREATE TABLE quality_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, reviewer TEXT, status TEXT, notes TEXT, workspace_id INTEGER, created_at INTEGER DEFAULT 1);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id, scope, status, config) VALUES (1, ?, 1, ?, ?, ?)').run('aegis', 'workspace', 'online', '{"openclawId":"aegis"}')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (2, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start', 'start', 'builder', 'next')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 1, ?, ?)').run('next', 'Next', 'next', 'builder')
  return db
}

function addParent(db: Database.Database, id: number, status: string) {
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, project_id, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES (?, ?, 'desc', ?, 'high', 'done', 'builder', 10, 1, 1, 'start')
  `).run(id, `Parent ${id}`, status)
  db.prepare('INSERT INTO quality_reviews (task_id, reviewer, status, notes, workspace_id) VALUES (?, ?, ?, ?, 1)')
    .run(id, 'aegis', 'approved', 'ok')
}

function mockRouteDeps(db: Database.Database, advanceTaskChain = vi.fn(() => ({ advanced: false, reason: 'not_eligible' }))) {
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
    bulkUpdateTaskStatusSchema: {},
    updateTaskSchema: {},
    qualityReviewSchema: {},
    createTaskSchema: {},
  }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1 })),
    workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
    workspaceScopeError: vi.fn(() => null),
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/mentions', () => ({ resolveMentionRecipients: vi.fn(() => ({ recipients: [], unresolved: [] })) }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  vi.doMock('@/lib/task-dispatch', () => ({
    advanceTaskChain,
    isSpec009C3DevImplementationTask: vi.fn(() => false),
    evaluateSpec009C3ReadinessEvidence: vi.fn(() => ({ ok: true })),
  }))
  return advanceTaskChain
}

describe('terminal-success advancement hooks', () => {
  it('advances after Aegis review approval in the scheduler path', async () => {
    const db = createDb()
    addParent(db, 99, 'review')
    vi.doMock('@/lib/db', () => ({
      getDatabase: () => db,
      db_helpers: {
        logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
          db.prepare('INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
        }),
      },
    }))
    vi.doMock('@/lib/command', () => ({ runOpenClaw: vi.fn(async () => ({ stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }) })) }))
    vi.doMock('@/lib/config', () => ({ config: { openclawHome: '/tmp/openclaw', gnap: { enabled: false } } }))
    vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
    vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(({ err }) => { throw err }), warn: vi.fn() } }))
    const { runAegisReviews } = await import('@/lib/task-dispatch')

    await runAegisReviews()

    expect(db.prepare('SELECT status FROM tasks WHERE id = 99').get()).toEqual({ status: 'done' })
    expect(db.prepare('SELECT workflow_template_slug, parent_task_id FROM tasks WHERE parent_task_id = 99').get())
      .toEqual({ workflow_template_slug: 'next', parent_task_id: 99 })
  })

  it('calls advanceTaskChain after operator quality-review approval', async () => {
    const db = createDb()
    addParent(db, 100, 'review')
    validatedBody = { taskId: 100, reviewer: 'operator', status: 'approved', notes: 'ok' }
    const advanceTaskChain = mockRouteDeps(db)
    const { POST } = await import('@/app/api/quality-review/route')

    const response = await POST(new NextRequest('http://localhost/api/quality-review', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(advanceTaskChain).toHaveBeenCalledWith({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'quality_review' })
  })

  it('calls advanceTaskChain after bulk task status updates to done', async () => {
    const db = createDb()
    addParent(db, 101, 'review')
    validatedBody = { tasks: [{ id: 101, status: 'done' }] }
    const advanceTaskChain = mockRouteDeps(db)
    const { PUT } = await import('@/app/api/tasks/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks', { method: 'PUT' }))

    expect(response.status).toBe(200)
    expect(advanceTaskChain).toHaveBeenCalledWith({ taskId: 101, workspaceId: 1, previousStatus: 'review', trigger: 'bulk_task_update' })
  })

  it('calls advanceTaskChain after detail task status update to done', async () => {
    const db = createDb()
    addParent(db, 102, 'review')
    validatedBody = { status: 'done' }
    const advanceTaskChain = mockRouteDeps(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/102', { method: 'PUT' }), { params: Promise.resolve({ id: '102' }) })

    expect(response.status).toBe(200)
    expect(advanceTaskChain).toHaveBeenCalledWith({ taskId: 102, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
  })
})
