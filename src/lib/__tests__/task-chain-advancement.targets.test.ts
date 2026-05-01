import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT NOT NULL, workspace_id INTEGER NOT NULL);
    CREATE TABLE project_agent_assignments (project_id INTEGER NOT NULL, role TEXT NOT NULL, agent_name TEXT NOT NULL, workspace_id INTEGER NOT NULL);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      task_prompt TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      agent_role TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      enabled INTEGER
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_to TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1,
      project_id INTEGER,
      project_ticket_no INTEGER,
      resolution TEXT,
      error_message TEXT,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER NOT NULL
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?), (2, ?, ?)')
    .run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }), 'beta', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  return db
}

function addTemplate(db: Database.Database, id: number, workspaceId: number, slug: string, next: string | null, enabled: number | null = 1) {
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug, enabled)
    VALUES (?, ?, ?, ?, ?, 'builder', ?, ?)
  `).run(id, slug, `Prompt for ${slug}`, workspaceId, slug, next, enabled)
}

function addParent(db: Database.Database, next: string): number {
  addTemplate(db, 1, 1, 'start', next)
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, assigned_to, project_id, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'done', 'high', 'builder', 10, 1, 1, 'start')
  `).run()
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function latestReason(db: Database.Database): string | null {
  const row = db.prepare('SELECT data FROM activities ORDER BY id DESC LIMIT 1').get() as { data: string } | undefined
  return row ? JSON.parse(row.data).reason_code : null
}

describe('advanceTaskChain target stalls', () => {
  it.each([
    ['missing target', 'missing', () => undefined, 'task_pipeline_target_missing'],
    ['cross-workspace target', 'shared', (db: Database.Database) => addTemplate(db, 9, 2, 'shared', null), 'task_pipeline_target_cross_workspace'],
    ['duplicate target', 'dupe', (db: Database.Database) => {
      addTemplate(db, 2, 1, 'dupe', null)
      addTemplate(db, 3, 1, 'dupe', null)
    }, 'task_pipeline_target_duplicate'],
    ['disabled target', 'disabled', (db: Database.Database) => addTemplate(db, 4, 1, 'disabled', null, 0), 'task_pipeline_target_disabled'],
  ])('records %s with a stable reason code and preserves terminal success', async (_label, next, setup, reasonCode) => {
    const db = createDb()
    const parentId = addParent(db, next)
    setup?.(db)
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: false, reason: 'stalled', reasonCode })
    expect(latestReason(db)).toBe(reasonCode)
    expect(db.prepare('SELECT status FROM tasks WHERE id = ?').get(parentId)).toEqual({ status: 'done' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(parentId)).toEqual({ count: 0 })
  })
})
