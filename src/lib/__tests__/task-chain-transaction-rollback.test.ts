import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(mode: 'successor' | 'validation' | 'stall'): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT, workspace_id INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      assigned_to TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1,
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
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id) VALUES (10, 1)').run()
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  if (mode === 'validation') {
    db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, output_schema, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start', 'start', JSON.stringify({ type: 'object', required: ['ok'] }), 'next')
    db.prepare('INSERT INTO tasks (id, title, status, priority, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, ?, 1, 1, ?)').run('Parent', 'done', 'high', JSON.stringify({ nope: true }), 'start')
  } else {
    db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start', 'start', 'builder', mode === 'stall' ? 'missing' : 'next')
    db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 1, ?, ?)').run('next', 'Next', 'next', 'builder')
    db.prepare('INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug) VALUES (100, ?, ?, ?, 10, 1, 1, ?)').run('Parent', 'done', 'high', 'start')
  }
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function snapshot(db: Database.Database) {
  return {
    parent: db.prepare('SELECT status, error_message, root_task_id, chain_id, chain_stage FROM tasks WHERE id = 100').get(),
    successors: db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get(),
    activities: db.prepare('SELECT COUNT(*) AS count FROM activities').get(),
  }
}

describe('advanceTaskChain transaction rollback', () => {
  it('rolls back parent lineage when successor insertion fails', async () => {
    const db = createDb('successor')
    db.exec(`
      CREATE TRIGGER abort_successor_insert
      BEFORE INSERT ON tasks
      WHEN NEW.parent_task_id IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'forced successor insert failure');
      END;
    `)
    const { advanceTaskChain } = await importDispatch(db)

    expect(() => advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' }))
      .toThrow(/forced successor insert failure/)
    expect(snapshot(db)).toEqual({
      parent: { status: 'done', error_message: null, root_task_id: null, chain_id: null, chain_stage: null },
      successors: { count: 0 },
      activities: { count: 0 },
    })
  })

  it('rolls back validation failure state when activity write fails', async () => {
    const db = createDb('validation')
    db.exec(`
      CREATE TRIGGER abort_activity_insert
      BEFORE INSERT ON activities
      BEGIN
        SELECT RAISE(ABORT, 'forced activity failure');
      END;
    `)
    const { advanceTaskChain } = await importDispatch(db)

    expect(() => advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
      .toThrow(/forced activity failure/)
    expect(snapshot(db)).toEqual({
      parent: { status: 'done', error_message: null, root_task_id: null, chain_id: null, chain_stage: null },
      successors: { count: 0 },
      activities: { count: 0 },
    })
  })

  it('rolls back stall activity writes without mutating the parent or creating successors', async () => {
    const db = createDb('stall')
    db.exec(`
      CREATE TRIGGER abort_stall_activity_insert
      BEFORE INSERT ON activities
      BEGIN
        SELECT RAISE(ABORT, 'forced stall activity failure');
      END;
    `)
    const { advanceTaskChain } = await importDispatch(db)

    expect(() => advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'bulk_task_update' }))
      .toThrow(/forced stall activity failure/)
    expect(snapshot(db)).toEqual({
      parent: { status: 'done', error_message: null, root_task_id: null, chain_id: null, chain_stage: null },
      successors: { count: 0 },
      activities: { count: 0 },
    })
  })
})
