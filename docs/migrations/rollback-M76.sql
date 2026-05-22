-- Rollback for M76 task-stage attempt persistence.
-- WARNING: this rollback removes task-stage attempt lifecycle history.
-- Back up or export task_stage_attempts and task_stage_attempt_events before
-- running this file if operators may need attempt history for review.
--
-- Rerun-safe inverse of additive migration 076_task_stage_attempts.
-- Drop the child lifecycle table before the parent attempt projection table,
-- then remove only the M76 schema marker.

DROP TABLE IF EXISTS task_stage_attempt_events;
DROP TABLE IF EXISTS task_stage_attempts;

DELETE FROM schema_migrations WHERE id = '076_task_stage_attempts';

-- Operator guidance: run PRAGMA foreign_key_check after rollback and verify it
-- returns no rows before treating the database as healthy.
PRAGMA foreign_key_check;
