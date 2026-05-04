-- SPEC-008 rollback M65c: drop canonical_usage_events + dedup indexes.
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065c_canonical_usage_events' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps
-- EXPLAIN logs readable. Operators rolling back the canonical event
-- pipeline should run rollback-M65d.sql first (canonical_budget_effects
-- references canonical_usage_events.id at the application layer even
-- though no FK is declared at the schema level), so dependants leave
-- the system before this table goes.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_canonical_partition;
DROP INDEX IF EXISTS idx_canonical_workspace_emitted;
DROP INDEX IF EXISTS idx_canonical_dedup;

DROP TABLE IF EXISTS canonical_usage_events;

DELETE FROM schema_migrations
WHERE id = '065c_canonical_usage_events';

PRAGMA foreign_keys = ON;
