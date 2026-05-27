import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M78_ID = '078_task_stage_claims'
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M78.sql')
const RELEASE_REASONS = [
  'launch_handoff_completed',
  'dispatch_failed',
  'task_terminal_done',
  'task_terminal_failed',
  'github_issue_terminal',
  'github_pr_terminal',
  'governance_blocked',
  'governance_deferred',
  'attempt_terminal_reconciled',
  'stale_claim_recovered',
  'boundary_error_deferred',
]

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

function tableColumns(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_xinfo(task_stage_claims)').all() as { name: string }[])
    .map((column) => column.name)
}

function taskColumns(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_xinfo(tasks)').all() as { name: string }[])
    .map((column) => column.name)
}

function indexColumns(db: Database.Database, indexName: string): string[] {
  return (db.prepare(`PRAGMA index_xinfo(${indexName})`).all() as { name: string | null; key: number }[])
    .filter((column) => column.key === 1)
    .map((column) => column.name)
    .filter((name): name is string => name !== null)
}

function insertAttempt(db: Database.Database, attemptNumber = 1): number {
  const result = db.prepare(`
    INSERT INTO task_stage_attempts (
      workspace_id, task_id, stage_key, attempt_number, status, created_at, updated_at
    ) VALUES (1, 100, 'dev', ?, 'running', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z')
  `).run(attemptNumber)
  return Number(result.lastInsertRowid)
}

function insertClaim(
  db: Database.Database,
  values: { state?: string; reason?: string | null; attemptNumber?: number } = {},
): void {
  const state = values.state ?? 'active'
  const reason = values.reason === undefined ? (state === 'active' ? null : 'launch_handoff_completed') : values.reason
  const releasedAt = state === 'active' ? null : 1770000300
  const releasedByRunId = state === 'active' ? null : 'dispatch-run'
  db.prepare(`
    INSERT INTO task_stage_claims (
      workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state,
      lease_owner, claim_run_id, lease_started_at, lease_expires_at,
      release_reason, released_at, released_by_run_id
    ) VALUES (1, 100, 'dev', ?, ?, 'scheduler', 'dispatch-run', 1770000000, 1770000300, ?, ?, ?)
  `).run(insertAttempt(db, values.attemptNumber ?? 1), state, reason, releasedAt, releasedByRunId)
}

describe('M78 task-stage claim persistence migration', () => {
  it('creates the task_stage_claims table idempotently with one migration marker', () => {
    const db = openMigratedDb()

    runMigrations(db)
    db.prepare('DELETE FROM schema_migrations WHERE id = ?').run(M78_ID)
    expect(() => {
      runMigrations(db)
    }).not.toThrow()

    expect(tableColumns(db)).toEqual([
      'id',
      'workspace_id',
      'task_id',
      'stage_key',
      'task_stage_attempt_id',
      'claim_state',
      'lease_owner',
      'claim_run_id',
      'lease_started_at',
      'lease_expires_at',
      'release_reason',
      'released_at',
      'released_by_run_id',
      'stale_recovered_from_claim_id',
      'metadata_json',
      'created_at',
      'updated_at',
    ])
    expect(db.prepare('SELECT COUNT(*) as count FROM schema_migrations WHERE id = ?').get(M78_ID)).toEqual({ count: 1 })
  })

  it('enforces one active claim per task stage while preserving historical rows', () => {
    const db = openMigratedDb()

    insertClaim(db)
    expect(() => {
      insertClaim(db, { attemptNumber: 2 })
    }).toThrow()

    db.prepare(`
      UPDATE task_stage_claims
      SET claim_state = 'released',
          release_reason = 'launch_handoff_completed',
          released_at = 1770000010,
          released_by_run_id = 'dispatch-run'
      WHERE id = 1
    `).run()
    expect(() => {
      insertClaim(db, { attemptNumber: 3 })
    }).not.toThrow()
  })

  it('enforces release reason vocabulary, active null reason, and one claim per attempt', () => {
    const db = openMigratedDb()

    for (const [index, reason] of RELEASE_REASONS.entries()) {
      insertClaim(db, {
        state: reason === 'stale_claim_recovered' ? 'stale_recovered' : 'released',
        reason,
        attemptNumber: index + 1,
      })
    }
    expect(() => {
      insertClaim(db, { state: 'released', reason: 'manual_release', attemptNumber: 99 })
    }).toThrow()
    expect(() => {
      insertClaim(db, { state: 'active', reason: 'launch_handoff_completed', attemptNumber: 100 })
    }).toThrow()
  })

  it('creates expected active, attempt, lease, and history indexes', () => {
    const db = openMigratedDb()
    const indexes = new Map(
      (db.prepare('PRAGMA index_list(task_stage_claims)').all() as { name: string; unique: number; partial: number }[])
        .map((index) => [index.name, index]),
    )

    expect(indexes.get('idx_task_stage_claims_active_unique')).toMatchObject({ unique: 1, partial: 1 })
    expect(indexColumns(db, 'idx_task_stage_claims_active_unique')).toEqual(['workspace_id', 'task_id', 'stage_key'])
    expect(indexes.get('idx_task_stage_claims_attempt_unique')).toMatchObject({ unique: 1, partial: 0 })
    expect(indexColumns(db, 'idx_task_stage_claims_attempt_unique')).toEqual(['task_stage_attempt_id'])
    expect(indexColumns(db, 'idx_task_stage_claims_task_history')).toEqual(['workspace_id', 'task_id', 'stage_key', 'id'])
    expect(indexes.get('idx_task_stage_claims_lease')).toMatchObject({ unique: 0, partial: 1 })
  })

  it('adds live GitHub issue-state terminal truth to tasks', () => {
    const db = openMigratedDb()

    expect(taskColumns(db)).toContain('github_issue_state')
  })
})

describe('M78 rollback SQL', () => {
  it('is present, removes only M78 state, and is rerun-safe', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')
    expect(sql).toMatch(/DROP TABLE IF EXISTS task_stage_claims/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations\s+WHERE id = '078_task_stage_claims'/i)

    const db = openMigratedDb()
    db.prepare("INSERT INTO schema_migrations (id) VALUES ('999_operator_marker')").run()
    db.exec(sql)
    db.exec(sql)

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_stage_claims'").get()).toBeUndefined()
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(M78_ID)).toBeUndefined()
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '999_operator_marker'").get()).toEqual({
      id: '999_operator_marker',
    })
  })
})
