-- Manual rollback for M78 / 078_task_stage_claims.
--
-- This rollback removes only the SPEC-013B active-claim authority. It leaves
-- M76 task-stage attempt evidence and M77 GitHub sync lifecycle state intact.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_task_stage_claims_state_updated;
DROP INDEX IF EXISTS idx_task_stage_claims_lease;
DROP INDEX IF EXISTS idx_task_stage_claims_task_history;
DROP INDEX IF EXISTS idx_task_stage_claims_attempt_unique;
DROP INDEX IF EXISTS idx_task_stage_claims_active_unique;
DROP TABLE IF EXISTS task_stage_claims;

DELETE FROM schema_migrations WHERE id = '078_task_stage_claims';

PRAGMA foreign_keys = ON;
