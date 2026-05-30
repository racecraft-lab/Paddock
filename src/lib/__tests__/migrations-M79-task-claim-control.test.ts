import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M79_ID = '079_task_claim_control'
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M79.sql')
const OPERATOR_REASONS = [
  'operator_released',
  'operator_cancelled',
  'operator_retry_requested',
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

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_xinfo(${table})`).all() as { name: string }[])
    .map((column) => column.name)
}

function insertAttempt(db: Database.Database, attemptNumber: number): number {
  const result = db.prepare(`
    INSERT INTO task_stage_attempts (
      workspace_id, task_id, stage_key, attempt_number, status, created_at, updated_at
    ) VALUES (1, 100, 'dev', ?, 'running', '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z')
  `).run(attemptNumber)
  return Number(result.lastInsertRowid)
}

function insertReleasedClaim(db: Database.Database, reason: string, attemptNumber: number): void {
  db.prepare(`
    INSERT INTO task_stage_claims (
      workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state,
      lease_owner, claim_run_id, lease_started_at, lease_expires_at,
      release_reason, released_at, released_by_run_id
    ) VALUES (1, 100, 'dev', ?, 'released', 'operator', ?, 1770000000, 1770000300, ?, 1770000010, 'operator-run')
  `).run(insertAttempt(db, attemptNumber), `operator-run-${String(attemptNumber)}`, reason)
}

describe('M79 task claim-control migration', () => {
  it('widens task_stage_claims release_reason for SPEC-013C operator reasons without dropping M78 constraints', () => {
    const db = openMigratedDb()

    for (const [index, reason] of OPERATOR_REASONS.entries()) {
      expect(() => {
        insertReleasedClaim(db, reason, index + 1)
      }).not.toThrow()
    }
    expect(() => {
      insertReleasedClaim(db, 'manual_release', 99)
    }).toThrow()

    const indexes = new Map(
      (db.prepare('PRAGMA index_list(task_stage_claims)').all() as { name: string; unique: number; partial: number }[])
        .map((index) => [index.name, index]),
    )
    expect(indexes.get('idx_task_stage_claims_active_unique')).toMatchObject({ unique: 1, partial: 1 })
    expect(indexes.get('idx_task_stage_claims_attempt_unique')).toMatchObject({ unique: 1, partial: 0 })
  })

  it('creates hashed task-stage scoped idempotency replay storage', () => {
    const db = openMigratedDb()

    expect(columns(db, 'task_claim_control_idempotency_keys')).toEqual([
      'actor_user_id',
      'workspace_id',
      'task_id',
      'stage_key',
      'idempotency_key_hash',
      'action',
      'request_body_hash',
      'response_body_json',
      'response_status',
      'response_headers_json',
      'claim_control_activity_id',
      'created_at',
      'expires_at',
    ])

    const pk = db.prepare('PRAGMA table_info(task_claim_control_idempotency_keys)').all() as { name: string; pk: number }[]
    expect(pk.filter((column) => column.pk > 0).map((column) => column.name)).toEqual([
      'actor_user_id',
      'workspace_id',
      'task_id',
      'stage_key',
      'idempotency_key_hash',
    ])

    db.prepare(`
      INSERT INTO task_claim_control_idempotency_keys (
        actor_user_id, workspace_id, task_id, stage_key, idempotency_key_hash,
        action, request_body_hash, response_body_json, response_status, created_at, expires_at
      ) VALUES (1, 1, 100, 'dev', 'sha256:key', 'retry', 'sha256:body', '{"ok":true}', 200, '2026-05-28T00:00:00.000Z', '2026-05-29T00:00:00.000Z')
    `).run()
    expect(() => {
      db.prepare(`
        INSERT INTO task_claim_control_idempotency_keys (
          actor_user_id, workspace_id, task_id, stage_key, idempotency_key_hash,
          action, request_body_hash, response_body_json, response_status, created_at, expires_at
        ) VALUES (1, 1, 100, 'dev', 'sha256:key', 'retry', 'sha256:body', '{"ok":true}', 200, '2026-05-28T00:00:00.000Z', '2026-05-29T00:00:00.000Z')
      `).run()
    }).toThrow()

    const createSql = (db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'task_claim_control_idempotency_keys'
    `).get() as { sql: string }).sql
    expect(createSql).not.toMatch(/idempotency_key\s+TEXT/i)
  })

  it('is rerun-safe after the marker is removed', () => {
    const db = openMigratedDb()

    db.prepare('DELETE FROM schema_migrations WHERE id = ?').run(M79_ID)
    expect(() => {
      runMigrations(db)
    }).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) as count FROM schema_migrations WHERE id = ?').get(M79_ID)).toEqual({ count: 1 })
    expect(() => {
      insertReleasedClaim(db, 'operator_released', 1)
    }).not.toThrow()
  })
})

describe('M79 rollback SQL', () => {
  it('is present, removes idempotency storage, restores old reason constraints, and reruns after reapply', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')
    expect(sql).toMatch(/task_claim_control_idempotency_keys/i)
    expect(sql).toMatch(/operator_released/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations\s+WHERE id = '079_task_claim_control'/i)

    const db = openMigratedDb()
    insertReleasedClaim(db, 'launch_handoff_completed', 1)
    db.exec(sql)
    db.exec(sql)

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_claim_control_idempotency_keys'").get()).toBeUndefined()
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(M79_ID)).toBeUndefined()
    expect(() => {
      insertReleasedClaim(db, 'operator_released', 2)
    }).toThrow()

    runMigrations(db)
    expect(() => {
      insertReleasedClaim(db, 'operator_released', 3)
    }).not.toThrow()
  })

  it('refuses to contract release_reason while SPEC-013C operator rows exist', () => {
    const db = openMigratedDb()
    insertReleasedClaim(db, 'operator_cancelled', 1)

    expect(() => db.exec(readFileSync(ROLLBACK_PATH, 'utf8'))).toThrow()
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(M79_ID)).toEqual({ id: M79_ID })
  })
})
