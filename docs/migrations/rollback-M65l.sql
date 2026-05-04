-- SPEC-008 rollback M65l: drop provider_entitlements + leave the four
-- M65l-added columns on provider_accounts in place.
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065l_provider_accounts_entitlements'
-- in src/lib/migrations.ts.
--
-- Drops:
--   - idx_provider_entitlements_account_effective
--   - provider_entitlements
--   - schema_migrations marker '065l_provider_accounts_entitlements'
--
-- Does NOT drop:
--   - provider_accounts (owned by M64, must survive M65l rollback)
--   - provider_accounts.entitlements_json
--   - provider_accounts.config_json (was created by M64; kept regardless)
--   - provider_accounts.tos_acknowledged_at
--   - provider_accounts.automation_class
--
-- Rationale: SQLite ALTER TABLE DROP COLUMN was added in 3.35 (2021).
-- The four M65l-added columns are nullable with no NOT NULL/CHECK
-- constraints and no associated indexes, so leaving them in place is
-- functionally safe for downstream readers that ignore unknown columns.
-- The forward migration uses addColumnIfMissing, so re-applying after
-- a rollback is idempotent: columns that survive rollback simply
-- become a no-op on the next forward migration.
--
-- Operators who require a strict schema match should run the M64-era
-- table-rebuild pattern (CREATE table_new ... INSERT ... DROP ...
-- ALTER ... RENAME) outside this rollback file, with a backup taken
-- first.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this
--   file after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_provider_entitlements_account_effective;

DROP TABLE IF EXISTS provider_entitlements;

DELETE FROM schema_migrations
WHERE id = '065l_provider_accounts_entitlements';

PRAGMA foreign_keys = ON;
