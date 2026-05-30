import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M80_ID = '080_agent_sandbox_lifecycles'
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M80.sql')
const openDbs: Database.Database[] = []
let runMigrations: (db: Database.Database) => void

beforeAll(async () => {
  const migrationsModule = await import('../migrations') as {
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
  return (db.prepare(`PRAGMA table_xinfo(${table})`).all() as { name: string }[]).map((column) => column.name)
}

function indexColumns(db: Database.Database, indexName: string): string[] {
  return (db.prepare(`PRAGMA index_xinfo(${indexName})`).all() as { name: string | null; key: number }[])
    .filter((column) => column.key === 1)
    .map((column) => column.name)
    .filter((name): name is string => name !== null)
}

describe('M80 agent sandbox lifecycle migration', () => {
  it('creates lifecycle and event tables idempotently with one migration marker', () => {
    const db = openMigratedDb()

    runMigrations(db)
    expect(columns(db, 'agent_sandbox_lifecycles')).toEqual([
      'id',
      'workspace_id',
      'task_id',
      'stage_key',
      'sandbox_attempt_key',
      'task_stage_attempt_id',
      'task_stage_claim_id',
      'owner',
      'sandbox_key',
      'root_id',
      'sanitized_relative_path',
      'handle_id',
      'status',
      'created_at',
      'updated_at',
      'prepared_at',
      'running_at',
      'terminal_at',
      'cleanup_requested_at',
      'cleaned_up_at',
      'metadata_json',
    ])
    expect(columns(db, 'agent_sandbox_lifecycle_events')).toEqual([
      'id',
      'lifecycle_id',
      'workspace_id',
      'task_id',
      'stage_key',
      'sandbox_key',
      'event_type',
      'status',
      'reason_code',
      'observed_at',
      'actor_type',
      'actor_id',
      'metadata_json',
    ])
    expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?').get(M80_ID)).toEqual({ count: 1 })
  })

  it('enforces closed owner/status values and unique sandbox keys per workspace', () => {
    const db = openMigratedDb()
    const insert = db.prepare(`
      INSERT INTO agent_sandbox_lifecycles (
        workspace_id, task_id, stage_key, sandbox_attempt_key, owner, sandbox_key,
        root_id, sanitized_relative_path, status
      ) VALUES (1, 100, 'stage', '1', ?, ?, 'mission_control_data_sandboxes', 'workspace/1/task/100', ?)
    `)

    insert.run('mission_control', 'key-1', 'created')
    expect(() => insert.run('codex', 'key-2', 'created')).toThrow()
    expect(() => insert.run('openclaw', 'key-3', 'launching')).toThrow()
    expect(() => insert.run('external_harness', 'key-1', 'created')).toThrow()
  })

  it('creates task, attempt, claim, and event ordering indexes', () => {
    const db = openMigratedDb()
    const indexes = new Map(
      (db.prepare('PRAGMA index_list(agent_sandbox_lifecycles)').all() as { name: string; unique: number; partial: number }[])
        .map((index) => [index.name, index]),
    )
    expect(indexes.get('sqlite_autoindex_agent_sandbox_lifecycles_1')?.unique).toBe(1)
    expect(indexColumns(db, 'sqlite_autoindex_agent_sandbox_lifecycles_1')).toEqual(['workspace_id', 'sandbox_key'])
    expect(indexColumns(db, 'idx_agent_sandbox_lifecycles_task_status')).toEqual(['workspace_id', 'task_id', 'stage_key', 'status', 'updated_at'])
    expect(indexes.get('idx_agent_sandbox_lifecycles_attempt')).toMatchObject({ partial: 1 })
    expect(indexes.get('idx_agent_sandbox_lifecycles_claim')).toMatchObject({ partial: 1 })
    expect(indexColumns(db, 'idx_agent_sandbox_lifecycle_events_lifecycle_order')).toEqual(['lifecycle_id', 'observed_at', 'id'])
    expect(indexColumns(db, 'idx_agent_sandbox_lifecycle_events_task_order')).toEqual(['workspace_id', 'task_id', 'stage_key', 'observed_at', 'id'])
  })
})

describe('M80 rollback SQL', () => {
  it('is present, removes only M80 state, and is rerun-safe', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')
    expect(sql).toMatch(/DROP TABLE IF EXISTS agent_sandbox_lifecycle_events/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS agent_sandbox_lifecycles/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations\s+WHERE id = '080_agent_sandbox_lifecycles'/i)

    const db = openMigratedDb()
    db.prepare("INSERT INTO schema_migrations (id) VALUES ('999_operator_marker')").run()
    db.exec(sql)
    db.exec(sql)

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_sandbox_lifecycles'").get()).toBeUndefined()
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(M80_ID)).toBeUndefined()
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '999_operator_marker'").get()).toEqual({
      id: '999_operator_marker',
    })
  })
})
