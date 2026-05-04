import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// SPEC-008 — Migration M64 (governance defaults) test harness.
//
// Migration sequence rebase per docs/migrations/migration-id-reservations.md
// (first-to-merge rule): SPEC-006 owns M63 on `main`. SPEC-008 was rebased
// from M63 → M64. Tests verify the M64 entry in src/lib/migrations.ts.
//
// Pattern follows migrations.M62-task-successor-index.test.ts — minimal
// fixture: insert schema_migrations markers up through 063 plus the
// minimal upstream tables M64 extends (resource_policies, resource_policy_events
// from M60/M61) so only M64 runs against a known shape.

const migrationIdsThroughM63 = [
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
]

const M64_ID = '064_resource_governance_default_policies'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function createDbBeforeM64(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)

  db.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Minimal upstream shape so M64 can extend M60/M61 tables.
    CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER,
      project_id INTEGER,
      agent_id INTEGER,
      agent_role TEXT,
      task_status TEXT,
      workflow_template_slug TEXT,
      provider TEXT,
      model TEXT,
      policy_type TEXT NOT NULL CHECK (policy_type IN ('wip_limit','budget','blackout','degraded_window')),
      limit_kind TEXT NOT NULL,
      limit_value REAL,
      period TEXT,
      timezone TEXT,
      schedule_json JSON,
      enforcement TEXT NOT NULL CHECK (enforcement IN ('alert','defer','pause_new_work','block_dispatch','require_override')),
      soft_threshold_pct REAL DEFAULT 80,
      hard_threshold_pct REAL DEFAULT 100,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE resource_policy_events (
      id INTEGER PRIMARY KEY,
      policy_id INTEGER,
      task_id INTEGER,
      agent_id INTEGER,
      decision TEXT NOT NULL CHECK (decision IN ('allow','defer','block','override_required','override')),
      reason TEXT,
      observed_value REAL,
      limit_value REAL,
      metadata JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const insert = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  for (const id of migrationIdsThroughM63) insert.run(id)

  return db
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

describe('SPEC-008 M64 governance defaults migration', () => {
  it('creates the four new governance tables', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    expect(tableExists(db, 'resource_decision_audit')).toBe(true)
    expect(tableExists(db, 'retention_policy')).toBe(true)
    expect(tableExists(db, 'provider_accounts')).toBe(true)
    expect(tableExists(db, 'governance_health_events')).toBe(true)
  })

  it('extends resource_policies with the M64 governance columns', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    const cols = columns(db, 'resource_policies')
    // M64 extension columns per task prompt T015 (FR-031, FR-037, FR-047).
    expect(cols).toEqual(
      expect.arrayContaining([
        'window_spec_json',
        'enforce_mode',
        'enabled_at',
        'disabled_at',
        'owner_workspace_id',
        'version',
        'etag',
        'notes',
        'default_template',
        'updated_by',
      ]),
    )
  })

  it('extends resource_policy_events with the M64 audit columns', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    const cols = columns(db, 'resource_policy_events')
    expect(cols).toEqual(
      expect.arrayContaining([
        'decision_id',
        'policy_id',
        'actor',
        'reason',
        'details_json',
        'confirmation_phrase',
        'prev_hash',
        'row_hash',
      ]),
    )
  })

  it('creates indexes on resource_decision_audit', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    expect(indexExists(db, 'idx_resource_decision_audit_decision_id')).toBe(true)
    expect(indexExists(db, 'idx_resource_decision_audit_captured_at')).toBe(true)
  })

  it('inserts the genesis audit row with the 64-character zero prev_hash per FR-219m', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    const genesis = db
      .prepare(`SELECT prev_hash, row_hash FROM resource_decision_audit ORDER BY id ASC LIMIT 1`)
      .get() as { prev_hash: string; row_hash: string } | undefined

    expect(genesis).toBeTruthy()
    expect(genesis?.prev_hash).toBe('0000000000000000000000000000000000000000000000000000000000000000')
    expect(genesis?.prev_hash).toHaveLength(64)
    // SHA-256 hex output is 64 lowercase chars.
    expect(genesis?.row_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('seeds five default retention horizons per Q63', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    const rows = db
      .prepare(`SELECT table_name, horizon_days FROM retention_policy ORDER BY table_name`)
      .all() as Array<{ table_name: string; horizon_days: number }>

    expect(rows).toEqual([
      { table_name: 'canonical_usage_events', horizon_days: 730 },
      { table_name: 'governance_dispatch_log', horizon_days: 30 },
      { table_name: 'governance_health_events', horizon_days: 30 },
      { table_name: 'raw_usage_events', horizon_days: 90 },
      { table_name: 'resource_decision_audit', horizon_days: 730 },
    ])
  })

  it('creates the provider_accounts unique constraint and active partial index', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    // Insert two distinct (provider, account_label) pairs OK.
    db.prepare(`INSERT INTO provider_accounts (provider, account_label) VALUES (?, ?)`).run(
      'anthropic',
      'racecraft-pro',
    )
    db.prepare(`INSERT INTO provider_accounts (provider, account_label) VALUES (?, ?)`).run(
      'openai',
      'racecraft-pro',
    )

    // Duplicate of the same (provider, account_label) violates the UNIQUE.
    expect(() =>
      db
        .prepare(`INSERT INTO provider_accounts (provider, account_label) VALUES (?, ?)`)
        .run('anthropic', 'racecraft-pro'),
    ).toThrow()

    expect(indexExists(db, 'idx_provider_accounts_active')).toBe(true)
  })

  it('records the M64 marker in schema_migrations', () => {
    const db = createDbBeforeM64()

    runMigrations(db)

    const marker = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(M64_ID) as { id: string } | undefined
    expect(marker?.id).toBe(M64_ID)
  })

  it('is idempotent — rerunning the migration is a no-op', () => {
    const db = createDbBeforeM64()

    runMigrations(db)
    const auditCount1 = (db
      .prepare(`SELECT COUNT(*) as c FROM resource_decision_audit`)
      .get() as { c: number }).c
    const retentionCount1 = (db
      .prepare(`SELECT COUNT(*) as c FROM retention_policy`)
      .get() as { c: number }).c

    // Force the migration to attempt to re-run by clearing only the M64 marker.
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(M64_ID)

    expect(() => runMigrations(db)).not.toThrow()

    const auditCount2 = (db
      .prepare(`SELECT COUNT(*) as c FROM resource_decision_audit`)
      .get() as { c: number }).c
    const retentionCount2 = (db
      .prepare(`SELECT COUNT(*) as c FROM retention_policy`)
      .get() as { c: number }).c

    expect(auditCount2).toBe(auditCount1)
    expect(retentionCount2).toBe(retentionCount1)
  })

  it('ships the rollback SQL artifact at docs/migrations/rollback-M64.sql', () => {
    const rollbackPath = join(process.cwd(), 'docs', 'migrations', 'rollback-M64.sql')
    expect(existsSync(rollbackPath)).toBe(true)

    const sql = readFileSync(rollbackPath, 'utf8')
    // Reverse-creation drops in explicit order, all idempotent.
    expect(sql).toMatch(/DROP TABLE IF EXISTS governance_health_events/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS provider_accounts/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS retention_policy/i)
    expect(sql).toMatch(/DROP TABLE IF EXISTS resource_decision_audit/i)
    expect(sql).toMatch(/DELETE FROM schema_migrations[\s\S]+064_resource_governance_default_policies/i)
  })

  it('rollback drops the four new tables and the M64 marker', () => {
    const db = createDbBeforeM64()
    runMigrations(db)

    db.exec(readFileSync(join(process.cwd(), 'docs/migrations/rollback-M64.sql'), 'utf8'))

    expect(tableExists(db, 'resource_decision_audit')).toBe(false)
    expect(tableExists(db, 'retention_policy')).toBe(false)
    expect(tableExists(db, 'provider_accounts')).toBe(false)
    expect(tableExists(db, 'governance_health_events')).toBe(false)

    const marker = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(M64_ID)
    expect(marker).toBeUndefined()
  })
})
