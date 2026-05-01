import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(parentLineage: Partial<{ root_task_id: number; chain_id: string; chain_stage: number }> = {}): Database.Database {
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
      created_by TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1,
      project_id INTEGER,
      project_ticket_no INTEGER,
      resolution TEXT,
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
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('agent-from-name')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'agent-from-name')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 1, ?, ?, ?)').run('start', 'Start prompt', 'start', 'builder', 'next')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 1, ?, ?)').run('next', 'Next prompt', 'next', 'builder')
  db.prepare(`
    INSERT INTO tasks
      (id, title, status, priority, assigned_to, project_id, workspace_id, workflow_template_id, workflow_template_slug, root_task_id, chain_id, chain_stage)
    VALUES (100, 'Parent', 'done', 'high', 'agent-from-name', 10, 1, 1, 'start', ?, ?, ?)
  `).run(parentLineage.root_task_id ?? null, parentLineage.chain_id ?? null, parentLineage.chain_stage ?? null)
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

describe('advanceTaskChain lineage', () => {
  it('initializes first-hop parent lineage and copies inherited successor fields', async () => {
    const db = createDb()
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'quality_review' })

    expect(result).toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })
    expect(db.prepare('SELECT root_task_id, chain_id, chain_stage FROM tasks WHERE id = 100').get()).toEqual({
      root_task_id: 100,
      chain_id: 'task-chain-100',
      chain_stage: 0,
    })
    expect(db.prepare(`
      SELECT parent_task_id, root_task_id, chain_id, chain_stage, workspace_id, project_id, workflow_template_id, workflow_template_slug, assigned_to
      FROM tasks
      WHERE parent_task_id = 100
    `).get()).toEqual({
      parent_task_id: 100,
      root_task_id: 100,
      chain_id: 'task-chain-100',
      chain_stage: 1,
      workspace_id: 1,
      project_id: 10,
      workflow_template_id: 2,
      workflow_template_slug: 'next',
      assigned_to: 'agent-from-name',
    })
  })

  it('preserves existing parent lineage and advances the stage for later hops', async () => {
    const db = createDb({ root_task_id: 50, chain_id: 'existing-chain', chain_stage: 3 })
    const { advanceTaskChain } = await importDispatch(db)

    advanceTaskChain({ taskId: 100, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' })

    expect(db.prepare('SELECT root_task_id, chain_id, chain_stage FROM tasks WHERE id = 100').get()).toEqual({
      root_task_id: 50,
      chain_id: 'existing-chain',
      chain_stage: 3,
    })
    expect(db.prepare('SELECT root_task_id, chain_id, chain_stage FROM tasks WHERE parent_task_id = 100').get()).toEqual({
      root_task_id: 50,
      chain_id: 'existing-chain',
      chain_stage: 4,
    })
  })
})
