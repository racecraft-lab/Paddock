-- SPEC-008 rollback M65e: drop resource_budget_ledger (append-only ledger).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065e_resource_budget_ledger' in
-- src/lib/migrations.ts.
--
-- Drop triggers first (so subsequent DROP TABLE is not blocked by the
-- BEFORE DELETE trigger), then indexes, then the table; reverse-create
-- order keeps EXPLAIN logs readable.
--
-- The genesis row is dropped along with the table; operators rolling
-- forward later will receive a fresh genesis row at the
-- forward-migration's "current YYYY-MM" partition_month.
--
-- Rerun-safety:
--   DROP TRIGGER IF EXISTS, DROP INDEX IF EXISTS, DROP TABLE IF EXISTS,
--   and the DELETE FROM schema_migrations statement are all idempotent.
--   Re-running this file after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_resource_budget_ledger_no_update;
DROP TRIGGER IF EXISTS trg_resource_budget_ledger_no_delete;

DROP INDEX IF EXISTS idx_resource_budget_ledger_decision;
DROP INDEX IF EXISTS idx_resource_budget_ledger_partition;
DROP INDEX IF EXISTS idx_resource_budget_ledger_policy_window;

DROP TABLE IF EXISTS resource_budget_ledger;

DELETE FROM schema_migrations
WHERE id = '065e_resource_budget_ledger';

PRAGMA foreign_keys = ON;
