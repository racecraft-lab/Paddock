import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(featureEnabled: boolean): Database.Database {
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
      next_template_slug TEXT,
      produces_pr INTEGER DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER DEFAULT 0
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      project_id INTEGER,
      resolution TEXT,
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
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: featureEnabled }))
  db.prepare('INSERT INTO projects (id, workspace_id) VALUES (10, 1)').run()
  return db
}

function addTemplate(db: Database.Database, id: number, values: Partial<{ next: string; slugOnly: boolean; downstreamOnly: boolean }>) {
  db.prepare(`
    INSERT INTO workflow_templates
      (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug, produces_pr, external_terminal_event, allow_redacted_artifacts)
    VALUES (?, 'template', 'Prompt', 1, ?, 'builder', ?, ?, ?, ?)
  `).run(
    id,
    values.slugOnly ? 'slug-only' : `template-${id}`,
    values.next ?? null,
    values.downstreamOnly ? 1 : 0,
    values.downstreamOnly ? 'pr_merged' : null,
    values.downstreamOnly ? 1 : 0,
  )
}

function addTask(db: Database.Database, templateId: number | null, status = 'done') {
  const templateSlug = templateId ? `template-${templateId}` : null
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, project_id, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', ?, 'high', 10, 1, ?, ?)
  `).run(status, templateId, templateSlug)
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

describe('advanceTaskChain eligibility', () => {
  it.each([
    ['flag off', false, 1, 'review'],
    ['unbound task', true, null, 'review'],
    ['already done previous status', true, 1, 'done'],
  ])('preserves legacy behavior for %s', async (_label, featureEnabled, templateId, previousStatus) => {
    const db = createDb(featureEnabled)
    if (templateId) addTemplate(db, templateId, { next: 'next' })
    const taskId = addTask(db, templateId)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId, workspaceId: 1, previousStatus, trigger: 'detail_task_update' }))
      .toMatchObject({ advanced: false, reason: 'not_eligible' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(taskId)).toEqual({ count: 0 })
  })

  it('ignores slug-only and downstream-metadata-only templates without creating successors', async () => {
    const db = createDb(true)
    addTemplate(db, 1, { slugOnly: true })
    addTemplate(db, 2, { downstreamOnly: true })
    const first = addTask(db, 1)
    const second = addTask(db, 2)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: first, workspaceId: 1, previousStatus: 'review', trigger: 'quality_review' }))
      .toMatchObject({ advanced: false, reason: 'not_eligible' })
    expect(advanceTaskChain({ taskId: second, workspaceId: 1, previousStatus: 'review', trigger: 'quality_review' }))
      .toMatchObject({ advanced: false, reason: 'not_eligible' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id IS NOT NULL').get()).toEqual({ count: 0 })
  })
})
