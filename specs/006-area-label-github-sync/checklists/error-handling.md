# Specification Quality Checklist: Error Handling

**Purpose**: Validate the quality, clarity, completeness, and consistency of error-handling REQUIREMENTS in SPEC-006 (Area-Label GitHub Sync). This is a unit test for English — does the spec clearly and unambiguously define how every failure mode is caught, isolated, recorded, and recovered? It does NOT test implementation behavior.
**Created**: 2026-05-01
**Feature**: [spec.md](../spec.md)
**Domain**: Error handling — failure isolation, atomicity, throttling, idempotency, conflict serialization

## Note On Locked Decisions

Per the user's "DO NOT REOPEN" list, the following are sealed prior decisions and are NOT evaluated by this checklist:

- Re-election deferred (sync-owner lifecycle handling deferred)
- Bookend kinds deferred (`area_routing_backfill_started` / `*_completed`)
- Hybrid 409 shape (response body fields per FR-035/036/037)
- Clear-then-set ordering for transfer (FR-037)
- AREA_LABEL_MAP contents (FR-030)

If the spec text touching these areas is referenced, the checklist evaluates the surrounding requirement quality (e.g., is the rule observable / testable / non-conflicting), not the decision itself.

## initializeLabels — Per-Label Failure Isolation

- [ ] CHK001 - Are the categories of GitHub API failure that `initializeLabels` MUST catch enumerated explicitly (rate-limit / 4xx / network) rather than left as "any error"? [Clarity, Spec §FR-027]
- [ ] CHK002 - Is "caught per-label" defined unambiguously — i.e., does the spec state that the catch boundary is around the per-label create call (not around the whole loop)? [Clarity, Spec §FR-027]
- [ ] CHK003 - Is the no-abort guarantee written at two scopes — the function itself AND the larger sync run that called it — so a reader cannot infer only one of them? [Completeness, Spec §FR-027]
- [ ] CHK004 - Does the spec require that a per-label failure does NOT block creation of subsequent labels in the same `initializeLabels` invocation (best-effort across the full set)? [Coverage, Spec §FR-027]
- [ ] CHK005 - Is the function's return contract on partial failure specified ("return successfully even on partial failure") rather than left as "no exception"? [Clarity, Spec §FR-027]
- [x] CHK006 - 5xx responses (server errors, gateway timeouts) are explicitly enumerated in the FR-027 failure taxonomy alongside rate-limit/4xx/network. [Resolved, Spec §FR-027]
- [ ] CHK007 - Are timeout / abort / non-HTTP transport errors (DNS resolution, TLS handshake) covered by the "network errors" category, or do they fall through unhandled? [Ambiguity, Spec §FR-027]
- [ ] CHK008 - Is the requirement that `initializeLabels` returns successfully written in observable terms (no thrown exception, no rejected promise) rather than implementation language? [Measurability, Spec §FR-027]

## Throttled `label_provisioning_failed` Activity

- [ ] CHK009 - Is the throttle window quantified as exactly 24 hours via a concrete predicate (`created_at > unixepoch() - 86400`) rather than "approximately one per day"? [Clarity, Spec §FR-027]
- [ ] CHK010 - Is the throttle scope defined as `(workspace_id, github_repo)` and not `(workspace_id)` alone or `(github_repo)` alone? [Clarity, Spec §FR-027]
- [ ] CHK011 - Does the spec state that all per-label failures from a single `initializeLabels` invocation collapse into ONE activity row (never one per failed label)? [Completeness, Spec §FR-027]
- [ ] CHK012 - Is the activity `data` shape for `label_provisioning_failed` defined with required keys (`workspace_id`, `github_repo`, `failed_labels`, `error_count`, `sample_error`, `trigger`)? [Completeness, Spec §FR-027a]
- [ ] CHK013 - Are the allowed `trigger` enum values listed exhaustively (`'connect' | 'area_slug_change' | 'bootstrap'`) rather than free-form? [Clarity, Spec §FR-027a]
- [ ] CHK014 - Is `sample_error` length-bounded (≤500 chars) and required to be sanitized (no Authorization headers, no GitHub tokens, no API keys, no email addresses, no PII)? [Completeness, Spec §FR-027a]
- [ ] CHK015 - Does the spec state WHERE sanitization MUST occur (at the call site that constructs the activity row, not deferred) rather than leaving the sanitization point unspecified? [Clarity, Spec §FR-027a]
- [ ] CHK016 - Is the throttle behavior on the boundary case (one row exists at exactly `created_at = unixepoch() - 86400`) defined, or could the strict-greater-than predicate cause a same-second double insert? [Edge Case, Spec §FR-027]
- [x] CHK017 - FR-027 (final sentence) and FR-027b together require structured log emission via the project process logger even when the throttle suppresses the activity row. [Resolved, Spec §FR-027 §FR-027b]
- [ ] CHK018 - Is the relationship between this throttle and FR-029's "no re-run on subsequent polls" explicit (the throttle prevents activity-log spam from the trigger paths in FR-028)? [Consistency, Spec §FR-027 vs §FR-028 §FR-029]
- [ ] CHK019 - Is "retried on the next explicit trigger" (SC-007) defined in terms of the three triggers in FR-028, so the recovery path is a closed set? [Clarity, Spec §SC-007 vs §FR-028]
- [x] CHK020 - FR-027 explicitly documents the throttle SELECT/INSERT as racy and accepts a brief duplicate-row window across truly concurrent calls (no consumer depends on at-most-one-row-per-window strictness). [Resolved, Spec §FR-027]

## Backfill Per-Task Failure Isolation

- [ ] CHK021 - Is each backfilled task's atomicity envelope defined as exactly the four operations (SELECT, label resolution, UPDATE `tasks.project_id` + `area_routing_backfilled_at`, INSERT activity)? [Completeness, Spec §FR-021]
- [ ] CHK022 - Is the all-four-COMMIT-or-all-four-ROLLBACK atomicity stated explicitly rather than implied by "wrapped in its own transaction"? [Clarity, Spec §FR-021]
- [ ] CHK023 - When a per-task transaction fails, is the recovery requirement specified (the task's `area_routing_backfilled_at` stays NULL, the resume scan retries it, the next task processes in its own independent transaction)? [Completeness, Spec §FR-021]
- [ ] CHK024 - Is "logged AND counted" defined as both observable in process logs AND counted in a structured aggregate, so a reader cannot drop one of the two? [Clarity, Spec §FR-021]
- [ ] CHK025 - Is the failure-handling rule for malformed/NULL `tasks.github_labels` JSON specified (treat as no-label case, log the parse failure, do NOT abort the per-task transaction)? [Edge Case, Spec §FR-021]
- [ ] CHK026 - Is the requirement that "no production code path resets `tasks.area_routing_backfilled_at` to NULL after it has been set" stated as a monotonic invariant with a unit test obligation? [Completeness, Spec §FR-021a §FR-056]
- [ ] CHK027 - Does the spec state that `tasks.area_routing_backfilled_at` MUST be set on tasks already in their correct project (no `project_id` change needed) so the resume scan skips them? [Clarity, Spec §FR-021]
- [ ] CHK028 - Are repeat per-task failures across runs covered (no permanent-skip sentinel; failure count visible to operators) so an operator knows a task is stuck rather than silently dropped? [Coverage, Spec §FR-021 / Edge Cases §"Per-task transaction failure during backfill"]
- [x] CHK029 - FR-022 (final amendment) explicitly states there is no upper failure-count threshold; every eligible task is attempted on every bootstrap cycle and the FR-027b structured log is the operator-visible signal for stuck tasks. [Resolved, Spec §FR-022 §FR-027b]
- [ ] CHK030 - Is the failure-counting mechanism's location specified (process log only, in-memory counter returned to caller, separate `backfill_summary` activity, etc.)? [Ambiguity, Spec §FR-021]

## Backfill Completion Marker And Idempotency

- [ ] CHK031 - Does the spec state that the completion marker is set ONLY AFTER every eligible task has been attempted (successfully or failed)? [Completeness, Spec §FR-022]
- [ ] CHK032 - Is "every eligible task attempted" measurable via the `WHERE area_routing_backfilled_at IS NULL` predicate so a verifier can decide whether the marker was set legitimately? [Measurability, Spec §FR-022 §FR-023]
- [ ] CHK033 - Is the marker-write transaction explicitly separate from the last per-task transaction (workspace-level vs task-level atomicity envelopes) rather than left ambiguous? [Clarity, Spec §FR-022]
- [ ] CHK034 - Is the failure mode covered where the per-task loop drains successfully but the completion-marker UPDATE itself fails (database error, process kill) — and is the recovery (next bootstrap re-enters, finds zero pending tasks, sets marker) specified? [Completeness, Spec §FR-022]
- [ ] CHK035 - Does the spec state that re-running backfill after a partial failure is idempotent — i.e., already-backfilled tasks are skipped via `WHERE area_routing_backfilled_at IS NULL`? [Completeness, Spec §FR-023]
- [ ] CHK036 - Is the SELECT predicate for resumption written as a column-based check (NOT an activity-log lookup) so the resume scan is O(remaining-tasks)? [Clarity, Spec §FR-023]
- [ ] CHK037 - Is "subsequent flag-on triggers MUST skip the backfill if the marker is set" stated as a non-conditional rule (no carve-out for partial completion or stale marker)? [Consistency, Spec §FR-022 vs §FR-023]
- [ ] CHK038 - Is the recovery flow for an operator who needs a re-evaluation pass documented (clear `workspaces.feature_flags.area_label_routing_backfill_completed_at`; do NOT clear individual `tasks.area_routing_backfilled_at` values)? [Completeness, Spec §FR-021a / Edge Cases]
- [ ] CHK039 - Is the post-recovery behavior unambiguous — clearing the workspace marker re-enters bootstrap; the resume scan then re-processes only tasks where `area_routing_backfilled_at IS NULL`? [Clarity, Spec §FR-021a §FR-023]
- [x] CHK040 - FR-022 amendment adds an explicit test obligation: after a backfill run with at least one forced per-task failure, the completion marker remains unset and a subsequent bootstrap re-enters until all tasks are processed. [Resolved, Spec §FR-022]

## PUT /api/projects/[id] Validation And No-Partial-State

- [ ] CHK041 - Are all 409 conflict cases enumerated (FR-035 area_slug, FR-036 triage, FR-037 owner) with structured response bodies that key on the `error` code rather than free-form text? [Completeness, Spec §FR-035 §FR-036 §FR-037]
- [ ] CHK042 - Does the spec state that 409 validation errors return BEFORE any state mutation (no partial state mutation occurs)? [Completeness, Spec §FR-035 §FR-036 §FR-037]
- [x] CHK043 - FR-034 amendment requires the conflict-check + UPDATE pair to run inside a single `db.transaction(() => { ... })` block; UNIQUE-violations roll back cleanly and translate to the matching 409 structured response. [Resolved, Spec §FR-034]
- [ ] CHK044 - Does the spec specify how 400 (format / regex / `area_slug` invalid) is distinguished from 409 (conflict), so the operator UI can branch correctly? [Clarity, Spec §FR-034 vs §FR-035]
- [ ] CHK045 - Is the FR-040a OFF-flag rejection path (PUT MUST reject area-routing fields with 400 when flag is OFF) consistent with the FR-035/036/037 conflict response shape — i.e., the response body code is identifiable and not collapsed into a generic 400? [Consistency, Spec §FR-040a vs §FR-035 §FR-036 §FR-037]
- [x] CHK046 - FR-034 amendment fixes validation order: 400 (format / regex / FR-040a flag-OFF rejection) is evaluated and returned BEFORE any uniqueness check; 400 wins over 409 deterministically. [Resolved, Spec §FR-034]
- [ ] CHK047 - Does the spec define the response body schema for all 409 paths consistently — every code includes `error`, `message`, and the relevant `existing_*_project_id` / `existing_*_project_slug` so the form rendering can rely on a uniform structure? [Consistency, Spec §FR-035 §FR-036 §FR-037]
- [ ] CHK048 - Is the contract that the form MUST key on the `error` code (not regex-parse `message`) stated as a producer obligation as well as a consumer obligation, so the API and UI agree on the contract? [Clarity, Spec §FR-041]
- [ ] CHK049 - Are the failure modes of the activity INSERT inside the transfer transaction specified (if the activity INSERT fails, the whole transaction rolls back including both UPDATEs)? [Completeness, Spec §FR-037]
- [ ] CHK050 - Is the constraint "transfer atomic in one `db.transaction(() => { ... })` block" written as observable behavior (no half-state visible to any reader) rather than implementation? [Measurability, Spec §FR-037 §FR-055]

## Atomic Owner Transfer

- [ ] CHK051 - Is the atomicity of the `transfer_owner=true` swap specified at the SQL level (one transaction wraps clear → set → activity) AND at the observable level (no reader sees zero owners or two owners)? [Completeness, Spec §FR-037 §FR-055]
- [ ] CHK052 - Does the spec state that a crash mid-transaction leaves the previous owner intact (NOT zero owners, NOT the new owner)? [Coverage, Spec §FR-037 §FR-055]
- [ ] CHK053 - Is the rollback path on activity-INSERT failure specified — the both UPDATE statements are reverted, ownership stays with the original owner, and no `sync_owner_transferred` row is committed? [Completeness, Spec §FR-037]
- [ ] CHK054 - Is the no-half-state guarantee written for ALL readers (poller, REST GET, SSE) rather than only one reader class? [Coverage, Spec §FR-055]
- [x] CHK055 - FR-055 case (c) requires a dedicated test injecting a process crash between FR-037's clear-statement and set-statement; after recovery the previous owner MUST still hold ownership and no `sync_owner_transferred` row exists. [Resolved, Spec §FR-055]

## Concurrent PUT Race On Different Projects In Same Group

- [ ] CHK056 - Does the spec define the race specifically — two operators calling `PUT /api/projects/[id]` with `is_repo_sync_owner=1` for DIFFERENT projects in the SAME `(workspace_id, github_repo)` group simultaneously? [Coverage, Spec §FR-037 §FR-055]
- [ ] CHK057 - Is the serialization mechanism named (the partial unique index `idx_projects_one_sync_owner_per_repo` under SQLite's writer-serialization / single-writer model)? [Clarity, Spec §FR-004 §FR-055]
- [ ] CHK058 - Does the spec state that the LOSER of the race receives a 409 Conflict with the standard `owner_conflict` body identifying the WINNING project as the new owner? [Completeness, Spec §FR-037 §FR-055]
- [x] CHK059 - FR-034 amendment forbids UNIQUE-violations leaking as 500 or generic database errors; the handler MUST translate UNIQUE-violations to the matching structured 409 (`area_slug_conflict`/`triage_conflict`/`owner_conflict`). [Resolved, Spec §FR-034]
- [x] CHK060 - FR-055 case (a) explicitly covers two simultaneous requests both with `transfer_owner=true` on different target projects in the same group; one wins, the other receives 409 with the winning project as the surfaced new owner. [Resolved, Spec §FR-055]
- [x] CHK061 - FR-055 case (b) covers one request with `transfer_owner=true` and one without; SQLite writer-serialization order determines who arrives first; whichever request reaches the writer second receives 409 deterministically. [Resolved, Spec §FR-055]
- [ ] CHK062 - Does the spec require a test that exactly one transfer succeeds, the loser receives 409, and at no point is `is_repo_sync_owner` observed by any read query as either zero owners or two owners? [Measurability, Spec §FR-055]
- [ ] CHK063 - Is the regression-safety property that the partial unique index serializes the race written as a non-negotiable invariant — i.e., removing the index would break this guarantee and is therefore forbidden by FR-004? [Consistency, Spec §FR-004 §FR-055]

## Cross-Cutting Error Handling Quality

- [x] CHK064 - FR-027b establishes a single uniform log shape (event/workspace_id/github_repo/error_message/error_class) shared across all four failure surfaces; ad-hoc per-surface log shapes are explicitly forbidden. [Resolved, Spec §FR-027b]
- [ ] CHK065 - Are the activity log writes for failures (`label_provisioning_failed`) protected by the same PII / token / Authorization-header sanitization rules as routing activities (FR-043a)? [Consistency, Spec §FR-027a §FR-043a]
- [x] CHK066 - FR-027b defines "logged" as `console.error` with a stable JSON payload matching the existing `src/lib/github-sync-engine.ts` log shape; production failure searches use one query path. [Resolved, Spec §FR-027b]
- [x] CHK067 - FR-027 amendment requires a default catch-all `UnknownError` boundary at the same per-label scope so a novel error type cannot escape `initializeLabels`; FR-027b's `error_class` enum includes `UnknownError`. [Resolved, Spec §FR-027 §FR-027b]
- [ ] CHK068 - For each error path covered by this checklist, is there an explicit spec sentence asserting "MUST NOT abort the larger sync run" so the no-cascade guarantee is testable end-to-end? [Completeness, Spec §FR-027 §FR-021 §SC-007]
- [ ] CHK069 - Is the relationship between flag-OFF behavior (FR-002) and error handling specified — do error paths produce zero `area_routing_*` or `label_provisioning_failed` activities when the flag is OFF? [Consistency, Spec §FR-002 vs §FR-027 §FR-042]
- [ ] CHK070 - Are the success criteria for error handling (SC-007 zero aborted runs, zero unhandled exceptions) measurable in CI — specifically, can a test runner observe both the run completion and the absence of an uncaught exception? [Measurability, Spec §SC-007]

## Requirement Quality Summary

Total items: 70
Coverage:
- initializeLabels per-label isolation: 8 items
- Throttled label_provisioning_failed activity: 12 items
- Backfill per-task failure isolation: 10 items
- Backfill completion marker and idempotency: 10 items
- PUT validation and no-partial-state: 10 items
- Atomic owner transfer: 5 items
- Concurrent PUT race serialization: 8 items
- Cross-cutting error handling quality: 7 items

Quality dimensions covered: Completeness, Clarity, Consistency, Measurability, Coverage, Edge Cases, Ambiguity, Gap.
