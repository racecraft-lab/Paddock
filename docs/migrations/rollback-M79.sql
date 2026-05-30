-- Manual rollback for M79 / 079_task_claim_control.
--
-- This rollback removes SPEC-013C idempotency replay storage and contracts
-- task_stage_claims.release_reason back to the SPEC-013B vocabulary only when
-- no SPEC-013C operator release reasons remain.

CREATE TEMP TABLE IF NOT EXISTS m79_rollback_guard (
  reason TEXT CHECK(reason IS NULL)
);

DELETE FROM m79_rollback_guard;

INSERT INTO m79_rollback_guard(reason)
SELECT release_reason
FROM task_stage_claims
WHERE release_reason IN (
  'operator_released',
  'operator_cancelled',
  'operator_retry_requested'
)
LIMIT 1;

DROP TABLE IF EXISTS m79_rollback_guard;

DROP INDEX IF EXISTS idx_task_claim_control_idempotency_task;
DROP INDEX IF EXISTS idx_task_claim_control_idempotency_expires_at;
DROP TABLE IF EXISTS task_claim_control_idempotency_keys;

DROP INDEX IF EXISTS idx_task_stage_claims_state_updated;
DROP INDEX IF EXISTS idx_task_stage_claims_lease;
DROP INDEX IF EXISTS idx_task_stage_claims_task_history;
DROP INDEX IF EXISTS idx_task_stage_claims_attempt_unique;
DROP INDEX IF EXISTS idx_task_stage_claims_active_unique;

ALTER TABLE task_stage_claims RENAME TO task_stage_claims_m79_old;

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
    'launch_handoff_completed',
    'dispatch_failed',
    'task_terminal_done',
    'task_terminal_failed',
    'github_issue_terminal',
    'github_pr_terminal',
    'governance_blocked',
    'governance_deferred',
    'attempt_terminal_reconciled',
    'stale_claim_recovered',
    'boundary_error_deferred'
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

INSERT INTO task_stage_claims (
  id,
  workspace_id,
  task_id,
  stage_key,
  task_stage_attempt_id,
  claim_state,
  lease_owner,
  claim_run_id,
  lease_started_at,
  lease_expires_at,
  release_reason,
  released_at,
  released_by_run_id,
  stale_recovered_from_claim_id,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  id,
  workspace_id,
  task_id,
  stage_key,
  task_stage_attempt_id,
  claim_state,
  lease_owner,
  claim_run_id,
  lease_started_at,
  lease_expires_at,
  release_reason,
  released_at,
  released_by_run_id,
  stale_recovered_from_claim_id,
  metadata_json,
  created_at,
  updated_at
FROM task_stage_claims_m79_old;

DROP TABLE task_stage_claims_m79_old;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_stage_claims_active_unique
  ON task_stage_claims(workspace_id, task_id, stage_key)
  WHERE claim_state = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_stage_claims_attempt_unique
  ON task_stage_claims(task_stage_attempt_id);
CREATE INDEX IF NOT EXISTS idx_task_stage_claims_task_history
  ON task_stage_claims(workspace_id, task_id, stage_key, id DESC);
CREATE INDEX IF NOT EXISTS idx_task_stage_claims_lease
  ON task_stage_claims(lease_expires_at)
  WHERE claim_state = 'active';
CREATE INDEX IF NOT EXISTS idx_task_stage_claims_state_updated
  ON task_stage_claims(workspace_id, claim_state, updated_at DESC);

DELETE FROM schema_migrations WHERE id = '079_task_claim_control';
