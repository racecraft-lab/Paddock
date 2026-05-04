-- SPEC-008 rollback M65h: drop resource_overrides (operator grants).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065h_resource_overrides' in
-- src/lib/migrations.ts.
--
-- Drop indexes first, then the table; reverse-create order keeps EXPLAIN
-- logs readable. resource_overrides has no schema-level FK — policy_id,
-- scope_id, and reservation_id are soft references managed by the
-- application writer.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_resource_overrides_idempotency;
DROP INDEX IF EXISTS idx_resource_overrides_expires;
DROP INDEX IF EXISTS idx_resource_overrides_active;

DROP TABLE IF EXISTS resource_overrides;

DELETE FROM schema_migrations
WHERE id = '065h_resource_overrides';

PRAGMA foreign_keys = ON;
