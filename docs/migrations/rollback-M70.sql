-- SPEC-008 rollback for migration M70 (`070_breaker_manually_reset_at`).
--
-- Per FR-006, FR-219d — drops the two columns added for the operator
-- manual-reset path on the persistent circuit breaker
-- (`POST /api/governance/breaker/reset`).
--
-- Order: drop columns in reverse-of-add order, then schema_migrations row
-- last so re-applying M70 is possible.
--
-- See specs/008-resource-governance/spec.md FR-006, FR-219d.

ALTER TABLE resource_governance_breaker DROP COLUMN manually_reset_by;
ALTER TABLE resource_governance_breaker DROP COLUMN manually_reset_at;

-- Reverse the migrations registration so re-running M70 is possible.
DELETE FROM schema_migrations WHERE id = '070_breaker_manually_reset_at';
