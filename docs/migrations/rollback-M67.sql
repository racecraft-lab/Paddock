-- SPEC-008 rollback for migration M67 (`067_provider_accounts_governance_columns`).
--
-- Per Constitution Convention G — additive column-add migrations roll back
-- via column drop. SQLite supports `DROP COLUMN` from 3.35+ (better-sqlite3
-- ships with a sufficiently recent SQLite). Each statement is idempotent
-- via `IF EXISTS` semantics emulated below — SQLite has no IF EXISTS for
-- columns, so wrap in PRAGMA-guarded checks if needed for repeat-runs;
-- otherwise re-running this script after a partial rollback is the
-- operator's responsibility.
--
-- Order: drop columns in reverse-of-add order, then the schema_migrations
-- row last so re-applying M67 is possible.
--
-- See specs/008-resource-governance/spec.md FR-131..149.

ALTER TABLE provider_accounts DROP COLUMN governance_tos_acknowledgments_json;
ALTER TABLE provider_accounts DROP COLUMN deactivated_at;
ALTER TABLE provider_accounts DROP COLUMN version;

-- Reverse the migrations registration so re-running M67 is possible.
DELETE FROM schema_migrations WHERE id = '067_provider_accounts_governance_columns';
