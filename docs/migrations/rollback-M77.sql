-- Rollback for M77 GitHub sync lifecycle persistence.
-- WARNING: this rollback removes automatic GitHub sync lifecycle control
-- and run-detail history. Existing compatibility sync history in github_syncs
-- remains readable and is intentionally preserved.
--
-- Rerun-safe inverse of additive migration 077_github_sync_lifecycle.
-- Drop run detail before control state, then remove only the M77 schema marker.

DROP INDEX IF EXISTS idx_github_sync_lifecycle_runs_result;
DROP INDEX IF EXISTS idx_github_sync_lifecycle_runs_sync_id;
DROP INDEX IF EXISTS idx_github_sync_lifecycle_runs_scope_started;
DROP INDEX IF EXISTS idx_github_sync_lifecycle_controls_lease;
DROP INDEX IF EXISTS idx_github_sync_lifecycle_controls_due;
DROP INDEX IF EXISTS idx_github_sync_lifecycle_controls_scope;

DROP TABLE IF EXISTS github_sync_lifecycle_runs;
DROP TABLE IF EXISTS github_sync_lifecycle_controls;

DELETE FROM schema_migrations WHERE id = '077_github_sync_lifecycle';

-- Operator guidance: run PRAGMA foreign_key_check after rollback and verify it
-- returns no rows before treating the database as healthy.
PRAGMA foreign_key_check;
