-- Manual rollback for M81 / 081_paddock_hard_rename.
--
-- Back up or export the SQLite database before running this rollback. This
-- restores the pre-Paddock persisted identifiers needed by code before M81.

PRAGMA foreign_keys = OFF;

UPDATE workspaces
SET slug = 'mission' || '-' || 'control'
WHERE slug = 'paddock';

UPDATE workspaces
SET feature_flags = replace(feature_flags, 'PILOT_PADDOCK_E2E', 'PILOT_' || 'MISSION' || '_' || 'CONTROL' || '_E2E')
WHERE feature_flags LIKE '%PILOT_PADDOCK_E2E%';

UPDATE workflow_templates
SET slug = replace(slug, 'paddock_', 'mission' || '-' || 'control' || '_')
WHERE slug LIKE '%paddock_%';

UPDATE workflow_templates
SET next_template_slug = replace(next_template_slug, 'paddock_', 'mission' || '-' || 'control' || '_')
WHERE next_template_slug LIKE '%paddock_%';

UPDATE workflow_templates
SET routing_rules = replace(routing_rules, 'paddock_', 'mission' || '-' || 'control' || '_')
WHERE routing_rules LIKE '%paddock_%';

UPDATE workflow_contract_runs
SET family = 'mission' || '-' || 'control'
WHERE family = 'paddock';

UPDATE workflow_contract_runs
SET source_path = replace(source_path, 'docs/ai/workflows/paddock', 'docs/ai/workflows/' || 'mission' || '-' || 'control')
WHERE source_path LIKE '%docs/ai/workflows/paddock%';

UPDATE workflow_contract_snapshots
SET family = 'mission' || '-' || 'control'
WHERE family = 'paddock';

UPDATE resource_policies
SET notes = replace(notes, 'SPEC-009B:paddock:', 'SPEC-009B:' || 'mission' || '-' || 'control' || ':')
WHERE notes LIKE '%SPEC-009B:paddock:%';

UPDATE agent_sandbox_lifecycles
SET owner = 'mission' || '_' || 'control'
WHERE owner = 'paddock';

UPDATE agent_sandbox_lifecycles
SET sandbox_key = replace(sandbox_key, 'owner/paddock', 'owner/' || 'mission' || '_' || 'control')
WHERE sandbox_key LIKE '%owner/paddock%';

UPDATE agent_sandbox_lifecycles
SET root_id = 'mission' || '_' || 'control' || '_data_sandboxes'
WHERE root_id = 'paddock_data_sandboxes';

UPDATE agent_sandbox_lifecycles
SET sanitized_relative_path = replace(sanitized_relative_path, 'owner/paddock', 'owner/' || 'mission' || '_' || 'control')
WHERE sanitized_relative_path LIKE '%owner/paddock%';

UPDATE agent_sandbox_lifecycle_events
SET sandbox_key = replace(sandbox_key, 'owner/paddock', 'owner/' || 'mission' || '_' || 'control')
WHERE sandbox_key LIKE '%owner/paddock%';

DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_sandbox_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_task_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_lifecycle_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_claim;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_attempt;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_task_status;
DROP TABLE IF EXISTS agent_sandbox_lifecycle_events_m81_rollback_old;
DROP TABLE IF EXISTS agent_sandbox_lifecycles_m81_rollback_old;
ALTER TABLE agent_sandbox_lifecycle_events RENAME TO agent_sandbox_lifecycle_events_m81_rollback_old;
ALTER TABLE agent_sandbox_lifecycles RENAME TO agent_sandbox_lifecycles_m81_rollback_old;

CREATE TABLE agent_sandbox_lifecycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
  sandbox_attempt_key TEXT NOT NULL CHECK(length(trim(sandbox_attempt_key)) > 0),
  task_stage_attempt_id INTEGER,
  task_stage_claim_id INTEGER,
  owner TEXT NOT NULL CHECK(owner IN ('mission' || '_' || 'control', 'openclaw', 'external_harness')),
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

INSERT INTO agent_sandbox_lifecycles (
  id, workspace_id, task_id, stage_key, sandbox_attempt_key, task_stage_attempt_id,
  task_stage_claim_id, owner, sandbox_key, root_id, sanitized_relative_path,
  handle_id, status, created_at, updated_at, prepared_at, running_at, terminal_at,
  cleanup_requested_at, cleaned_up_at, metadata_json
)
SELECT
  id, workspace_id, task_id, stage_key, sandbox_attempt_key, task_stage_attempt_id,
  task_stage_claim_id, owner, sandbox_key, root_id, sanitized_relative_path,
  handle_id, status, created_at, updated_at, prepared_at, running_at, terminal_at,
  cleanup_requested_at, cleaned_up_at, metadata_json
FROM agent_sandbox_lifecycles_m81_rollback_old;

INSERT INTO agent_sandbox_lifecycle_events (
  id, lifecycle_id, workspace_id, task_id, stage_key, sandbox_key, event_type,
  status, reason_code, observed_at, actor_type, actor_id, metadata_json
)
SELECT
  id, lifecycle_id, workspace_id, task_id, stage_key, sandbox_key, event_type,
  status, reason_code, observed_at, actor_type, actor_id, metadata_json
FROM agent_sandbox_lifecycle_events_m81_rollback_old;

DROP TABLE agent_sandbox_lifecycle_events_m81_rollback_old;
DROP TABLE agent_sandbox_lifecycles_m81_rollback_old;

CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycles_task_status
  ON agent_sandbox_lifecycles(workspace_id, task_id, stage_key, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycles_attempt
  ON agent_sandbox_lifecycles(workspace_id, task_stage_attempt_id)
  WHERE task_stage_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycles_claim
  ON agent_sandbox_lifecycles(workspace_id, task_stage_claim_id)
  WHERE task_stage_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycle_events_lifecycle_order
  ON agent_sandbox_lifecycle_events(lifecycle_id, observed_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycle_events_task_order
  ON agent_sandbox_lifecycle_events(workspace_id, task_id, stage_key, observed_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_agent_sandbox_lifecycle_events_sandbox_order
  ON agent_sandbox_lifecycle_events(workspace_id, sandbox_key, observed_at ASC, id ASC);

DELETE FROM schema_migrations WHERE id = '081_paddock_hard_rename';

PRAGMA foreign_keys = ON;
