-- SPEC-004 rollback M62: drop one-successor-per-parent guard.
-- Snapshot the database before running this file.

DROP INDEX IF EXISTS idx_tasks_one_successor_per_parent;

DELETE FROM schema_migrations
WHERE id = '062_task_successor_unique_parent_index';
