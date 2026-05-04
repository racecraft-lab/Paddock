-- SPEC-008 rollback M65j: drop correction_ledger (coalesced corrections).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065j_correction_ledger' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps EXPLAIN
-- logs readable. correction_ledger has no schema-level FK -
-- canonical_event_id and ledger_entry_id are soft references managed by
-- the application writer.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_correction_ledger_applied;
DROP INDEX IF EXISTS idx_correction_ledger_event;

DROP TABLE IF EXISTS correction_ledger;

DELETE FROM schema_migrations
WHERE id = '065j_correction_ledger';

PRAGMA foreign_keys = ON;
