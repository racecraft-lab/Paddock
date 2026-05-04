-- SPEC-008 rollback M65m: drop the eight governance final tables and
-- their indexes.
-- Snapshot the database before running this file.
--
-- The forward migration entry is '065m_governance_final_tables' in
-- src/lib/migrations.ts.
--
-- Tables dropped (reverse-create order):
--   1. governance_orphan_event
--   2. reconciler_lease
--   3. governance_audit_verification_state
--   4. ingest_rate_state
--   5. quarantined_raw_events
--   6. recovery_action
--   7. resource_window_instances
--   8. resource_governance_breaker
--
-- Indexes dropped first, then tables. None of the M65m tables declare
-- a FOREIGN KEY clause; PRAGMA foreign_key_check runs at the end as
-- an integrity gate to confirm the schema is consistent after rollback
-- (the same gate that runs at the end of M65m's up()).
--
-- Rerun-safety:
--   DROP INDEX IF EXISTS, DROP TABLE IF EXISTS, and the DELETE FROM
--   schema_migrations statement are all idempotent. Re-running this
--   file after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_governance_orphan_event_unresolved;
DROP INDEX IF EXISTS idx_quarantined_raw_events_source_quarantined;
DROP INDEX IF EXISTS idx_recovery_action_taken_at;
DROP INDEX IF EXISTS idx_resource_window_instances_lookup;

DROP TABLE IF EXISTS governance_orphan_event;
DROP TABLE IF EXISTS reconciler_lease;
DROP TABLE IF EXISTS governance_audit_verification_state;
DROP TABLE IF EXISTS ingest_rate_state;
DROP TABLE IF EXISTS quarantined_raw_events;
DROP TABLE IF EXISTS recovery_action;
DROP TABLE IF EXISTS resource_window_instances;
DROP TABLE IF EXISTS resource_governance_breaker;

DELETE FROM schema_migrations
WHERE id = '065m_governance_final_tables';

PRAGMA foreign_keys = ON;

-- Integrity gate: assert no foreign-key violations remain after the
-- rollback completes. Mirrors the foreign_key_check the forward
-- migration runs at the end of up(). The PRAGMA below is parsed by
-- the SQLite engine but does not raise via apply scripts; operators
-- verifying the rollback should re-run the pragma in their SQL
-- console after applying this file. An empty result indicates a
-- clean rollback.
PRAGMA foreign_key_check;
