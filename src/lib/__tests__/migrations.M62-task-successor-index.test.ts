import { readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

const migrationIdsBeforeM62 = [
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
]

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()));
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, parent_task_id INTEGER);
  `)
  const insert = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  for (const id of migrationIdsBeforeM62) insert.run(id)
  return db
}

function indexSql(db: Database.Database): string | null {
  const row = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_tasks_one_successor_per_parent'
  `).get() as { sql: string } | undefined
  return row?.sql ?? null
}

describe('M62 one-successor-per-parent migration', () => {
  it('fails closed during preflight when duplicate non-null parent_task_id rows already exist', () => {
    const db = createDb()
    db.prepare('INSERT INTO tasks (id, parent_task_id) VALUES (1, 100), (2, 100)').run()

    expect(() => runMigrations(db)).toThrow(/parent_task_id 100 has 2 successors/)
    expect(indexSql(db)).toBeNull()
  })

  it('creates a partial unique index for non-null parents while allowing multiple root tasks', () => {
    const db = createDb()
    db.prepare('INSERT INTO tasks (id, parent_task_id) VALUES (1, NULL), (2, NULL), (3, 100)').run()

    runMigrations(db)

    expect(indexSql(db)).toContain('WHERE parent_task_id IS NOT NULL')
    expect(() => db.prepare('INSERT INTO tasks (id, parent_task_id) VALUES (4, 100)').run()).toThrow()
    expect(() => db.prepare('INSERT INTO tasks (id, parent_task_id) VALUES (5, NULL), (6, NULL)').run()).not.toThrow()
  })

  it('rollback drops the M62 index and migration marker', () => {
    const db = createDb()
    runMigrations(db)
    expect(indexSql(db)).not.toBeNull()

    db.exec(readFileSync(join(process.cwd(), 'docs/migrations/rollback-M62.sql'), 'utf8'))

    expect(indexSql(db)).toBeNull()
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get('062_task_successor_unique_parent_index')).toBeUndefined()
  })
})
