-- SPEC-008 rollback M65i: drop reconciliation_batches (state machine).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065i_reconciliation_batches' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps EXPLAIN
-- logs readable. reconciliation_batches has no schema-level FK -
-- source_id is a soft reference to source_emission_capability(source_id)
-- managed by the application writer.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_reconciliation_batches_active;
DROP INDEX IF EXISTS idx_reconciliation_batches_state;

DROP TABLE IF EXISTS reconciliation_batches;

DELETE FROM schema_migrations
WHERE id = '065i_reconciliation_batches';

PRAGMA foreign_keys = ON;
