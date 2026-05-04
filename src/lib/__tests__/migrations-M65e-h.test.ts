import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// SPEC-008 - Migration M65e..M65h test harness.

const migrationIdsThroughM65d = [
  '001_init',
  '002_quality_reviews',
  '003_quality_review_status_backfill',
  '004_messages',
  '005_users',
  '006_workflow_templates',
  '007_audit_log',
  '008_webhooks',
  '009_pipelines',
  '010_settings',
  '011_alert_rules',
  '012_super_admin_tenants',
  '013_tenant_owner_gateway',
  '014_auth_google_approvals',
  '015_missing_indexes',
  '016_direct_connections',
  '017_github_sync',
  '018_token_usage',
  '019_webhook_retry',
  '020_claude_sessions',
  '021_workspace_isolation_phase1',
  '022_workspace_isolation_phase2',
  '023_workspace_isolation_phase3',
  '024_projects_support',
  '025_token_usage_task_attribution',
  '026_task_outcome_tracking',
  '027_enhanced_projects',
  '028_github_sync_v2',
  '029_link_workspaces_to_tenants',
  '032_adapter_configs',
  '033_skills',
  '034_agents_source',
  '035_api_keys_v2',
  '036_recurring_tasks_index',
  '037_security_audit',
  '038_agent_evals',
  '039_session_costs',
  '040_agent_api_keys',
  '041_gateway_health_logs',
  '042_agent_hidden',
  '043_hash_session_tokens',
  '044_spawn_history',
  '045_task_dispatch_attempts',
  '046_agent_runs',
  '047_agent_working_memory',
  '048_memory_fts',
  '049_agent_runtime_type',
  '050_mcp_call_receipt_signing',
  '051_security_audit_indexes',
  '052_recalculate_agent_trust_without_rate_limit_hits',
  '053_agent_scope',
  '054_workflow_templates_task_chain_routing_and_artifact_policy',
  '055_tasks_workflow_template_binding_and_lineage',
  '056_workspace_feature_flags',
  '057_task_dispositions',
  '058_task_artifacts',
  '059_facility_workspace_seed',
  '060_resource_policies',
  '061_resource_policy_events',
  '062_task_successor_unique_parent_index',
  '063_area_label_routing_sync_owner_triage',
  '064_resource_governance_default_policies',
  '065a_source_emission_capability',
  '065b_raw_usage_events',
  '065c_canonical_usage_events',
  '065d_canonical_budget_effects',
]

const M65E_ID = '065e_resource_budget_ledger'
const M65F_ID = '065f_resource_budget_counters'
const M65G_ID = '065g_resource_reservations'
const M65H_ID = '065h_resource_overrides'

const ZERO_PREV_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function applySql(db: Database.Database, sql: string): void {
  db.exec(sql)
}

function createDbBeforeM65e(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)

  applySql(
    db,
    `CREATE TABLE schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL DEFAULT (unixepoch())
     );`,
  )

  const insert = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  for (const id of migrationIdsThroughM65d) insert.run(id)

  return db
}

function applyRollback(db: Database.Database, fileName: string): void {
  const sql = readFileSync(
    join(process.cwd(), 'docs', 'migrations', fileName),
    'utf8',
  )
  applySql(db, sql)
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function indexExists(db: Database.Database, index: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 as ok FROM sqlite_master WHERE type = 'index' AND name = ?`,
    )
    .get(index) as { ok?: number } | undefined
  return row?.ok === 1
}

function triggerExists(db: Database.Database, trigger: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 as ok FROM sqlite_master WHERE type = 'trigger' AND name = ?`,
    )
    .get(trigger) as { ok?: number } | undefined
  return row?.ok === 1
}

function columns(db: Database.Database, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((column) => column.name)
}

describe('SPEC-008 M65e resource_budget_ledger (append-only, hash-chained)', () => {
  it('creates the resource_budget_ledger table with the documented columns', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(tableExists(db, 'resource_budget_ledger')).toBe(true)

    const cols = columns(db, 'resource_budget_ledger')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'policy_id',
        'counter_id',
        'window_start',
        'kind',
        'amount',
        'unit',
        'source_event_id',
        'decision_id',
        'prev_hash',
        'row_hash',
        'partition_month',
        'created_at',
        'notes_json',
      ]),
    )
  })

  it('creates the documented indexes on resource_budget_ledger', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_budget_ledger_policy_window')).toBe(true)
    expect(indexExists(db, 'idx_resource_budget_ledger_partition')).toBe(true)
    expect(indexExists(db, 'idx_resource_budget_ledger_decision')).toBe(true)
  })

  it('kind CHECK constraint accepts the five documented values', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const validKinds = ['debit', 'credit', 'correction', 'reservation', 'release']
    for (const kind of validKinds) {
      db.prepare(
        `INSERT INTO resource_budget_ledger
           (policy_id, window_start, kind, amount, unit, prev_hash, row_hash, partition_month)
         VALUES (1, '2026-05-01T00:00:00Z', ?, 1, 'usd', ?, ?, '2026-05')`,
      ).run(kind, ZERO_PREV_HASH, 'a'.repeat(64))
    }

    // 5 inserted plus genesis (credit, amount=0). Filter excludes the genesis.
    const count = (db
      .prepare(
        `SELECT COUNT(*) as c FROM resource_budget_ledger WHERE kind != 'credit' OR amount != 0`,
      )
      .get() as { c: number }).c
    expect(count).toBe(5)
  })

  it("kind CHECK constraint rejects an unrecognized value (e.g., 'topup')", () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_budget_ledger
             (policy_id, window_start, kind, amount, unit, prev_hash, row_hash, partition_month)
           VALUES (1, '2026-05-01T00:00:00Z', 'topup', 1, 'usd', ?, ?, '2026-05')`,
        )
        .run(ZERO_PREV_HASH, 'a'.repeat(64)),
    ).toThrow(/CHECK constraint failed|kind/i)
  })

  it("unit CHECK constraint rejects an unrecognized value (e.g., 'gb')", () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_budget_ledger
             (policy_id, window_start, kind, amount, unit, prev_hash, row_hash, partition_month)
           VALUES (1, '2026-05-01T00:00:00Z', 'debit', 1, 'gb', ?, ?, '2026-05')`,
        )
        .run(ZERO_PREV_HASH, 'a'.repeat(64)),
    ).toThrow(/CHECK constraint failed|unit/i)
  })

  it('seeds a genesis row with prev_hash=64 zeros, policy_id=0, kind=credit, amount=0 (FR-219m)', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const genesis = db
      .prepare(
        `SELECT policy_id, kind, amount, unit, prev_hash, row_hash, partition_month
         FROM resource_budget_ledger
         WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as
      | {
          policy_id: number
          kind: string
          amount: number
          unit: string
          prev_hash: string
          row_hash: string
          partition_month: string
        }
      | undefined

    expect(genesis).toBeDefined()
    expect(genesis?.policy_id).toBe(0)
    expect(genesis?.kind).toBe('credit')
    expect(genesis?.amount).toBe(0)
    expect(genesis?.prev_hash).toBe(ZERO_PREV_HASH)
    expect(genesis?.row_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(genesis?.partition_month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('genesis row_hash is the SHA-256 of the canonical pipe-delimited form', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const genesis = db
      .prepare(
        `SELECT policy_id, counter_id, window_start, kind, amount, unit,
                source_event_id, decision_id, prev_hash, row_hash,
                partition_month, notes_json
         FROM resource_budget_ledger
         WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as {
      policy_id: number
      counter_id: number | null
      window_start: string
      kind: string
      amount: number
      unit: string
      source_event_id: number | null
      decision_id: string | null
      prev_hash: string
      row_hash: string
      partition_month: string
      notes_json: string | null
    }

    // Canonical form: prev_hash|policy_id|counter_id|window_start|kind|
    // amount|unit|source_event_id|decision_id|partition_month|notes_json
    // with NULL rendered as empty string.
    const canonical = [
      genesis.prev_hash,
      String(genesis.policy_id),
      genesis.counter_id == null ? '' : String(genesis.counter_id),
      genesis.window_start,
      genesis.kind,
      String(genesis.amount),
      genesis.unit,
      genesis.source_event_id == null ? '' : String(genesis.source_event_id),
      genesis.decision_id == null ? '' : genesis.decision_id,
      genesis.partition_month,
      genesis.notes_json == null ? '' : genesis.notes_json,
    ].join('|')

    const expectedHash = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(genesis.row_hash).toBe(expectedHash)
  })

  it('creates BEFORE UPDATE/DELETE triggers that make the table append-only (FR-176a)', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(triggerExists(db, 'trg_resource_budget_ledger_no_update')).toBe(true)
    expect(triggerExists(db, 'trg_resource_budget_ledger_no_delete')).toBe(true)
  })

  it('UPDATE on resource_budget_ledger is rejected by trg_resource_budget_ledger_no_update', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db.prepare(`UPDATE resource_budget_ledger SET amount = 999 WHERE id = 1`).run(),
    ).toThrow(/append-only/i)
  })

  it('DELETE on resource_budget_ledger is rejected by trg_resource_budget_ledger_no_delete', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db.prepare(`DELETE FROM resource_budget_ledger WHERE id = 1`).run(),
    ).toThrow(/append-only/i)
  })

  it('records the M65e marker in schema_migrations', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65E_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65E_ID)
  })

  it('rerunning M65e (with marker deleted) does NOT insert a duplicate genesis row', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const before = (db
      .prepare(
        `SELECT COUNT(*) as c FROM resource_budget_ledger WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as { c: number }).c
    expect(before).toBe(1)

    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65E_ID)

    expect(() => runMigrations(db)).not.toThrow()

    const after = (db
      .prepare(
        `SELECT COUNT(*) as c FROM resource_budget_ledger WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as { c: number }).c
    expect(after).toBe(1)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65e.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65e.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_resource_budget_ledger_no_update/i)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_resource_budget_ledger_no_delete/i)
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_resource_budget_ledger/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_budget_ledger/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065e_resource_budget_ledger/i,
    )
  })

  it('rollback drops resource_budget_ledger, its indexes, triggers, and the M65e marker', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    applyRollback(db, 'rollback-M65e.sql')

    expect(tableExists(db, 'resource_budget_ledger')).toBe(false)
    expect(triggerExists(db, 'trg_resource_budget_ledger_no_update')).toBe(false)
    expect(triggerExists(db, 'trg_resource_budget_ledger_no_delete')).toBe(false)
    expect(indexExists(db, 'idx_resource_budget_ledger_policy_window')).toBe(false)
    expect(indexExists(db, 'idx_resource_budget_ledger_partition')).toBe(false)
    expect(indexExists(db, 'idx_resource_budget_ledger_decision')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65E_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65f resource_budget_counters (precomputed per-window balances)', () => {
  it('creates the resource_budget_counters table with the documented columns', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(tableExists(db, 'resource_budget_counters')).toBe(true)

    const cols = columns(db, 'resource_budget_counters')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'policy_id',
        'window_start',
        'consumed_usd',
        'consumed_token',
        'consumed_request',
        'consumed_session',
        'reserved_usd',
        'reserved_token',
        'reserved_request',
        'reserved_session',
        'version',
        'pending_rebuild_job_id',
        'updated_at',
      ]),
    )
  })

  it('creates the documented indexes on resource_budget_counters', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_budget_counters_lookup')).toBe(true)
    expect(indexExists(db, 'idx_resource_budget_counters_pending_rebuild')).toBe(true)
  })

  it('UNIQUE(policy_id, window_start) prevents duplicate counter rows', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_budget_counters (policy_id, window_start)
       VALUES (1, '2026-05-01T00:00:00Z')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_budget_counters (policy_id, window_start)
           VALUES (1, '2026-05-01T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('counters default consumed_/reserved_/version to 0/0/1 with pending_rebuild_job_id NULL', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_budget_counters (policy_id, window_start)
       VALUES (2, '2026-05-02T00:00:00Z')`,
    ).run()

    const row = db
      .prepare(
        `SELECT consumed_usd, consumed_token, consumed_request, consumed_session,
                reserved_usd, reserved_token, reserved_request, reserved_session,
                version, pending_rebuild_job_id
         FROM resource_budget_counters
         WHERE policy_id = 2 AND window_start = '2026-05-02T00:00:00Z'`,
      )
      .get() as {
      consumed_usd: number
      consumed_token: number
      consumed_request: number
      consumed_session: number
      reserved_usd: number
      reserved_token: number
      reserved_request: number
      reserved_session: number
      version: number
      pending_rebuild_job_id: string | null
    }

    expect(row.consumed_usd).toBe(0)
    expect(row.consumed_token).toBe(0)
    expect(row.consumed_request).toBe(0)
    expect(row.consumed_session).toBe(0)
    expect(row.reserved_usd).toBe(0)
    expect(row.reserved_token).toBe(0)
    expect(row.reserved_request).toBe(0)
    expect(row.reserved_session).toBe(0)
    expect(row.version).toBe(1)
    expect(row.pending_rebuild_job_id).toBeNull()
  })

  it('records the M65f marker in schema_migrations', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65F_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65F_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65f.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65f.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_resource_budget_counters/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_budget_counters/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065f_resource_budget_counters/i,
    )
  })

  it('rollback drops resource_budget_counters, its indexes, and the M65f marker', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    applyRollback(db, 'rollback-M65f.sql')

    expect(tableExists(db, 'resource_budget_counters')).toBe(false)
    expect(indexExists(db, 'idx_resource_budget_counters_lookup')).toBe(false)
    expect(indexExists(db, 'idx_resource_budget_counters_pending_rebuild')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65F_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65g resource_reservations (with state-transition trigger)', () => {
  it('creates the resource_reservations table with the documented columns', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(tableExists(db, 'resource_reservations')).toBe(true)

    const cols = columns(db, 'resource_reservations')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'policy_id',
        'counter_id',
        'window_start',
        'amount',
        'unit',
        'state',
        'granted_by',
        'originating_decision_id',
        'expires_at',
        'reserved_at',
        'finalized_at',
        'finalized_reason',
      ]),
    )
  })

  it('creates the documented indexes on resource_reservations', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_reservations_active')).toBe(true)
    expect(indexExists(db, 'idx_resource_reservations_expires_at')).toBe(true)
  })

  it("state CHECK constraint rejects an unrecognized value (e.g., 'pending')", () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_reservations
             (policy_id, window_start, amount, unit, state, granted_by, expires_at)
           VALUES (1, '2026-05-01T00:00:00Z', 1, 'usd', 'pending', 'system', '2026-05-02T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|state/i)
  })

  it("unit CHECK constraint rejects an unrecognized value (e.g., 'gb')", () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_reservations
             (policy_id, window_start, amount, unit, state, granted_by, expires_at)
           VALUES (1, '2026-05-01T00:00:00Z', 1, 'gb', 'active', 'system', '2026-05-02T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|unit/i)
  })

  it('creates the BEFORE UPDATE OF state trigger', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(triggerExists(db, 'trg_resource_reservations_state_transition')).toBe(true)
  })

  it('allows valid state transitions: active->consumed, active->released, active->expired', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const insert = db.prepare(
      `INSERT INTO resource_reservations
         (policy_id, window_start, amount, unit, state, granted_by, expires_at)
       VALUES (?, '2026-05-01T00:00:00Z', 1, 'usd', 'active', 'system', '2026-05-02T00:00:00Z')`,
    )
    const a = insert.run(1).lastInsertRowid as number
    const b = insert.run(2).lastInsertRowid as number
    const c = insert.run(3).lastInsertRowid as number

    expect(() =>
      db
        .prepare(`UPDATE resource_reservations SET state = 'consumed' WHERE id = ?`)
        .run(a),
    ).not.toThrow()
    expect(() =>
      db
        .prepare(`UPDATE resource_reservations SET state = 'released' WHERE id = ?`)
        .run(b),
    ).not.toThrow()
    expect(() =>
      db
        .prepare(`UPDATE resource_reservations SET state = 'expired' WHERE id = ?`)
        .run(c),
    ).not.toThrow()
  })

  it('rejects invalid state transitions (e.g., consumed->active, released->consumed)', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const insert = db.prepare(
      `INSERT INTO resource_reservations
         (policy_id, window_start, amount, unit, state, granted_by, expires_at)
       VALUES (?, '2026-05-01T00:00:00Z', 1, 'usd', 'active', 'system', '2026-05-02T00:00:00Z')`,
    )
    const consumedId = insert.run(1).lastInsertRowid as number
    db.prepare(`UPDATE resource_reservations SET state = 'consumed' WHERE id = ?`).run(consumedId)

    expect(() =>
      db
        .prepare(`UPDATE resource_reservations SET state = 'active' WHERE id = ?`)
        .run(consumedId),
    ).toThrow(/invalid state transition/i)

    const releasedId = insert.run(2).lastInsertRowid as number
    db.prepare(`UPDATE resource_reservations SET state = 'released' WHERE id = ?`).run(releasedId)

    expect(() =>
      db
        .prepare(`UPDATE resource_reservations SET state = 'consumed' WHERE id = ?`)
        .run(releasedId),
    ).toThrow(/invalid state transition/i)
  })

  it('records the M65g marker in schema_migrations', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65G_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65G_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65g.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65g.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_resource_reservations_state_transition/i)
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_resource_reservations/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_reservations/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065g_resource_reservations/i,
    )
  })

  it('rollback drops resource_reservations, its indexes, trigger, and the M65g marker', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    // Drop M65h first (resource_overrides has a soft FK to resource_reservations).
    applySql(db, `DROP TABLE IF EXISTS resource_overrides`)

    applyRollback(db, 'rollback-M65g.sql')

    expect(tableExists(db, 'resource_reservations')).toBe(false)
    expect(triggerExists(db, 'trg_resource_reservations_state_transition')).toBe(false)
    expect(indexExists(db, 'idx_resource_reservations_active')).toBe(false)
    expect(indexExists(db, 'idx_resource_reservations_expires_at')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65G_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65h resource_overrides (operator grants)', () => {
  it('creates the resource_overrides table with the documented columns', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(tableExists(db, 'resource_overrides')).toBe(true)

    const cols = columns(db, 'resource_overrides')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'scope_kind',
        'scope_id',
        'policy_id',
        'granted_amount',
        'granted_unit',
        'reservation_id',
        'reason',
        'actor',
        'idempotency_key',
        'granted_at',
        'expires_at',
        'revoked_at',
        'revoked_reason',
      ]),
    )
  })

  it('creates the documented indexes on resource_overrides', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_overrides_active')).toBe(true)
    expect(indexExists(db, 'idx_resource_overrides_expires')).toBe(true)
    expect(indexExists(db, 'idx_resource_overrides_idempotency')).toBe(true)
  })

  it("scope_kind CHECK constraint rejects an unrecognized value (e.g., 'tenant')", () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_overrides
             (scope_kind, reason, actor, idempotency_key, expires_at)
           VALUES ('tenant', 'r', 'op', 'k1', '2026-05-02T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|scope_kind/i)
  })

  it('scope_kind CHECK constraint accepts the six documented values', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const validScopes = [
      'facility',
      'workspace',
      'agent',
      'project',
      'task_status',
      'specific_task',
    ]
    const insert = db.prepare(
      `INSERT INTO resource_overrides
         (scope_kind, reason, actor, idempotency_key, expires_at)
       VALUES (?, 'r', 'op', ?, '2026-05-02T00:00:00Z')`,
    )
    for (let i = 0; i < validScopes.length; i++) {
      insert.run(validScopes[i], `key-${i}`)
    }

    const count = (db
      .prepare(`SELECT COUNT(*) as c FROM resource_overrides`)
      .get() as { c: number }).c
    expect(count).toBe(validScopes.length)
  })

  it('granted_unit CHECK accepts NULL or one of the four documented units', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    const insert = db.prepare(
      `INSERT INTO resource_overrides
         (scope_kind, granted_unit, reason, actor, idempotency_key, expires_at)
       VALUES ('facility', ?, 'r', 'op', ?, '2026-05-02T00:00:00Z')`,
    )
    insert.run(null, 'k-null')
    insert.run('usd', 'k-usd')
    insert.run('token', 'k-token')
    insert.run('request', 'k-request')
    insert.run('session', 'k-session')

    expect(() => insert.run('gb', 'k-bad')).toThrow(/CHECK constraint failed|granted_unit/i)
  })

  it('UNIQUE(idempotency_key, actor) prevents duplicate operator grants', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_overrides
         (scope_kind, reason, actor, idempotency_key, expires_at)
       VALUES ('facility', 'r', 'opA', 'shared-key', '2026-05-02T00:00:00Z')`,
    ).run()

    // Same idempotency_key with different actor is allowed.
    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_overrides
             (scope_kind, reason, actor, idempotency_key, expires_at)
           VALUES ('facility', 'r', 'opB', 'shared-key', '2026-05-02T00:00:00Z')`,
        )
        .run(),
    ).not.toThrow()

    // Same (idempotency_key, actor) is rejected.
    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_overrides
             (scope_kind, reason, actor, idempotency_key, expires_at)
           VALUES ('facility', 'r', 'opA', 'shared-key', '2026-05-02T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('records the M65h marker in schema_migrations', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65H_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65H_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65h.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65h.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_resource_overrides/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_overrides/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065h_resource_overrides/i,
    )
  })

  it('rollback drops resource_overrides, its indexes, and the M65h marker', () => {
    const db = createDbBeforeM65e()
    runMigrations(db)

    applyRollback(db, 'rollback-M65h.sql')

    expect(tableExists(db, 'resource_overrides')).toBe(false)
    expect(indexExists(db, 'idx_resource_overrides_active')).toBe(false)
    expect(indexExists(db, 'idx_resource_overrides_expires')).toBe(false)
    expect(indexExists(db, 'idx_resource_overrides_idempotency')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65H_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65e..M65h idempotency', () => {
  it('rerunning all four migrations is a no-op (no duplicate genesis row, no errors)', () => {
    const db = createDbBeforeM65e()

    runMigrations(db)

    const genesisCountBefore = (db
      .prepare(
        `SELECT COUNT(*) as c FROM resource_budget_ledger WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as { c: number }).c
    expect(genesisCountBefore).toBe(1)

    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65E_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65F_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65G_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65H_ID)

    expect(() => runMigrations(db)).not.toThrow()

    const genesisCountAfter = (db
      .prepare(
        `SELECT COUNT(*) as c FROM resource_budget_ledger WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(ZERO_PREV_HASH) as { c: number }).c
    expect(genesisCountAfter).toBe(1)
  })
})
