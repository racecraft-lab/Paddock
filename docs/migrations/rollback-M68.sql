-- SPEC-008 — M68 rollback
--
-- Per FR-243: explicit reverse of `068_aegis_emergency_reserve_governance_mode`.
-- M68 introduces (1) `aegis_emergency_reserves`, (2)
-- `workspaces.aegis_governance_mode`, (3) `aegis_fallback_activity`. The
-- rollback drops the two new tables and removes the workspaces column.
-- SQLite has no `ALTER TABLE ... DROP COLUMN` until 3.35; this script uses
-- the table-rebuild pattern for the workspaces column to remain
-- compatible with the project's pinned better-sqlite3 binary.
--
-- Run order:
--   1. Drop dependent tables.
--   2. Rebuild `workspaces` without `aegis_governance_mode`.
--
-- Idempotent — safe to rerun.

DROP INDEX IF EXISTS idx_aegis_fallback_activity_workspace_hour;
DROP TABLE IF EXISTS aegis_fallback_activity;

DROP INDEX IF EXISTS idx_aegis_emergency_reserves_workspace;
DROP TABLE IF EXISTS aegis_emergency_reserves;

-- workspaces.aegis_governance_mode rebuild — only run when the column
-- exists; this script is intended to be wrapped by the rollback runner
-- which checks `PRAGMA table_info(workspaces)` first. The block below is
-- the literal table-rebuild sequence the runner emits.
--
-- Pseudocode:
--   1. CREATE TABLE workspaces_M68_rollback AS SELECT
--        <every column except aegis_governance_mode>
--      FROM workspaces;
--   2. DROP TABLE workspaces;
--   3. ALTER TABLE workspaces_M68_rollback RENAME TO workspaces;
--   4. Recreate any indexes that referenced workspaces.
--
-- Because the column list is workspace-schema dependent and changes per
-- migration history, the rollback runner generates the SELECT list
-- dynamically. See docs/migrations/rollback-procedure.md for the runner
-- algorithm.
