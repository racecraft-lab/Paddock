# UAT Runbook: 010b-product-line-b-smoke

| Field | Value |
|-------|-------|
| Spec | 010b-product-line-b-smoke |
| Branch | 010b-product-line-b-smoke |
| PR | **PR:** <set on PR open> |
| Generated from | 2026-06-05T04:39:14Z |



## Env Setup

Run these from the repository root before walking the acceptance tests.

| Command | Value |
|---------|-------|
| BUILD | `pnpm build` |
| TYPECHECK | `pnpm typecheck` |
| LINT | `pnpm lint` |
| LINT_FIX | _not available for this project_ |
| UNIT_TEST | `pnpm test` |
| INTEGRATION_TEST | `pnpm test:e2e` |
| SINGLE_FILE_INTEGRATION | _not available for this project_ |

## Per-Story Acceptance Tests

<a id="us-1"></a>
### User Story 1 - Preflight Without Mutation (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Seed Disabled Product Line B (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Enable, Smoke, And Disable (Priority: P2)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Prove Product Line A Isolation (Priority: P2)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-5"></a>
### User Story 5 - Preserve Evidence For Future Gardening (Priority: P3)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.



## FR Coverage Matrix

| Story | Acceptance test |
|-------|-----------------|
| [User Story 1 - Preflight Without Mutation (Priority: P1)](#us-1) | see the Per-Story Acceptance Tests block above |
| [User Story 2 - Seed Disabled Product Line B (Priority: P1)](#us-2) | see the Per-Story Acceptance Tests block above |
| [User Story 3 - Enable, Smoke, And Disable (Priority: P2)](#us-3) | see the Per-Story Acceptance Tests block above |
| [User Story 4 - Prove Product Line A Isolation (Priority: P2)](#us-4) | see the Per-Story Acceptance Tests block above |
| [User Story 5 - Preserve Evidence For Future Gardening (Priority: P3)](#us-5) | see the Per-Story Acceptance Tests block above |


## Negative-Path Tests


- Product Line B preflight detects existing `product-line-b` residue or conflicting `plb-platform` assignments; the workflow stops before mutation and reports the residue.
- Retained FocusEngine or OpenClaw identities are present; they remain retained inventory and are not reused unless a later spec explicitly generalizes and assigns them.
- Product Line B seed or smoke would change Product Line A ownership, task state, sync ownership, or metrics; the workflow stops and reports the isolation violation.
- A live GitHub write is unavailable or undesired; the required smoke remains valid with synthetic `racecraft-lab/Paddock` metadata.
- Product Line B remains enabled after smoke or cleanup fails; the workflow reports incomplete disablement and does not claim closeout.
- The implementation would require scheduler, runner, sandbox, harness-adapter, or auto-merge behavior; that work is rejected as out of scope for this spec.
- The operator cannot complete the manual smoke checklist in under one operator-hour; timing evidence records the miss and the PR review packet explains the cause.

## Self-Review Findings

1. **Tests executed?** Yes. The final post-gate run executed `direnv exec . pnpm build`, `direnv exec . pnpm typecheck`, `direnv exec . pnpm lint`, `direnv exec . pnpm test`, and `direnv exec . pnpm test:e2e` on 2026-06-06 after the code-review recovery fixes. Results: build/typecheck/lint passed, unit tests passed with 361 files and 3,391 tests, and Playwright E2E passed with 653 passed and 1 skipped.
2. **Edge cases?** No `[edge-case-gap]` remains. SC-001 preflight ready/residue/no-mutation paths are covered by `src/lib/__tests__/product-line-b-seed.test.ts`; SC-002 disabled seed/idempotent verify paths are covered by the same seed suite and HAL UAT; SC-003 synthetic issue and no-live-write paths are covered by `src/lib/__tests__/product-line-b-smoke.test.ts`; SC-004 Product Line A isolation and scoped API/dashboard paths are covered by smoke isolation tests; SC-005 final disablement/cleanup counters, missing schema proof surfaces, and malformed `feature_flags` syntax/object-shape paths are covered by smoke tests; SC-006 operator timing is recorded in the HAL checklist evidence; SC-007 packet traceability is recorded in this workflow and `specs/010b-product-line-b-smoke/verify-tasks-report.md`.
3. **Requirements matched?** FR-001-FR-003 map to T014-T017 and T001-T002; FR-004-FR-005 map to T018-T023 and T003; FR-006-FR-013 map to T024-T035 and T004-T006; FR-014-FR-015 map to T036-T047, this workflow evidence table, and the verify-tasks report. All 47 tasks are marked `[X]` and the post verify-tasks report found 47 VERIFIED, 0 PARTIAL, 0 WEAK, and 0 NOT_FOUND.
4. **Follow-up?** No `[TODO]`, `[DEFERRED]`, or `[OUT-OF-SCOPE]` markers were found in `spec.md`, `tasks.md`, or this workflow file. Deferred scope is explicitly listed below as non-goal work for future specs: scheduler/claim/retry authority, runner state, sandbox lifecycle, harness adapter implementation, runtime-inventory eligibility, auto-merge, live GitHub mutation as a required gate, retained-identity takeover, and broad dashboard redesign.

## Sign-off

Advisory only — these checkboxes block nothing.

- [ ] Reviewer walked every Per-Story Acceptance Test above.
- [ ] Reviewer confirmed the Negative-Path Tests behave as described.
- [ ] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
