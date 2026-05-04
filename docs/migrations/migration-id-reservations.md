# Migration ID Reservations

This document tracks the next-available migration id in `src/lib/migrations.ts`
and any reservations held by in-flight specs. Migration ids are append-only
and the `schema_migrations` table keys on the `id` string — once a migration
ships to any operator it must NOT be renumbered.

## Convention

- Migration ids are zero-padded 3-digit (`055_*`, `061_*`, …) followed by a
  descriptive snake_case slug.
- Rollback files follow `docs/migrations/rollback-MNN.sql` (where `MNN` is
  the bare migration number — e.g., M62, M63).
- The migration body and behavior MUST be unchanged regardless of final id.
  Specs reserve a "logical" position; the actual number is assigned at merge
  time.

## Currently shipped (on `main`)

| Migration ID | Spec | Description |
|--------------|------|-------------|
| M53–M61 | SPEC-001 (Foundation Migrations, PR #15) | Agent scope backfill, workflow-template routing/artifact-policy columns, task lineage, workspace feature-flag storage, dispositions, artifacts, facility seed, resource policies, resource policy events |
| M62 | SPEC-004 (Task Pipeline Engine, PR #22) | `idx_tasks_one_successor_per_parent` partial unique index — DB-backed duplicate-successor protection |
| M63 | SPEC-006 (Area-Label GitHub Sync, PR #21) | `063_area_label_routing_sync_owner_triage` — `projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`, plus four indexes |

Last shipped id: **M63** (`063_area_label_routing_sync_owner_triage`).

Next available id: **M64** (reserved by SPEC-008, in flight).

## Reservations (in-flight)

| Migration ID | Spec | Description | Status |
|--------------|------|-------------|--------|
| M64 + M65a..m + M66 | SPEC-008 (Resource Governance and Cost Tracker Enforcement) | M64 (`064_resource_governance_default_policies`) — extends `resource_policies`/`resource_policy_events`, creates `resource_decision_audit` (genesis row + audit chain), `retention_policy` (Q63 horizon seeds), `provider_accounts` skeleton, `governance_health_events`. M65a..m + M66 follow. | In flight in `.worktrees/008-resource-governance/` (rebased from M63 to M64 on 2026-05-02 after SPEC-006 PR #21 merged first) |

## Rebase rule

**First-to-merge keeps M62; the second rebases to M63 and renames its
rollback SQL accordingly.**

When the second spec rebases:

1. Renumber the migration entry in `src/lib/migrations.ts` (e.g., `id: '062_…'` → `id: '063_…'`).
2. Rename the rollback file (`docs/migrations/rollback-M62.sql` → `docs/migrations/rollback-M63.sql`).
3. Update any references in spec.md / plan.md / tasks.md that hard-code `M62`.
4. Update this document: move the rebased spec from "M62 (or M63)" to its
   final number, mark the kept-position one as the canonical M62.

The migration body and runtime behavior MUST remain unchanged across the
rebase. The only changes are the numeric id, file name, and string references.

## Adding a new reservation

Future specs reserving the next available id MUST:

1. Add a row to the "Reservations (in-flight)" table with the proposed
   migration id (next available at the time of reservation).
2. State the reservation explicitly in the spec's `### Functional Requirements`
   section, pointing at this document.
3. Update this document on merge to reflect the actual final id.
