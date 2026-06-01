-- SPEC-006 rollback M63: drop SPEC-006 indexes + columns
-- (area_slug, is_triage_project, is_repo_sync_owner, area_routing_backfilled_at).
-- Snapshot the database before running this file.
--
-- Migration ID was rebased from M62 to M63 after SPEC-004 (PR #22) shipped M62
-- first per docs/migrations/migration-id-reservations.md (first-to-merge rule).
--
-- IMPORTANT — SQLite ALTER TABLE DROP COLUMN caveat:
--   SQLite has supported DROP COLUMN since 3.35 (March 2021). Paddock's
--   minimum SQLite version (better-sqlite3 v12) bundles 3.45+, so DROP COLUMN
--   works in production. However, the operation is NOT instant — for very large
--   tasks/projects tables, schedule rollback during a maintenance window.
--
-- Rerun-safety:
--   The DROP INDEX, json_remove, and DELETE FROM schema_migrations statements
--   in this file are rerun-safe (DROP INDEX IF EXISTS, json_remove returns the
--   original on miss, DELETE on a non-matching id is a no-op).
--   The ALTER TABLE ... DROP COLUMN statements are NOT rerunnable: SQLite has
--   no DROP COLUMN IF EXISTS, so a second invocation after the columns are
--   already gone will raise "no such column" and abort. Operators replaying an
--   interrupted rollback should comment out (or skip) any DROP COLUMN whose
--   column has already been removed, and rely on the index/json_remove/
--   schema_migrations cleanup steps to converge.
--
-- Index drop order is the reverse of CREATE order (defensive — SQLite does not
-- require ordered drops, but reverse order keeps EXPLAIN logs readable).

PRAGMA foreign_keys = OFF;

-- Indexes first (UNIQUE partial indexes block column DROP otherwise).
DROP INDEX IF EXISTS idx_tasks_area_routing_backfill_pending;
DROP INDEX IF EXISTS idx_projects_one_triage_per_workspace;
DROP INDEX IF EXISTS idx_projects_one_sync_owner_per_repo;
DROP INDEX IF EXISTS idx_projects_workspace_area_slug;

-- Columns (reverse of ADD order).
ALTER TABLE tasks DROP COLUMN area_routing_backfilled_at;
ALTER TABLE projects DROP COLUMN is_repo_sync_owner;
ALTER TABLE projects DROP COLUMN is_triage_project;
ALTER TABLE projects DROP COLUMN area_slug;

-- Workspace feature flag cleanup — remove the SPEC-006 backfill marker if set.
-- Safe even when the JSON key is absent: json_remove returns the original on miss.
UPDATE workspaces
SET feature_flags = json_remove(feature_flags, '$.area_label_routing_backfill_completed_at')
WHERE feature_flags IS NOT NULL;

DELETE FROM schema_migrations
WHERE id = '063_area_label_routing_sync_owner_triage';

PRAGMA foreign_keys = ON;
