-- SPEC-008 rollback for migration M69 (`069_governance_idempotency_keys_grant_disable`).
--
-- Per FR-209, FR-219a, FR-219d, FR-391 — drops the
-- `governance_idempotency_keys` table + its expiry index, plus the
-- `users.governance_grants_disabled_at` column added for the override-grant
-- anomaly auto-disable path.
--
-- Idempotent (`DROP ... IF EXISTS`).
--
-- Order: index first, then table, then column drop, then schema_migrations
-- row so re-running M69 is possible.
--
-- See specs/008-resource-governance/spec.md FR-209, FR-219a, FR-219d.

DROP INDEX IF EXISTS idx_governance_idempotency_keys_expires_at;
DROP TABLE IF EXISTS governance_idempotency_keys;
ALTER TABLE users DROP COLUMN governance_grants_disabled_at;

-- Reverse the migrations registration so re-running M69 is possible.
DELETE FROM schema_migrations WHERE id = '069_governance_idempotency_keys_grant_disable';
