import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(resolution: string | null): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, output_schema TEXT, routing_rules TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      resolution TEXT,
      error_message TEXT,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER
    );
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, output_schema, next_template_slug)
    VALUES (1, 'start', 'Prompt', 1, 'start', ?, 'next')
  `).run(JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }))
  db.prepare(`
    INSERT INTO tasks (title, status, priority, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'done', 'high', ?, 1, 1, 'start')
  `).run(resolution)
  return db
}

function createPilotDb(resolution: string | null): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT,
      task_prompt TEXT,
      workspace_id INTEGER,
      slug TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      resolution TEXT,
      error_message TEXT,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER
    );
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?)').run(JSON.stringify({ FEATURE_TASK_PIPELINES: true }))
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, output_schema, routing_rules, next_template_slug)
    VALUES (1, 'pilot triage', 'Prompt', 1, 'mission-control_issue_triage', ?, ?, NULL)
  `).run(
    JSON.stringify({
      type: 'object',
      additionalProperties: false,
      required: ['disposition', 'rationale'],
      properties: {
        disposition: {
          type: 'string',
          enum: [
            'ACTIONABLE_REMEDIATION',
            'DUPLICATE',
            'OBSOLETE',
            'INVALID',
            'NEEDS_HUMAN',
            'NEEDS_SPECIALIST',
            'NEEDS_SPEC',
          ],
        },
        rationale: { type: 'string' },
      },
    }),
    JSON.stringify([
      { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
    ]),
  )
  db.prepare(`
    INSERT INTO tasks (title, status, priority, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Pilot parent', 'done', 'high', ?, 1, 1, 'mission-control_issue_triage')
  `).run(resolution)
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function row(db: Database.Database) {
  return db.prepare('SELECT status, error_message FROM tasks WHERE id = 1').get()
}

function reason(db: Database.Database) {
  const activity = db.prepare('SELECT data FROM activities ORDER BY id DESC LIMIT 1').get() as { data: string }
  return JSON.parse(activity.data).reason_code
}

describe('advanceTaskChain output validation', () => {
  it.each([
    ['missing output', null, 'task_pipeline_output_missing'],
    ['invalid output', JSON.stringify({ ok: 'yes' }), 'task_pipeline_output_invalid'],
  ])('fails parent for %s and creates no successor', async (_label, resolution, reasonCode) => {
    const db = createDb(resolution)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 1, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
      .toMatchObject({ advanced: false, reason: 'validation_failed', reasonCode })
    expect(row(db)).toMatchObject({ status: 'failed', error_message: expect.stringContaining(reasonCode) })
    expect(reason(db)).toBe(reasonCode)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 1').get()).toEqual({ count: 0 })
  })

  it.each([
    ['missing pilot output', null, 'task_pipeline_output_missing'],
    ['malformed pilot output', '{"disposition":', 'task_pipeline_output_invalid'],
    [
      'unknown pilot disposition',
      JSON.stringify({ disposition: 'REMEDIATE', rationale: 'not in enum' }),
      'task_pipeline_output_invalid',
    ],
  ])('fails closed for %s without creating a remediation successor', async (_label, resolution, reasonCode) => {
    const db = createPilotDb(resolution)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: 1, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }))
      .toMatchObject({ advanced: false, reason: 'validation_failed', reasonCode })
    expect(row(db)).toMatchObject({ status: 'failed', error_message: expect.stringContaining(reasonCode) })
    expect(reason(db)).toBe(reasonCode)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 1').get()).toEqual({ count: 0 })
  })
})
