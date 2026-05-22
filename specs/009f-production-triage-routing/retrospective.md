---
feature: 009f-production-triage-routing
branch: 009f-production-triage-routing
date: 2026-05-22
completion_rate: 100
spec_adherence: 100
requirements_total: 53
requirements_implemented: 53
critical_findings: 0
significant_findings: 0
---

# SPEC-009F Retrospective

## Executive Summary

SPEC-009F completed all 55 generated tasks and implemented the requested
production-visible, recommendation-only routing for the six supported
non-remediation Issue Triage outcomes. The implementation stayed inside the
core product boundary: no migration, runtime dependency, live GitHub mutation,
successor template, claim/runner/sandbox/adapter path, or auto-merge behavior
was added.

The main process deviation was reviewability size: the final PR exceeds the
generic one-surface budget, but the workflow records a ratified exception
because the behavior remains one terminal triage-routing evidence surface plus
the existing task Evidence extension. The extra footprint is SpecKit artifacts,
API parity, security payload tests, UAT fixtures, and guard tooling.

## Proposed Spec Changes

None. The implementation did not reveal a requirement mismatch that should be
patched into `spec.md` before merge.

## Requirement Coverage Matrix

| Area | Requirement IDs | Result | Evidence |
|---|---|---|---|
| Supported outcomes and recommendation-only boundary | FR-001..FR-003 | Implemented | `src/lib/triage-routing.ts`, `src/lib/task-dispatch.ts`, focused routing/dispatch tests |
| Existing evidence storage and idempotency | FR-004..FR-005, FR-023..FR-028 | Implemented | `publishArtifact()` routing path, supersession/idempotency tests |
| Lane payload contracts | FR-006..FR-013, FR-019..FR-022, FR-041 | Implemented | `src/lib/triage-routing-payloads.ts`, payload/security tests |
| Task Evidence API/UI | FR-014..FR-016, FR-029..FR-030, FR-040 | Implemented | `src/lib/task-evidence.ts`, `task-evidence-section.tsx`, OpenAPI parity |
| Rollout/source gates and specialist metadata | FR-017..FR-018, FR-031..FR-034 | Implemented | flag/source gating tests, specialist recommendation fixtures |
| UAT, cleanup, and guardrails | FR-035..FR-039 | Implemented | focused Playwright UAT, smoke checklist, scope guard |
| Measurable outcomes | SC-001..SC-012 | Implemented | focused and full verification matrix below |

## Success Criteria Assessment

All success criteria were met by local verification:

- Six supported outcomes route with no remediation successor.
- No external GitHub mutation, dispatch, spec setup, claim, runner, sandbox,
  adapter, or auto-merge behavior is introduced.
- Task Evidence exposes the current `Triage routing` summary and keeps
  non-allowlisted content inert.
- Same-outcome retries remain idempotent; changed-disposition retries fail
  visibly without terminal evidence for the attempted outcome.
- UAT fixture artifacts are generated under `test-results/` and disposable
  rows are cleaned with zero-count evidence.

## Architecture Drift

| Planned Constraint | Actual Implementation | Drift |
|---|---|---|
| Reuse existing task artifacts, dispositions, and activities | Reused existing storage and routed artifacts through `publishArtifact()` | None |
| No new route/API surface except Evidence extension | Extended existing task Evidence API shape and UI block | None |
| Recommendation-only, no live side effects | Scope guard and tests enforce no mutation/successor/runner/adapter drift | None |
| Keep implementation reviewable | Final diff exceeds generic budget but carries a workflow and PR exception | Documented exception |

## Significant Deviations

None.

## Innovations And Best Practices

- The post-review remediation moved routing artifacts fully behind
  `publishArtifact()`, preserving the repo-owned secret/redaction/size and
  supersession pipeline.
- The e2e UAT drives the production `/api/tasks` completion path through
  `advanceTaskChain()` instead of calling routing helpers directly.
- The SPEC-009F scope guard now protects against committed review artifacts
  and forbidden drift across GitHub mutation, successor creation, claim,
  runner, sandbox, adapter, and auto-merge paths.

## Constitution Compliance

No violations found.

- Test-first implementation was preserved with focused RED/GREEN coverage.
- Feature flag/source gating uses the existing pilot flag boundary.
- No migration or runtime dependency was introduced.
- Reviewability debt is explicitly recorded as an exception rather than hidden.
- Real UI journey evidence exists through focused Playwright UAT.

## Unspecified Implementations

None requiring a spec change. Reviewability bookkeeping and PR-body generation
are process artifacts required by the SpecKit Pro workflow, not product-scope
expansion.

## Task Execution Analysis

- Total tasks: 55
- Completed tasks: 55
- Completion rate: 100%
- PR: https://github.com/racecraft-lab/mission-control/pull/57
- Review remediation: no Copilot/human review comments existed when the
  retrospective ran; Copilot review waiting was skipped by operator direction
  because monthly quota is exhausted.

Verification completed under Node 22.22.2:

- Focused routing/dispatch tests: 41 passed
- Broader focused SPEC-009F tests: 84 passed
- `pnpm api:parity`: passed
- `node scripts/spec-009f/check-scope-guards.mjs`: passed
- Focused e2e UAT: 1 passed
- `pnpm build`: passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- Full `pnpm test`: 2,991 passed, 3 skipped, 84 todo
- Full `pnpm test:e2e`: 648 passed
- Reviewability diff gate: passed as exception

## Lessons Learned And Recommendations

1. Keep artifact-pipeline ownership explicit whenever a spec creates new
   artifact types. The safest path is to use the central publisher before any
   feature-specific storage shortcut exists.
2. For routing specs, e2e UAT should exercise the production state transition
   path, not only helper APIs.
3. Reviewability exceptions need final, branch-exact numbers after all status
   commits land; otherwise the PR packet drifts.
4. Roadmap and PRD hygiene should name the next unblocked spec before merge so
   post-merge status commands do not fall back to stale `autopilot-state.json`
   or memory.

## Self-Assessment Checklist

- Evidence completeness: PASS
- Coverage integrity: PASS
- Metrics sanity: PASS
- Severity consistency: PASS
- Constitution review: PASS
- Human Gate readiness: PASS; no spec edits proposed
- Actionability: PASS

## File Traceability Appendix

- Routing payloads and validation: `src/lib/triage-routing-payloads.ts`
- Routing publisher and idempotency: `src/lib/triage-routing.ts`
- Production dispatch hook: `src/lib/task-dispatch.ts`
- Evidence derivation: `src/lib/task-evidence.ts`
- Evidence UI: `src/components/panels/task-evidence-section.tsx`
- API contract: `openapi.json`
- Scope guard: `scripts/spec-009f/check-scope-guards.mjs`
- UAT fixture: `tests/e2e/spec-009f-triage-routing.spec.ts`
- UAT evidence ledger: `docs/qa/pilot-smoke-checklist.md`
- Workflow/state ledgers: `docs/ai/specs/SPEC-009F-workflow.md`,
  `docs/ai/specs/autopilot-state.json`
