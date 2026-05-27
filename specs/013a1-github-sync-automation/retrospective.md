---
feature: "SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle"
branch: "013a1-github-sync-automation"
date: "2026-05-23"
completion_rate: 100
spec_adherence: 100
requirements:
  functional: 49
  non_functional: 0
  success_criteria: 8
  total: 57
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
pr_blocked: true
pr_block_reason: "GitHub reviewDecision=REVIEW_REQUIRED; all listed checks/statuses are successful."
---

# Retrospective: SPEC-013A1

## Executive Summary

SPEC-013A1 completed all 72 planned tasks and implemented the requested default-off GitHub sync automation lifecycle without changing `spec.md`. The branch adds M77 lifecycle state, scheduler-owned automatic polling, scoped API controls, manual-sync overlap protection, cursor-safe failure and partial handling, shared-repository owner selection, sanitized diagnostics, and an operator-visible GitHub Sync panel section.

Spec adherence is 100% using the retrospective formula: `(57 implemented + 0 modified + 0 partial * 0.5) / (57 total - 0 unspecified) * 100`. Local UAT/integration evidence is green: `direnv exec . pnpm test:all` passed strict scope, lint, typecheck, 300 Vitest files, production build, and 651 Playwright tests. PR #60 is not UAT-blocked, but it remains PR-blocked by the required human approval gate.

## Proposed Spec Changes

No `spec.md` edits are proposed from this retrospective.

Report-only notes for future specs:

- Record an explicit "no external GitHub network UAT required" acceptance note when GitHub API behavior is verified through repository-owned mocks, route stubs, and sync seams rather than a live provider run.
- Tighten reviewability budget estimates for multi-surface lifecycle specs; the actual diff substantially exceeded the plan projection even though the split exception was ratified.

## Requirement Coverage Matrix

| Requirement IDs | Status | Evidence |
| --- | --- | --- |
| FR-001, FR-034 | Implemented | `FEATURE_GITHUB_SYNC_AUTOMATION` is registered through `resolveFlag` and remains independent from `FEATURE_AREA_LABEL_ROUTING` in `src/lib/feature-flags.ts`, `src/lib/github-sync-poller.ts`, and tests. |
| FR-002, FR-003, FR-027, FR-028 | Implemented | `PATCH /api/github/sync/control` handles scoped enable/disable, bounded interval/bounds updates, idempotent backoff reset, and operator auth in `src/app/api/github/sync/control/route.ts`. |
| FR-004, FR-005, FR-035 | Implemented | Scheduler-owned `github_sync_automation` registration and runtime tick execution are in `src/lib/scheduler.ts`; singleton poller remains legacy/test-compatible, not the product contract. |
| FR-006, FR-007, FR-008, FR-026 | Implemented | Manual `POST /api/github/sync` compatibility is preserved with same-scope 409 overlap handling, trigger-all conflict preflight, lease release, and independent non-overlapping scopes in `src/app/api/github/sync/route.ts`. |
| FR-009, FR-010, FR-024, FR-031, FR-032, FR-033 | Implemented | Automatic candidates are grouped by `(workspace_id, github_repo)`, owner selection is applied, non-owner/unresolved outcomes are terminal non-ingesting records, and duplicate ingestion tests pass. |
| FR-011, FR-012, FR-013, FR-019, FR-020 | Implemented | M77 separates lifecycle controls from run history and includes leases, run identity, scope, terminal result, cursor effect, counters, skipped ownership counts, and stale recovery. |
| FR-014, FR-015, FR-016, FR-017, FR-018, FR-041, FR-042, FR-043 | Implemented | Lifecycle and sync-engine tests cover success-only cursor advancement, bounded pages/issues/duration, malformed page handling, retry signal precedence, caps, and sanitized failure categories. |
| FR-021, FR-022, FR-036, FR-037, FR-038, FR-039, FR-040 | Implemented | Rollback-safe disablement, no forbidden authority, local activity/diagnostic/health evidence, and safe-field redaction are implemented and guarded by `guardrails:spec-013a1` plus redaction tests. |
| FR-023, FR-025, FR-029 | Implemented | `GET /api/github/sync` exposes `github_sync_lifecycle.v1` with scope, controls, active/last run, cursor, error, backoff, counters, skipped, and diagnostics. |
| FR-030, FR-044, FR-045, FR-046, FR-047, FR-048, FR-049 | Implemented | The GitHub Sync panel renders a distinct automatic lifecycle section, keeps manual sync separate, uses operator-readable state copy, avoids forbidden authority language, and exposes live status. |
| SC-001 | Implemented | Playwright journey enables scoped automation, observes scheduler state, disables it, and triggers manual fallback. |
| SC-002 | Implemented | Lifecycle and scheduler tests verify failed automatic/manual attempts preserve the prior last success cursor. |
| SC-003 | Implemented | Engine and UI/e2e tests verify page/issue/duration bounded partials and visible partial reasons. |
| SC-004 | Implemented | Ownership tests verify shared repositories poll only through the selected owner and avoid duplicate issue rows. |
| SC-005 | Implemented | Route and lifecycle tests verify one lease owner plus deterministic rejected/skipped overlap outcomes. |
| SC-006 | Implemented | Lifecycle tests verify stale lease recovery and recovery evidence without operator data repair. |
| SC-007 | Implemented | Control route, quickstart, rollback docs, and panel tests verify flag/control disabled states preserve manual sync. |
| SC-008 | Implemented | Component and Playwright tests verify automatic/manual separation, lifecycle states, sanitized diagnostics, and absence of forbidden authority copy. |

## Success Criteria Assessment

| Success Criterion | Result | Evidence |
| --- | --- | --- |
| SC-001 | Pass | `tests/e2e/spec-013a1-github-sync-automation.spec.ts` first journey plus full Playwright run. |
| SC-002 | Pass | `github-sync-lifecycle.test.ts`, `scheduler-github-sync-automation.test.ts`, and redaction/failure tests. |
| SC-003 | Pass | `github-sync-engine-lifecycle.test.ts`, `scheduler-github-sync-automation.test.ts`, panel tests, and e2e diagnostics journey. |
| SC-004 | Pass | `github-sync-lifecycle-ownership.test.ts`, `spec006-poller.test.ts`, API/UI tests, and shared-repository e2e coverage. |
| SC-005 | Pass | `src/app/api/github/sync/__tests__/route.test.ts` and lifecycle overlap tests. |
| SC-006 | Pass | Stale lease recovery tests and e2e stale recovery visibility. |
| SC-007 | Pass | Feature flag default-off tests, control disable tests, panel flag-disabled test, and rollback docs. |
| SC-008 | Pass | GitHub Sync panel component tests and Playwright forbidden-authority copy assertions. |

## Architecture Drift Table

| Planned Architecture | Implemented Architecture | Drift | Severity |
| --- | --- | --- | --- |
| Additive M77 lifecycle controls/runs with rollback SQL | Implemented in `src/lib/migrations.ts` and `docs/migrations/rollback-M77.sql` | None | Positive |
| Scheduler-owned automatic lifecycle, not external cron or process-wide singleton | Implemented through `github_sync_automation` scheduler task and scoped poller helpers | None | Positive |
| Existing manual sync remains fallback | Manual route success shapes preserved; leases and conflicts wrap only lifecycle safety | None | Positive |
| GitHub Sync API/UI surface owns lifecycle visibility | `GET /api/github/sync`, `PATCH /api/github/sync/control`, and `github-sync-panel.tsx` own controls/status | None | Positive |
| Reviewable LOC 700-1,200; 14-22 total files projected under warning accepted | Actual diff is 63 files and about 11,060 insertions / 510 deletions | Scale exceeded projection but was handled by ratified transition exception, review packet, and full verification | Significant |

## Significant Deviations

### SIGNIFICANT: Reviewability Scale Exceeded Plan Projection

- Evidence: `git diff --stat origin/main...HEAD` reports 63 files changed with about 11,060 insertions and 510 deletions, while `plan.md` projected 14-22 total files and 700-1,200 reviewable LOC.
- Impact: Raises human review cost and verification debt, even though the branch includes a ratified transition exception and review packet.
- Root cause: The implementation kept scheduler/runtime, API, UI, schema, docs, guardrails, and verification evidence in one safety boundary, matching the split decision but underestimating artifact/test volume.
- Prevention: Future lifecycle specs should split earlier or set a more realistic reviewability budget before task generation.

### MINOR: No Live External GitHub Network UAT

- Evidence: Review packet known gaps state that no external GitHub network UAT was run; behavior is covered through existing sync seams, mocks, and e2e route stubs.
- Impact: Does not block UAT/PR because the spec accepted a controlled GitHub issue source and local UAT passed, but live-provider confidence remains an operator rollout consideration.
- Prevention: Future specs should state whether live provider UAT is mandatory or explicitly out of scope.

## Innovations And Best Practices

- Durable lifecycle records became a reusable pattern for separating controls from run history while preserving operator-visible activity evidence.
- Retry signal precedence and redacted diagnostics provide a reusable boundary pattern for provider-facing lifecycle features.
- The forbidden-authority guard gives a concrete scope-control mechanism for specs that must not create task claim, dispatch, remediation, sandbox, auto-merge, or triage behavior.
- The review packet plus verify-tasks report created a clear reviewer path across a large multi-surface change.

## Constitution Compliance

| Principle | Result | Evidence |
| --- | --- | --- |
| I. Zero-Regression Contract | Pass | Flag defaults off; manual sync compatibility fields and fallback are preserved; `pnpm test:all` passed. |
| II. Install Compatibility Discipline | Pass | M77 is additive and rollback SQL is documented; no destructive migration. |
| IV. Test-First Development | Pass | Tasks and verify report show failing-test-first coverage across migration, lifecycle, API, scheduler, UI, and e2e surfaces. |
| V. Feature-Flag Resolution Discipline | Pass | New behavior uses `FEATURE_GITHUB_SYNC_AUTOMATION` through `resolveFlag` and defaults off. |
| VII. Additive Migration Policy | Pass | M77 adds tables/indexes only and ships `docs/migrations/rollback-M77.sql`. |
| X. Observability and Auditability | Pass | Lifecycle controls/runs, `github_syncs`, activity rows, API/UI status, and health summaries provide evidence. |
| XIII. Defensive Boundaries | Pass | GitHub failure categories, retry signals, malformed pages, and secret redaction are normalized before exposure. |
| XIV. Real UI Journey Quality Gate | Pass | Real Playwright SPEC-013A1 journeys passed and full e2e passed 651 tests. |
| XV. Spec Artifact Provenance And Archive Sweep | Pass | Archive sweep current-target exclusion and screenshot guard evidence are recorded. |
| XVI. Reviewability And Verification Debt Control | Pass with ratified exception | Final diff exceeded projections, but reviewability gate status is `exception`, `pass=true`, with transition exception documented. |

Constitution violations: None.

## Unspecified Implementations

None that change product behavior outside the spec boundary. Two supporting artifacts are process/verification additions rather than product scope creep:

- `scripts/spec-013a1/check-github-sync-scope.mjs` and `guardrails:spec-013a1` enforce the spec's forbidden-authority non-goals.
- `verify-tasks-report.md` and the review packet preserve implementation evidence for PR review and closeout.

## Task Execution Analysis

- Total tasks: 72
- Completed tasks: 72
- Completion rate: 100%
- Verified tasks report: 72 verified, 0 partial, 0 weak, 0 not found, 0 skipped
- Primary implementation phases completed in order: setup, foundation, US1, US2, US3, US4, polish
- Review remediation completed before retrospective: stale lifecycle completion clearing replacement leases and same-second manual run ID collisions were fixed and regression-tested.

## Lessons Learned And Recommendations

1. Keep lifecycle safety boundaries cohesive, but budget them as multi-surface transition work from the start.
2. Make live-provider UAT expectations explicit before implementation when local route stubs and sync seams are accepted evidence.
3. Preserve report artifacts such as verify-tasks and review packets for large specs; they materially reduce review ambiguity.
4. Continue pairing forbidden-authority guardrails with specs that must exclude future execution/control-plane surfaces.

## File Traceability Appendix

| Surface | Files |
| --- | --- |
| Migration/rollback | `src/lib/migrations.ts`, `docs/migrations/rollback-M77.sql`, `docs/runbook/migration-rollback.md` |
| Lifecycle state/API helpers | `src/lib/github-sync-lifecycle.ts`, `src/lib/github-sync-lifecycle-api.ts`, `src/lib/github-sync-lifecycle-types.ts` |
| Scheduler/poller/engine | `src/lib/scheduler.ts`, `src/lib/github-sync-poller.ts`, `src/lib/github-sync-engine.ts` |
| GitHub Sync API | `src/app/api/github/sync/route.ts`, `src/app/api/github/sync/control/route.ts`, `openapi.json`, `src/app/api/index/route.ts` |
| Operator UI | `src/components/panels/github-sync-panel.tsx`, `src/components/panels/__tests__/github-sync-panel.test.tsx`, `tests/e2e/spec-013a1-github-sync-automation.spec.ts` |
| Tests | `src/lib/__tests__/github-sync-lifecycle.test.ts`, `migrations-M77-github-sync-lifecycle.test.ts`, `github-sync-lifecycle-errors.test.ts`, `github-sync-lifecycle-redaction.test.ts`, `github-sync-lifecycle-ownership.test.ts`, `github-sync-engine-lifecycle.test.ts`, `scheduler-github-sync-automation.test.ts`, `spec006-poller.test.ts`, route/control tests |
| Scope/docs/evidence | `scripts/spec-013a1/check-github-sync-scope.mjs`, `package.json`, `tsconfig.spec-strict.json`, `eslint.config.mjs`, `docs/ai/specs/013a1-github-sync-automation-review-packet.md`, `specs/013a1-github-sync-automation/verify-tasks-report.md`, `tasks.md`, `quickstart.md` |

## Self-Assessment Checklist

- PASS: Evidence completeness - every major deviation includes concrete file/task/behavior evidence.
- PASS: Coverage integrity - all FR-001 through FR-049 and SC-001 through SC-008 are represented.
- PASS: Metrics sanity - completion and adherence formulas are applied directly from `tasks.md` and `spec.md`.
- PASS: Severity consistency - significant finding is reviewability scale drift; minor finding is live-provider UAT scope note.
- PASS: Constitution review - violations are explicitly listed as none.
- PASS: Human Gate readiness - no spec changes are proposed; no spec-modifying handoff is launched.
- PASS: Actionability - recommendations are tied to reviewability budgeting, live UAT scope, evidence reports, and forbidden-authority guards.
