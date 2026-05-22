import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M76_ID = '076_task_stage_attempts'
const STATUS_VALUES = ['created', 'running', 'succeeded', 'failed', 'released', 'cancelled', 'archived']
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M76.sql')

const openDbs: Database.Database[] = []
let runMigrations: (db: Database.Database) => void

beforeAll(async () => {
  const modulePath = '../migrations'
  const migrationsModule = (await import(modulePath)) as {
    runMigrations: (db: Database.Database) => void
  }
  runMigrations = migrationsModule.runMigrations
})

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function openMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('task_stage_attempts', 'task_stage_attempt_events')
        ORDER BY name
      `,
    )
    .all()
    .map((row) => (row as { name: string }).name)
}

function tableColumns(db: Database.Database, table: string): Map<string, { notnull: number; pk: number; type: string }> {
  return new Map(
    (db.prepare(`PRAGMA table_xinfo(${table})`).all() as {
      name: string
      notnull: number
      pk: number
      type: string
    }[]).map((column) => [column.name, column]),
  )
}

function indexNames(db: Database.Database, table: string): Map<string, { unique: number; partial: number }> {
  return new Map(
    (db.prepare(`PRAGMA index_list(${table})`).all() as {
      name: string
      unique: number
      partial: number
    }[]).map((index) => [index.name, index]),
  )
}

function indexColumns(db: Database.Database, indexName: string): string[] {
  return (db.prepare(`PRAGMA index_xinfo(${indexName})`).all() as { name: string | null; key: number }[])
    .filter((column) => column.key === 1)
    .map((column) => column.name)
    .filter((name): name is string => name !== null)
}

function insertAttempt(
  db: Database.Database,
  values: Partial<{
    workspace_id: number
    task_id: number
    stage_key: string
    attempt_number: number
    status: string
    run_id: string | null
  }> = {},
): number {
  const result = db
    .prepare(
      `
        INSERT INTO task_stage_attempts (
          workspace_id,
          task_id,
          stage_key,
          attempt_number,
          status,
          created_at,
          updated_at,
          run_id
        )
        VALUES (?, ?, ?, ?, ?, '2026-05-22T12:00:00.000Z', '2026-05-22T12:00:00.000Z', ?)
      `,
    )
    .run(
      values.workspace_id ?? 1,
      values.task_id ?? 100,
      values.stage_key ?? 'remediation',
      values.attempt_number ?? 1,
      values.status ?? 'created',
      values.run_id ?? null,
    )

  return Number(result.lastInsertRowid)
}

describe('M76 task-stage attempt persistence migration', () => {
  it('creates both task-stage attempt tables idempotently and records one migration marker', () => {
    const db = openMigratedDb()

    runMigrations(db)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M76_ID)
    expect(() => {
      runMigrations(db)
    }).not.toThrow()

    expect(tableNames(db)).toEqual(['task_stage_attempt_events', 'task_stage_attempts'])
    expect(
      db.prepare(`SELECT COUNT(*) as count FROM schema_migrations WHERE id = ?`).get(M76_ID),
    ).toEqual({ count: 1 })
  })

  it('creates the required attempt columns without claim, lease, or one-active-attempt authority columns', () => {
    const db = openMigratedDb()
    const columns = tableColumns(db, 'task_stage_attempts')

    expect([...columns.keys()]).toEqual([
      'id',
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
      'status',
      'created_at',
      'updated_at',
      'started_at',
      'completed_at',
      'archived_at',
      'run_id',
      'workflow_template_id',
      'workflow_template_slug',
      'metadata_json',
    ])
    expect(columns.get('id')).toMatchObject({ pk: 1, type: 'INTEGER' })
    for (const required of ['workspace_id', 'task_id', 'stage_key', 'attempt_number', 'status', 'created_at', 'updated_at']) {
      expect(columns.get(required)?.notnull).toBe(1)
    }
    for (const nullable of [
      'started_at',
      'completed_at',
      'archived_at',
      'run_id',
      'workflow_template_id',
      'workflow_template_slug',
      'metadata_json',
    ]) {
      expect(columns.get(nullable)?.notnull).toBe(0)
    }

    for (const forbidden of ['claim_owner', 'claim_token', 'lease_expires_at', 'owner_id', 'locked_by', 'retry_count']) {
      expect(columns.has(forbidden)).toBe(false)
    }
  })

  it('creates the required lifecycle event columns with a cascade parent foreign key', () => {
    const db = openMigratedDb()
    const columns = tableColumns(db, 'task_stage_attempt_events')

    expect([...columns.keys()]).toEqual([
      'id',
      'attempt_id',
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
      'status',
      'observed_at',
      'actor_type',
      'actor_id',
      'message',
      'metadata_json',
    ])
    for (const required of [
      'attempt_id',
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
      'status',
      'observed_at',
    ]) {
      expect(columns.get(required)?.notnull).toBe(1)
    }

    expect(db.prepare(`PRAGMA foreign_key_list(task_stage_attempt_events)`).all()).toEqual([
      expect.objectContaining({
        table: 'task_stage_attempts',
        from: 'attempt_id',
        to: 'id',
        on_delete: 'CASCADE',
      }),
    ])
    expect(db.prepare(`PRAGMA foreign_key_list(task_stage_attempts)`).all()).not.toContainEqual(
      expect.objectContaining({ from: 'run_id' }),
    )
  })

  it('enforces status vocabulary, non-empty stage keys, positive attempt numbers, and per-stage attempt uniqueness only', () => {
    const db = openMigratedDb()

    for (const status of STATUS_VALUES) {
      expect(() => insertAttempt(db, { stage_key: `stage-${status}`, status })).not.toThrow()
    }

    expect(() => insertAttempt(db, { stage_key: '   ' })).toThrow()
    expect(() => insertAttempt(db, { stage_key: 'bad-status', status: 'queued' })).toThrow()
    expect(() => insertAttempt(db, { stage_key: 'bad-attempt-number', attempt_number: 0 })).toThrow()

    insertAttempt(db, { task_id: 200, stage_key: 'quality', attempt_number: 1, status: 'running' })
    expect(() => insertAttempt(db, { task_id: 200, stage_key: 'quality', attempt_number: 1, status: 'created' })).toThrow()
    expect(() => insertAttempt(db, { task_id: 200, stage_key: 'quality', attempt_number: 2, status: 'running' })).not.toThrow()
    expect(() => insertAttempt(db, { task_id: 200, stage_key: 'review', attempt_number: 1, status: 'running' })).not.toThrow()
  })

  it('creates only the allowed attempt uniqueness and inspection indexes', () => {
    const db = openMigratedDb()
    const indexes = indexNames(db, 'task_stage_attempts')

    expect(indexes.get('sqlite_autoindex_task_stage_attempts_1')?.unique).toBe(1)
    expect(indexColumns(db, 'sqlite_autoindex_task_stage_attempts_1')).toEqual([
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
    ])

    expect(indexes.get('idx_task_stage_attempts_task_stage_attempt')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_task_stage_attempts_task_stage_attempt')).toEqual([
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
    ])
    expect(indexes.get('idx_task_stage_attempts_task_status')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_task_stage_attempts_task_status')).toEqual(['workspace_id', 'task_id', 'status', 'updated_at'])
    expect(indexes.get('idx_task_stage_attempts_run_id')).toMatchObject({ unique: 0, partial: 1 })
    expect(indexColumns(db, 'idx_task_stage_attempts_run_id')).toEqual(['workspace_id', 'run_id'])
    expect(indexes.get('idx_task_stage_attempts_archived')).toMatchObject({ unique: 0, partial: 1 })
    expect(indexColumns(db, 'idx_task_stage_attempts_archived')).toEqual(['workspace_id', 'archived_at'])

    const uniqueIndexes = [...indexes.entries()].filter(([, index]) => index.unique === 1).map(([name]) => name)
    expect(uniqueIndexes).toEqual(['sqlite_autoindex_task_stage_attempts_1'])
  })

  it('creates required non-unique lifecycle inspection indexes and has clean foreign-key health', () => {
    const db = openMigratedDb()
    const attemptId = insertAttempt(db)

    db.prepare(
      `
        INSERT INTO task_stage_attempt_events (
          attempt_id,
          workspace_id,
          task_id,
          stage_key,
          attempt_number,
          status,
          observed_at
        )
        VALUES (?, 1, 100, 'remediation', 1, 'created', '2026-05-22T12:00:00.000Z')
      `,
    ).run(attemptId)

    expect(() =>
      db
        .prepare(
          `
            INSERT INTO task_stage_attempt_events (
              attempt_id,
              workspace_id,
              task_id,
              stage_key,
              attempt_number,
              status,
              observed_at
            )
            VALUES (?, 1, 100, 'remediation', 1, 'queued', '2026-05-22T12:01:00.000Z')
          `,
        )
        .run(attemptId),
    ).toThrow()

    const indexes = indexNames(db, 'task_stage_attempt_events')
    expect(indexes.get('idx_task_stage_attempt_events_attempt_order')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_task_stage_attempt_events_attempt_order')).toEqual(['attempt_id', 'observed_at', 'id'])
    expect(indexes.get('idx_task_stage_attempt_events_task_order')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_task_stage_attempt_events_task_order')).toEqual([
      'workspace_id',
      'task_id',
      'stage_key',
      'attempt_number',
      'observed_at',
      'id',
    ])
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
  })
})

describe('M76 task-stage attempt rollback SQL', () => {
  it('ships an operator-facing idempotent rollback with child-first drops, marker cleanup, foreign-key guidance, and history-loss warning', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')

    expect(sql).toMatch(/history loss|removes attempt history|attempt history/i)
    expect(sql).toMatch(/backup|export/i)
    expect(sql).toMatch(/PRAGMA\s+foreign_key_check/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations\s+WHERE id = '076_task_stage_attempts'/i)
    expect(sql.indexOf('DROP TABLE IF EXISTS task_stage_attempt_events')).toBeGreaterThanOrEqual(0)
    expect(sql.indexOf('DROP TABLE IF EXISTS task_stage_attempts')).toBeGreaterThan(
      sql.indexOf('DROP TABLE IF EXISTS task_stage_attempt_events'),
    )
  })

  it('drops child and parent tables, removes only the M76 marker, and remains rerun-safe', () => {
    const db = openMigratedDb()
    db.prepare(`INSERT INTO schema_migrations (id) VALUES ('999_operator_marker')`).run()
    const attemptId = insertAttempt(db)
    db.prepare(
      `
        INSERT INTO task_stage_attempt_events (
          attempt_id,
          workspace_id,
          task_id,
          stage_key,
          attempt_number,
          status,
          observed_at
        )
        VALUES (?, 1, 100, 'remediation', 1, 'created', '2026-05-22T12:00:00.000Z')
      `,
    ).run(attemptId)

    const sql = readFileSync(ROLLBACK_PATH, 'utf8')
    expect(() => db.exec(sql)).not.toThrow()
    expect(() => db.exec(sql)).not.toThrow()

    expect(tableNames(db)).toEqual([])
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M76_ID)).toBeUndefined()
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id = '999_operator_marker'`).get()).toEqual({
      id: '999_operator_marker',
    })
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
  })
})
