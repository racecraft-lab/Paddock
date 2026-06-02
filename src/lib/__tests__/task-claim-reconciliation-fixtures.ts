import Database from 'better-sqlite3'

export function openTaskClaimDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      feature_flags TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      slug TEXT,
      ticket_prefix TEXT,
      github_repo TEXT,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      is_repo_sync_owner INTEGER NOT NULL DEFAULT 1,
      is_triage_project INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
      github_pr_state TEXT,
      github_issue_state TEXT,
      github_synced_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      role TEXT NOT NULL DEFAULT 'dev',
      config TEXT
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE task_stage_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
      status TEXT NOT NULL CHECK(status IN ('created', 'running', 'succeeded', 'failed', 'released', 'cancelled', 'archived')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      started_at TEXT,
      completed_at TEXT,
      archived_at TEXT,
      run_id TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      metadata_json TEXT,
      UNIQUE(workspace_id, task_id, stage_key, attempt_number)
    );
    CREATE TABLE task_stage_attempt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
      status TEXT NOT NULL CHECK(status IN ('created', 'running', 'succeeded', 'failed', 'released', 'cancelled', 'archived')),
      observed_at TEXT NOT NULL,
      actor_type TEXT CHECK(actor_type IS NULL OR actor_type IN ('test', 'fixture', 'operator', 'system')),
      actor_id TEXT,
      message TEXT,
      metadata_json TEXT,
      FOREIGN KEY(attempt_id) REFERENCES task_stage_attempts(id) ON DELETE CASCADE
    );
    CREATE TABLE task_stage_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      task_stage_attempt_id INTEGER NOT NULL,
      claim_state TEXT NOT NULL CHECK(claim_state IN ('active', 'released', 'stale_recovered')),
      lease_owner TEXT NOT NULL CHECK(length(trim(lease_owner)) > 0),
      claim_run_id TEXT NOT NULL CHECK(length(trim(claim_run_id)) > 0),
      lease_started_at INTEGER NOT NULL CHECK(lease_started_at > 0),
      lease_expires_at INTEGER NOT NULL CHECK(lease_expires_at > lease_started_at),
      release_reason TEXT CHECK(release_reason IS NULL OR release_reason IN (
        'launch_handoff_completed', 'dispatch_failed', 'task_terminal_done', 'task_terminal_failed',
        'github_issue_terminal', 'github_pr_terminal', 'governance_blocked', 'governance_deferred',
        'attempt_terminal_reconciled', 'stale_claim_recovered', 'boundary_error_deferred',
        'operator_released', 'operator_cancelled', 'operator_retry_requested'
      )),
      released_at INTEGER,
      released_by_run_id TEXT,
      stale_recovered_from_claim_id INTEGER,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(task_stage_attempt_id) REFERENCES task_stage_attempts(id) ON DELETE CASCADE,
      CHECK((claim_state = 'active' AND release_reason IS NULL AND released_at IS NULL) OR (claim_state <> 'active' AND release_reason IS NOT NULL AND released_at IS NOT NULL)),
      CHECK((claim_state = 'active' AND released_by_run_id IS NULL) OR (claim_state <> 'active' AND released_by_run_id IS NOT NULL)),
      CHECK((claim_state = 'stale_recovered') = (release_reason = 'stale_claim_recovered'))
    );
    CREATE UNIQUE INDEX idx_task_stage_claims_active_unique
      ON task_stage_claims(workspace_id, task_id, stage_key)
      WHERE claim_state = 'active';
    CREATE UNIQUE INDEX idx_task_stage_claims_attempt_unique
      ON task_stage_claims(task_stage_attempt_id);
    CREATE TABLE task_claim_control_idempotency_keys (
      actor_user_id INTEGER NOT NULL CHECK(actor_user_id > 0),
      workspace_id INTEGER NOT NULL CHECK(workspace_id > 0),
      task_id INTEGER NOT NULL CHECK(task_id > 0),
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      idempotency_key_hash TEXT NOT NULL CHECK(length(trim(idempotency_key_hash)) > 0),
      action TEXT NOT NULL CHECK(action IN ('retry', 'release', 'cancel')),
      request_body_hash TEXT NOT NULL CHECK(length(trim(request_body_hash)) > 0),
      response_body_json TEXT NOT NULL,
      response_status INTEGER NOT NULL CHECK(response_status >= 200 AND response_status <= 299),
      response_headers_json TEXT,
      claim_control_activity_id INTEGER,
      created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
      expires_at TEXT NOT NULL CHECK(length(trim(expires_at)) > 0),
      PRIMARY KEY(actor_user_id, workspace_id, task_id, stage_key, idempotency_key_hash)
    );
    CREATE INDEX idx_task_claim_control_idempotency_expires_at
      ON task_claim_control_idempotency_keys(expires_at);
    CREATE INDEX idx_task_claim_control_idempotency_task
      ON task_claim_control_idempotency_keys(workspace_id, task_id, stage_key, created_at DESC);
    CREATE TABLE github_sync_lifecycle_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      max_pages INTEGER NOT NULL DEFAULT 10,
      max_issues INTEGER NOT NULL DEFAULT 1000,
      max_duration_seconds INTEGER NOT NULL DEFAULT 45,
      owner_project_id INTEGER,
      disabled_reason TEXT,
      next_retry_at INTEGER,
      next_retry_reason TEXT,
      backoff_seconds INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      lease_run_id TEXT,
      lease_owner TEXT,
      lease_started_at INTEGER,
      lease_expires_at INTEGER,
      last_started_at INTEGER,
      last_completed_at INTEGER,
      last_success_cursor TEXT,
      last_error TEXT,
      latest_partial_run_reason TEXT,
      total_successes INTEGER NOT NULL DEFAULT 0,
      total_failures INTEGER NOT NULL DEFAULT 0,
      total_partials INTEGER NOT NULL DEFAULT 0,
      total_overlap_rejections INTEGER NOT NULL DEFAULT 0,
      skipped_owner_count INTEGER NOT NULL DEFAULT 0,
      skipped_non_owner_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE github_sync_lifecycle_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      project_id INTEGER,
      trigger TEXT NOT NULL DEFAULT 'automatic',
      requested_by TEXT,
      lease_owner TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      result TEXT NOT NULL,
      failure_reason TEXT,
      partial_run_reason TEXT,
      cursor_before TEXT,
      cursor_after TEXT,
      cursor_advanced INTEGER NOT NULL DEFAULT 0,
      pages_fetched INTEGER NOT NULL DEFAULT 0,
      issues_seen INTEGER NOT NULL DEFAULT 0,
      issues_pulled INTEGER NOT NULL DEFAULT 0,
      issues_pushed INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      stale_recovered_from_run_id TEXT,
      diagnostics_json TEXT
    );
    CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER,
      project_id INTEGER,
      agent_id INTEGER,
      policy_type TEXT NOT NULL,
      limit_kind TEXT NOT NULL,
      limit_value REAL,
      enforcement TEXT NOT NULL,
      enforce_mode TEXT,
      window_spec_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      enabled_at TEXT,
      disabled_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      etag TEXT
    );
    CREATE TABLE resource_policy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER,
      task_id INTEGER,
      agent_id INTEGER,
      decision TEXT NOT NULL,
      reason TEXT,
      observed_value REAL,
      limit_value REAL,
      metadata TEXT,
      decision_id TEXT,
      actor TEXT,
      details_json TEXT,
      prev_hash TEXT,
      row_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE resource_decision_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id TEXT NOT NULL,
      workspace_id INTEGER,
      actor TEXT,
      decision TEXT NOT NULL,
      reason TEXT,
      payload_json TEXT,
      prev_hash TEXT NOT NULL,
      row_hash TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (1, ?, ?, ?)')
    .run('alpha', 'Alpha', '{"FEATURE_TASK_CONTROL_PLANE":true}')
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, is_repo_sync_owner)
    VALUES (10, 1, 'Paddock', 'paddock', 'MC', 'racecraft-lab/Paddock', 1, 1)
  `).run()
  db.prepare(`
    INSERT INTO agents (id, name, workspace_id, status, role)
    VALUES (7, 'builder', 1, 'idle', 'dev')
  `).run()
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, owner_project_id,
      last_completed_at, total_successes
    )
    VALUES (1, 'racecraft-lab/Paddock', 1, 300, 10, 1770000000, 1)
  `).run()
  db.prepare(`
    INSERT INTO github_sync_lifecycle_runs (
      run_id, workspace_id, github_repo, project_id, started_at, completed_at, result,
      issues_pulled
    )
    VALUES ('ghsync_success', 1, 'racecraft-lab/Paddock', 10, 1769999900, 1770000000, 'success', 1)
  `).run()
  db.prepare(`
    INSERT INTO resource_decision_audit (
      decision_id, workspace_id, actor, decision, reason, payload_json, prev_hash, row_hash
    )
    VALUES ('genesis', NULL, 'system', 'allow', 'genesis', '{}', '', 'genesis-hash')
  `).run()
  return db
}

export function seedClaimableTask(
  db: Database.Database,
  values: Partial<{
    id: number
    status: string
    assigned_to: string | null
    github_repo: string | null
    github_issue_number: number | null
    github_synced_at: number | null
    github_issue_state: string | null
    github_pr_state: string | null
  }> = {},
): number {
  const id = values.id ?? 100
  db.prepare(`
    INSERT INTO tasks (
      id, title, status, assigned_to, workspace_id, project_id, workflow_template_id,
      workflow_template_slug, github_repo, github_issue_number, github_synced_at,
      github_issue_state, github_pr_state
    ) VALUES (?, 'Claimable task', ?, ?, 1, 10, 20, 'dev_implementation', ?, ?, ?, ?, ?)
  `).run(
    id,
    values.status ?? 'assigned',
    values.assigned_to === undefined ? 'builder' : values.assigned_to,
    values.github_repo === undefined ? 'racecraft-lab/Paddock' : values.github_repo,
    values.github_issue_number === undefined ? 123 : values.github_issue_number,
    values.github_synced_at === undefined ? 1770000000 : values.github_synced_at,
    values.github_issue_state ?? null,
    values.github_pr_state ?? null,
  )
  return id
}

export function activityTypes(db: Database.Database): string[] {
  return (db.prepare('SELECT type FROM activities ORDER BY id ASC').all() as { type: string }[]).map((row) => row.type)
}
