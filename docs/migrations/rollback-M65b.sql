-- SPEC-008 rollback M65b: drop raw_usage_events (append-only ingest table).
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065b_raw_usage_events' in
-- src/lib/migrations.ts. raw_usage_events declares
-- FOREIGN KEY(source_id) REFERENCES source_emission_capability(source_id),
-- so this rollback must run BEFORE rollback-M65a.sql.
--
-- Drop indexes first, then the table; this matches the operator playbook
-- of "release dependants before parents" and keeps EXPLAIN logs readable.
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this file
--   after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_raw_usage_events_reconcile_status;
DROP INDEX IF EXISTS idx_raw_usage_events_session;
DROP INDEX IF EXISTS idx_raw_usage_events_partition;
DROP INDEX IF EXISTS idx_raw_usage_events_source_ingested;

DROP TABLE IF EXISTS raw_usage_events;

DELETE FROM schema_migrations
WHERE id = '065b_raw_usage_events';

PRAGMA foreign_keys = ON;
