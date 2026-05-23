import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M77_ID = '077_github_sync_lifecycle'
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M77.sql')

const CONTROL_COLUMNS = [
  'id',
  'workspace_id',
  'github_repo',
  'enabled',
  'interval_seconds',
  'max_pages',
  'max_issues',
  'max_duration_seconds',
  'owner_project_id',
  'disabled_reason',
  'next_retry_at',
  'next_retry_reason',
  'backoff_seconds',
  'consecutive_failures',
  'lease_run_id',
  'lease_owner',
  'lease_started_at',
  'lease_expires_at',
  'last_started_at',
  'last_completed_at',
  'last_success_cursor',
  'last_error',
  'latest_partial_run_reason',
  'total_successes',
  'total_failures',
  'total_partials',
  'total_overlap_rejections',
  'skipped_owner_count',
  'skipped_non_owner_count',
  'created_at',
  'updated_at',
]

const RUN_COLUMNS = [
  'run_id',
  'sync_id',
  'workspace_id',
  'github_repo',
  'project_id',
  'trigger',
  'requested_by',
  'lease_owner',
  'started_at',
  'completed_at',
  'result',
  'failure_reason',
  'partial_run_reason',
  'cursor_before',
  'cursor_after',
  'cursor_advanced',
  'pages_fetched',
  'issues_seen',
  'issues_pulled',
  'issues_pushed',
  'duration_ms',
  'stale_recovered_from_run_id',
  'diagnostics_json',
]

const openDbs: Database.Database[] = []
let runMigrations: (db: Database.Database) => void

beforeAll(async () => {
  const migrationsModule = (await import('../migrations')) as {
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
          AND name IN ('github_sync_lifecycle_controls', 'github_sync_lifecycle_runs')
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

function applyRollback(db: Database.Database): void {
  db.exec(readFileSync(ROLLBACK_PATH, 'utf8'))
}

function insertControl(
  db: Database.Database,
  values: Partial<{
    workspace_id: number
    github_repo: string
    enabled: number
    interval_seconds: number
    max_pages: number
    max_issues: number
    max_duration_seconds: number
    lease_run_id: string | null
    lease_expires_at: number | null
  }> = {},
): number {
  const result = db
    .prepare(
      `
        INSERT INTO github_sync_lifecycle_controls (
          workspace_id,
          github_repo,
          enabled,
          interval_seconds,
          max_pages,
          max_issues,
          max_duration_seconds,
          lease_run_id,
          lease_expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      values.workspace_id ?? 1,
      values.github_repo ?? 'builderz-labs/mission-control',
      values.enabled ?? 0,
      values.interval_seconds ?? 300,
      values.max_pages ?? 10,
      values.max_issues ?? 1000,
      values.max_duration_seconds ?? 45,
      values.lease_run_id ?? null,
      values.lease_expires_at ?? null,
    )

  return Number(result.lastInsertRowid)
}

function insertRun(
  db: Database.Database,
  values: Partial<{
    run_id: string
    sync_id: number | null
    workspace_id: number
    github_repo: string
    trigger: string
    started_at: number
    result: string
    failure_reason: string | null
    cursor_before: string | null
    cursor_after: string | null
    cursor_advanced: number
  }> = {},
): void {
  db.prepare(
    `
      INSERT INTO github_sync_lifecycle_runs (
        run_id,
        sync_id,
        workspace_id,
        github_repo,
        trigger,
        started_at,
        result,
        failure_reason,
        cursor_before,
        cursor_after,
        cursor_advanced
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    values.run_id ?? 'run-1',
    values.sync_id ?? null,
    values.workspace_id ?? 1,
    values.github_repo ?? 'builderz-labs/mission-control',
    values.trigger ?? 'automatic',
    values.started_at ?? 1_779_552_000,
    values.result ?? 'running',
    values.failure_reason ?? null,
    values.cursor_before ?? null,
    values.cursor_after ?? null,
    values.cursor_advanced ?? 0,
  )
}

describe('M77 GitHub sync lifecycle migration', () => {
  it('creates lifecycle tables idempotently and records exactly one M77 marker', () => {
    const db = openMigratedDb()

    runMigrations(db)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M77_ID)
    expect(() => {
      runMigrations(db)
    }).not.toThrow()

    expect(tableNames(db)).toEqual(['github_sync_lifecycle_controls', 'github_sync_lifecycle_runs'])
    expect(
      db.prepare(`SELECT COUNT(*) as count FROM schema_migrations WHERE id = ?`).get(M77_ID),
    ).toEqual({ count: 1 })
  })

  it('creates the control table shape, bounds checks, scoped uniqueness, and inspection indexes', () => {
    const db = openMigratedDb()
    const columns = tableColumns(db, 'github_sync_lifecycle_controls')

    expect([...columns.keys()]).toEqual(CONTROL_COLUMNS)
    expect(columns.get('id')).toMatchObject({ pk: 1, type: 'INTEGER' })
    for (const required of [
      'workspace_id',
      'github_repo',
      'enabled',
      'interval_seconds',
      'max_pages',
      'max_issues',
      'max_duration_seconds',
      'backoff_seconds',
      'consecutive_failures',
      'total_successes',
      'total_failures',
      'total_partials',
      'total_overlap_rejections',
      'skipped_owner_count',
      'skipped_non_owner_count',
      'created_at',
      'updated_at',
    ]) {
      expect(columns.get(required)?.notnull).toBe(1)
    }

    insertControl(db)
    expect(() => insertControl(db)).toThrow()
    expect(() => insertControl(db, { workspace_id: 2 })).not.toThrow()
    expect(() => insertControl(db, { github_repo: 'builderz-labs/other-repo' })).not.toThrow()
    expect(() => insertControl(db, { github_repo: 'bad-enabled', enabled: 2 })).toThrow()
    expect(() => insertControl(db, { github_repo: 'short-interval', interval_seconds: 59 })).toThrow()
    expect(() => insertControl(db, { github_repo: 'too-many-pages', max_pages: 101 })).toThrow()
    expect(() => insertControl(db, { github_repo: 'too-many-issues', max_issues: 5001 })).toThrow()
    expect(() => insertControl(db, { github_repo: 'too-short-duration', max_duration_seconds: 4 })).toThrow()

    const indexes = indexNames(db, 'github_sync_lifecycle_controls')
    expect(indexes.get('idx_github_sync_lifecycle_controls_scope')).toMatchObject({ unique: 1, partial: 0 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_controls_scope')).toEqual(['workspace_id', 'github_repo'])
    expect(indexes.get('idx_github_sync_lifecycle_controls_due')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_controls_due')).toEqual([
      'enabled',
      'next_retry_at',
      'workspace_id',
    ])
    expect(indexes.get('idx_github_sync_lifecycle_controls_lease')).toMatchObject({ unique: 0, partial: 1 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_controls_lease')).toEqual(['lease_expires_at'])
  })

  it('creates the run detail table shape, vocab checks, sync-history foreign key, cursor rule, and indexes', () => {
    const db = openMigratedDb()
    const columns = tableColumns(db, 'github_sync_lifecycle_runs')

    expect([...columns.keys()]).toEqual(RUN_COLUMNS)
    expect(columns.get('run_id')).toMatchObject({ pk: 1, type: 'TEXT' })
    for (const required of [
      'workspace_id',
      'github_repo',
      'trigger',
      'started_at',
      'result',
      'cursor_advanced',
      'pages_fetched',
      'issues_seen',
      'issues_pulled',
      'issues_pushed',
    ]) {
      expect(columns.get(required)?.notnull).toBe(1)
    }

    expect(db.prepare(`PRAGMA foreign_key_list(github_sync_lifecycle_runs)`).all()).toContainEqual(
      expect.objectContaining({
        table: 'github_syncs',
        from: 'sync_id',
        to: 'id',
      }),
    )

    const syncId = Number(
      db
        .prepare(
          `
            INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, workspace_id)
            VALUES ('builderz-labs/mission-control', 1779552000, 0, 'inbound', 'success', 1)
          `,
        )
        .run().lastInsertRowid,
    )

    insertRun(db, {
      run_id: 'manual-success',
      sync_id: syncId,
      trigger: 'manual',
      result: 'success',
      cursor_after: '2026-05-23T00:00:00.000Z',
      cursor_advanced: 1,
    })
    insertRun(db, { run_id: 'automatic-failed', result: 'failed', failure_reason: 'github_rate_limited' })
    insertRun(db, {
      run_id: 'automatic-skipped-owner',
      result: 'skipped_owner',
      cursor_before: '2026-05-22T00:00:00.000Z',
      cursor_after: '2026-05-22T00:00:00.000Z',
    })

    expect(() => {
      insertRun(db, { run_id: 'bad-trigger', trigger: 'cron' })
    }).toThrow()
    expect(() => {
      insertRun(db, { run_id: 'bad-result', result: 'queued' })
    }).toThrow()
    expect(() => {
      insertRun(db, { run_id: 'bad-failure', result: 'failed', failure_reason: 'raw_http_body' })
    }).toThrow()
    expect(() => {
      insertRun(db, {
        run_id: 'bad-cursor-advance',
        result: 'failed',
        cursor_before: '2026-05-22T00:00:00.000Z',
        cursor_after: '2026-05-23T00:00:00.000Z',
        cursor_advanced: 1,
      })
    }).toThrow()

    const indexes = indexNames(db, 'github_sync_lifecycle_runs')
    expect(indexes.get('idx_github_sync_lifecycle_runs_scope_started')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_runs_scope_started')).toEqual([
      'workspace_id',
      'github_repo',
      'started_at',
    ])
    expect(indexes.get('idx_github_sync_lifecycle_runs_sync_id')).toMatchObject({ unique: 0, partial: 1 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_runs_sync_id')).toEqual(['sync_id'])
    expect(indexes.get('idx_github_sync_lifecycle_runs_result')).toMatchObject({ unique: 0, partial: 0 })
    expect(indexColumns(db, 'idx_github_sync_lifecycle_runs_result')).toEqual(['workspace_id', 'result', 'completed_at'])
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
  })

  it('ships an idempotent rollback artifact that drops run detail before controls and preserves compatibility sync history', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')

    expect(sql).toMatch(/github_syncs.*remain|preserve.*github_syncs|compatibility sync history/i)
    expect(sql).toMatch(/PRAGMA\s+foreign_key_check/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations\s+WHERE id = '077_github_sync_lifecycle'/i)
    expect(sql.indexOf('DROP TABLE IF EXISTS github_sync_lifecycle_runs')).toBeGreaterThanOrEqual(0)
    expect(sql.indexOf('DROP TABLE IF EXISTS github_sync_lifecycle_controls')).toBeGreaterThan(
      sql.indexOf('DROP TABLE IF EXISTS github_sync_lifecycle_runs'),
    )
  })

  it('rollback drops only M77 lifecycle state, remains rerun-safe, and allows M77 to run again', () => {
    const db = openMigratedDb()
    db.prepare(`INSERT INTO schema_migrations (id) VALUES ('999_operator_marker')`).run()
    const syncId = Number(
      db
        .prepare(
          `
            INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, workspace_id)
            VALUES ('builderz-labs/mission-control', 1779552000, 0, 'inbound', 'success', 1)
          `,
        )
        .run().lastInsertRowid,
    )
    insertControl(db)
    insertRun(db, {
      run_id: 'rollback-run',
      sync_id: syncId,
      trigger: 'manual',
      result: 'success',
      cursor_after: '2026-05-23T00:00:00.000Z',
      cursor_advanced: 1,
    })

    expect(() => {
      applyRollback(db)
    }).not.toThrow()
    expect(() => {
      applyRollback(db)
    }).not.toThrow()

    expect(tableNames(db)).toEqual([])
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M77_ID)).toBeUndefined()
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id = '999_operator_marker'`).get()).toEqual({
      id: '999_operator_marker',
    })
    expect(db.prepare(`SELECT COUNT(*) as count FROM github_syncs WHERE id = ?`).get(syncId)).toEqual({ count: 1 })

    runMigrations(db)
    expect(tableNames(db)).toEqual(['github_sync_lifecycle_controls', 'github_sync_lifecycle_runs'])
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M77_ID)).toEqual({ id: M77_ID })
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
  })
})
