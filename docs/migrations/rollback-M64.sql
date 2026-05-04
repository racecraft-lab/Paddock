-- SPEC-008 rollback M64: drop governance defaults foundation.
-- Snapshot the database before running this file.
--
-- Migration ID was rebased from M63 to M64 per
-- docs/migrations/migration-id-reservations.md (first-to-merge rule):
-- SPEC-006 (PR #21) merged M63 (063_area_label_routing_sync_owner_triage)
-- first, so SPEC-008 takes M64. The forward migration entry is
-- '064_resource_governance_default_policies' in src/lib/migrations.ts.
--
-- Reverse-creation drop order (mirror of M64 forward sequence):
--   6. governance_health_events
--   5. provider_accounts
--   4. retention_policy
--   3. resource_decision_audit
--   2. resource_policy_events ALTER columns - NOT reversed here (see note)
--   1. resource_policies ALTER columns      - NOT reversed here (see note)
--
-- IMPORTANT - SQLite ALTER TABLE DROP COLUMN caveat:
--   SQLite has supported DROP COLUMN since 3.35 (March 2021). Mission
--   Control's bundled SQLite (better-sqlite3 v12 -> 3.45+) supports it,
--   but the operation is NOT instant for large tables. Per the SPEC-008
--   data-model.md M64 rollback guidance, full ADD COLUMN reversal on
--   resource_policies and resource_policy_events requires a table-rebuild
--   (CREATE new table from M60/M61 baseline schema, INSERT...SELECT
--   without the new columns, DROP old, RENAME new). That procedure is
--   long and risky for a generic rollback artifact, so this file ONLY
--   drops the four NEW tables and the schema_migrations marker.
--
--   Operators who need to reverse the ALTER TABLE ADD COLUMN extensions
--   on resource_policies / resource_policy_events MUST follow the
--   table-rebuild procedure documented in docs/migrations/rollback-procedure.md.
--
-- Rerun-safety:
--   DROP TABLE IF EXISTS, DROP INDEX IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this
--   file after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

-- 6. governance_health_events
DROP INDEX IF EXISTS idx_governance_health_events_component_captured;
DROP TABLE IF EXISTS governance_health_events;

-- 5. provider_accounts
DROP INDEX IF EXISTS idx_provider_accounts_active;
DROP TABLE IF EXISTS provider_accounts;

-- 4. retention_policy
DROP TABLE IF EXISTS retention_policy;

-- 3. resource_decision_audit
DROP INDEX IF EXISTS idx_resource_decision_audit_captured_at;
DROP INDEX IF EXISTS idx_resource_decision_audit_decision_id;
DROP TABLE IF EXISTS resource_decision_audit;

-- Schema migrations marker.
DELETE FROM schema_migrations
WHERE id = '064_resource_governance_default_policies';

PRAGMA foreign_keys = ON;
