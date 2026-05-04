-- SPEC-008 rollback M65k: drop resource_snapshots (cumulative deltas).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065k_resource_snapshots' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps EXPLAIN
-- logs readable. resource_snapshots has no schema-level FK -
-- source_id is a soft reference to source_emission_capability(source_id)
-- and scope_id is a soft reference to workspaces(id) (when
-- scope_kind='workspace'); both are managed by the application writer.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_resource_snapshots_partition;
DROP INDEX IF EXISTS idx_resource_snapshots_scope;

DROP TABLE IF EXISTS resource_snapshots;

DELETE FROM schema_migrations
WHERE id = '065k_resource_snapshots';

PRAGMA foreign_keys = ON;
