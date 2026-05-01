import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

function createChainDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_sync_enabled INTEGER NOT NULL DEFAULT 0, github_repo TEXT);
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
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0
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
      workspace_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE task_subscriptions (task_id INTEGER NOT NULL, agent_name TEXT NOT NULL, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  return db
}

function addTemplate(
  db: Database.Database,
  values: {
    id: number
    slug: string
    name?: string
    role?: string | null
    outputSchema?: unknown
    routingRules?: unknown[]
    nextTemplateSlug?: string | null
  },
) {
  db.prepare(`
    INSERT INTO workflow_templates
      (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, routing_rules, next_template_slug)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    values.id,
    values.name ?? values.slug,
    `Prompt for ${values.slug}`,
    values.slug,
    values.role ?? 'builder',
    values.outputSchema === undefined ? null : JSON.stringify(values.outputSchema),
    values.routingRules === undefined ? null : JSON.stringify(values.routingRules),
    values.nextTemplateSlug ?? null,
  )
}

function addParent(db: Database.Database, templateId: number, slug: string, resolution: unknown, status = 'done'): number {
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES (?, ?, 'high', 'builder', 10, ?, 1, ?, ?)
  `).run('Parent', status, resolution === null ? null : JSON.stringify(resolution), templateId, slug)
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: { logActivity: vi.fn() },
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function successors(db: Database.Database, parentId: number) {
  return db.prepare(`
    SELECT title, assigned_to, workflow_template_id, workflow_template_slug, parent_task_id
    FROM tasks
    WHERE parent_task_id = ?
    ORDER BY id
  `).all(parentId)
}

describe('advanceTaskChain routing', () => {
  it('creates one successor from the first matching ordered routing rule', async () => {
    const db = createChainDb()
    addTemplate(db, {
      id: 1,
      slug: 'triage',
      outputSchema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'] },
      routingRules: [
        { when: '$.kind == "docs"', next_template_slug: 'docs' },
        { when: '$.kind == "build"', next_template_slug: 'build' },
      ],
      nextTemplateSlug: 'fallback',
    })
    addTemplate(db, { id: 2, slug: 'docs' })
    addTemplate(db, { id: 3, slug: 'build' })
    addTemplate(db, { id: 4, slug: 'fallback' })
    const parentId = addParent(db, 1, 'triage', { kind: 'build' })
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })
    expect(successors(db, parentId)).toEqual([
      { title: 'build', assigned_to: 'builder', workflow_template_id: 3, workflow_template_slug: 'build', parent_task_id: parentId },
    ])
  })

  it('uses static fallback and terminates normally when no next template is selected', async () => {
    const db = createChainDb()
    addTemplate(db, { id: 1, slug: 'start', nextTemplateSlug: 'fallback' })
    addTemplate(db, { id: 2, slug: 'fallback' })
    const parentId = addParent(db, 1, 'start', null)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'assigned', trigger: 'bulk_task_update' }))
      .toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })

    addTemplate(db, { id: 3, slug: 'terminal', routingRules: [{ when: '$.kind == "never"', next_template_slug: 'fallback' }] })
    const terminalParentId = addParent(db, 3, 'terminal', { kind: 'done' })
    expect(advanceTaskChain({ taskId: terminalParentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' }))
      .toMatchObject({ advanced: false, reason: 'chain_terminated' })
    expect(successors(db, terminalParentId)).toEqual([])
  })
})
