import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.doUnmock('@/lib/task-claim-reconciliation')
  vi.resetModules()
})

function openDispatchDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      role TEXT NOT NULL DEFAULT 'dev',
      config TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      ticket_prefix TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_to TEXT,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      project_ticket_no INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      github_synced_at INTEGER,
      tags TEXT,
      metadata TEXT,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  db.prepare('INSERT INTO agents (id, name, workspace_id, status, role) VALUES (1, ?, 1, ?, ?)').run('builder', 'idle', 'dev')
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('MC')
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, status, priority, assigned_to, workspace_id, project_id,
      workflow_template_slug, github_repo, github_issue_number, github_synced_at
    ) VALUES (100, 'Duplicate launch candidate', 'Dispatch me', 'assigned', 'high', 'builder', 1, 10, 'dev', 'racecraft-lab/mission-control', 123, 1770000000)
  `).run()
  return db
}

async function importDispatch(db: Database.Database, admission: unknown) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: {
      logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
        db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
      }),
    },
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  vi.doMock('@/lib/task-claim-reconciliation', () => ({
    reconcileAndAcquireTaskStageClaim: vi.fn(() => admission),
    releaseTaskStageClaim: vi.fn(),
  }))
  return import('@/lib/task-dispatch')
}

describe('dispatchAssignedTasks SPEC-013B claim boundary', () => {
  it('skips launch when claim reconciliation reports a duplicate active claim', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks } = await importDispatch(db, {
      outcome: 'duplicate_prevented',
      stage_key: 'dev',
      active_claim_id: 88,
      task_stage_attempt_id: 9,
      reason: 'active_claim_exists',
    })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'assigned' })
    expect(db.prepare("SELECT COUNT(*) as count FROM activities WHERE type = 'task_dispatched'").get()).toEqual({ count: 0 })
  })
})
