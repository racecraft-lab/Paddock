# UAT Runbook: 013d-claim-control-operator-ux

| Field | Value |
|-------|-------|
| Spec | 013d-claim-control-operator-ux |
| Branch | 013d-claim-control-operator-ux |
| PR | **PR:** <set on PR open> |
| Generated from | 2026-05-30T16:36:57Z |



## Env Setup

Run these from the repository root before walking the acceptance tests.

| Command | Value |
|---------|-------|
| BUILD | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm build` |
| TYPECHECK | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck` |
| LINT | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint` |
| LINT_FIX | _not available for this project_ |
| UNIT_TEST | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test` |
| INTEGRATION_TEST | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:e2e` |
| SINGLE_FILE_INTEGRATION | _not available for this project_ |

## Per-Story Acceptance Tests

<a id="us-1"></a>
### User Story 1 - Inspect Claim-Control State (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Confirm And Submit Eligible Actions (Priority: P2)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Override Retry Backoff With Reason (Priority: P3)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Understand Read-Only Access (Priority: P4)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-5"></a>
### User Story 5 - Review Stable Visual States (Priority: P5)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.



## FR Coverage Matrix

| Story | Acceptance test |
|-------|-----------------|
| [User Story 1 - Inspect Claim-Control State (Priority: P1)](#us-1) | see the Per-Story Acceptance Tests block above |
| [User Story 2 - Confirm And Submit Eligible Actions (Priority: P2)](#us-2) | see the Per-Story Acceptance Tests block above |
| [User Story 3 - Override Retry Backoff With Reason (Priority: P3)](#us-3) | see the Per-Story Acceptance Tests block above |
| [User Story 4 - Understand Read-Only Access (Priority: P4)](#us-4) | see the Per-Story Acceptance Tests block above |
| [User Story 5 - Review Stable Visual States (Priority: P5)](#us-5) | see the Per-Story Acceptance Tests block above |


## Negative-Path Tests


- The claim-control read model is absent for a task that otherwise has evidence and run-state data.
- The backend returns feature-flag-disabled state with an explicit reason.
- The operator opens a task with stale claim-control data and the backend rejects the mutation because expected state no longer matches.
- A network failure happens after the operator confirms a mutation but before the client receives a response, leaving one same-submission retry path available.
- The same failed network submission is retried immediately and must reuse the in-flight idempotency key and identical request body.
- A subsequent operator decision, changed request body, changed expected state, task change, close, cancel, or completed response must clear the prior idempotency key.
- The backend returns an idempotent replay instead of performing a second mutation.
- The operator enters an overlong, empty, or otherwise invalid cancel or backoff override reason.
- The backend returns sanitized error categories without raw request, diagnostics, prompt, transcript, provider, token, auth header, or GitHub body content.
- Refresh after mutation succeeds for some task-detail surfaces before others.

## Self-Review Findings

**Completed**: 2026-05-31
1. **Tests executed?** Yes. This session actually ran and exited zero for build, typecheck, lint, unit tests, and integration tests: `pnpm build`, `pnpm typecheck`, `pnpm lint`, focused Vitest 14 tests, focused local Playwright 2 tests, Docker-backed Playwright 2 tests, full `pnpm test` 312 files / 3239 tests, targeted `tests/login-flow.spec.ts` 5 tests, and full `pnpm test:e2e` 653 tests. The latest command evidence is recorded in the Phase 7 evidence and Post Integration Suite rows above.
2. **Edge cases?** No `[edge-case-gap]` findings. Non-happy-path coverage is present for absent/flag-off/loading/error states (`src/components/panels/__tests__/claim-control-section.test.tsx:289`), sanitized backend error categories without raw diagnostic fields (`src/components/panels/__tests__/claim-control-section.test.tsx:356`), stale expected-state conflict (`tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1096`), viewer/read-only auth failure (`src/components/panels/__tests__/claim-control-section.test.tsx:536`, `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1115`), active backoff and override reason (`src/components/panels/__tests__/claim-control-section.test.tsx:455`, `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1091`), same-submission idempotency cleanup (`src/components/panels/__tests__/claim-control-section.test.tsx:404`), raw key/request redaction (`src/components/panels/__tests__/claim-control-section.test.tsx:497`, `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1013`), fixture cleanup and feature-flag restoration (`tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1133`, `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts:1153`), and Storybook visual variants (`src/components/panels/claim-control-section.stories.tsx:103`, `src/components/panels/claim-control-section.stories.tsx:119`, `src/components/panels/claim-control-section.stories.tsx:133`, `src/components/panels/claim-control-section.stories.tsx:155`, `src/components/panels/claim-control-section.stories.tsx:178`, `src/components/panels/claim-control-section.stories.tsx:187`, `src/components/panels/claim-control-section.stories.tsx:194`).
3. **Requirements matched?** No orphan FRs or completed tasks found. FR-001 through FR-008 trace to completed US1 tasks T011-T022; FR-009 through FR-019 trace to completed US2/US3/US4 tasks T023-T050; FR-020 and FR-021 trace to completed static scope guard task T064; FR-022 and FR-025 trace to completed browser/fixture/evidence tasks T052-T063 and T072; FR-023 traces to Storybook tasks T051, T057, and T060; FR-024 traces to component accessibility/status/alert and viewer tasks T023-T029 and T045-T050. All T001-T072 are `[X]` in `tasks.md`; implementation evidence is committed in `3e30d9c7`; PR metadata may add a later closeout commit.
4. **Follow-up?** No `[TODO]`, `[DEFERRED]`, or `[OUT-OF-SCOPE]` markers were found in `spec.md`, `plan.md`, or `tasks.md`. The remaining UAT runbook, PR body, PR creation, review remediation, and retrospective items are tracked as explicit Post items below.
---

## Sign-off

Advisory only — these checkboxes block nothing.

- [ ] Reviewer walked every Per-Story Acceptance Test above.
- [ ] Reviewer confirmed the Negative-Path Tests behave as described.
- [ ] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
