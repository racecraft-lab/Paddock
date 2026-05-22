import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES,
  archiveTaskStageAttempt,
  appendTaskStageAttemptEvent,
  createTaskStageAttempt,
  listTaskStageAttemptsForTask,
  type SerializedTaskStageAttempt,
} from '../task-stage-attempts'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

interface AttemptDbRow {
  readonly id: number
  readonly metadata_json: string | null
}

interface EventDbRow {
  readonly id: number
  readonly attempt_id: number
  readonly status: string
  readonly observed_at: string
  readonly actor_type: string | null
  readonly actor_id: string | null
  readonly message: string | null
  readonly metadata_json: string | null
}

interface CountRow {
  readonly count: number
}

interface LastInsertRow {
  readonly id: number
}

function openDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT
    );

    CREATE TABLE task_stage_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      archived_at TEXT,
      run_id TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      metadata_json TEXT,
      UNIQUE(workspace_id, task_id, stage_key, attempt_number)
    );

    CREATE TABLE task_stage_attempt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES task_stage_attempts(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      message TEXT,
      metadata_json TEXT
    );

    CREATE INDEX idx_task_stage_attempts_task_stage_attempt
      ON task_stage_attempts(workspace_id, task_id, stage_key, attempt_number DESC);
    CREATE INDEX idx_task_stage_attempt_events_attempt_order
      ON task_stage_attempt_events(attempt_id, observed_at ASC, id ASC);

    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      agent_name TEXT,
      runtime TEXT,
      git_branch TEXT,
      git_commit TEXT,
      error TEXT,
      steps TEXT DEFAULT '[]',
      cost_usd REAL,
      metadata TEXT DEFAULT '{}'
    );
  `)
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, workflow_template_id, workflow_template_slug)
    VALUES (101, 7, 'Remediate issue', 'in_progress', 22, 'mission-control_issue_remediation')
  `).run()
  return db
}

function rows<T>(db: Database.Database, sql: string): T[] {
  return db.prepare(sql).all() as T[]
}

function firstRow<T>(values: readonly T[]): T {
  const value = values[0]
  if (value === undefined) {
    throw new Error('expected row')
  }
  return value
}

function findAttempt(
  attempts: readonly SerializedTaskStageAttempt[],
  stageKey: string,
): SerializedTaskStageAttempt {
  const attempt = attempts.find((candidate) => candidate.stage_key === stageKey)
  if (attempt === undefined) {
    throw new Error(`missing attempt ${stageKey}`)
  }
  return attempt
}

function lastInsertId(db: Database.Database): number {
  return (db.prepare('SELECT last_insert_rowid() AS id').get() as LastInsertRow).id
}

describe('SPEC-013A task stage attempt helpers', () => {
  it('exports the exact frozen lifecycle vocabulary', () => {
    expect(TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES).toEqual([
      'created',
      'running',
      'succeeded',
      'failed',
      'released',
      'cancelled',
      'archived',
    ])
    expect(Object.isFrozen(TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES)).toBe(true)
  })

  it('creates an attempt with a created event, optional run_id, workflow context, and bounded metadata', () => {
    const db = openDb()
    const longValue = 'x'.repeat(10_000)

    const attempt = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 1,
      runId: 'run-123',
      observedAt: '2026-05-22T12:00:00.000Z',
      actorType: 'test',
      actorId: 'spec-013a',
      message: 'created for helper test',
      metadata: { fixture: true, longValue },
    })

    expect(attempt).toMatchObject({
      workspace_id: '7',
      task_id: '101',
      stage_key: 'remediation',
      attempt_number: 1,
      status: 'created',
      created_at: '2026-05-22T12:00:00.000Z',
      updated_at: '2026-05-22T12:00:00.000Z',
      run_id: 'run-123',
      workflow_template_id: 22,
      workflow_template_slug: 'mission-control_issue_remediation',
    })

    const attemptRows = rows<AttemptDbRow>(db, 'SELECT * FROM task_stage_attempts')
    const eventRows = rows<EventDbRow>(db, 'SELECT * FROM task_stage_attempt_events')
    const persistedAttempt = firstRow(attemptRows)
    const persistedEvent = firstRow(eventRows)

    expect(attemptRows).toHaveLength(1)
    expect(eventRows).toHaveLength(1)
    expect(persistedEvent).toMatchObject({
      attempt_id: persistedAttempt.id,
      status: 'created',
      observed_at: '2026-05-22T12:00:00.000Z',
      actor_type: 'test',
      actor_id: 'spec-013a',
      message: 'created for helper test',
    })
    expect(Buffer.byteLength(persistedAttempt.metadata_json ?? '', 'utf8')).toBeLessThanOrEqual(4096)
    expect(Buffer.byteLength(persistedEvent.metadata_json ?? '', 'utf8')).toBeLessThanOrEqual(4096)
  })

  it('appends lifecycle events and updates current projection in one transaction', () => {
    const db = openDb()
    const attempt = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 1,
      observedAt: '2026-05-22T12:00:00.000Z',
    })

    appendTaskStageAttemptEvent(db, {
      attemptId: Number(attempt.id),
      status: 'running',
      observedAt: '2026-05-22T12:02:00.000Z',
      message: 'started',
    })
    appendTaskStageAttemptEvent(db, {
      attemptId: Number(attempt.id),
      status: 'failed',
      observedAt: '2026-05-22T12:05:00.000Z',
      message: 'failed',
    })

    expect(db.prepare('SELECT status, updated_at, started_at, completed_at, archived_at FROM task_stage_attempts WHERE id = ?').get(attempt.id)).toEqual({
      status: 'failed',
      updated_at: '2026-05-22T12:05:00.000Z',
      started_at: '2026-05-22T12:02:00.000Z',
      completed_at: '2026-05-22T12:05:00.000Z',
      archived_at: null,
    })

    db.exec(`
      CREATE TRIGGER block_failed_projection
      BEFORE UPDATE ON task_stage_attempts
      WHEN NEW.status = 'released'
      BEGIN
        SELECT RAISE(ABORT, 'blocked projection update');
      END;
    `)

    expect(() => appendTaskStageAttemptEvent(db, {
      attemptId: Number(attempt.id),
      status: 'released',
      observedAt: '2026-05-22T12:06:00.000Z',
    })).toThrow(/blocked projection update/)

    expect(db.prepare("SELECT COUNT(*) AS count FROM task_stage_attempt_events WHERE status = 'released'").get() as CountRow).toEqual({ count: 0 })
    expect(db.prepare('SELECT status, updated_at, completed_at FROM task_stage_attempts WHERE id = ?').get(attempt.id)).toEqual({
      status: 'failed',
      updated_at: '2026-05-22T12:05:00.000Z',
      completed_at: '2026-05-22T12:05:00.000Z',
    })
  })

  it('archives attempts as a non-destructive projection and lifecycle event', () => {
    const db = openDb()
    const attempt = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'review',
      attemptNumber: 1,
      observedAt: '2026-05-22T12:00:00.000Z',
    })

    const archived = archiveTaskStageAttempt(db, {
      attemptId: Number(attempt.id),
      observedAt: '2026-05-22T12:10:00.000Z',
      actorType: 'operator',
      message: 'uat cleanup',
    })

    expect(archived).toMatchObject({
      id: attempt.id,
      status: 'archived',
      updated_at: '2026-05-22T12:10:00.000Z',
      archived_at: '2026-05-22T12:10:00.000Z',
    })
    expect(db.prepare('SELECT status, observed_at, message FROM task_stage_attempt_events WHERE attempt_id = ? ORDER BY id DESC LIMIT 1').get(attempt.id)).toEqual({
      status: 'archived',
      observed_at: '2026-05-22T12:10:00.000Z',
      message: 'uat cleanup',
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_stage_attempts WHERE id = ?').get(attempt.id) as CountRow).toEqual({ count: 1 })
  })

  it('fails closed on unknown lifecycle states before writing rows', () => {
    const db = openDb()

    expect(() => createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 1,
      status: 'queued',
      observedAt: '2026-05-22T12:00:00.000Z',
    })).toThrow(/invalid_lifecycle_status/)
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_stage_attempts').get() as CountRow).toEqual({ count: 0 })

    const attempt = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 1,
      observedAt: '2026-05-22T12:00:00.000Z',
    })

    expect(() => appendTaskStageAttemptEvent(db, {
      attemptId: Number(attempt.id),
      status: 'queued',
      observedAt: '2026-05-22T12:01:00.000Z',
    })).toThrow(/invalid_lifecycle_status/)
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_stage_attempt_events WHERE status = 'queued'").get() as CountRow).toEqual({ count: 0 })
  })

  it('orders attempts and returns at most 10 most-recent lifecycle entries chronologically', () => {
    const db = openDb()

    createTaskStageAttempt(db, { workspaceId: 7, taskId: 101, stageKey: 'zeta', attemptNumber: 1, observedAt: '2026-05-22T11:00:00.000Z' })
    const alphaOne = createTaskStageAttempt(db, { workspaceId: 7, taskId: 101, stageKey: 'alpha', attemptNumber: 1, observedAt: '2026-05-22T11:00:00.000Z' })
    const alphaTwo = createTaskStageAttempt(db, { workspaceId: 7, taskId: 101, stageKey: 'alpha', attemptNumber: 2, observedAt: '2026-05-22T11:00:00.000Z' })

    for (let index = 1; index <= 12; index += 1) {
      appendTaskStageAttemptEvent(db, {
        attemptId: Number(alphaTwo.id),
        status: index % 2 === 0 ? 'running' : 'created',
        observedAt: `2026-05-22T12:${String(index).padStart(2, '0')}:00.000Z`,
        message: `event-${String(index).padStart(2, '0')}`,
      })
    }

    const envelope = listTaskStageAttemptsForTask(db, { workspaceId: 7, taskId: 101 })

    const firstAttempt = firstRow(envelope.attempts)

    expect(envelope.attempts.map((attempt) => `${attempt.stage_key}:${String(attempt.attempt_number)}`)).toEqual([
      'alpha:2',
      'alpha:1',
      'zeta:1',
    ])
    expect(firstAttempt.lifecycle).toHaveLength(10)
    expect(firstAttempt.lifecycle.map((event) => event.message)).toEqual([
      'event-03',
      'event-04',
      'event-05',
      'event-06',
      'event-07',
      'event-08',
      'event-09',
      'event-10',
      'event-11',
      'event-12',
    ])
    expect(alphaOne.status).toBe('created')
  })

  it('serializes compact run summaries and marks missing or unavailable run links', () => {
    const db = openDb()
    db.prepare(`
      INSERT INTO runs (
        id, workspace_id, status, started_at, ended_at, agent_name, runtime,
        git_branch, git_commit, error, steps, cost_usd, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'run-123',
      7,
      'running',
      '2026-05-22T12:01:00.000Z',
      null,
      'aegis',
      'mission-control',
      '013a-run-state-spine',
      'abc123',
      null,
      '[{"secret":"omit"}]',
      42.5,
      '{"secret":"omit"}',
    )

    createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'linked',
      attemptNumber: 1,
      runId: 'run-123',
      observedAt: '2026-05-22T12:00:00.000Z',
    })
    createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'missing',
      attemptNumber: 1,
      runId: 'run-missing',
      observedAt: '2026-05-22T12:00:00.000Z',
    })
    createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'none',
      attemptNumber: 1,
      observedAt: '2026-05-22T12:00:00.000Z',
    })

    const envelope = listTaskStageAttemptsForTask(db, { workspaceId: 7, taskId: 101 })
    const linked = findAttempt(envelope.attempts, 'linked')
    const missing = findAttempt(envelope.attempts, 'missing')
    const none = findAttempt(envelope.attempts, 'none')

    expect(linked.run_link).toEqual({ state: 'linked', run_id: 'run-123' })
    expect(linked.run_summary).toEqual({
      id: 'run-123',
      status: 'running',
      started_at: '2026-05-22T12:01:00.000Z',
      ended_at: null,
      agent_name: 'aegis',
      runtime: 'mission-control',
      git_branch: '013a-run-state-spine',
      git_commit: 'abc123',
      error: null,
    })
    expect(linked.run_summary).not.toHaveProperty('steps')
    expect(linked.run_summary).not.toHaveProperty('cost_usd')
    expect(linked.run_summary).not.toHaveProperty('metadata')
    expect(missing.run_link).toEqual({ state: 'missing_unavailable', run_id: 'run-missing' })
    expect(missing.run_summary).toBeNull()
    expect(none.run_link).toEqual({ state: 'none' })
    expect(none.run_summary).toBeNull()
  })

  it('returns invalid stored-state warnings without repairing rows', () => {
    const db = openDb()
    db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at
      ) VALUES (7, 101, 'remediation', 1, 'queued', '2026-05-22T12:00:00.000Z', '2026-05-22T12:00:00.000Z')
    `).run()
    const attemptId = lastInsertId(db)
    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, message
      ) VALUES (?, 7, 101, 'remediation', 1, 'created', '2026-05-22T12:00:00.000Z', 'valid')
    `).run(attemptId)
    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, message
      ) VALUES (?, 7, 101, 'remediation', 1, 'queued', '2026-05-22T12:01:00.000Z', 'invalid')
    `).run(attemptId)

    const before = db.prepare('SELECT status, updated_at FROM task_stage_attempts WHERE id = ?').get(attemptId)
    const envelope = listTaskStageAttemptsForTask(db, { workspaceId: 7, taskId: 101 })
    const after = db.prepare('SELECT status, updated_at FROM task_stage_attempts WHERE id = ?').get(attemptId)

    const attempt = firstRow(envelope.attempts)

    expect(attempt.status).toBe('invalid_state')
    expect(attempt.lifecycle).toEqual([
      {
        id: '1',
        status: 'created',
        observed_at: '2026-05-22T12:00:00.000Z',
        actor_type: null,
        actor_id: null,
        message: 'valid',
        metadata: null,
      },
    ])
    expect(envelope.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_attempt_state', attempt_id: String(attemptId), field: 'status' }),
      expect.objectContaining({ code: 'invalid_lifecycle_state', attempt_id: String(attemptId), field: 'lifecycle.status' }),
    ]))
    expect(after).toEqual(before)
  })

  it('returns projection drift warnings for valid stale projections without repairing rows', () => {
    const db = openDb()
    db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at
      ) VALUES (
        7, 101, 'remediation', 1, 'running',
        '2026-05-22T12:00:00.000Z',
        '2026-05-22T12:01:00.000Z',
        NULL,
        NULL,
        NULL
      )
    `).run()
    const attemptId = lastInsertId(db)
    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, message
      ) VALUES (?, 7, 101, 'remediation', 1, 'created', '2026-05-22T12:00:00.000Z', 'created')
    `).run(attemptId)
    db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, message
      ) VALUES (?, 7, 101, 'remediation', 1, 'failed', '2026-05-22T12:05:00.000Z', 'failed')
    `).run(attemptId)

    const before = db.prepare('SELECT status, updated_at, started_at, completed_at, archived_at FROM task_stage_attempts WHERE id = ?').get(attemptId)
    const envelope = listTaskStageAttemptsForTask(db, { workspaceId: 7, taskId: 101 })
    const after = db.prepare('SELECT status, updated_at, started_at, completed_at, archived_at FROM task_stage_attempts WHERE id = ?').get(attemptId)

    expect(firstRow(envelope.attempts).status).toBe('running')
    expect(envelope.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'status',
        projection_value: 'running',
        expected_value: 'failed',
        latest_valid_lifecycle: {
          status: 'failed',
          observed_at: '2026-05-22T12:05:00.000Z',
        },
      }),
      expect.objectContaining({
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'completed_at',
        projection_value: null,
        expected_value: '2026-05-22T12:05:00.000Z',
      }),
    ]))
    expect(after).toEqual(before)
  })
})
