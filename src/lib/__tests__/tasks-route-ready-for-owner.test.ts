import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      ticket_prefix TEXT,
      status TEXT DEFAULT 'active',
      ticket_counter INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
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
      workspace_id INTEGER NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      github_repo TEXT,
      github_pr_number INTEGER
    );
    CREATE TABLE quality_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      reviewer TEXT,
      status TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({
    FEATURE_TASK_PIPELINES: true,
    FEATURE_TWO_STEP_TERMINAL: false,
  }))
  db.prepare('INSERT INTO projects (id, workspace_id, name, ticket_prefix) VALUES (10, 1, ?, ?)').run('Alpha', 'ALP')
  db.prepare(`
    INSERT INTO workflow_templates (id, workspace_id, slug, produces_pr, external_terminal_event)
    VALUES (20, 1, 'pr-template', 1, 'github_pr_merged')
  `).run()
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, assigned_to, project_id, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES (100, 'Owner gate candidate', 'Needs owner gate', 'quality_review', 'high', 'builder', 10, 1, 20, 'pr-template')
  `).run()
  return db
}

function setTwoStepTerminalFlag(db: Database.Database, enabled: boolean) {
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1').run(JSON.stringify({
    FEATURE_TASK_PIPELINES: true,
    FEATURE_TWO_STEP_TERMINAL: enabled,
  }))
}

function seedReadyForOwnerTask(db: Database.Database, id: number, status = 'ready_for_owner') {
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, status, priority, assigned_to, project_id, workspace_id,
      workflow_template_id, workflow_template_slug, github_repo, github_pr_number
    )
    VALUES (?, ?, 'Needs owner merge', ?, 'high', 'builder', 10, 1, 20, 'pr-template', 'owner/repo', ?)
  `).run(id, `Owner gate ${id}`, status, id)
}

function mockDeps(db: Database.Database) {
  const broadcast = vi.fn()
  const syncTaskOutbound = vi.fn()
  const advanceTaskChain = vi.fn()
  const createNotification = vi.fn((recipient, type, title, message, sourceType, sourceId, workspaceId) => {
    db.prepare(`
      INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(recipient, type, title, message, sourceType, sourceId, workspaceId)
  })
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: {
      logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
        db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
      }),
      createNotification,
      ensureTaskSubscription: vi.fn(),
    },
  }))
  vi.doMock('@/lib/auth', () => ({ requireRole: vi.fn(() => ({ user: { username: 'operator', display_name: 'Operator' } })) }))
  vi.doMock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1 })),
    workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
    workspaceScopeError: vi.fn(() => null),
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound }))
  vi.doMock('@/lib/gnap-sync', () => ({ removeTaskFromGnap: vi.fn() }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: false, autoSync: false, repoPath: '' } } }))
  vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
  vi.doMock('@/lib/task-dispatch', () => ({ advanceTaskChain, retryTaskChainAdvancement: vi.fn() }))
  return { advanceTaskChain, broadcast, createNotification, syncTaskOutbound }
}

function snapshot(db: Database.Database) {
  return {
    tasks: db.prepare('SELECT id, status, updated_at, completed_at, resolution, error_message FROM tasks ORDER BY id').all(),
    activities: db.prepare('SELECT COUNT(*) AS count FROM activities').get(),
    notifications: db.prepare('SELECT COUNT(*) AS count FROM notifications').get(),
  }
}

describe('task routes ready_for_owner flag-off write guard', () => {
  it('rejects initial ready_for_owner task creation before create side effects', async () => {
    const db = createDb()
    const mocks = mockDeps(db)
    const before = snapshot(db)
    const { POST } = await import('@/app/api/tasks/route')

    const response = await POST(new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Bad initial owner gate', status: 'ready_for_owner' }),
      headers: { 'content-type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'ready_for_owner cannot be used as an initial task status' })
    expect(snapshot(db)).toEqual(before)
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(mocks.syncTaskOutbound).not.toHaveBeenCalled()
  })

  it('rejects bulk ready_for_owner writes while the flag is off before mutating state', async () => {
    const db = createDb()
    mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks: [{ id: 100, status: 'ready_for_owner' }] }),
      headers: { 'content-type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
  })

  it('rejects bulk ready_for_owner writes while the flag is on before mutating state', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks: [{ id: 100, status: 'ready_for_owner' }] }),
      headers: { 'content-type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
  })

  it('rejects detail ready_for_owner writes while the flag is off before mutating state', async () => {
    const db = createDb()
    mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/100', {
      method: 'PUT',
      body: JSON.stringify({ status: 'ready_for_owner' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: '100' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
  })

  it('rejects detail ready_for_owner writes while the flag is on before mutating state', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/100', {
      method: 'PUT',
      body: JSON.stringify({ status: 'ready_for_owner' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: '100' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
  })

  it('allows bulk done writes for PR-producing templates without the GitHub merge terminal event', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    db.prepare("UPDATE workflow_templates SET external_terminal_event = 'review.completed' WHERE id = 20").run()
    db.prepare("INSERT INTO quality_reviews (task_id, reviewer, status, workspace_id) VALUES (100, 'aegis', 'approved', 1)").run()
    const mocks = mockDeps(db)
    const { PUT } = await import('@/app/api/tasks/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks: [{ id: 100, status: 'done' }] }),
      headers: { 'content-type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, updated: 1 })
    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 100').get()).toEqual({
      status: 'done',
      completed_at: expect.any(Number),
    })
    expect(mocks.advanceTaskChain).toHaveBeenCalledWith({
      taskId: 100,
      workspaceId: 1,
      previousStatus: 'quality_review',
      trigger: 'bulk_task_update',
    })
  })

  it('allows detail done writes for PR-producing templates without the GitHub merge terminal event', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    db.prepare("UPDATE workflow_templates SET external_terminal_event = 'review.completed' WHERE id = 20").run()
    db.prepare("INSERT INTO quality_reviews (task_id, reviewer, status, workspace_id) VALUES (100, 'aegis', 'approved', 1)").run()
    const mocks = mockDeps(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/100', {
      method: 'PUT',
      body: JSON.stringify({ status: 'done' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: '100' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.task.status).toBe('done')
    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 100').get()).toEqual({
      status: 'done',
      completed_at: expect.any(Number),
    })
    expect(mocks.advanceTaskChain).toHaveBeenCalledWith({
      taskId: 100,
      workspaceId: 1,
      previousStatus: 'quality_review',
      trigger: 'detail_task_update',
    })
  })

  it('rejects bulk done writes for all affected ready_for_owner PR-producing tasks without side effects', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    db.prepare(`
      UPDATE tasks
      SET status = 'ready_for_owner', github_repo = 'owner/repo', github_pr_number = 100
      WHERE id = 100
    `).run()
    seedReadyForOwnerTask(db, 101)
    const mocks = mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks: [{ id: 100, status: 'done' }, { id: 101, status: 'done' }] }),
      headers: { 'content-type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100, 101],
    })
    expect(snapshot(db)).toEqual(before)
    expect(mocks.advanceTaskChain).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(mocks.syncTaskOutbound).not.toHaveBeenCalled()
  })

  it('rejects detail done writes for ready_for_owner PR-producing tasks with a one-item task_ids array', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    db.prepare(`
      UPDATE tasks
      SET status = 'ready_for_owner', github_repo = 'owner/repo', github_pr_number = 100
      WHERE id = 100
    `).run()
    const mocks = mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/100', {
      method: 'PUT',
      body: JSON.stringify({ status: 'done' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: '100' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
    expect(mocks.advanceTaskChain).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(mocks.syncTaskOutbound).not.toHaveBeenCalled()
  })

  it('blocks failed-to-done recovery attempts for PR-producing tasks through the same merge guard', async () => {
    const db = createDb()
    setTwoStepTerminalFlag(db, true)
    db.prepare(`
      UPDATE tasks
      SET status = 'failed', github_repo = 'owner/repo', github_pr_number = 100, error_message = 'needs retry'
      WHERE id = 100
    `).run()
    const mocks = mockDeps(db)
    const before = snapshot(db)
    const { PUT } = await import('@/app/api/tasks/[id]/route')

    const response = await PUT(new NextRequest('http://localhost/api/tasks/100', {
      method: 'PUT',
      body: JSON.stringify({ status: 'done', resolution: 'Recovered after manual check' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: '100' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(snapshot(db)).toEqual(before)
    expect(mocks.advanceTaskChain).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
    expect(mocks.syncTaskOutbound).not.toHaveBeenCalled()
  })
})
