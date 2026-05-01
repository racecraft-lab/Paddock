# Data Integrity Checklist: Area-Label GitHub Sync

**Purpose**: Unit tests for the data-integrity requirements written in `spec.md` and `plan.md`. Each item validates whether the requirements themselves are complete, clear, consistent, and measurable — NOT whether the implementation works.
**Created**: 2026-05-01
**Feature**: SPEC-006 — Area-Label GitHub Sync
**Domain**: Data Integrity (migration, indexes, backfill idempotency, transaction boundaries, activity-log shape)
**Audience**: Reviewer (PR / pre-merge gate)
**Depth**: Standard (release gate for a flag-gated, schema-changing migration)

## Migration — additive columns and rollback

- [ ] CHK001 Are all four new columns (`projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`) explicitly specified as NULLable / `DEFAULT 0` with no NOT NULL constraint and no destructive ALTER? [Completeness, Spec §FR-003, Data-Model §1.1, §1.2]
- [ ] CHK002 Is the migration's idempotency mechanism (`addColumnIfMissing` helper) named in the requirements rather than left as an implementation choice? [Clarity, Spec §FR-003]
- [ ] CHK003 Are the SQL types for boolean columns (SQLite `INTEGER` 0/1) and the timestamp column (`INTEGER` Unix-epoch seconds) specified consistently across `spec.md` and `data-model.md`? [Consistency, Data-Model §1.1, §1.2]
- [ ] CHK004 Is the `tasks.area_routing_backfilled_at` semantic ("NULL ⇒ pending; set to `unixepoch()` per-task at COMMIT time") specified unambiguously enough that a reviewer can decide whether a UNIX-epoch INTEGER versus an ISO-8601 TEXT representation is acceptable? [Clarity, Spec §FR-021, Data-Model §1.2]
- [ ] CHK005 Are the rollback SQL requirements complete — explicit DROP for every column AND every index added by the migration, plus the rerun-safety caveat for `DROP COLUMN`? [Completeness, Spec §FR-006, Data-Model §4]
- [ ] CHK006 Is the rollback's "no data loss in unrelated columns" guarantee stated as a measurable acceptance criterion (e.g., schema diff equivalence to pre-SPEC-006 baseline)? [Measurability, Spec §SC-009, US7-AC3]
- [ ] CHK007 Are migration-id reconciliation rules with SPEC-004 (M62 ↔ M63 swap) precise enough that the second-to-merge spec knows exactly which file names, rollback file names, and string references to update at rebase? [Clarity, Spec §FR-007]
- [ ] CHK008 Is the legacy unique constraint `(workspace_id, github_repo, github_issue_number)` requirement explicit in BOTH `spec.md` and `data-model.md` as an invariant the migration must NOT alter? [Consistency, Spec §FR-008, Data-Model §2]

## Owner backfill — determinism and rerun-safety

- [ ] CHK009 Is the owner-election predicate quantified with an exact SQL clause — `MIN(projects.id)` per `(workspace_id, github_repo)` GROUP BY, filtered by `github_sync_enabled=1 AND github_repo IS NOT NULL`? [Clarity, Spec §FR-005, Data-Model §3]
- [ ] CHK010 Is determinism explicitly required (same input rows ⇒ same elected owner) and stated as a testable property rather than implied by `MIN()`? [Measurability, Data-Model §3]
- [ ] CHK011 Are the requirements for rerun-safety of the owner-election UPDATE measurable — i.e., is it specified that a second migration run produces the same end state with no UNIQUE-violation error? [Completeness, Data-Model §3]
- [ ] CHK012 Are the requirements explicit about workspaces with zero `github_sync_enabled=1` projects (election writes nothing; all rows remain at `is_repo_sync_owner=0`)? [Edge Case, Data-Model §3]
- [ ] CHK013 Are the requirements explicit about projects where `github_repo IS NULL` (excluded from election; legacy non-GitHub-synced projects unaffected)? [Edge Case, Data-Model §3]
- [x] CHK014 Is the migration's behavior specified for the case where a `(workspace_id, github_repo)` group contains both `github_sync_enabled=1` and `github_sync_enabled=0` projects (only enabled projects compete for ownership)? [Clarity, Resolved — FR-005 expanded]

## Partial unique indexes — enforcement and edge cases

- [ ] CHK015 Are the WHERE clauses for the two partial unique indexes (`WHERE is_repo_sync_owner=1` and `WHERE is_triage_project=1`) specified verbatim in the requirements? [Clarity, Spec §FR-004, Data-Model §2]
- [ ] CHK016 Is it explicitly stated that the partial unique indexes enforce "at most one" rather than "exactly one" (i.e., zero owners and zero triage are both legal database states)? [Clarity, Edge Case, Spec §Edge Cases L140]
- [ ] CHK017 Are the requirements explicit about the operator-visible consequence of zero owners (polling for that group is a no-op until the operator reassigns) — and is this consequence framed as a preflight/runbook responsibility rather than runtime self-heal? [Coverage, Spec §FR-046, §Edge Cases L140]
- [ ] CHK018 Are the requirements explicit that the race between owner deletion and re-assignment can leave a `(workspace_id, github_repo)` group with zero owners — and that this transient state is acceptable AND visible via FR-046 preflight? [Edge Case, Risk, Spec §Edge Cases L140]
- [ ] CHK019 Are INSERT and UPDATE rejection requirements specified for both `is_repo_sync_owner` and `is_triage_project` — with explicit error contracts (HTTP 409 `owner_conflict` / `triage_conflict` plus structured fields) — so that "partial unique index violated" is never raw-bubbled to the operator? [Completeness, Spec §FR-036, §FR-037]
- [ ] CHK020 Are the requirements explicit that SQLite UNIQUE constraints (including partial unique indexes) are immediate-only and CANNOT be `DEFERRABLE`, with the implementation-level consequence (clear-then-set order) called out? [Clarity, Risk, Spec §FR-037, Plan §Constraints L22]
- [ ] CHK021 Is the requirement that "set-first ordering MUST raise a UNIQUE violation" written as a testable invariant (a unit test asserts the failure) rather than only narrated in prose? [Measurability, Spec §FR-037 final sentence]

## Auto-backfill — preserves legacy unique constraint while moving tasks

- [ ] CHK022 Are the requirements explicit that `backfillAreaRouting` changes only `tasks.project_id` (and `tasks.area_routing_backfilled_at`) — never `(workspace_id, github_repo, github_issue_number)` — so the legacy unique constraint cannot be violated? [Completeness, Spec §FR-008, §FR-021, Data-Model §7]
- [ ] CHK023 Is the regression test contract specified for "task moves between two projects sharing one `(workspace_id, github_repo)` produces zero UNIQUE violations and exactly one `area_routing_resolved` activity with `source='backfill'`"? [Measurability, Spec §FR-050]
- [x] CHK024 Are the requirements explicit about whether `area_routing_backfilled_at` is set on EVERY processed task, including failures (counted) and skips (e.g., already in correct project)? [Clarity, Resolved — FR-021 expanded]
- [ ] CHK025 Is the resume predicate `WHERE workspace_id=? AND github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL` written verbatim in the requirements (so a reviewer can grep for it)? [Clarity, Spec §FR-023, Data-Model §6]
- [ ] CHK026 Is the resume scan complexity requirement (`O(remaining-tasks)` rather than `O(all-tasks)`) tied to a specific index (`idx_tasks_area_routing_backfill_pending`)? [Measurability, Spec §FR-004, Data-Model §2]
- [x] CHK027 Are the requirements explicit about behavior when `tasks.github_labels` is NULL or malformed JSON during backfill (parse error handling, no-label fallback path)? [Edge Case, Resolved — FR-021 expanded]

## Per-task transactions and crash-resume semantics

- [ ] CHK028 Are the requirements explicit that per-task transactions wrap all four operations (SELECT cache-or-row, label resolution, UPDATE `tasks.project_id` + `area_routing_backfilled_at`, INSERT activity) inside a single `db.transaction(() => {...})` block? [Completeness, Spec §FR-021]
- [ ] CHK029 Is the failure-isolation requirement quantified — "a failure on task N MUST NOT affect tasks {N+1, N+2, ...}" — as a testable property? [Measurability, Spec §FR-021, US5-AC4]
- [ ] CHK030 Are the requirements explicit about the no-duplicate-activity guarantee on resume — i.e., a task with `area_routing_backfilled_at IS NOT NULL` is excluded from the resume scan, so no second activity row can be written for it? [Completeness, Spec §FR-023, §FR-044]
- [x] CHK031 Is the requirement specified for the case where a task's UPDATE succeeded but the activity INSERT failed pre-commit (per-task transaction rolls back; task reappears in resume scan; rerun produces exactly one activity row)? [Edge Case, Coverage, Resolved — FR-021 expanded]
- [ ] CHK032 Is the requirement specified for the case where the per-task transaction commits but the process is killed before the next task starts (resume picks up at the next NULL `area_routing_backfilled_at` row; no duplicate work)? [Edge Case, Coverage]
- [ ] CHK033 Are the requirements explicit that retried tasks failing again (database error, malformed labels) are NOT silently dropped — failures are counted and logged but the next task proceeds? [Clarity, Spec §Edge Cases L146, §FR-021]
- [ ] CHK034 Is "skipped on subsequent runs unless the resume mechanism explicitly retries failed tasks" precise enough to determine whether failed tasks have `area_routing_backfilled_at` set (skipped on resume) or left NULL (retried on resume)? [Ambiguity, Spec §Edge Cases L146]

## Monotonicity of `tasks.area_routing_backfilled_at`

- [x] CHK035 Is the monotonicity invariant ("`area_routing_backfilled_at` MUST never decrease and MUST never be cleared back to NULL by routine sync paths") written as an explicit requirement? [Resolved — FR-021a added]
- [ ] CHK036 Is the supported manual-recovery path ("operator clears the workspace-level completion marker" — but NOT individual `tasks.area_routing_backfilled_at` values) precise about which value(s) the operator may clear? [Clarity, Spec §Edge Cases L141]
- [x] CHK037 Is there a measurable assertion that no production code path resets `tasks.area_routing_backfilled_at` to NULL after it has been set (e.g., a grep guard or unit test)? [Measurability, Resolved — FR-021a mandates a unit/integration test]

## Workspace completion marker — atomicity with the last task move

- [ ] CHK038 Is the atomicity requirement for `workspaces.feature_flags.area_label_routing_backfill_completed_at` specified — set only after ALL eligible tasks finish, never partway through? [Completeness, Spec §FR-022]
- [ ] CHK039 Is the requirement explicit about whether the completion-marker UPDATE is in the SAME transaction as the last task's UPDATE, or in a separate transaction immediately after the loop ends? [Ambiguity, Spec §FR-022]
- [x] CHK040 Is the requirement specified for the case where the loop completes successfully but the completion-marker UPDATE fails (does the next sync re-scan, find zero pending tasks, and set the marker; or does the backfill re-run from scratch)? [Edge Case, Resolved — FR-022 expanded]
- [ ] CHK041 Is the requirement specified for behavior when the completion marker is set but new GitHub-synced tasks are subsequently added (those tasks are routed inbound by `pullFromGitHub` per FR-009..FR-014, NOT by re-running backfill)? [Coverage, Clarity]
- [ ] CHK042 Are the requirements explicit about the storage format of `area_label_routing_backfill_completed_at` (ISO-8601 string vs. Unix epoch) and consistent between `spec.md`, `data-model.md`, and `feature-flags-runbook.md`? [Consistency, Spec §FR-022, Data-Model §1.3]

## Activity-log shape — fidelity and PII/secrets discipline

- [ ] CHK043 Are the `data` field shapes for `area_routing_resolved`, `area_routing_unresolved`, `label_provisioning_failed`, and `sync_owner_transferred` enumerated with EVERY required key (no implicit additions, no missing keys) in `spec.md` and `data-model.md`? [Completeness, Spec §FR-027a, §FR-043, Data-Model §5.4]
- [x] CHK044 Is the requirement that activity `data` MUST NOT contain PII or secrets stated explicitly (rather than implied by the listed keys)? [Security, Resolved — FR-043a added; FR-027a tightened]
- [ ] CHK045 Is the `sample_error` truncation rule for `label_provisioning_failed` quantified (max length, what to strip — no auth headers, no tokens)? [Clarity, Spec §FR-027a]
- [ ] CHK046 Is the `reason` enum ('single_match' | 'no_label' | 'multi_label' | 'no_match' | 'no_triage') exhaustive and consistent across FR-042/FR-043, US3, US5, and `data-model.md`? [Consistency, Spec §FR-042, §FR-043, US3]
- [ ] CHK047 Is the `source` enum ('ingest' | 'backfill') exhaustive — and is it explicit that no third value (e.g., 'manual', 'webhook') is permitted in this spec? [Completeness, Spec §FR-024, §FR-043]
- [ ] CHK048 Is the throttle requirement for `label_provisioning_failed` ("at most one per `(workspace_id, github_repo)` per 24h") quantified with the exact pre-insert query (`created_at > unixepoch() - 86400`)? [Measurability, Spec §FR-027]
- [x] CHK049 Are the requirements explicit that `actor_user_id` in `sync_owner_transferred` is a stable internal id (no email, no display name) so the activity row carries no operator PII? [Security, Resolved — FR-043a + Data-Model §5.4 updated]
- [ ] CHK050 Are activity rows for the FR-015 no-thrash guarantee — i.e., NO activity row is written on subsequent syncs of an existing task — specified as a measurable invariant (zero rows of any `kind='area_routing_*'` for unchanged tasks)? [Measurability, Spec §FR-044, US4-AC2]

## Index coverage and query plans

- [ ] CHK051 Are the requirements explicit that the partial unique index `idx_projects_one_sync_owner_per_repo` does NOT enforce presence (zero owners is legal) — only uniqueness when present? [Clarity, Edge Case]
- [ ] CHK052 Is `idx_projects_workspace_area_slug` covering enough for the inbound routing cache `SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?`, and is this assumption stated rather than implicit? [Coverage, Plan §Performance Goals]
- [ ] CHK053 Are the four index names spelled identically in `spec.md`, `data-model.md`, and the rollback SQL (so a typo in any one document does not produce orphan indexes after rollback)? [Consistency, Spec §FR-004, Data-Model §2, §4]
- [ ] CHK054 Are the requirements explicit about the order of `DROP INDEX` versus `DROP COLUMN` in rollback (drop indexes first to avoid implicit dependencies)? [Clarity, Data-Model §4]

## Cross-document consistency

- [ ] CHK055 Do `spec.md` FR-003/FR-004, `data-model.md` §1–§2, and the rollback SQL §4 enumerate the SAME four columns and SAME four indexes (no item present in one and missing from another)? [Consistency, Spec §FR-003, Data-Model §1–§4]
- [ ] CHK056 Is the migration id reservation (M62 vs. M63) handled consistently across rollback file name, `migration-id-reservations.md` update, and `rollback-procedure.md` row append? [Consistency, Spec §FR-007, Plan §Documentation]
- [ ] CHK057 Are the activity `data` keys defined in FR-027a, FR-043, and `data-model.md` §5.4 byte-identical (same key names, same types, same enum sets)? [Consistency, Spec §FR-027a, §FR-043, Data-Model §5.4]

## Out-of-scope clarity

- [ ] CHK058 Are the deferred items (sync-owner re-election, backfill bookend kinds, `kind='sync_owner_lost'`) listed in BOTH `spec.md` Edge Cases AND `data-model.md` §7 with consistent rationale (Article XII)? [Consistency, Spec §Edge Cases L140 §L147, Data-Model §7]
- [ ] CHK059 Is "no automatic re-routing on subsequent label change" stated in `spec.md` AND in `data-model.md` runtime entities so a future contributor cannot silently add a re-route path? [Consistency, Spec §FR-015, §Assumptions L305]
- [ ] CHK060 Is the prohibition "no new `tasks.*` column tracking the OLD `project_id`" stated as a requirement (data-model §7) and traceable to a constitution article (XII — speculative generality)? [Traceability, Data-Model §7]

## Notes

- Items prefixed `[Gap]` indicate the requirement is missing or under-specified in `spec.md` / `plan.md` / `data-model.md` and need authoring before G4 closure.
- Items tagged `[Risk]` or `[Security]` should be remediated even if low confidence; defer to consensus only when the resolution is non-obvious.
- This checklist is a unit test for the requirements quality, not for the implementation. A passing G4 means each gap is closed by a written requirement, not by code.
