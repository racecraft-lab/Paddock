# Regression Safety Checklist: Area-Label GitHub Sync

**Purpose**: Validate that requirements protect existing flag-OFF behavior and existing test suites against regression introduced by SPEC-006 schema, code, and runtime additions
**Created**: 2026-05-01
**Feature**: [spec.md](../spec.md)
**Domain**: Regression safety (Phase 4 checklist 2 of 4)

> This is a unit test for the requirements in the regression-safety domain. Each item asks whether the spec/plan/data-model defines the property — not whether code passes. The standalone `[Gap]` token marks items where the requirement text is missing or under-specified and must be authored before G4 closure.

## Flag-OFF Parity Requirements

- [ ] CHK001 - Are flag-OFF requirements for poller project iteration explicitly stated to match the legacy per-project query without referencing `is_repo_sync_owner`? [Completeness] [Spec §FR-002] [Spec §US1-AC1]
- [ ] CHK002 - Are flag-OFF requirements for inbound ingestion explicitly defined to write the same task row shape (no new field populated) as the pre-SPEC-006 baseline? [Completeness] [Spec §FR-002]
- [ ] CHK003 - Are flag-OFF requirements for outbound `pushTaskToGitHub` explicitly defined to emit only `mc:*` and `priority:*` labels (no `area:*`)? [Completeness] [Spec §FR-017] [Spec §US1-AC2]
- [ ] CHK004 - Are flag-OFF requirements for `initializeLabels(repo)` (no `workspaceId`) explicitly defined to create only the legacy label set? [Completeness] [Spec §US1-AC3]
- [ ] CHK005 - Are flag-OFF requirements for the activity log explicitly defined to write zero rows of `kind='area_routing_resolved'`, `kind='area_routing_unresolved'`, `kind='label_provisioning_failed'`, or `kind='sync_owner_transferred'` after a full sync cycle? [Completeness] [Spec §SC-010] [Spec §US1-AC4]
- [ ] CHK006 - Is the meaning of "byte-identical to pre-SPEC-006 baseline" measurable for flag-OFF (e.g., via captured before/after snapshots of poller SQL and label set)? [Measurability] [Spec §FR-002] [Spec §US1 Independent Test]
- [ ] CHK007 - Is the requirement that `connect` (POST /api/github) provisions only `mc:*`/`priority:*` labels when the flag is OFF for the target workspace explicitly stated? [Completeness] [Spec §FR-002] [Spec §US1-AC3]
- [ ] CHK008 - Is there an explicit requirement that no new activity kinds are emitted on the connect handler path when the flag is OFF? [Completeness] [Spec §FR-002] [Spec §SC-010]

## Existing Test Suite Parity

- [ ] CHK009 - Is there an explicit requirement that `pnpm test` passes unchanged with the flag OFF in test fixtures? [Completeness] [Plan §Regression-safety test gates]
- [ ] CHK010 - Is there an explicit requirement that `pnpm test:e2e` passes unchanged with the flag OFF in test fixtures? [Completeness] [Plan §Regression-safety test gates]
- [ ] CHK011 - Is there an explicit requirement that `pnpm typecheck` passes after the schema additions in this spec? [Clarity] [Plan §Regression-safety test gates]
- [ ] CHK012 - Is there an explicit requirement that `pnpm lint` passes after the new code paths land? [Clarity] [Plan §Regression-safety test gates]
- [ ] CHK013 - Are test-fixture defaults for `workspaces.feature_flags` documented so existing tests inherit a flag-OFF baseline by default? [Completeness] [Plan §Regression-safety test gates]
- [ ] CHK014 - Is there a requirement that the new test suites do not modify shared fixtures used by pre-SPEC-006 tests in ways that change pre-existing assertions? [Completeness] [Spec §FR-002] [Plan §Regression-safety test gates]

## Schema Additivity (Existing INSERT/UPDATE Compatibility)

- [ ] CHK015 - Are the four new columns explicitly required to be NULL-able / DEFAULT-zero so existing INSERT statements without them continue to succeed? [Completeness] [Spec §FR-003]
- [ ] CHK016 - Is there an explicit requirement that existing UPDATE statements that do not reference the new columns continue to behave identically (no triggers, no implicit writes)? [Completeness] [Spec §FR-003] [Spec §FR-002]
- [ ] CHK017 - Is the migration explicitly required to be idempotent and rerun-safe (using `addColumnIfMissing` precedent)? [Completeness] [Spec §FR-003] [Spec §FR-005]
- [ ] CHK018 - Is the rollback SQL file location and naming convention (`docs/migrations/rollback-M62.sql` or `rollback-M63.sql`) explicitly required? [Completeness] [Spec §FR-006]
- [ ] CHK019 - Is the rollback explicitly required to drop all four new columns AND all four indexes without altering unrelated columns? [Completeness] [Spec §FR-006]
- [ ] CHK020 - Is the requirement that the legacy unique constraint `(workspace_id, github_repo, github_issue_number)` MUST remain in place explicitly stated? [Completeness] [Spec §FR-008]
- [ ] CHK021 - Is there a requirement that the rollback procedure entry is appended to `docs/migrations/rollback-procedure.md` (matching SPEC-001 precedent)? [Completeness] [Plan §Constitution Check VII]

## Index Plan Stability

- [ ] CHK022 - Is there an explicit, measurable requirement that SQLite's query planner MUST NOT select any of the four new indexes for the canonical pre-existing legacy query set (e.g., agent queue, task list, search-by-id, sync-owner-less poller selection)? [Measurability] [Plan §Regression-safety test gates]
- [ ] CHK023 - Is an `EXPLAIN QUERY PLAN` snapshot or comparison harness referenced as part of the test plan? [Measurability] [Plan §Regression-safety test gates]
- [ ] CHK024 - Is the requirement that index creation is gated behind the migration (NOT created at startup) explicitly stated? [Clarity] [Spec §FR-004] [Plan §Regression-safety test gates]
- [ ] CHK025 - Are the predicates of the four partial indexes (`WHERE is_repo_sync_owner=1`, `WHERE is_triage_project=1`, `WHERE github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL`) explicitly required to NOT be referenced by legacy queries (so the partial index has no chance to be selected for legacy plans)? [Completeness] [Spec §FR-004] [Plan §Regression-safety test gates]
- [ ] CHK026 - Is there a requirement to capture `EXPLAIN QUERY PLAN` for the canonical pre-existing query set before and after migration so any plan delta is detectable in CI? [Measurability] [Plan §Regression-safety test gates]

## Owner Backfill Runtime Safety

- [ ] CHK027 - Is the migration-time owner backfill (lowest `projects.id` per `(workspace_id, github_repo)` group with `github_sync_enabled=1`) explicitly defined and deterministic? [Completeness] [Spec §FR-005]
- [ ] CHK028 - Is there an explicit requirement that the backfilled `is_repo_sync_owner` column is NEVER read by code paths when `resolveFlag` returns false (the column has zero runtime effect when the flag is OFF)? [Completeness] [Spec §FR-002] [Spec §FR-018]
- [ ] CHK029 - Is there an explicit assertion-class requirement that the migration body itself is rerun-safe and produces an identical end state on a database that already has the migration applied (no UNIQUE violation from `idx_projects_one_sync_owner_per_repo`)? [Completeness] [Spec §FR-005]
- [ ] CHK030 - Is the case `(workspace_id, github_repo)` group with zero `github_sync_enabled=1` projects explicitly defined to leave every row at `is_repo_sync_owner=0` (no polling, no error)? [Completeness] [Spec §FR-005]

## Per-Row Flag Evaluation in Poller (Mass-Mode Pitfall)

- [ ] CHK031 - Is the github-sync-poller filter explicitly required to evaluate `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` PER ROW (per workspace/repo) rather than once at process start? [Clarity] [Spec §FR-052]
- [ ] CHK032 - Is there an explicit requirement that the poller MUST NOT cache `resolveFlag` results across workspaces in a way that could silence polling for OFF workspaces when the same process also services ON workspaces? [Risk] [Spec §FR-052]
- [ ] CHK033 - Is there a required mixed-tenant test fixture (some workspaces flag-ON, others flag-OFF) that asserts OFF workspaces are still polled normally and ON workspaces are owner-filtered? [Measurability] [Spec §FR-052] [Plan §Regression-safety test gates]
- [ ] CHK034 - Is the requirement that "process-wide flag mode" (mass-mode) MUST NOT exist explicitly stated, with an anti-pattern callout that a single boolean cached at boot time would break multi-tenant correctness? [Clarity] [Spec §FR-052]

## initializeLabels Backward Compatibility

- [ ] CHK035 - Is the legacy 1-arg signature `initializeLabels(repo)` explicitly required to remain callable so existing call sites compile without modification? [Completeness] [Spec §FR-053]
- [ ] CHK036 - When called without `workspaceId`, is the requirement that ONLY `mc:*` and `priority:*` labels are created (no `area:*`) explicitly stated? [Completeness] [Spec §US1-AC3] [Spec §FR-053]
- [ ] CHK037 - When called WITH `workspaceId` AND the flag is ON for that workspace, is the requirement that area labels are added explicitly stated? [Completeness] [Spec §FR-025]
- [ ] CHK038 - When called WITH `workspaceId` AND the flag is OFF for that workspace, is the behavior explicitly specified — specifically that NO `area:*` labels are created? [Coverage] [Spec §FR-053]
- [ ] CHK039 - Is there a requirement that the optional `workspaceId` parameter has a documented default that preserves legacy behavior? [Clarity] [Spec §FR-053]

## Activity Kind Isolation and Forward Compatibility

- [ ] CHK040 - Is the requirement that the four new activity kinds (`area_routing_resolved`, `area_routing_unresolved`, `label_provisioning_failed`, `sync_owner_transferred`) are emitted only when the flag is ON explicitly stated? [Completeness] [Spec §FR-002] [Spec §SC-010]
- [ ] CHK041 - Is there a requirement that activity-feed renderers gracefully ignore unknown `kind` values (forward-compat for older renderers reading new rows during rolling deploy or rollback)? [Coverage] [Spec §FR-054]
- [ ] CHK042 - Is the requirement that no SPEC-006 activity row is written during the connect-handler path when the flag is OFF explicitly stated? [Completeness] [Spec §FR-002] [Spec §SC-010]
- [ ] CHK043 - Are activity `data` payloads for the new kinds required to be additive-only (existing readers of legacy `kind` rows MUST NOT see schema drift)? [Completeness] [Spec §FR-043]

## 409 Conflict Response Shape Stability

- [ ] CHK044 - Is the hybrid 409 response shape `{ error, message, existing_*_project_id, existing_*_project_slug }` explicitly defined for `area_slug_conflict`, `triage_conflict`, and `owner_conflict`? [Completeness] [Spec §FR-035] [Spec §FR-036] [Spec §FR-037]
- [ ] CHK045 - Is the requirement that pre-existing 409 callers on `PUT /api/projects/[id]` (non-area paths) continue to receive their pre-SPEC-006 body shape unchanged explicitly stated? [Completeness] [Spec §FR-002]
- [ ] CHK046 - Is there a contract test (or equivalent assertion) requirement that the new 409 shape is asserted in tests? [Completeness] [Plan §Contracts §projects-put.md]
- [ ] CHK047 - Is the form-side requirement that the UI key on the structured `error` code (not regex-parse `message`) explicitly stated so message text can change without breaking the form? [Completeness] [Spec §FR-041]

## Transfer Ordering Safety

- [ ] CHK048 - Is the requirement that the clear-then-set transfer occurs inside a single `db.transaction(() => { ... })` block explicitly stated? [Completeness] [Spec §FR-037]
- [ ] CHK049 - Is the rationale for clear-then-set ordering (SQLite UNIQUE indexes are immediate, not DEFERRABLE) captured in the requirement so future maintainers do not silently invert the order? [Completeness] [Spec §FR-037] [Plan §Technical Context]
- [ ] CHK050 - Is there a unit-test requirement that asserts set-first ordering raises a UNIQUE violation (lock-in test against accidental regression)? [Completeness] [Spec §FR-037]
- [ ] CHK051 - Is there a requirement that concurrent transfer requests cannot leave `is_repo_sync_owner` in a half-state visible mid-transaction? [Coverage] [Spec §FR-055]
- [ ] CHK052 - Is the order of operations within the transfer transaction (clear → set → activity INSERT) explicitly required so the audit row is written inside the same transaction as the swap? [Completeness] [Spec §FR-037]

## Cross-Cutting Regression Risks

- [ ] CHK053 - Is there a documented assertion that "no new top-level directories" and "no new TS/TSX modules" so existing import graphs remain unchanged? [Completeness] [Plan §Strict Scope]
- [ ] CHK054 - Is there a requirement that the per-sync routing cache (one extra `SELECT` per `pullFromGitHub` call) does NOT execute when the flag is OFF? [Completeness] [Spec §FR-009]
- [ ] CHK055 - Is there a requirement that the bootstrap hook (FR-019) is gated by the flag and does NOT execute on flag-OFF workspaces? [Completeness] [Spec §FR-018] [Spec §FR-019]
- [ ] CHK056 - Is there a requirement that the flag-resolution helper (`resolveFlag`) is the only entry point and that no inline `process.env.FEATURE_AREA_LABEL_ROUTING` reads exist in production code paths (CI grep enforced)? [Completeness] [Spec §FR-001]
- [ ] CHK057 - Is the rollback strategy "flip flag OFF (instant); columns retained but ignored" explicitly stated as the supported runtime rollback path (no migration rollback required)? [Completeness] [Spec §FR-045] [Plan §Quickstart]
- [ ] CHK058 - Is there a requirement that `tasks.area_routing_backfilled_at` does NOT influence runtime behavior when the flag is OFF (the column is read only by the flag-ON backfill resume scan)? [Completeness] [Spec §FR-002] [Spec §FR-021a]

## Notes

- Items prefixed with the standalone `[Gap]` token indicate the requirement is missing or under-specified in `spec.md` / `plan.md` / `data-model.md` / `research.md` / contracts and need authoring before G4 closure.
- This checklist is a unit test for the regression-safety quality of the requirements. A passing G4 means each gap is closed by a written requirement, not by a passing test in code.
- Already-resolved decisions (4 columns + 4 indexes + 4 activity kinds, hybrid 409 shape, clear-then-set inside `db.transaction()`, sync-owner re-election deferred per Constitution Article XII, backfill bookend kinds deferred) are NOT reopened by this checklist.
