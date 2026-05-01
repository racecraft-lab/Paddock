import Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

it('treats an existing successor as automated advancement idempotency and creates no duplicate', async () => {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      project_id INTEGER,
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
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id) VALUES (10, 1)').run()
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start', 'start', 'builder', 'next')
  db.prepare('INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, 1, 1, ?)').run('Parent', 'done', 'high', 'start')
  db.prepare('INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, parent_task_id) VALUES (101, ?, ?, ?, 10, 1, 100)').run('Existing successor', 'assigned', 'high')
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  const { advanceTaskChain } = await import('@/lib/task-dispatch')

  expect(advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
    .toMatchObject({ advanced: false, reason: 'successor_exists', successorTaskId: 101 })
  expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 1 })
})
