-- SPEC-008 rollback M65g: drop resource_reservations (atomic reservation
-- rows + state-transition trigger). Snapshot the database before running
-- this file.
--
-- The forward migration entry is '065g_resource_reservations' in
-- src/lib/migrations.ts.
--
-- Drop the trigger first (so subsequent UPDATE/DROP TABLE work without
-- the state-transition guard), then indexes, then the table.
-- reverse-create order keeps EXPLAIN logs readable.
--
-- Dependency note:
--   resource_overrides (M65h) carries a soft reference to
--   resource_reservations(id) via overrides.reservation_id. Operators
--   rolling back M65g should drop or empty resource_overrides first to
--   avoid leaving dangling references.
--
-- Rerun-safety:
--   DROP TRIGGER IF EXISTS, DROP INDEX IF EXISTS, DROP TABLE IF EXISTS,
--   and the DELETE FROM schema_migrations statement are all idempotent.
--   Re-running this file after a partial rollback is safe.

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_resource_reservations_state_transition;

DROP INDEX IF EXISTS idx_resource_reservations_expires_at;
DROP INDEX IF EXISTS idx_resource_reservations_active;

DROP TABLE IF EXISTS resource_reservations;

DELETE FROM schema_migrations
WHERE id = '065g_resource_reservations';

PRAGMA foreign_keys = ON;
