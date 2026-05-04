-- SPEC-008 rollback M65a: drop source_emission_capability registry.
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065a_source_emission_capability' in
-- src/lib/migrations.ts.
--
-- Rerun-safety:
--   DROP TABLE IF EXISTS and the DELETE FROM schema_migrations statement are
--   idempotent. Re-running this file after a partial rollback is safe.
--
-- Dependency note:
--   raw_usage_events (M65b) declares FOREIGN KEY(source_id) REFERENCES
--   source_emission_capability(source_id). Operators MUST roll back M65b
--   first (rollback-M65b.sql), otherwise this DROP TABLE will fail with a
--   foreign-key violation when foreign_keys=ON. With foreign_keys=OFF (set
--   below for the rollback window) the DROP succeeds but leaves orphan
--   rows in raw_usage_events; the operator should ensure that table has
--   already been dropped or truncated.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS source_emission_capability;

DELETE FROM schema_migrations
WHERE id = '065a_source_emission_capability';

PRAGMA foreign_keys = ON;
