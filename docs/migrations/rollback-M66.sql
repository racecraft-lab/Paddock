-- SPEC-008 rollback for migration M66 (`066_token_pricing`).
--
-- Per FR-243, FR-260a, Constitution Convention G — drops the table and
-- both indexes. Idempotent (`DROP ... IF EXISTS`); safe to re-run on a
-- partially-rolled-back database.
--
-- Order: indexes first, then table.
--
-- See specs/008-resource-governance/spec.md FR-260a (token_pricing).

DROP INDEX IF EXISTS idx_token_pricing_lookup;
DROP INDEX IF EXISTS idx_token_pricing_unique;
DROP TABLE IF EXISTS token_pricing;

-- Reverse the migrations registration so re-running M66 is possible.
DELETE FROM schema_migrations WHERE id = '066_token_pricing';
