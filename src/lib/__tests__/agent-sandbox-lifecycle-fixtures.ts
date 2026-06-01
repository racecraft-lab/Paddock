import Database from 'better-sqlite3'

export function openAgentSandboxLifecycleDb(featureEnabled = true): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      feature_flags TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      workflow_template_slug TEXT
    );
    CREATE TABLE task_stage_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE task_stage_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      task_stage_attempt_id INTEGER NOT NULL,
      claim_state TEXT NOT NULL
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER
    );
    CREATE TABLE agent_sandbox_lifecycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      sandbox_attempt_key TEXT NOT NULL CHECK(length(trim(sandbox_attempt_key)) > 0),
      task_stage_attempt_id INTEGER,
      task_stage_claim_id INTEGER,
      owner TEXT NOT NULL CHECK(owner IN ('mission_control', 'openclaw', 'external_harness')),
      sandbox_key TEXT NOT NULL CHECK(length(trim(sandbox_key)) > 0),
      root_id TEXT NOT NULL CHECK(length(trim(root_id)) > 0),
      sanitized_relative_path TEXT NOT NULL CHECK(length(trim(sanitized_relative_path)) > 0),
      handle_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('created', 'prepared', 'running', 'terminal', 'cleanup_pending', 'cleaned_up', 'rolled_back', 'cleanup_failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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
      stage_key TEXT NOT NULL,
      sandbox_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT,
      reason_code TEXT,
      observed_at TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      metadata_json TEXT,
      FOREIGN KEY(lifecycle_id) REFERENCES agent_sandbox_lifecycles(id) ON DELETE CASCADE
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (1, ?, ?, ?)')
    .run('mission-control', 'Paddock', featureEnabled ? '{"FEATURE_AGENT_RUNNER_SANDBOXES":true,"FEATURE_TASK_CONTROL_PLANE":true}' : '{"FEATURE_AGENT_RUNNER_SANDBOXES":false}')
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, workflow_template_slug)
    VALUES (100, 1, 'Implement sandbox lifecycle', 'assigned', 'issue_remediation')
  `).run()
  db.prepare(`
    INSERT INTO task_stage_attempts (id, workspace_id, task_id, stage_key, attempt_number, status)
    VALUES (456, 1, 100, 'issue_remediation', 1, 'running')
  `).run()
  db.prepare(`
    INSERT INTO task_stage_claims (id, workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state)
    VALUES (789, 1, 100, 'issue_remediation', 456, 'active')
  `).run()
  return db
}

export function sandboxLifecycleInput(overrides: Partial<{
  owner: 'mission_control' | 'openclaw' | 'external_harness'
  stageKey: string
  productLineSlug: string
  attemptId: string | number
  dataDir: string
}> = {}) {
  return {
    workspaceId: 1,
    productLineSlug: overrides.productLineSlug ?? 'mission-control',
    taskId: 100,
    stageKey: overrides.stageKey ?? 'issue_remediation',
    attemptId: overrides.attemptId ?? 456,
    taskStageAttemptId: 456,
    taskStageClaimId: 789,
    owner: overrides.owner ?? 'mission_control',
    dataDir: overrides.dataDir,
    now: '2026-05-28T00:00:00.000Z',
  } as const
}

export function tableCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
}
