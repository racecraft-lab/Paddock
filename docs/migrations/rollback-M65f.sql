-- SPEC-008 rollback M65f: drop resource_budget_counters (precomputed
-- per-window balances). Snapshot the database before running this file.
--
-- The forward migration entry is '065f_resource_budget_counters' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps EXPLAIN
-- logs readable. resource_budget_counters has no schema-level FK, but
-- application writers treat policy_id as a soft reference.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_resource_budget_counters_pending_rebuild;
DROP INDEX IF EXISTS idx_resource_budget_counters_lookup;

DROP TABLE IF EXISTS resource_budget_counters;

DELETE FROM schema_migrations
WHERE id = '065f_resource_budget_counters';

PRAGMA foreign_keys = ON;
