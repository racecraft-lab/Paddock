/**
 * SPEC-007 US1 (Flag-OFF Parity) + US2 (Disposition Insert After Triage Completion)
 *
 * Covers tasks T100-T102, T200-T205 (TDD red-first authored before implementation)
 * and turned green by T105-T106, T109, T206-T212.
 *
 * Strict scope: this test file lives under src/lib/__tests__/ which is on the
 * SPEC-007 allowlist. The implementation under test is in
 *   src/lib/task-dispatch.ts (post-commit disposition insert + flag-OFF metadata gate)
 *   src/lib/task-artifacts.ts (sanitization helper)
 *   src/lib/aegis-review.ts  (FR-090 cross-cutting hook)
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

const TRIAGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    disposition: {
      type: 'string',
      enum: ['merged', 'closed', 'rejected', 'rerouted', 'duplicate', 'spam', 'completed', 'abandoned'],
    },
    reason: { type: 'string' },
  },
  required: ['disposition'],
} as const

function createDb(opts: {
  flagDispositionLogging?: boolean
  flagTaskArtifacts?: boolean
} = {}): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT,
      feature_flags TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER,
      ticket_prefix TEXT,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      github_repo TEXT,
      github_sync_enabled INTEGER DEFAULT 0
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE project_agent_assignments (
      project_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL
    );
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
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE task_dispositions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      disposition TEXT NOT NULL,
      reason TEXT,
      triaged_by_agent_id INTEGER,
      triaged_at INTEGER,
      workspace_id INTEGER NOT NULL
    );
  `)

  const flags: Record<string, boolean> = { FEATURE_TASK_PIPELINES: true }
  if (opts.flagDispositionLogging) flags.FEATURE_DISPOSITION_LOGGING = true
  if (opts.flagTaskArtifacts) flags.FEATURE_TASK_ARTIFACTS = true
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)')
    .run('alpha', JSON.stringify(flags))

  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('triage-bot')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (2, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)')
    .run('builder', 'builder')
  return db
}

function addTriageTemplate(db: Database.Database, opts: { id: number; nextSlug?: string } = { id: 1 }): void {
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug)
    VALUES (?, 'triage', 'Triage', 1, 'triage', 'triage-bot', ?, ?)
  `).run(opts.id, JSON.stringify(TRIAGE_OUTPUT_SCHEMA), opts.nextSlug ?? null)
}

function addNonTriageTemplate(db: Database.Database, id: number, slug: string, nextSlug: string | null = null): void {
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug)
    VALUES (?, ?, 'p', 1, ?, 'builder', NULL, ?)
  `).run(id, slug, slug, nextSlug)
}

function addTriageParent(
  db: Database.Database,
  templateId: number,
  resolution: unknown,
  agent: string = 'triage-bot',
): number {
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'done', 'high', ?, 10, ?, 1, ?, 'triage')
  `).run(agent, resolution === null ? null : JSON.stringify(resolution), templateId)
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

describe('T100 (US1): flag-OFF — no task_dispositions row, no disposition_* activity', () => {
  it('writes zero rows when FEATURE_DISPOSITION_LOGGING is OFF on a triage template', async () => {
    const db = createDb({ flagDispositionLogging: false })
    addTriageTemplate(db, { id: 1 })
    const parentId = addTriageParent(db, 1, { disposition: 'closed', reason: 'fixed in #42' })

    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' })

    const dispositionRows = db.prepare('SELECT COUNT(*) AS n FROM task_dispositions').get() as { n: number }
    expect(dispositionRows.n).toBe(0)

    const activityRows = db
      .prepare("SELECT COUNT(*) AS n FROM activities WHERE type LIKE 'disposition_%'")
      .get() as { n: number }
    expect(activityRows.n).toBe(0)
  })
})

describe('T101 (US1): flag-OFF — successor.metadata.input_artifacts MUST NOT be present', () => {
  it("'input_artifacts' in JSON.parse(successor.metadata) === false", async () => {
    const db = createDb({ flagTaskArtifacts: false, flagDispositionLogging: false })
    addNonTriageTemplate(db, 1, 'start', 'next')
    addNonTriageTemplate(db, 2, 'next', null)
    const insertResult = db
      .prepare(`
        INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
        VALUES ('Parent', 'done', 'high', 'builder', 10, NULL, 1, 1, 'start')
      `)
      .run()
    const parentId = Number(insertResult.lastInsertRowid)

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    expect(result.advanced).toBe(true)
    expect(result.successorTaskId).toBeTypeOf('number')

    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)
    expect('input_artifacts' in metadata).toBe(false)

    const baselinePath = join(
      process.cwd(),
      'src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json',
    )
    expect(existsSync(baselinePath)).toBe(true)
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    for (const forbidden of baseline.forbidden_under_flag_off as string[]) {
      expect(forbidden in metadata).toBe(false)
    }
    expect(metadata).toHaveProperty('task_pipeline')
    for (const key of baseline.task_pipeline_required_keys as string[]) {
      expect(metadata.task_pipeline).toHaveProperty(key)
    }
  })
})

describe('T102 (US1): flag-OFF EXPLAIN-QUERY-PLAN snapshot fixture present', () => {
  it('reuses the pre-M62 fixture (FR-110)', () => {
    const explainPath = join(
      process.cwd(),
      'src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json',
    )
    expect(existsSync(explainPath)).toBe(true)
    const fixture = JSON.parse(readFileSync(explainPath, 'utf8'))
    expect(fixture).toBeDefined()
  })
})

describe('T200 (US2): flag-ON happy path — exactly one task_dispositions row', () => {
  it('inserts one row with correct disposition, reason, triaged_by_agent_id, triaged_at, workspace_id', async () => {
    const db = createDb({ flagDispositionLogging: true })
    addTriageTemplate(db, { id: 1 })
    const before = Math.floor(Date.now() / 1000)
    const parentId = addTriageParent(db, 1, { disposition: 'closed', reason: 'fixed in #42' }, 'triage-bot')

    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' })
    const after = Math.floor(Date.now() / 1000)

    const rows = db.prepare('SELECT * FROM task_dispositions WHERE task_id = ?').all(parentId) as Array<{
      task_id: number
      disposition: string
      reason: string | null
      triaged_by_agent_id: number | null
      triaged_at: number
      workspace_id: number
    }>
    expect(rows.length).toBe(1)
    const r = rows[0]!
    expect(r.disposition).toBe('closed')
    expect(r.reason).toBe('fixed in #42')
    expect(r.triaged_by_agent_id).toBe(1)
    expect(r.workspace_id).toBe(1)
    expect(r.triaged_at).toBeGreaterThanOrEqual(before - 2)
    expect(r.triaged_at).toBeLessThanOrEqual(after + 2)
  })
})

describe('T201 (US2): validation-failure cases write disposition=unknown + sanitized activity', () => {
  it.each([
    ['missing field', { reason: 'no disposition' }],
    ['enum violation', { disposition: 'bogus', reason: 'r' }],
    ["agent supplies reserved 'unknown'", { disposition: 'unknown', reason: 'r' }],
  ])('case (%s): inserts unknown row + emits disposition_validation_failed activity', async (_label, output) => {
    const db = createDb({ flagDispositionLogging: true })
    addTriageTemplate(db, { id: 1 })
    const parentId = addTriageParent(db, 1, output, 'triage-bot')

    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' })

    const dispRows = db.prepare(
      "SELECT disposition FROM task_dispositions WHERE task_id = ?",
    ).all(parentId) as Array<{ disposition: string }>
    expect(dispRows.length).toBe(1)
    expect(dispRows[0]!.disposition).toBe('unknown')

    const activity = db.prepare(
      "SELECT data FROM activities WHERE type = 'disposition_validation_failed' AND entity_id = ?",
    ).get(parentId) as { data: string } | undefined
    expect(activity).toBeDefined()
    const payload = JSON.parse(activity!.data)
    expect(payload).toHaveProperty('rule')
    expect(payload).toHaveProperty('violation')
    expect(payload).toHaveProperty('field')
    expect(payload).toHaveProperty('content_sha256')
    expect(typeof payload.content_sha256).toBe('string')
    expect(payload.content_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(payload).toHaveProperty('byte_size')
    expect(typeof payload.byte_size).toBe('number')
    expect(payload).toHaveProperty('redacted_excerpt')
    expect(typeof payload.redacted_excerpt).toBe('string')
    expect(payload).toHaveProperty('truncated')
    expect(typeof payload.truncated).toBe('boolean')
  })
})

describe('T202 (US2): FR-013 sanitization-pipeline unit test', () => {
  it('sha256 + byte_size accurate; ≤4 KiB excerpt; truncated when >16 KiB; payload ≤16 KiB', async () => {
    const { sanitizeDispositionFailurePayload } = await import('@/lib/task-artifacts')

    const small = sanitizeDispositionFailurePayload({
      rule: 'output_schema_violation',
      violation: 'missing_required_field',
      field: 'disposition',
      content: '{"reason":"no disp"}',
    })
    expect(small.content_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(small.byte_size).toBe(Buffer.byteLength('{"reason":"no disp"}', 'utf8'))
    expect(small.truncated).toBe(false)
    expect(Buffer.byteLength(small.redacted_excerpt, 'utf8')).toBeLessThanOrEqual(4 * 1024)

    const big = 'x'.repeat(20 * 1024)
    const sanitized = sanitizeDispositionFailurePayload({
      rule: 'output_schema_violation',
      violation: 'missing_required_field',
      field: 'disposition',
      content: big,
    })
    expect(sanitized.byte_size).toBe(Buffer.byteLength(big, 'utf8'))
    expect(sanitized.truncated).toBe(true)
    expect(Buffer.byteLength(sanitized.redacted_excerpt, 'utf8')).toBeLessThanOrEqual(4 * 1024)
    expect(Buffer.byteLength(JSON.stringify(sanitized), 'utf8')).toBeLessThanOrEqual(16 * 1024)
  })

  it('runs the secret detector and substitutes <REDACTED:{rule_id}> tokens', async () => {
    const { sanitizeDispositionFailurePayload } = await import('@/lib/task-artifacts')

    const content = 'AKIAIOSFODNN7EXAMPLE'
    const sanitized = sanitizeDispositionFailurePayload({
      rule: 'output_schema_violation',
      violation: 'enum_violation',
      field: 'disposition',
      content,
    })
    expect(sanitized.redacted_excerpt).not.toContain(content)
  })
})

describe('T203 (US2): INSERT failure → throttled activity, no rethrow, advancement unaffected', () => {
  it('writes one disposition_insert_failed activity within 60s window; never throws', async () => {
    const db = createDb({ flagDispositionLogging: true })
    addTriageTemplate(db, { id: 1 })
    const parentId = addTriageParent(db, 1, { disposition: 'closed', reason: 'r' }, 'triage-bot')

    db.exec('DROP TABLE task_dispositions')

    const { advanceTaskChain } = await importDispatch(db)
    expect(() =>
      advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' }),
    ).not.toThrow()

    const failures = db.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = 'disposition_insert_failed' AND entity_id = ?",
    ).get(parentId) as { n: number }
    expect(failures.n).toBe(1)
  })
})

describe('T204 (US2): non-triage template — no row, no validation activity', () => {
  it('skips both disposition insert and validation activity when output_schema lacks required disposition', async () => {
    const db = createDb({ flagDispositionLogging: true })
    addNonTriageTemplate(db, 1, 'build', null)
    const insertResult = db
      .prepare(`
        INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
        VALUES ('Parent', 'done', 'high', 'builder', 10, NULL, 1, 1, 'build')
      `)
      .run()
    const parentId = Number(insertResult.lastInsertRowid)

    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })

    const rows = db.prepare('SELECT COUNT(*) AS n FROM task_dispositions').get() as { n: number }
    expect(rows.n).toBe(0)
    const acts = db.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type LIKE 'disposition_%'",
    ).get() as { n: number }
    expect(acts.n).toBe(0)
  })
})

describe('T205 (US2): output-schema validation uses SPEC-004 validateTaskOutput', () => {
  it('the disposition validator path delegates to the existing constrained AJV validator', async () => {
    const validatorMod = await import('@/lib/output-schema-validator')
    expect(typeof validatorMod.validateTaskOutput).toBe('function')

    const db = createDb({ flagDispositionLogging: true })
    addTriageTemplate(db, { id: 1 })
    const parentId = addTriageParent(db, 1, { disposition: 'closed', reason: 'r' }, 'triage-bot')

    const spy = vi.spyOn(validatorMod, 'validateTaskOutput')
    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'aegis_review' })

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
