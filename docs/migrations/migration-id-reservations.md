# Migration ID Reservations

This document tracks the next-available migration id in `src/lib/migrations.ts`
and any reservations held by in-flight specs. Migration ids are append-only
and the `schema_migrations` table keys on the `id` string — once a migration
ships to any operator it must NOT be renumbered.

## Convention

- Migration ids are zero-padded 3-digit (`055_*`, `061_*`, …) followed by a
  descriptive snake_case slug.
- Rollback files live under `docs/migrations/` and use the pattern
  `rollback-M<NN>.sql`, where `<NN>` is the bare migration number. Lettered
  sub-migrations keep the suffix in the rollback filename, e.g.
  `docs/migrations/rollback-M65a.sql`.
- The migration body and behavior MUST be unchanged regardless of final id.
  Specs reserve a "logical" position; the actual number is assigned at merge
  time.

## Currently shipped (on `main`)

| Migration ID | Spec | Description |
|--------------|------|-------------|
| M53–M61 | SPEC-001 (Foundation Migrations, PR #15) | Agent scope backfill, workflow-template routing/artifact-policy columns, task lineage, workspace feature-flag storage, dispositions, artifacts, facility seed, resource policies, resource policy events |
| M62 | SPEC-004 (Task Pipeline Engine, PR #22) | `idx_tasks_one_successor_per_parent` partial unique index — DB-backed duplicate-successor protection |
| M63 | SPEC-006 (Area-Label GitHub Sync, PR #21) | `063_area_label_routing_sync_owner_triage` — `projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`, plus four indexes |
| M64–M66 | SPEC-008 (Resource Governance and Cost Tracker Enforcement, PR #26) | Resource-governance defaults, usage/canonicalization/budget/audit tables, provider entitlements, and token pricing |
| M67–M70 | SPEC-008 follow-up migrations | Provider-account governance columns, Aegis emergency reserve governance mode, governance idempotency keys/grant disablement, and breaker manual reset metadata |
| M71 | SPEC-009A (Workflow Contract Format and Roundtrip, PR #28) | Workflow-contract diagnostics, errors, and LKG snapshots |
| M72–M75 | SPEC-009B deployment follow-up migrations | Workflow-template `enabled`, facility/global alignment, workspace soft-disable, and default-workspace restore guard |
| M76 | SPEC-013A (Run-State Persistence Spine, PR #58) | `task_stage_attempts` and `task_stage_attempt_events` |
| M77 | SPEC-013A1 (GitHub Sync Automation and Poller Lifecycle, PR #60) | GitHub sync lifecycle controls and run history |
| M78 | SPEC-013B (Claim and Reconciliation Authority, PR #62) | `task_stage_claims` plus task GitHub issue state |
| M79 | SPEC-013C (Retry/Backoff and Debug API Surfaces, PR #63) | Claim-control idempotency keys and widened claim release reasons |
| M80 | SPEC-014A (Sandbox Ownership and Lifecycle Contract, PR #64) | Agent sandbox lifecycle and lifecycle event tables |
| M81 | Paddock rename migration | Persisted identity rewrite and sandbox owner constraint rebuild for Paddock naming |

Last shipped id: **M81** (`081_paddock_hard_rename`).

Next available id: **M82**.

## Reservations (in-flight)

No active migration id reservations are recorded. Future specs should reserve
M82 or later unless `src/lib/migrations.ts` has advanced.

## Collision handling

If two branches reserve the same migration id, the first branch merged to
`main` keeps the id. The later branch rebases to the next available id and
renames its rollback SQL accordingly.

When a spec rebases:

1. Renumber the migration entry in `src/lib/migrations.ts` (for example, `id: '082_…'` → `id: '083_…'`).
2. Rename the rollback file from the old migration number to the new migration
   number, for example `rollback-M82.sql` to `rollback-M83.sql`.
3. Update any references in spec.md / plan.md / tasks.md that hard-code the old id.
4. Update this document: move the rebased spec to its final number.

The migration body and runtime behavior MUST remain unchanged across the
rebase. The only changes are the numeric id, file name, and string references.

## Adding a new reservation

Future specs reserving the next available id MUST:

1. Add the proposed migration id to "Reservations (in-flight)" with the next
   available id at the time of reservation.
2. State the reservation explicitly in the spec's `### Functional Requirements`
   section, pointing at this document.
3. Update this document on merge to reflect the actual final id.
