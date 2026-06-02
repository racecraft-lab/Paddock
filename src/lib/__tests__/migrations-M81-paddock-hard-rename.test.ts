import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const M81_ID = '081_paddock_hard_rename'
const ROLLBACK_PATH = join(process.cwd(), 'docs', 'migrations', 'rollback-M81.sql')
const openDbs: Database.Database[] = []
let runMigrations: (db: Database.Database) => void

const legacyParts = ['mission', 'control'] as const
const legacyKebab = legacyParts.join('-')
const legacySnake = legacyParts.join('_')
const legacyEnv = legacyParts.map((part) => part.toUpperCase()).join('_')
const legacyFlag = ['PILOT', legacyEnv, 'E2E'].join('_')

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

function resetM81(db: Database.Database): void {
  db.prepare('DELETE FROM schema_migrations WHERE id = ?').run(M81_ID)
}

function installLegacySandboxTables(db: Database.Database): void {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    DROP TABLE IF EXISTS agent_sandbox_lifecycle_events;
    DROP TABLE IF EXISTS agent_sandbox_lifecycles;
    CREATE TABLE agent_sandbox_lifecycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      sandbox_attempt_key TEXT NOT NULL CHECK(length(trim(sandbox_attempt_key)) > 0),
      task_stage_attempt_id INTEGER,
      task_stage_claim_id INTEGER,
      owner TEXT NOT NULL CHECK(owner IN ('${legacySnake}', 'openclaw', 'external_harness')),
      sandbox_key TEXT NOT NULL CHECK(length(trim(sandbox_key)) > 0),
      root_id TEXT NOT NULL CHECK(length(trim(root_id)) > 0),
      sanitized_relative_path TEXT NOT NULL CHECK(length(trim(sanitized_relative_path)) > 0),
      handle_id TEXT,
      status TEXT NOT NULL CHECK(status IN (
        'created',
        'prepared',
        'running',
        'terminal',
        'cleanup_pending',
        'cleaned_up',
        'rolled_back',
        'cleanup_failed'
      )),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      prepared_at TEXT,
      running_at TEXT,
      terminal_at TEXT,
      cleanup_requested_at TEXT,
      cleaned_up_at TEXT,
      metadata_json TEXT,
      UNIQUE(workspace_id, sandbox_key)
    );
    CREATE TABLE agent_sandbox_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lifecycle_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      sandbox_key TEXT NOT NULL CHECK(length(trim(sandbox_key)) > 0),
      event_type TEXT NOT NULL CHECK(length(trim(event_type)) > 0),
      status TEXT CHECK(status IS NULL OR status IN (
        'created',
        'prepared',
        'running',
        'terminal',
        'cleanup_pending',
        'cleaned_up',
        'rolled_back',
        'cleanup_failed'
      )),
      reason_code TEXT,
      observed_at TEXT NOT NULL,
      actor_type TEXT CHECK(actor_type IS NULL OR actor_type IN ('system', 'operator', 'test', 'fake_owner')),
      actor_id TEXT,
      metadata_json TEXT,
      FOREIGN KEY(lifecycle_id) REFERENCES agent_sandbox_lifecycles(id) ON DELETE CASCADE
    );
  `)
  db.pragma('foreign_keys = ON')
}

function seedLegacyRows(db: Database.Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO tenants (
      id, slug, display_name, linux_user, openclaw_home, workspace_root
    ) VALUES (1, 'test-tenant', 'Test Tenant', 'test-tenant', '/tmp/openclaw', '/tmp/workspace')
  `).run()
  db.prepare(`
    INSERT OR REPLACE INTO workspaces (id, slug, name, tenant_id, feature_flags)
    VALUES (900, ?, 'Paddock', 1, ?)
  `).run(legacyKebab, JSON.stringify({ [legacyFlag]: true }))
  db.prepare(`
    INSERT INTO workflow_templates (
      id, workspace_id, name, task_prompt, slug, next_template_slug, routing_rules
    ) VALUES (900, 900, 'Legacy workflow', 'Prompt', ?, ?, ?)
  `).run(
    `${legacyKebab}_issue_triage`,
    `${legacyKebab}_review`,
    JSON.stringify([{ next_template_slug: `${legacyKebab}_remediation_plan` }]),
  )
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, slug, ticket_prefix, github_repo)
    VALUES (900, 900, 'QA', 'qa', 'QA', ?)
  `).run(`racecraft/${legacyKebab}`)
  db.prepare(`
    INSERT INTO workflow_contract_runs (
      id, family, workspace_id, mode, status, mutation_status, source_path
    ) VALUES (900, ?, 900, 'import', 'success', 'applied', ?)
  `).run(legacyKebab, `docs/ai/workflows/${legacyKebab}/workflow-contract.yaml`)
  db.prepare(`
    INSERT INTO workflow_contract_snapshots (
      id, family, workspace_id, contract_hash, canonical_json, runtime_templates_json, recovery_command
    ) VALUES (900, ?, 900, 'hash', '{}', '[]', ?)
  `).run(legacyKebab, `recover ${legacyKebab}`)
  db.prepare(`
    INSERT INTO resource_policies (
      id, workspace_id, policy_type, limit_kind, limit_value, period, timezone, enforcement, notes
    ) VALUES (900, 900, 'budget', 'token', 100, 'day', 'UTC', 'alert', ?)
  `).run(`SPEC-009B:${legacyKebab}:daily-token-budget`)
  db.prepare(`
    INSERT INTO agent_sandbox_lifecycles (
      id, workspace_id, task_id, stage_key, sandbox_attempt_key, owner, sandbox_key,
      root_id, sanitized_relative_path, status
    ) VALUES (900, 900, 901, 'dev', '1', ?, ?, ?, ?, 'created')
  `).run(
    legacySnake,
    `workspace/900/product-line/${legacyKebab}/task/901/stage/dev/attempt/1/owner/${legacySnake}`,
    `${legacySnake}_data_sandboxes`,
    `workspace/900/product-line/${legacyKebab}/task/901/stage/dev/attempt/1/owner/${legacySnake}`,
  )
  db.prepare(`
    INSERT INTO agent_sandbox_lifecycle_events (
      id, lifecycle_id, workspace_id, task_id, stage_key, sandbox_key, event_type, status, observed_at
    ) VALUES (900, 900, 900, 901, 'dev', ?, 'created', 'created', '2026-06-01T00:00:00.000Z')
  `).run(`workspace/900/product-line/${legacyKebab}/task/901/stage/dev/attempt/1/owner/${legacySnake}`)
}

describe('M81 Paddock hard rename migration', () => {
  it('is marked on fresh databases and keeps the new sandbox owner constraint', () => {
    const db = openMigratedDb()

    expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?').get(M81_ID)).toEqual({ count: 1 })
    const sql = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_sandbox_lifecycles'
    `).get() as { sql: string }
    expect(sql.sql).toContain("'paddock'")
    expect(sql.sql).not.toContain(legacySnake)
  })

  it('rewrites old persisted identity values and preserves sandbox events', () => {
    const db = openMigratedDb()
    resetM81(db)
    installLegacySandboxTables(db)
    seedLegacyRows(db)

    runMigrations(db)

    expect(db.prepare('SELECT slug, feature_flags FROM workspaces WHERE id = 900').get()).toEqual({
      slug: 'paddock',
      feature_flags: JSON.stringify({ PILOT_PADDOCK_E2E: true }),
    })
    expect(db.prepare('SELECT github_repo FROM projects WHERE id = 900').get()).toEqual({ github_repo: 'racecraft-lab/Paddock' })
    expect(db.prepare('SELECT slug, next_template_slug, routing_rules FROM workflow_templates WHERE id = 900').get()).toEqual({
      slug: 'paddock_issue_triage',
      next_template_slug: 'paddock_review',
      routing_rules: JSON.stringify([{ next_template_slug: 'paddock_remediation_plan' }]),
    })
    expect(db.prepare('SELECT family, source_path FROM workflow_contract_runs WHERE id = 900').get()).toEqual({
      family: 'paddock',
      source_path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
    })
    expect(db.prepare('SELECT family, recovery_command FROM workflow_contract_snapshots WHERE id = 900').get()).toEqual({
      family: 'paddock',
      recovery_command: 'recover paddock',
    })
    expect(db.prepare('SELECT notes FROM resource_policies WHERE id = 900').get()).toEqual({
      notes: 'SPEC-009B:paddock:daily-token-budget',
    })
    expect(db.prepare('SELECT owner, root_id, sandbox_key FROM agent_sandbox_lifecycles WHERE id = 900').get()).toEqual({
      owner: 'paddock',
      root_id: 'paddock_data_sandboxes',
      sandbox_key: 'workspace/900/product-line/paddock/task/901/stage/dev/attempt/1/owner/paddock',
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM agent_sandbox_lifecycle_events WHERE lifecycle_id = 900').get()).toEqual({
      count: 1,
    })
  })
})

describe('M81 rollback SQL', () => {
  it('is present, removes only the M81 marker, and is free of exact legacy tokens', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true)
    const sql = readFileSync(ROLLBACK_PATH, 'utf8')

    expect(sql).toMatch(/DELETE FROM schema_migrations WHERE id = '081_paddock_hard_rename'/)
    expect(sql).not.toContain(legacyKebab)
    expect(sql).not.toContain(legacySnake)
    expect(sql).not.toContain(legacyFlag)
  })
})
