-- SPEC-008 rollback M65d: drop canonical_budget_effects (posted-effect ledger).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065d_canonical_budget_effects' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps
-- EXPLAIN logs readable. canonical_budget_effects has no schema-level
-- FK to canonical_usage_events (M65c), but the application writer
-- treats canonical_event_id as a soft reference, so operators rolling
-- back the canonical event pipeline should run this file BEFORE
-- rollback-M65c.sql to release dependants first.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_canonical_budget_effects_active;
DROP INDEX IF EXISTS idx_canonical_budget_effects_counter;

DROP TABLE IF EXISTS canonical_budget_effects;

DELETE FROM schema_migrations
WHERE id = '065d_canonical_budget_effects';

PRAGMA foreign_keys = ON;
