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
      workflow_template_slug TEXT
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

function mockDeps(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: {
      logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
        db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
      }),
      createNotification: vi.fn(),
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
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/gnap-sync', () => ({ removeTaskFromGnap: vi.fn() }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: false, autoSync: false, repoPath: '' } } }))
  vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
  vi.doMock('@/lib/task-dispatch', () => ({ advanceTaskChain: vi.fn(), retryTaskChainAdvancement: vi.fn() }))
}

function snapshot(db: Database.Database) {
  return {
    task: db.prepare('SELECT status, updated_at FROM tasks WHERE id = 100').get(),
    activities: db.prepare('SELECT COUNT(*) AS count FROM activities').get(),
  }
}

describe('task routes ready_for_owner flag-off write guard', () => {
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
})
