---
feature: SPEC-004 Task Pipeline Engine and Declarative Routing
branch: 004-task-pipeline-engine
date: 2026-05-01
completion_rate: 100
spec_adherence: 100
task_count: 88
completed_task_count: 88
proposed_spec_changes: 0
---

# Retrospective: SPEC-004 Task Pipeline Engine and Declarative Routing

## Executive Summary

SPEC-004 completed all 88 generated tasks and locally verified the implementation under the higher file-descriptor limit requested for final validation. The implementation stayed within the intended Phase 3 surface: task-chain runtime behavior over `workflow_templates`, constrained structured-output validation, safe declarative routing, shared task creation side effects, workflow-template chain fields, explicit retry recovery, M62 successor uniqueness, documentation, audit remediation, and guardrails.

No spec changes are proposed. The main implementation deviation was not product scope drift; it was post-implementation test compatibility work for legacy e2e workflow tests that still targeted unscoped `/api/workflows` while SPEC-004 intentionally made Product Line scoped workflow access the authoritative contract.

## Proposed Spec Changes

None.

## Requirement Coverage Matrix

| Requirement | Coverage |
|---|---|
| P3-AC1 through P3-AC3 | Covered by `advanceTaskChain`, output-schema validation, routing/fallback/termination behavior, and focused chain regression tests. |
| P3-AC4 and P3-AC4a | Covered by explicit `retry_chain_advancement`, failure/stall eligibility, drift/provenance checks, side-effect-free rejection behavior, and retry response/activity tests. |
| P3-AC5 through P3-AC7 | Covered by shared `createTask()`, migrated task creation callsites, exact chain activity reason codes, lineage behavior, and M62 uniqueness/rollback tests. |
| P3-AC8 | Covered by direct pinned runtime dependencies, audit remediation, CI guardrails, and passing `pnpm audit:high` with 0 high vulnerabilities. |
| P3-AC9 through P3-AC11 | Covered by constrained JSON Schema validation, safe routing evaluation, static guardrails, and `docs/orchestration.md` refresh. |
| P3-AC12 | Covered by workflow-template API/UI chain fields, query-parameter delete compatibility, Product Line scoped workflow e2e repairs, and full Playwright pass. |
| P3-AC6b | Covered by bounded `chain_retry` response tests and no full corrected-output/routing-trace leakage. |

## Success Criteria Assessment

All generated tasks are checked complete in `tasks.md`. Final local gates passed: `pnpm spec004:guardrails`, strict-scope TypeScript, `pnpm typecheck`, `pnpm lint`, `pnpm test` with 150 files / 1182 tests, `pnpm build`, focused Playwright 25/25, full `pnpm test:e2e` with 532/532 tests, SPEC-004 Storybook/Argos coverage for the workflow-template UI, and `pnpm audit:high` with 0 high vulnerabilities.

## Architecture Drift Table

| Area | Result | Evidence |
|---|---|---|
| SQL scope | No unexpected schema expansion | SPEC-004 adds only M62 successor uniqueness and rollback evidence. |
| Task templates | No new `task_templates` table | Runtime uses `workflow_templates` as required. |
| Downstream specs | No SPEC-005/SPEC-006/SPEC-007 behavior pulled forward | Guardrails check downstream terminology and scope drift. |
| Product Line scope | Intentional scoped workflow behavior | Legacy e2e helpers were updated to request a non-Facility Product Line workspace. |

## Significant Deviations

None requiring spec changes.

Operational deviations:

- The doctor extension initially reported stale root-level `templates/` and `memory/` false positives; the PR branch remediated the script to validate the actual `.specify` layout and exact agent command directories.
- Earlier sandbox runs were blocked by EMFILE/listener/socket restrictions. Final verification was rerun with `ulimit -n 8192`, which cleared the full gate set.

## Innovations and Best Practices

- The shared `createTask()` helper centralizes task creation side effects while preserving source-specific API, GitHub import, GitHub sync, recurring, and pipeline successor behavior.
- Static guardrails now protect SPEC-004 dependency pins, direct production task inserts, unsafe evaluator primitives, and downstream scope drift.
- Retry recovery records stable operator-readable and machine-readable provenance without leaking full corrected output or routing traces.

## Constitution Compliance

PASS. The work followed feature-flagged, additive, test-backed implementation, preserved single-workspace compatibility with flag-off behavior, and recorded evidence in the workflow ledger. No constitution update is recommended.

## Unspecified Implementations

None. The scoped e2e helper repair follows the already-specified Product Line workflow contract introduced by SPEC-004 and does not add product behavior.

## Task Execution Analysis

Completion rate: 88/88 tasks, 100%.

Spec adherence: 100%. No generated task remains open, and no acceptance criterion is intentionally deferred inside SPEC-004. The branch remains pending PR review/merge before roadmap status can move from In Progress to Complete.

## Lessons Learned and Recommendations

- Keep long-running autopilot post gates on the higher file-descriptor limit when local exec has previously hit EMFILE.
- Treat extension doctor failures as actionable after comparing them to canonical prerequisite scripts; stale extension root assumptions should be fixed in the doctor check rather than carried as permanent workflow exceptions.
- Product Line scoped e2e helpers should become the default for APIs that can operate in Facility aggregate or Product Line scope.
- Shared visual harness labels should stay platform/domain scoped; spec-specific labels belong only in spec-owned tests, fixtures, or traceability metadata.

## File Traceability Appendix

- Workflow ledger: `docs/ai/specs/SPEC-004-workflow.md`
- Live state: `docs/ai/specs/autopilot-state.json`
- Generated tasks: `specs/004-task-pipeline-engine/tasks.md`
- Roadmap evidence: `docs/ai/rc-factory-technical-roadmap.md`
- PRD status note: `docs/rc-factory-v1-prd.md`
- E2E compatibility repairs: `tests/helpers.ts`, `tests/workflows-crud.spec.ts`, `tests/injection-guard-endpoints.spec.ts`, `tests/delete-body.spec.ts`
- Visual coverage: `src/components/panels/orchestration-bar.spec-004.stories.tsx`, `scripts/verify-argos-storybook-metadata.mjs`, `.github/workflows/argos-storybook.yml`

## Self-Assessment Checklist

- Evidence completeness: PASS
- Coverage integrity: PASS
- Metrics sanity: PASS
- Severity consistency: PASS
- Constitution review: PASS
- Human Gate readiness: PASS
- Actionability: PASS
