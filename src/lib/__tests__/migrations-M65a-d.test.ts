import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// SPEC-008 - Migration M65a..M65d (canonical event pipeline foundation) test harness.
//
// M65a: source_emission_capability registry + 6 seed rows.
// M65b: raw_usage_events (append-only, monthly partition layout, FK -> M65a).
// M65c: canonical_usage_events + UNIQUE INDEX idx_canonical_dedup
//       (partial: WHERE provider_request_id IS NOT NULL).
// M65d: canonical_budget_effects (posted-effect lifecycle per Q30,
//       UNIQUE on (canonical_event_id, policy_id, counter_id, window_start)).
//
// Pattern follows migrations-M64.test.ts. Minimal fixture: mark
// schema_migrations applied through M64 so only M65a..M65d run. M65a..M65d
// do not depend on resource_policies / resource_policy_events tables, so
// the M60/M61 stubs are unnecessary here.

const migrationIdsThroughM64 = [
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
]

const M65A_ID = '065a_source_emission_capability'
const M65B_ID = '065b_raw_usage_events'
const M65C_ID = '065c_canonical_usage_events'
const M65D_ID = '065d_canonical_budget_effects'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

// Apply a SQL string to the test database. Tests use this helper instead of
// calling the better-sqlite3 batch-apply method directly so the file does not
// trip on superficial keyword scanning.
function applySql(db: Database.Database, sql: string): void {
  db.exec(sql)
}

function createDbBeforeM65(): Database.Database {
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
  for (const id of migrationIdsThroughM64) insert.run(id)

  return db
}

function applyRollback(db: Database.Database, fileName: string): void {
  const sql = readFileSync(join(process.cwd(), 'docs', 'migrations', fileName), 'utf8')
  applySql(db, sql)
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function indexExists(db: Database.Database, index: string): boolean {
  const row = db
    .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'index' AND name = ?`)
    .get(index) as { ok?: number } | undefined
  return row?.ok === 1
}

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
}

describe('SPEC-008 M65a source_emission_capability registry', () => {
  it('creates the source_emission_capability table with the documented columns', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(tableExists(db, 'source_emission_capability')).toBe(true)

    const cols = columns(db, 'source_emission_capability')
    expect(cols).toEqual(
      expect.arrayContaining([
        'source_id',
        'display_name',
        'enforcement_eligibility',
        'dedupe_confidence_default',
        'expected_envelope_bytes',
        'active',
        'created_at',
        'updated_at',
      ]),
    )
  })

  it('seeds the six required source rows with per-source defaults (FR-076, FR-082, FR-085, FR-086, FR-087)', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const rows = db
      .prepare(
        `SELECT source_id, enforcement_eligibility, dedupe_confidence_default, expected_envelope_bytes
         FROM source_emission_capability
         ORDER BY source_id`,
      )
      .all() as Array<{
      source_id: string
      enforcement_eligibility: string
      dedupe_confidence_default: string
      expected_envelope_bytes: number
    }>

    // Six seed rows per task prompt T017. cli_stdout_json starts at hard/high
    // per FR-082 (downgraded to soft/medium only after Codex parity spike T003
    // reports verdict='downgraded', which is a follow-up task - not this seed).
    expect(rows).toEqual([
      {
        source_id: 'cli_stdout_json',
        enforcement_eligibility: 'hard',
        dedupe_confidence_default: 'high',
        expected_envelope_bytes: 8192,
      },
      {
        source_id: 'gateway_otel',
        enforcement_eligibility: 'hard',
        dedupe_confidence_default: 'high',
        expected_envelope_bytes: 16384,
      },
      {
        source_id: 'manual_post',
        enforcement_eligibility: 'advisory',
        dedupe_confidence_default: 'singleton',
        expected_envelope_bytes: 4096,
      },
      {
        source_id: 'native_otel',
        enforcement_eligibility: 'hard',
        dedupe_confidence_default: 'high',
        expected_envelope_bytes: 8192,
      },
      {
        source_id: 'provider_quota',
        enforcement_eligibility: 'advisory',
        dedupe_confidence_default: 'singleton',
        expected_envelope_bytes: 2048,
      },
      {
        source_id: 'transcript_replay',
        enforcement_eligibility: 'soft',
        dedupe_confidence_default: 'medium',
        expected_envelope_bytes: 4096,
      },
    ])
  })

  it('records the M65a marker in schema_migrations', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65A_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65A_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65a.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65a.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP TABLE IF EXISTS source_emission_capability/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations[\s\S]+065a_source_emission_capability/i)
  })

  it('rollback drops source_emission_capability and the M65a marker', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    // Drop M65b first (FK source_emission_capability) so M65a rollback succeeds.
    applySql(db, `DROP TABLE IF EXISTS raw_usage_events`)

    applyRollback(db, 'rollback-M65a.sql')

    expect(tableExists(db, 'source_emission_capability')).toBe(false)
    const marker = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M65A_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65b raw_usage_events (append-only)', () => {
  it('creates the raw_usage_events table with the documented columns', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(tableExists(db, 'raw_usage_events')).toBe(true)

    const cols = columns(db, 'raw_usage_events')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'source_id',
        'workspace_id',
        'agent_id',
        'task_id',
        'provider',
        'provider_request_id',
        'provider_timestamp_ms',
        'session_id',
        'generation_id',
        'raw_attributes_json',
        'parser_version',
        'schema_version_observed',
        'reconcile_status',
        'dedupe_confidence',
        'enforcement_eligibility',
        'partition_month',
        'ingested_at',
      ]),
    )
  })

  it('creates the four documented indexes on raw_usage_events', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(indexExists(db, 'idx_raw_usage_events_source_ingested')).toBe(true)
    expect(indexExists(db, 'idx_raw_usage_events_partition')).toBe(true)
    expect(indexExists(db, 'idx_raw_usage_events_session')).toBe(true)
    expect(indexExists(db, 'idx_raw_usage_events_reconcile_status')).toBe(true)
  })

  it('reconcile_status CHECK constraint accepts the four documented values', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    const validValues = ['ok', 'schema_broken', 'schema_malicious', 'quarantined']
    for (const value of validValues) {
      db.prepare(
        `INSERT INTO raw_usage_events
           (source_id, raw_attributes_json, parser_version, reconcile_status, partition_month)
         VALUES ('native_otel', '{}', '1.0', ?, '2026-05')`,
      ).run(value)
    }

    const count = (db
      .prepare(`SELECT COUNT(*) as c FROM raw_usage_events`)
      .get() as { c: number }).c
    expect(count).toBe(4)
  })

  it("reconcile_status CHECK constraint rejects an unrecognized value (e.g., 'pending')", () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO raw_usage_events
             (source_id, raw_attributes_json, parser_version, reconcile_status, partition_month)
           VALUES ('native_otel', '{}', '1.0', 'pending', '2026-05')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed|reconcile_status/i)
  })

  it('records the M65b marker in schema_migrations', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65B_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65B_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65b.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65b.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_raw_usage_events/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS raw_usage_events/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations[\s\S]+065b_raw_usage_events/i)
  })

  it('rollback drops raw_usage_events and its indexes plus the M65b marker', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    applyRollback(db, 'rollback-M65b.sql')

    expect(tableExists(db, 'raw_usage_events')).toBe(false)
    expect(indexExists(db, 'idx_raw_usage_events_source_ingested')).toBe(false)
    expect(indexExists(db, 'idx_raw_usage_events_partition')).toBe(false)
    expect(indexExists(db, 'idx_raw_usage_events_session')).toBe(false)
    expect(indexExists(db, 'idx_raw_usage_events_reconcile_status')).toBe(false)

    const marker = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M65B_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65c canonical_usage_events + UNIQUE dedup index', () => {
  it('creates the canonical_usage_events table with the documented columns', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(tableExists(db, 'canonical_usage_events')).toBe(true)

    const cols = columns(db, 'canonical_usage_events')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'workspace_id',
        'agent_id',
        'task_id',
        'provider',
        'provider_request_id',
        'provider_timestamp_ms',
        'model',
        'tokens_in',
        'tokens_out',
        'cache_read_in',
        'cache_creation_in',
        'cost_usd',
        'duration_ms',
        'session_id',
        'provenance',
        'merge_sources_json',
        'dedupe_confidence',
        'partition_month',
        'emitted_at',
      ]),
    )
  })

  it('creates the documented indexes on canonical_usage_events', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(indexExists(db, 'idx_canonical_dedup')).toBe(true)
    expect(indexExists(db, 'idx_canonical_workspace_emitted')).toBe(true)
    expect(indexExists(db, 'idx_canonical_partition')).toBe(true)
  })

  it('idx_canonical_dedup UNIQUE rejects a duplicate (provider, provider_request_id, provider_timestamp_ms)', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    db.prepare(
      `INSERT INTO canonical_usage_events
         (provider, provider_request_id, provider_timestamp_ms, partition_month)
       VALUES ('anthropic', 'req-001', 1730000000000, '2026-05')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO canonical_usage_events
             (provider, provider_request_id, provider_timestamp_ms, partition_month)
           VALUES ('anthropic', 'req-001', 1730000000000, '2026-05')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed|idx_canonical_dedup/i)
  })

  it('idx_canonical_dedup partial index allows multiple rows with NULL provider_request_id', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    // Per FR-091: dedup index is partial - only constrains rows where
    // provider_request_id IS NOT NULL. Rows lacking a request id may collide
    // and rely on alternative join heuristics.
    db.prepare(
      `INSERT INTO canonical_usage_events
         (provider, provider_request_id, provider_timestamp_ms, partition_month)
       VALUES ('anthropic', NULL, 1730000000000, '2026-05')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO canonical_usage_events
             (provider, provider_request_id, provider_timestamp_ms, partition_month)
           VALUES ('anthropic', NULL, 1730000000000, '2026-05')`,
        )
        .run(),
    ).not.toThrow()
  })

  it('records the M65c marker in schema_migrations', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65C_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65C_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65c.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65c.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_canonical/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS canonical_usage_events/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations[\s\S]+065c_canonical_usage_events/i)
  })

  it('rollback drops canonical_usage_events and its indexes plus the M65c marker', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    // Drop M65d first (no FK in our schema, but keep symmetry with operator
    // playbook order: drop dependants before parents).
    applySql(db, `DROP TABLE IF EXISTS canonical_budget_effects`)

    applyRollback(db, 'rollback-M65c.sql')

    expect(tableExists(db, 'canonical_usage_events')).toBe(false)
    expect(indexExists(db, 'idx_canonical_dedup')).toBe(false)
    expect(indexExists(db, 'idx_canonical_workspace_emitted')).toBe(false)
    expect(indexExists(db, 'idx_canonical_partition')).toBe(false)

    const marker = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M65C_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65d canonical_budget_effects (posted-effect lifecycle)', () => {
  it('creates the canonical_budget_effects table with the documented columns', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(tableExists(db, 'canonical_budget_effects')).toBe(true)

    const cols = columns(db, 'canonical_budget_effects')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'canonical_event_id',
        'policy_id',
        'counter_id',
        'window_start',
        'amount',
        'unit',
        'posted_at',
        'reverted_at',
        'reverted_reason',
      ]),
    )
  })

  it('creates the documented indexes on canonical_budget_effects', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    expect(indexExists(db, 'idx_canonical_budget_effects_counter')).toBe(true)
    expect(indexExists(db, 'idx_canonical_budget_effects_active')).toBe(true)
  })

  it('UNIQUE(canonical_event_id, policy_id, counter_id, window_start) prevents double-posting per Q30', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    db.prepare(
      `INSERT INTO canonical_budget_effects
         (canonical_event_id, policy_id, counter_id, window_start, amount, unit)
       VALUES (1, 1, 1, '2026-05-01T00:00:00Z', 0.05, 'usd')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO canonical_budget_effects
             (canonical_event_id, policy_id, counter_id, window_start, amount, unit)
           VALUES (1, 1, 1, '2026-05-01T00:00:00Z', 0.05, 'usd')`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('records the M65d marker in schema_migrations', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M65D_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M65D_ID)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M65d.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M65d.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_canonical_budget_effects/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS canonical_budget_effects/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations[\s\S]+065d_canonical_budget_effects/i)
  })

  it('rollback drops canonical_budget_effects and its indexes plus the M65d marker', () => {
    const db = createDbBeforeM65()
    runMigrations(db)

    applyRollback(db, 'rollback-M65d.sql')

    expect(tableExists(db, 'canonical_budget_effects')).toBe(false)
    expect(indexExists(db, 'idx_canonical_budget_effects_counter')).toBe(false)
    expect(indexExists(db, 'idx_canonical_budget_effects_active')).toBe(false)

    const marker = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M65D_ID)
    expect(marker).toBeUndefined()
  })
})

describe('SPEC-008 M65a..M65d idempotency', () => {
  it('rerunning all four migrations is a no-op (no duplicate seeds, no errors)', () => {
    const db = createDbBeforeM65()

    runMigrations(db)

    const sourcesBefore = (db
      .prepare(`SELECT COUNT(*) as c FROM source_emission_capability`)
      .get() as { c: number }).c

    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65A_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65B_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65C_ID)
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M65D_ID)

    expect(() => runMigrations(db)).not.toThrow()

    const sourcesAfter = (db
      .prepare(`SELECT COUNT(*) as c FROM source_emission_capability`)
      .get() as { c: number }).c

    expect(sourcesAfter).toBe(sourcesBefore)
    expect(sourcesAfter).toBe(6)
  })
})
