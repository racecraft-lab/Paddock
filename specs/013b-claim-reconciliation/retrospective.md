---
feature: "SPEC-013B - Claim and Reconciliation Authority"
branch: "013b-claim-reconciliation"
date: "2026-05-27"
completion_rate: 100
spec_adherence: 100
requirements:
  functional: 20
  user_stories: 4
  acceptance_scenarios: 12
  success_criteria: 8
coverage:
  implemented: 57
  partial: 0
  modified: 0
  not_implemented: 0
  unspecified: 0
findings:
  critical: 0
  significant: 1
  minor: 1
  positive: 4
uat_blocked: false
pr_blocked: false
pr_block_reason: "PR #62 merged to main as 5e61d0ffc02f9345b265cd5420660d02bf693016 on 2026-05-27; HAL deployment promotion and post-merge HITL UAT are complete."
---

# Retrospective: SPEC-013B

## Executive Summary

SPEC-013B completed 57/57 tasks and implemented the requested claim and reconciliation authority for GitHub issue-linked `assigned` task stages. The implementation adds additive M78 claim persistence, pre-claim reconciliation, governance allow/block/defer handling, launch-critical-section claims, stale recovery, terminal/gated release, read-only evidence, and dispatch integration without adding runner, harness, sandbox, retry UI, auto-merge, triage, or successor-selection behavior.

Spec adherence is 100% by task verification: 57 verified, 0 partial, 0 weak, 0 not found, and 0 skipped. Local verification is green: focused SPEC-013B Vitest passed 4 files and 27 tests, and `direnv exec . pnpm test:all` passed strict-scope, lint, typecheck, 3167 Vitest tests, production build, and 651 Playwright tests. PR #62 merged to `main` as `5e61d0ffc02f9345b265cd5420660d02bf693016`; HAL deployment promotion and post-merge HITL UAT replay id `spec013b-hal-uat-2026-05-27T23-05-31-000Z` are complete.

## Proposed Spec Changes

No `spec.md` edits are proposed from this retrospective.

Report-only notes for future specs:

- Treat reviewability-gate false blocks as plugin defects when an accepted transition exception is present but the gate still reports `status=block`.
- Keep future control-plane specs explicit about which external source is authoritative for terminal tracker state before claim acquisition.

## Requirement Coverage Matrix

| Requirement / Area | Status | Evidence |
| --- | --- | --- |
| GitHub issue-linked `assigned` intake only | Implemented | `src/lib/task-claim-reconciliation.ts` and focused eligibility tests exclude local-only, repo-only, non-issue-linked, and non-assigned tasks. |
| One active claim per `(workspace_id, task_id, stage_key)` | Implemented | M78 table/index tests and claim tests cover active uniqueness, duplicate prevention, and SQLite constraint races. |
| Reconciliation before claim | Implemented | Claim tests cover terminal task state, terminal GitHub issue/PR state, stale truth, lifecycle readiness, and governance outcomes before active claim acquisition. |
| Dispatch launch-critical-section integration | Implemented | `src/lib/task-dispatch.ts` acquires before legacy `in_progress` mutation and releases on success or failure; dispatch integration tests cover duplicate prevention and boundary deferral. |
| Durable evidence and read-only inspection | Implemented | Activity writers, attempt lifecycle metadata, read model, route tests, OpenAPI/API index, quickstart, and verify-tasks report are present. |
| Non-goal preservation | Implemented | Static guards and tests confirm no runner, harness, sandbox, manual release/retry/cancel, auto-merge, triage, mutation route, or successor-selection surface was introduced. |

## Success Criteria Assessment

| Success Criterion | Result | Evidence |
| --- | --- | --- |
| Flag-off legacy behavior preserved | Pass | Dispatch tests cover flag-off path without claim side effects. |
| Concurrent ticks cannot both claim/launch | Pass | Claim and dispatch tests cover duplicate active claims and duplicate-prevented activity evidence. |
| Only eligible GitHub-linked assigned tasks enter intake | Pass | Eligibility tests cover assignment, repo, issue number, workspace owner, and local-only exclusion. |
| Reconciliation gates terminal/stale/governance state | Pass | Claim tests cover terminal task, GitHub issue/PR, stale truth, lifecycle readiness, and governance allow/block/defer. |
| Active claims release safely | Pass | Release compare-and-set, stale-owner safety, launch success/failure, and retry regression tests pass. |
| Evidence remains read-only and safe | Pass | Route side-effect row-count tests and metadata allowlist tests pass. |
| Successor authority remains existing code | Pass | Static import guards and dispatch tests keep `advanceTaskChain` outside the new claim authority. |
| Post-merge UAT replay is documented | Pass | HAL replay id `spec013b-hal-uat-2026-05-27T23-05-31-000Z` is recorded in `uat-report.md`, and PR #62 has landed on `main`. |

## Architecture Drift Table

| Planned Architecture | Implemented Architecture | Drift | Severity |
| --- | --- | --- | --- |
| Narrow claim/reconciliation module called by dispatch | Implemented in `src/lib/task-claim-reconciliation.ts` with `src/lib/task-dispatch.ts` integration | None | Positive |
| Additive claim persistence with rollback | M78 adds `task_stage_claims` and `tasks.github_issue_state`; rollback SQL exists | Minor expansion | Positive |
| SPEC-013A passive attempts remain evidence, not locks | Active authority lives in `task_stage_claims`; passive attempts are linked evidence | None | Positive |
| No runner/harness/retry/manual-control scope | Static guards, route tests, and implementation avoid these surfaces | None | Positive |
| Reviewability budget handled by transition exception | Full diff is larger than normal gate thresholds and passes only as an accepted transition exception | Expected drift | Significant |

## Significant Deviations

### SIGNIFICANT: Reviewability Scale Requires Transition Exception

- Evidence: patched reviewability gate reports `status=exception`, `pass=true`, 6560 reviewable LOC, 14 production files, 63 total files, and 6 primary surfaces.
- Impact: Human review cost is higher than a normal reviewability budget, but the branch includes focused tests, verify-tasks evidence, a PR review packet, and explicit scope boundaries.
- Root cause: SPEC-013B spans migration, dispatch runtime, GitHub truth projection, read-only API evidence, docs, and verification artifacts as one safety boundary.
- Prevention: Future control-plane slices should either split earlier or explicitly budget migration/runtime/API/docs evidence as a transition-sized review packet.

## Minor Findings

### MINOR: Doctor Extension Missing

- Evidence: the doctor post item was skipped because `.specify/scripts/bash/doctor.sh` is not present in this repository.
- Impact: Does not block PR #62 because focused verification, verify-tasks, cleanup, review, and full `pnpm test:all` evidence are present.
- Prevention: Install or restore the doctor extension if future autopilot runs must complete that item without a skip.

## Innovations And Best Practices

- Short launch-critical-section claims avoid turning SPEC-013B into long-running execution ownership.
- Closed outcome/release vocabularies make deferrals and releases auditable.
- The retry regression test protects against treating released passive failed attempts as permanent terminal suppressors.
- The plugin follow-up PR #95 captures the reviewability-gate false-block fix so future Codex autopilot runs do not stall on accepted exceptions.

## Constitution Compliance

| Principle | Result | Evidence |
| --- | --- | --- |
| I. Zero-Regression Contract | Pass | `FEATURE_TASK_CONTROL_PLANE=false` keeps legacy dispatch behavior. |
| IV. Test-First Development | Pass | Focused tests cover migration, claim model, reconciliation, dispatch, and read-only route behavior. |
| V. Feature-Flag Resolution Discipline | Pass | Runtime behavior uses feature-flag resolution rather than inline env gating. |
| VII. Additive Migration Policy | Pass | M78 is additive and rollback SQL is documented. |
| VIII. Successor Side-Effect Parity | Pass | `advanceTaskChain` remains the existing successor-selection authority. |
| X. Observability and Auditability | Pass | Activities, attempt evidence, read model, API route, quickstart, and verify report document claim outcomes. |
| XVI. Reviewability And Verification Debt Control | Pass with ratified exception | Reviewability gate passes as `exception`; PR body and workflow disclose the larger branch diff. |

Constitution violations: None.

## Task Execution Analysis

- Total tasks: 57
- Completed tasks: 57
- Completion rate: 100%
- Verify-tasks report: 57 verified, 0 partial, 0 weak, 0 not found, 0 skipped
- Post-implementation evidence: focused Vitest, typecheck, full `pnpm test:all`, code review, cleanup, reviewability gate, PR body generation, PR creation, and initial review-remediation inspection are recorded in the workflow.
- Open human gates: required PR review, pending CI/check completion, and post-merge HITL UAT.

## Lessons Learned And Recommendations

1. Preserve the claim authority as a short bounded lease and keep long-running execution ownership for later harness specs.
2. Keep GitHub terminal truth projection explicit in the data model so claim release does not depend on ad hoc API calls.
3. Treat reviewability tooling bugs as plugin work, not repository-specific workarounds; PR #95 records the fix.
4. Keep post-merge HITL UAT separate from local automated proof when the acceptance criterion requires target-environment concurrent replay.
