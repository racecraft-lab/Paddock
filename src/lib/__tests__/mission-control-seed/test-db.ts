import Database from 'better-sqlite3'

export function makeMissionControlSeedDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      feature_flags TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      linux_user TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      openclaw_home TEXT NOT NULL,
      workspace_root TEXT NOT NULL
    );

    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      ticket_prefix TEXT NOT NULL,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      github_repo TEXT,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      github_labels_initialized INTEGER NOT NULL DEFAULT 0,
      github_default_branch TEXT DEFAULT 'main',
      metadata TEXT,
      area_slug TEXT,
      is_triage_project INTEGER DEFAULT 0,
      is_repo_sync_owner INTEGER DEFAULT 0,
      UNIQUE(workspace_id, slug),
      UNIQUE(workspace_id, ticket_prefix)
    );

    CREATE TABLE project_agent_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, agent_name)
    );

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'inbox',
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_to TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      due_date INTEGER,
      estimated_hours INTEGER,
      actual_hours INTEGER,
      tags TEXT,
      metadata TEXT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      project_id INTEGER,
      project_ticket_no INTEGER,
      github_issue_number INTEGER,
      github_repo TEXT,
      github_synced_at INTEGER,
      github_branch TEXT,
      github_pr_number INTEGER,
      github_pr_state TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      task_prompt TEXT NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 300,
      agent_role TEXT,
      tags TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX idx_workflow_templates_workspace_slug
      ON workflow_templates(workspace_id, slug)
      WHERE slug IS NOT NULL;

    CREATE TABLE workflow_contract_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      mutation_status TEXT NOT NULL,
      source_path TEXT,
      export_path TEXT,
      contract_hash TEXT,
      routing_hashes_json TEXT,
      output_schema_hashes_json TEXT,
      diff_json TEXT NOT NULL DEFAULT '{}',
      template_counts_json TEXT NOT NULL DEFAULT '{}',
      error_count INTEGER NOT NULL DEFAULT 0,
      lkg_snapshot_id INTEGER,
      recovery_command TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE TABLE workflow_contract_run_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_contract_runs(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      manifest_path TEXT,
      canonical_model_path TEXT,
      template_slug TEXT,
      message TEXT NOT NULL,
      remediation_hint TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE workflow_contract_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      contract_hash TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      runtime_templates_json TEXT NOT NULL,
      recovery_command TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id),
      project_id INTEGER REFERENCES projects(id),
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
      schedule_json TEXT,
      enforcement TEXT NOT NULL CHECK (enforcement IN ('alert','defer','pause_new_work','block_dispatch','require_override')),
      soft_threshold_pct REAL DEFAULT 80,
      hard_threshold_pct REAL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1,
      window_spec_json TEXT,
      enforce_mode TEXT DEFAULT 'shadow',
      enabled_at TEXT,
      disabled_at TEXT,
      owner_workspace_id INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      etag TEXT,
      notes TEXT,
      default_template INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.prepare(`
    INSERT INTO tenants (id, slug, display_name, linux_user, status, openclaw_home, workspace_root)
    VALUES (1, 'default', 'Default', 'default', 'active', '/tmp/openclaw', '/tmp/workspaces')
  `).run()
  db.prepare("INSERT INTO workspaces (slug, name, tenant_id) VALUES ('facility', 'Facility', 1)").run()
  return db
}

export function tableColumns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
}

export function missionControlContractPath(): string {
  return 'docs/ai/workflows/mission-control/workflow-contract.yaml'
}

export function operatorEvidenceFixturePath(): string {
  return 'src/lib/__tests__/mission-control-seed/fixtures/operator-evidence.json'
}
