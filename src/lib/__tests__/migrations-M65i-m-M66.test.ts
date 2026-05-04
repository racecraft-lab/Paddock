import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { MODEL_PRICING } from '@/lib/token-pricing'

// SPEC-008 - Migration M65i..M65m + M66 test harness.

const migrationIdsThroughM65h = [
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
  '065e_resource_budget_ledger',
  '065f_resource_budget_counters',
  '065g_resource_reservations',
  '065h_resource_overrides',
]

const M65I_ID = '065i_reconciliation_batches'
const M65J_ID = '065j_correction_ledger'
const M65K_ID = '065k_resource_snapshots'
const M65L_ID = '065l_provider_accounts_entitlements'
const M65M_ID = '065m_governance_final_tables'
const M66_ID = '066_token_pricing'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function createDbBeforeM65i(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)

  db.prepare(
    `CREATE TABLE schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL DEFAULT (unixepoch())
     )`,
  ).run()

  const insert = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  for (const id of migrationIdsThroughM65h) insert.run(id)

  return db
}

function applyRollback(db: Database.Database, fileName: string): void {
  const sql = readFileSync(
    join(process.cwd(), 'docs', 'migrations', fileName),
    'utf8',
  )
  db.exec(sql)
}

// M64 created provider_accounts. Tests that need M65l to ALTER it must
// also stand the M64 skeleton up because createDbBeforeM65i only marks
// M64 applied without executing it. Mirror the M64 schema exactly so
// addColumnIfMissing can run the four documented ALTERs.
function seedProviderAccountsM64Skeleton(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      account_label TEXT NOT NULL,
      billing_mode TEXT,
      config_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      UNIQUE(provider, account_label)
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_provider_accounts_active
    ON provider_accounts(provider) WHERE deleted_at IS NULL
  `)
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

function columns(db: Database.Database, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((column) => column.name)
}

describe('SPEC-008 M65i reconciliation_batches (state machine)', () => {
  it('creates the reconciliation_batches table with the documented columns', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(tableExists(db, 'reconciliation_batches')).toBe(true)

    const cols = columns(db, 'reconciliation_batches')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'source_id',
        'window_start',
        'window_end',
        'state',
        'rows_processed',
        'last_row_cursor',
        'attempts',
        'max_attempts',
        'max_duration_seconds',
        'started_at',
        'completed_at',
        'error_message',
        'created_at',
      ]),
    )
  })

  it('creates the documented indexes on reconciliation_batches', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(indexExists(db, 'idx_reconciliation_batches_state')).toBe(true)
    expect(indexExists(db, 'idx_reconciliation_batches_active')).toBe(true)
  })

  it('state CHECK constraint accepts the six documented values', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    const validStates = [
      'pending',
      'running',
      'completed',
      'failed',
      'failed_timeout',
      'failed_permanent',
    ]
    const insert = db.prepare(
      `INSERT INTO reconciliation_batches (source_id, window_start, window_end, state)
       VALUES (?, ?, ?, ?)`,
    )
    for (let i = 0; i < validStates.length; i++) {
      insert.run(`src-${i}`, '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', validStates[i])
    }

    const count = (db
      .prepare(`SELECT COUNT(*) as c FROM reconciliation_batches`)
      .get() as { c: number }).c
    expect(count).toBe(validStates.length)
  })

  it("state CHECK constraint rejects an unrecognized value (e.g., 'paused')", () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO reconciliation_batches (source_id, window_start, window_end, state)
           VALUES ('s', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', 'paused')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|state/i)
  })

  it('UNIQUE(source_id, window_start, window_end) prevents duplicate batches', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    db.prepare(
      `INSERT INTO reconciliation_batches (source_id, window_start, window_end, state)
       VALUES ('native_otel', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', 'pending')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO reconciliation_batches (source_id, window_start, window_end, state)
           VALUES ('native_otel', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', 'pending')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('records the M65i marker in schema_migrations', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65I_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65I_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65i.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65i.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_reconciliation_batches/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS reconciliation_batches/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065i_reconciliation_batches/i,
    )
  })

  it('rollback drops reconciliation_batches, its indexes, and the M65i marker', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    applyRollback(db, 'rollback-M65i.sql')

    expect(tableExists(db, 'reconciliation_batches')).toBe(false)
    expect(indexExists(db, 'idx_reconciliation_batches_state')).toBe(false)
    expect(indexExists(db, 'idx_reconciliation_batches_active')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65I_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65j correction_ledger (coalesced corrections)', () => {
  it('creates the correction_ledger table with the documented columns', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(tableExists(db, 'correction_ledger')).toBe(true)

    const cols = columns(db, 'correction_ledger')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'canonical_event_id',
        'prior_amount',
        'corrected_amount',
        'delta',
        'reason',
        'ledger_entry_id',
        'applied_at',
        'applied_by',
        'notes_json',
      ]),
    )
  })

  it('creates the documented indexes on correction_ledger', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(indexExists(db, 'idx_correction_ledger_event')).toBe(true)
    expect(indexExists(db, 'idx_correction_ledger_applied')).toBe(true)
  })

  it('reason CHECK constraint accepts the five documented values', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    const validReasons = [
      'late_arrival',
      'dedupe_repair',
      'price_correction',
      'manual',
      'schema_repair',
    ]
    const insert = db.prepare(
      `INSERT INTO correction_ledger
         (canonical_event_id, prior_amount, corrected_amount, delta, reason, applied_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (let i = 0; i < validReasons.length; i++) {
      insert.run(i + 1, 1.0, 2.0, 1.0, validReasons[i], 'system')
    }

    const count = (db
      .prepare(`SELECT COUNT(*) as c FROM correction_ledger`)
      .get() as { c: number }).c
    expect(count).toBe(validReasons.length)
  })

  it("reason CHECK constraint rejects an unrecognized value (e.g., 'rollback')", () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO correction_ledger
             (canonical_event_id, prior_amount, corrected_amount, delta, reason, applied_by)
           VALUES (1, 1.0, 2.0, 1.0, 'rollback', 'system')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|reason/i)
  })

  it('records the M65j marker in schema_migrations', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65J_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65J_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65j.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65j.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_correction_ledger/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS correction_ledger/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065j_correction_ledger/i,
    )
  })

  it('rollback drops correction_ledger, its indexes, and the M65j marker', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    applyRollback(db, 'rollback-M65j.sql')

    expect(tableExists(db, 'correction_ledger')).toBe(false)
    expect(indexExists(db, 'idx_correction_ledger_event')).toBe(false)
    expect(indexExists(db, 'idx_correction_ledger_applied')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65J_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65k resource_snapshots (cumulative deltas)', () => {
  it('creates the resource_snapshots table with the documented columns', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(tableExists(db, 'resource_snapshots')).toBe(true)

    const cols = columns(db, 'resource_snapshots')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'source_id',
        'scope_kind',
        'scope_id',
        'snapshot_at',
        'cumulative_tokens_in',
        'cumulative_tokens_out',
        'cumulative_cost_usd',
        'cumulative_requests',
        'delta_from_prior',
        'source_emission_fingerprint',
        'partition_month',
        'ingested_at',
      ]),
    )
  })

  it('creates the documented indexes on resource_snapshots', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_snapshots_scope')).toBe(true)
    expect(indexExists(db, 'idx_resource_snapshots_partition')).toBe(true)
  })

  it('UNIQUE(source_id, scope_kind, scope_id, snapshot_at) prevents duplicate snapshots', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_snapshots
         (source_id, scope_kind, scope_id, snapshot_at,
          source_emission_fingerprint, partition_month)
       VALUES ('native_otel', 'workspace', 1, '2026-05-01T00:00:00Z',
               'fp-1', '2026-05')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_snapshots
             (source_id, scope_kind, scope_id, snapshot_at,
              source_emission_fingerprint, partition_month)
           VALUES ('native_otel', 'workspace', 1, '2026-05-01T00:00:00Z',
                   'fp-1', '2026-05')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('default cumulative_* values and delta_from_prior NULL for first snapshot', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_snapshots
         (source_id, scope_kind, scope_id, snapshot_at,
          source_emission_fingerprint, partition_month)
       VALUES ('native_otel', 'facility', NULL, '2026-05-01T00:00:00Z',
               'fp-genesis', '2026-05')`,
    ).run()

    const row = db
      .prepare(
        `SELECT cumulative_tokens_in, cumulative_tokens_out, cumulative_cost_usd,
                cumulative_requests, delta_from_prior
         FROM resource_snapshots
         WHERE source_id = 'native_otel'`,
      )
      .get() as {
      cumulative_tokens_in: number
      cumulative_tokens_out: number
      cumulative_cost_usd: number
      cumulative_requests: number
      delta_from_prior: number | null
    }

    expect(row.cumulative_tokens_in).toBe(0)
    expect(row.cumulative_tokens_out).toBe(0)
    expect(row.cumulative_cost_usd).toBe(0)
    expect(row.cumulative_requests).toBe(0)
    expect(row.delta_from_prior).toBeNull()
  })

  it('records the M65k marker in schema_migrations', () => {
    const db = createDbBeforeM65i()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65K_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65K_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65k.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65k.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_resource_snapshots/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_snapshots/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065k_resource_snapshots/i,
    )
  })

  it('rollback drops resource_snapshots, its indexes, and the M65k marker', () => {
    const db = createDbBeforeM65i()
    runMigrations(db)

    applyRollback(db, 'rollback-M65k.sql')

    expect(tableExists(db, 'resource_snapshots')).toBe(false)
    expect(indexExists(db, 'idx_resource_snapshots_scope')).toBe(false)
    expect(indexExists(db, 'idx_resource_snapshots_partition')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65K_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65l provider_accounts extensions + provider_entitlements', () => {
  it('adds entitlements_json, tos_acknowledged_at, automation_class to provider_accounts', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    const cols = columns(db, 'provider_accounts')
    expect(cols).toEqual(
      expect.arrayContaining([
        'entitlements_json',
        'config_json',
        'tos_acknowledged_at',
        'automation_class',
      ]),
    )
  })

  it('addColumnIfMissing keeps provider_accounts.config_json even when M64 already created it', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    // Simulate M64 already having created config_json - the M65l ALTER
    // must no-op silently rather than fail with "duplicate column".
    runMigrations(db)

    const cols = columns(db, 'provider_accounts')
    const configJsonCount = cols.filter((c) => c === 'config_json').length
    expect(configJsonCount).toBe(1)
  })

  it('creates the provider_entitlements table with the documented columns', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    expect(tableExists(db, 'provider_entitlements')).toBe(true)

    const cols = columns(db, 'provider_entitlements')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'account_id',
        'tier',
        'rate_limits_json',
        'monthly_token_cap',
        'effective_at',
        'expires_at',
        'source',
        'detected_at',
      ]),
    )
  })

  it('creates the documented index idx_provider_entitlements_account_effective', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    expect(indexExists(db, 'idx_provider_entitlements_account_effective')).toBe(true)
  })

  it('declares a FOREIGN KEY from provider_entitlements.account_id to provider_accounts(id)', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    const fks = db
      .prepare(`PRAGMA foreign_key_list(provider_entitlements)`)
      .all() as Array<{ table: string; from: string; to: string }>

    const accountFk = fks.find(
      (fk) => fk.from === 'account_id' && fk.table === 'provider_accounts',
    )
    expect(accountFk?.to).toBe('id')
  })

  it('records the M65l marker in schema_migrations', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65L_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65L_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65l.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65l.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_provider_entitlements/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS provider_entitlements/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065l_provider_accounts_entitlements/i,
    )
  })

  it('rollback drops provider_entitlements, its index, and the M65l marker', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    applyRollback(db, 'rollback-M65l.sql')

    expect(tableExists(db, 'provider_entitlements')).toBe(false)
    expect(indexExists(db, 'idx_provider_entitlements_account_effective')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65L_ID)
    expect(marker).toBeUndefined()

    // provider_accounts table itself is preserved (M64 owns it); the
    // rollback only undoes the M65l-added columns and the new
    // provider_entitlements table.
    expect(tableExists(db, 'provider_accounts')).toBe(true)
  })
})

describe('SPEC-008 M65m governance final tables', () => {
  const M65M_TABLES = [
    'resource_governance_breaker',
    'resource_window_instances',
    'recovery_action',
    'quarantined_raw_events',
    'ingest_rate_state',
    'governance_audit_verification_state',
    'reconciler_lease',
    'governance_orphan_event',
  ]

  it('creates all eight M65m governance final tables', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    for (const table of M65M_TABLES) {
      expect(tableExists(db, table)).toBe(true)
    }
  })

  it('resource_governance_breaker enforces state CHECK ("closed" | "half_open" | "open")', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    for (const state of ['closed', 'half_open', 'open']) {
      db.prepare(
        `INSERT INTO resource_governance_breaker (scope_kind, scope_id, state)
         VALUES (?, ?, ?)`,
      ).run(`scope-${state}`, 1, state)
    }

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_governance_breaker (scope_kind, scope_id, state)
           VALUES ('scope-bad', 1, 'tripped')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|state/i)
  })

  it('quarantined_raw_events enforces reason CHECK against the six FR values', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    const validReasons = [
      'rate_limit',
      'disk_full',
      'schema_malicious',
      'oversized',
      'schema_broken',
      'adversarial_pattern',
    ]
    const insert = db.prepare(
      `INSERT INTO quarantined_raw_events (source_id, reason, raw_payload_json)
       VALUES (?, ?, ?)`,
    )
    for (const reason of validReasons) {
      insert.run('src-x', reason, '{}')
    }

    expect(() =>
      db
        .prepare(
          `INSERT INTO quarantined_raw_events (source_id, reason, raw_payload_json)
           VALUES ('src-x', 'wholly_unrecognized', '{}')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|reason/i)
  })

  it('ingest_rate_state enforces state CHECK against the four FR values', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    const validStates = ['accepting', 'rate_limited', 'circuit_open', 'disk_full_pause']
    const insert = db.prepare(
      `INSERT INTO ingest_rate_state (source_path, state) VALUES (?, ?)`,
    )
    for (const state of validStates) {
      insert.run(`/var/log/${state}`, state)
    }

    expect(() =>
      db
        .prepare(
          `INSERT INTO ingest_rate_state (source_path, state)
           VALUES ('/var/log/bad', 'paused')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|state/i)
  })

  it('reconciler_lease primary key is composite (source_id, window_start, window_end)', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    db.prepare(
      `INSERT INTO reconciler_lease
         (source_id, window_start, window_end, leaseholder, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('src-1', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', 'reconciler-a', '2026-05-02T01:00:00Z')

    expect(() =>
      db
        .prepare(
          `INSERT INTO reconciler_lease
             (source_id, window_start, window_end, leaseholder, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('src-1', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', 'reconciler-b', '2026-05-02T02:00:00Z'),
    ).toThrow(/UNIQUE constraint failed|PRIMARY KEY/i)
  })

  it('resource_window_instances UNIQUE(policy_id, window_start) prevents duplicate windows', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_window_instances (policy_id, window_kind, window_start, window_end)
       VALUES (1, 'monthly', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_window_instances (policy_id, window_kind, window_start, window_end)
           VALUES (1, 'monthly', '2026-05-01T00:00:00Z', '2026-06-30T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('resource_governance_breaker UNIQUE(scope_kind, scope_id) prevents duplicate breaker rows', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    db.prepare(
      `INSERT INTO resource_governance_breaker (scope_kind, scope_id, state)
       VALUES ('workspace', 7, 'closed')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO resource_governance_breaker (scope_kind, scope_id, state)
           VALUES ('workspace', 7, 'open')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('creates the documented indexes on M65m tables', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    expect(indexExists(db, 'idx_resource_window_instances_lookup')).toBe(true)
    expect(indexExists(db, 'idx_recovery_action_taken_at')).toBe(true)
    expect(indexExists(db, 'idx_quarantined_raw_events_source_quarantined')).toBe(true)
    expect(indexExists(db, 'idx_governance_orphan_event_unresolved')).toBe(true)
  })

  it('PRAGMA foreign_key_check passes after M65m runs', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    const violations = db.pragma('foreign_key_check') as unknown[]
    expect(Array.isArray(violations)).toBe(true)
    expect(violations.length).toBe(0)
  })

  it('records the M65m marker in schema_migrations', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65M_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65M_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65m.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65m.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/PRAGMA foreign_key_check/i)
    for (const table of M65M_TABLES) {
      expect(sql).toMatch(new RegExp(`DROP TABLE IF EXISTS ${table}`, 'i'))
    }
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+065m_governance_final_tables/i,
    )
  })

  it('rollback drops all eight M65m tables, their indexes, and the M65m marker', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    applyRollback(db, 'rollback-M65m.sql')

    for (const table of M65M_TABLES) {
      expect(tableExists(db, table)).toBe(false)
    }
    expect(indexExists(db, 'idx_resource_window_instances_lookup')).toBe(false)
    expect(indexExists(db, 'idx_recovery_action_taken_at')).toBe(false)
    expect(indexExists(db, 'idx_quarantined_raw_events_source_quarantined')).toBe(false)
    expect(indexExists(db, 'idx_governance_orphan_event_unresolved')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65M_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M66 token_pricing + facility-default seed', () => {
  it('creates the token_pricing table with the documented columns', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    expect(tableExists(db, 'token_pricing')).toBe(true)

    const cols = columns(db, 'token_pricing')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'provider',
        'model',
        'scope_kind',
        'scope_id',
        'input_per_mtok_usd',
        'output_per_mtok_usd',
        'effective_at',
        'expires_at',
        'source',
        'created_at',
      ]),
    )
  })

  it('scope_kind CHECK accepts "facility" and "workspace" only', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    db.prepare(
      `INSERT INTO token_pricing
         (provider, model, scope_kind, scope_id,
          input_per_mtok_usd, output_per_mtok_usd, effective_at, source)
       VALUES ('anthropic', 'test-model-a', 'workspace', 1,
               1.0, 2.0, '2026-05-02T00:00:00Z', 'operator')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO token_pricing
             (provider, model, scope_kind, scope_id,
              input_per_mtok_usd, output_per_mtok_usd, effective_at, source)
           VALUES ('anthropic', 'test-model-b', 'tenant', 1,
                   1.0, 2.0, '2026-05-02T00:00:00Z', 'operator')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|scope_kind/i)
  })

  it('creates the documented unique and lookup indexes', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    expect(indexExists(db, 'idx_token_pricing_unique')).toBe(true)
    expect(indexExists(db, 'idx_token_pricing_lookup')).toBe(true)
  })

  it('seeds one row per MODEL_PRICING entry with facility-default source', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    const rows = db
      .prepare(
        `SELECT provider, model, scope_kind, scope_id, source,
                input_per_mtok_usd, output_per_mtok_usd
         FROM token_pricing
         WHERE source = 'facility-default'`,
      )
      .all() as Array<{
      provider: string
      model: string
      scope_kind: string
      scope_id: number | null
      source: string
      input_per_mtok_usd: number
      output_per_mtok_usd: number
    }>

    // One seed row per MODEL_PRICING key (each key is unique in the
    // source-of-truth Record).
    expect(rows.length).toBe(Object.keys(MODEL_PRICING).length)
    for (const row of rows) {
      expect(row.scope_kind).toBe('facility')
      expect(row.scope_id).toBeNull()
      expect(row.source).toBe('facility-default')
    }
  })

  it('seeds preserve MODEL_PRICING input/output rates exactly', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    // Pick a representative row whose price is well-known.
    const row = db
      .prepare(
        `SELECT input_per_mtok_usd, output_per_mtok_usd
         FROM token_pricing
         WHERE model = 'anthropic/claude-opus-4-6' AND source = 'facility-default'`,
      )
      .get() as {
      input_per_mtok_usd: number
      output_per_mtok_usd: number
    } | undefined

    expect(row).toBeDefined()
    expect(row?.input_per_mtok_usd).toBe(15.0)
    expect(row?.output_per_mtok_usd).toBe(75.0)
  })

  it('records the M66 marker in schema_migrations', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M66_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M66_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M66.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M66.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_token_pricing/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS token_pricing/i)
    expect(sql).toMatch(
      /DELETE FROM schema_migrations[\s\S]+066_token_pricing/i,
    )
  })

  it('rollback drops token_pricing, its indexes, and the M66 marker', () => {
    const db = createDbBeforeM65i()
    seedProviderAccountsM64Skeleton(db)
    runMigrations(db)

    applyRollback(db, 'rollback-M66.sql')

    expect(tableExists(db, 'token_pricing')).toBe(false)
    expect(indexExists(db, 'idx_token_pricing_unique')).toBe(false)
    expect(indexExists(db, 'idx_token_pricing_lookup')).toBe(false)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M66_ID)
    expect(marker).toBeUndefined()
  })
})
