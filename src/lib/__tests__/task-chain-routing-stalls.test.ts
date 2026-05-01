import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(routingRules: unknown[]): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_counter INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      task_prompt TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      agent_role TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      project_id INTEGER,
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
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id) VALUES (10, 1)').run()
  db.prepare(`
    INSERT INTO workflow_templates
      (id, name, task_prompt, workspace_id, slug, output_schema, routing_rules)
    VALUES (1, 'start', 'Prompt', 1, 'start', ?, ?)
  `).run(JSON.stringify({ type: 'object' }), JSON.stringify(routingRules))
  db.prepare(`
    INSERT INTO tasks (title, status, priority, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'done', 'high', 10, ?, 1, 1, 'start')
  `).run(JSON.stringify({ value: 'x' }))
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function activityReason(db: Database.Database): string {
  const row = db.prepare('SELECT data FROM activities ORDER BY id DESC LIMIT 1').get() as { data: string }
  return JSON.parse(row.data).reason_code
}

describe('advanceTaskChain routing stall activities', () => {
  it('records expression rejection as task_pipeline_routing_expression_rejected', async () => {
    const db = createDb([{ when: '$.value == /unsafe/', next_template_slug: 'next' }])
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 1, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
      .toMatchObject({ advanced: false, reason: 'stalled', reasonCode: 'task_pipeline_routing_expression_rejected' })
    expect(activityReason(db)).toBe('task_pipeline_routing_expression_rejected')
  })

  it('records budget exhaustion as task_pipeline_routing_budget_exceeded', async () => {
    const longLiteral = 'x'.repeat(160)
    const rules = Array.from({ length: 64 }, (_, index) => ({ when: `$.value == "${longLiteral}-${index}"`, next_template_slug: 'next' }))
    const db = createDb(rules)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 1, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
      .toMatchObject({ advanced: false, reason: 'stalled', reasonCode: 'task_pipeline_routing_budget_exceeded' })
    expect(activityReason(db)).toBe('task_pipeline_routing_budget_exceeded')
  })
})
