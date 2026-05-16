import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(withAssignment: boolean): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      assigned_to TEXT,
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
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id) VALUES (10, 1)').run()
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (99, ?, 1)').run('named-agent')
  if (withAssignment) {
    db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name) VALUES (10, ?, ?)')
      .run('reviewer', 'named-agent')
  }
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start', 'start', 'builder', 'review')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 1, ?, ?)').run('review', 'Review', 'review', 'reviewer')
  db.prepare('INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, 1, 1, ?)').run('Parent', 'done', 'high', 'start')
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function latestReason(db: Database.Database): string {
  const row = db.prepare('SELECT data FROM activities ORDER BY id DESC LIMIT 1').get() as { data: string }
  return JSON.parse(row.data).reason_code
}

describe('advanceTaskChain assignee resolution', () => {
  it('resolves successors by project_agent_assignments.agent_name joined to agents.name', async () => {
    const db = createDb(true)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' }))
      .toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })
    expect(db.prepare('SELECT assigned_to FROM tasks WHERE parent_task_id = 100').get()).toEqual({ assigned_to: 'named-agent' })
  })

  it('stalls with task_pipeline_successor_assignee_missing when no live assignee matches the target role', async () => {
    const db = createDb(false)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' }))
      .toMatchObject({ advanced: false, reason: 'stalled', reasonCode: 'task_pipeline_successor_assignee_missing' })
    expect(latestReason(db)).toBe('task_pipeline_successor_assignee_missing')
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'done' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 0 })
  })
})
