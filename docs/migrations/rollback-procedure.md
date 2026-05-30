# SPEC-001 / SPEC-004 / SPEC-006 / SPEC-008 Manual Rollback Procedure

SPEC-001 adds forward-only migrations M53 through M61; SPEC-004 adds M62 (`idx_tasks_one_successor_per_parent`); SPEC-006 adds M63 (area-label routing schema); SPEC-008 adds M65a..m + M66 (resource governance schema, see SPEC-008 row below). The live migration runner has no `down()` hook, so rollback is an operator-initiated manual SQL procedure.

## SPEC-014A (Sandbox Lifecycle) Rollback

SPEC-014A adds M80 `080_agent_sandbox_lifecycles`. To reverse only the sandbox lifecycle schema after stopping Mission Control writers and backing up the database, run:

1. `docs/migrations/rollback-M80.sql`
2. `PRAGMA foreign_key_check;`
3. Verify `schema_migrations` no longer contains `080_agent_sandbox_lifecycles`.

This rollback removes `agent_sandbox_lifecycle_events` before `agent_sandbox_lifecycles` and leaves unrelated task, attempt, claim, activity, and workflow data intact.

## SPEC-008 (Resource Governance) Reverse Order

Per FR-243 the SPEC-008 rollback files MUST be applied in strict reverse order, M66 → M65m → M65l → ... → M65a → M64. The M64 file is the SPEC-001 tail rollback (M64 was reserved for SPEC-008 pre-rename — the canonical SPEC-008 chain begins at M65a):

1. `docs/migrations/rollback-M66.sql` (token_pricing)
2. `docs/migrations/rollback-M65m.sql` (final 8 governance tables)
3. `docs/migrations/rollback-M65l.sql` (provider_accounts extensions)
4. `docs/migrations/rollback-M65k.sql` (resource_snapshots)
5. `docs/migrations/rollback-M65j.sql` (correction_ledger)
6. `docs/migrations/rollback-M65i.sql` (reconciliation_batches)
7. `docs/migrations/rollback-M65h.sql` (resource_overrides)
8. `docs/migrations/rollback-M65g.sql` (resource_reservations)
9. `docs/migrations/rollback-M65f.sql` (resource_budget_counters)
10. `docs/migrations/rollback-M65e.sql` (resource_budget_ledger)
11. `docs/migrations/rollback-M65d.sql` (canonical_budget_effects)
12. `docs/migrations/rollback-M65c.sql` (canonical_usage_events)
13. `docs/migrations/rollback-M65b.sql` (raw_usage_events)
14. `docs/migrations/rollback-M65a.sql` (source_emission_capability)
15. `docs/migrations/rollback-M64.sql` (SPEC-001 tail; only when fully unwinding)

After step 2, run `PRAGMA foreign_key_check;` and verify the result is clean. The M65m rollback file embeds this assertion (FR-243).

## Preconditions

1. Stop Mission Control writers.
2. Snapshot the SQLite database file before making changes.
3. Confirm the database is on the SPEC-001 tail:

```sql
SELECT id, applied_at
FROM schema_migrations
WHERE id BETWEEN '053_agent_scope' AND '063_area_label_routing_sync_owner_triage'
ORDER BY id;
```

4. Confirm the database snapshot exists and is restorable before running any rollback file. The M53-M56 column rollbacks use SQLite copy-and-rename table rebuilds so they remain replay-safe after the SPEC-001 columns are already absent.

## Reverse Order

Apply the rollback files in this exact order:

1. `docs/migrations/rollback-M63.sql` (SPEC-006 — area-label routing schema)
2. `docs/migrations/rollback-M62.sql` (SPEC-004 — task successor unique index)
3. `docs/migrations/rollback-M61.sql`
4. `docs/migrations/rollback-M60.sql`
5. `docs/migrations/rollback-M59.sql`
6. `docs/migrations/rollback-M58.sql`
7. `docs/migrations/rollback-M57.sql`
8. `docs/migrations/rollback-M56.sql`
9. `docs/migrations/rollback-M55.sql`
10. `docs/migrations/rollback-M54.sql`
11. `docs/migrations/rollback-M53.sql`

## SQLite Column Rollback Guidance

SQLite supports `ALTER TABLE ... DROP COLUMN`, but it does not support `DROP COLUMN IF EXISTS`. The M53-M56 rollback files therefore use transactional copy-and-rename table rebuilds instead of direct `DROP COLUMN` statements. Re-running those files after rollback leaves the baseline schema intact.

## Facility Workspace Guard

`rollback-M59.sql` deletes only a workspace with `slug='facility'` and `name='Facility'` when no migration-052 workspace-scoped table references it. It also enables foreign-key enforcement so Phase 0 tables that still exist can block unsafe deletion. If later specs or operators have attached data to that workspace, the row and migration marker remain for operator review.

## Post-Rollback Checks

```sql
SELECT id
FROM schema_migrations
WHERE id BETWEEN '053_agent_scope' AND '061_resource_policy_events'
ORDER BY id;

PRAGMA table_info(agents);
PRAGMA table_info(workflow_templates);
PRAGMA table_info(tasks);
PRAGMA table_info(workspaces);
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'task_dispositions',
  'task_artifacts',
  'resource_policies',
  'resource_policy_events'
);
```

The first query should return no rows. The table-info checks should no longer list the SPEC-001 columns, and the final table query should return no rows.
