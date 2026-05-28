---
feature: SPEC-014A - Sandbox Ownership and Lifecycle Contract
branch: 014a-sandbox-lifecycle-contract
date: 2026-05-28
completion_rate: 100
spec_adherence: 100
requirements:
  functional: 40
  nonfunctional: 0
  success_criteria: 10
  implemented: 50
  partial: 0
  modified: 0
  not_implemented: 0
  unspecified: 2
findings:
  critical: 0
  significant: 0
  minor: 2
  positive: 2
---

# Retrospective: SPEC-014A - Sandbox Ownership and Lifecycle Contract

## Executive Summary

SPEC-014A implemented the requested sandbox ownership and lifecycle contract with full task completion and no critical or significant spec drift. The implementation adds M79 lifecycle/event persistence, a bounded sandbox key/path helper, feature-flagged fake owners, cleanup/rollback evidence, and the read-only `sandbox_lifecycle.v1` task route while keeping real harness execution, UI controls, adapter manifests, retry/debug controls, successor selection, governance changes, token accounting, and auto-merge out of scope.

Spec adherence is 100% by the retrospective formula:

```text
((IMPLEMENTED + MODIFIED + (PARTIAL * 0.5)) / (Total Requirements - UNSPECIFIED)) * 100
= ((50 + 0 + (0 * 0.5)) / (50 - 0)) * 100
= 100%
```

Task completion is 58/58 tasks, or 100%.

## Proposed Spec Changes

None. No `spec.md` edits are recommended by this retrospective.

The only observed deltas are implementation/process refinements already captured in `tasks.md`, `workflow.md`, or code evidence:

- Strict subproject coverage was narrowed to strict-compatible helper/test files while the route implementation and M79 migration test remain covered by normal app typecheck, ESLint, and Vitest.
- Verification needed the repo-pinned Node 22 runtime for `better-sqlite3`; direct Node 26 execution was not a valid verification environment.

## Requirement Coverage Matrix

| Requirement range | Status | Evidence |
|---|---|---|
| FR-001..FR-002 lifecycle/event persistence | Implemented | `src/lib/migrations.ts` adds `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`; `src/lib/__tests__/migrations-M79-agent-sandbox-lifecycles.test.ts` verifies columns, constraints, indexes, rerun, and rollback. |
| FR-003..FR-006 owner enum and deterministic key | Implemented | `src/lib/agent-sandbox-lifecycle.ts` exports closed owner/status vocabularies and `buildSandboxKey`; helper tests cover valid owners, invalid owners, and key shape. |
| FR-007..FR-011 bounded roots and safe path evidence | Implemented | `resolveSandboxRoot`, segment validation, safe metadata allowlisting, and tests reject traversal, absolute paths, reserved/unsafe segments, raw payloads, tokens, and host paths. |
| FR-012..FR-018 lifecycle hooks, statuses, links, and claim boundary | Implemented | Hook functions cover create, prepare, running, terminal, cleanup, rollback, optional attempt/claim links, and do not call claim authority helpers. |
| FR-019..FR-026 duplicate create, conflict, cleanup, rollback, retention | Implemented | Transactional create/reuse/conflict behavior, `create_reused`, cleanup failure, stale `cleanup_pending`, rollback, and durable row retention are covered in lifecycle tests. |
| FR-027..FR-032 flag-off behavior and fake owners | Implemented | `FEATURE_AGENT_RUNNER_SANDBOXES` is default-off in `src/lib/feature-flags.ts`; mutation paths resolve through `resolveFlag`; tests prove no rows/events/artifacts and no real harness launch. |
| FR-033..FR-036 read API and documentation parity | Implemented | `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts`, `src/app/api/index/route.ts`, `openapi.json`, and route tests cover viewer auth, workspace/task scope, filtering, disabled evidence, no-write GET behavior, API index, and OpenAPI parity. |
| FR-037 manual UAT | Implemented | Workflow post-gate evidence records enabled fake lifecycle, cleanup, flag-off mutation block, and disabled-state read evidence through disposable in-memory fake lifecycle and route tests. |
| FR-038..FR-039 scope deferral and SPEC-014B handoff | Implemented | Scope guard tests cover UI, adapters, real launch, retry/debug, successor, governance, token, and auto-merge exclusions; roadmap preserves SPEC-014B as first runtime-inventory integration. |
| FR-040 structured boundary failures | Implemented | Validation and lifecycle errors return structured reason codes and safe metadata; tests cover unsafe metadata and route error responses. |

## Success Criteria Assessment

| Success criterion | Status | Evidence |
|---|---|---|
| SC-001 deterministic fake lifecycle keys | Met | Fake-owner tests run all three owners and verify key shape. |
| SC-002 adversarial path corpus fails closed | Met | Path/key tests cover traversal, absolute syntax, reserved names, unsafe Unicode/control-style input, overlong values, duplicate normalization, and root escape. |
| SC-003 flag-OFF mutations create zero rows/events | Met | Flag-off tests cover create, prepare, running, terminal, cleanup, rollback, fake artifacts, and read evidence. |
| SC-004 read responses omit unsafe payloads | Met | Read-model tests assert no host paths, tokens, raw provider/session payloads, or raw path fragments. |
| SC-005 duplicate matching create appends reuse event | Met | Duplicate create tests assert same lifecycle and one `create_reused` event per retry. |
| SC-006 conflicting duplicate create fails closed | Met | Tests cover owner, root, path projection, and normalized-key conflicts without mutating existing evidence. |
| SC-007 cleanup/rollback removes fake artifacts and keeps rows | Met | Cleanup and rollback tests verify artifact removal with durable lifecycle/event rows. |
| SC-008 cleanup failure is inspectable | Met | Cleanup failure tests verify `cleanup_failed` plus safe reason metadata. |
| SC-009 API index/OpenAPI coverage | Met | Route tests assert `/api/tasks/{id}/sandbox-lifecycles` in OpenAPI and `/api/tasks/:id/sandbox-lifecycles` in API index. |
| SC-010 manual UAT | Met | Workflow records disposable enabled lifecycle, read inspection, cleanup, flag-off mutation block, and disabled read evidence. |

## Architecture Drift Table

| Planned element | Implemented outcome | Drift |
|---|---|---|
| Additive M79 lifecycle/event schema plus rollback | Implemented in `src/lib/migrations.ts`; rollback in `docs/migrations/rollback-M79.sql` and procedure docs | None |
| One narrow lifecycle helper | Implemented as `src/lib/agent-sandbox-lifecycle.ts` | None |
| Production fake owners only | Implemented in helper; static tests guard against real harness imports/calls | None |
| Task-authorized read-only API | Implemented at `GET /api/tasks/[id]/sandbox-lifecycles` | None |
| Strict scope entries for new modules | ESLint covers route/helper/tests; `tsconfig.spec-strict.json` covers strict-compatible helper and tests, excluding route implementation and M79 migration test due legacy imports | Minor planned-to-task refinement |
| No UI, registry, real execution, retry/debug, successor, governance, token, or auto-merge behavior | Scope guard tests and diff review keep these absent | None |

## Significant Deviations

None.

## Minor Findings

### MINOR-001: Strict-scope implementation was narrower than early plan wording

The plan expected the route/helper/focused tests to enter strict scope. The final task plan narrowed TypeScript strict-subproject inclusion to the strict-compatible helper, fixture, helper test, and route test, while keeping the route implementation and M79 migration test under normal app typecheck/Vitest because they import legacy auth/db/migration surfaces outside the strict subproject boundary.

Evidence:

- `tasks.md` T002 records the exception.
- `tsconfig.spec-strict.json` includes `src/lib/agent-sandbox-lifecycle.ts`, fixtures, helper tests, and route tests.
- `eslint.config.mjs` includes route, migration test, helper, and tests.
- `pnpm check:strict-scope`, `pnpm typecheck`, `pnpm lint`, and focused Vitest passed per workflow evidence.

Impact: Low. This is a verification-scope refinement, not a runtime behavior gap.

### MINOR-002: Verification environment required repo-pinned Node 22

The verify-tasks report records a blocked direct Vitest run under Node 26 because `better-sqlite3` did not match that runtime. Rebuilding and running through `direnv exec .` under Node v22.22.2 passed.

Impact: Low. The repo prerequisite is Node >=22 and the project notes recommend Node 22 LTS; the successful verification environment matches the supported runtime.

## Innovations And Best Practices

### POSITIVE-001: Extra sandbox-key event-order index

The implementation adds `idx_agent_sandbox_lifecycle_events_sandbox_order` in addition to the required lifecycle-order and task-order indexes. This is a bounded read-performance improvement for sandbox-key lookups and does not expand product behavior.

Reusability potential: Medium for SPEC-014B runtime inventory reads if sandbox-key-specific evidence views are needed.

Constitution candidate: No. It is an implementation detail, not a new principle.

### POSITIVE-002: Static forbidden-scope guard

The lifecycle helper tests include a static guard against importing/calling UI, adapter manifests, real launch code, retry/debug controls, successor behavior, governance changes, token accounting, and auto-merge surfaces. This makes the non-goal boundary executable.

Reusability potential: High for future adapter specs with hard non-goal boundaries.

Constitution candidate: Possible as a reviewability convention pattern, but not required for this spec.

## Constitution Compliance

| Article | Result | Evidence |
|---|---|---|
| I. Zero-Regression Contract | PASS | Feature flag defaults OFF; disabled mutations insert no rows/events and touch no artifacts. |
| II. Install Compatibility And Operational Impact Discipline | PASS | Additive tables, new helper/API files, no destructive migration. |
| III. OpenClaw Adapter Isolation | PASS | OpenClaw is represented only as a fake owner enum; no optional adapter launch or host dependency was added. |
| IV. Test-First Development | PASS | Tasks were TDD-ordered; focused tests, full Vitest, typecheck, lint, build, and API parity passed. |
| V. Feature-Flag Resolution Discipline | PASS | Runtime gating uses `resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', ctx)`; flag registry defaults OFF. |
| VI. Dependency Supply-Chain Hygiene | PASS | No new runtime dependency for SPEC-014A. |
| VII. Additive Migration Policy | PASS | M79 is additive and has rollback SQL plus rollback-procedure documentation. |
| VIII. Successor Side-Effect Parity | PASS | Scope guard prevents `createTask`, `advanceTaskChain`, and successor behavior. |
| IX. Safe Evaluation Discipline | PASS | No evaluator or dynamic execution path was added. |
| X. Observability and Auditability | PASS | Lifecycle events are append-only durable evidence and safe reason metadata is preserved. |
| XI. Keep It Simple | PASS | One helper owns lifecycle/key/path/read-model behavior; route remains read-only. |
| XII. Avoid Speculative Generality | PASS | Runtime inventory UI, adapter registry, real harness behavior, retry controls, and reapers are deferred. |
| XIII. Defensive Boundaries | PASS | Path, metadata, owner, lifecycle, and route errors are structured and fail closed without unsafe payload leakage. |
| XIV. Real UI Journey Quality Gate | N/A | No UI/browser journey changed; e2e was recorded N/A with server-only equivalent verification. |
| XV. Spec Artifact Provenance And Archive Sweep | PASS | Workflow records archive sweep dry-run and excludes cleanup from this feature branch. |
| XVI. Reviewability And Verification Debt Control | PASS | Reviewability diff gate passed with ratified lifecycle-safety exception; PR packet records scope, evidence, rollback, and flag behavior. |

Constitution violations: None.

## Unspecified Implementations

| Item | Classification | Evidence | Risk |
|---|---|---|---|
| `idx_agent_sandbox_lifecycle_events_sandbox_order` | Positive | Additional index in M79 migration | Low; additive and bounded |
| Doctor skill wrapper fallback note | Minor process finding | Workflow notes generated Codex doctor wrapper still points to stale script path, while installed extension script passed | Low; not SPEC-014A runtime behavior |

## Task Execution Analysis

| Phase | Result |
|---|---|
| Setup | T001-T005 complete; strict config, lint scope, fixtures, and rollback placeholder landed. |
| Foundational | T006-T011 complete; M79 schema, event table, rollback SQL, and feature flag registry verified. |
| US1 | T012-T018 complete; owners, statuses, key shape, fake owners, and no-real-launch proof landed. |
| US2 | T019-T025 complete; flag-off no-row/no-event/no-artifact behavior and disabled read evidence landed. |
| US3 | T026-T032 complete; bounded path, key, metadata, and collision validation landed. |
| US4 | T033-T039 complete; duplicate create, conflict, rollback, cleanup success/failure, stale pending, and durable retention landed. |
| US5 | T040-T046 complete; read model, route, auth/scope, no-write GET, API index, and OpenAPI parity landed. |
| Polish | T047-T058 complete; scope guard, quickstart, rollback docs, focused tests, typecheck, lint, build, full tests, API parity, and UAT evidence landed. |

Completion rate: 58/58 = 100%.

## Verification And Post-Gate Evidence

Latest workflow evidence records:

- Focused SPEC-014A Vitest: 34 passed tests.
- Feature flag and migration guard tests: 44 passed tests.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm api:parity`: pass.
- `pnpm build`: pass outside the Codex sandbox after sandbox worker-resource failure.
- Full `pnpm test`: 307 passed files, 3201 passed tests, 33 skipped files, 3 skipped tests, 84 todo tests.
- `$speckit-verify-tasks-run`: 11/11 checked tasks verified, 0 flagged items.
- `$speckit-review-run`: prior cleanup, path-validation, and OpenAPI findings cleared.
- `$speckit-cleanup-run`: 58 completed tasks inspected, 0 edits, 0 critical or small auto-fix findings.
- Reviewability diff gate: pass with ratified exception.
- PR: https://github.com/racecraft-lab/mission-control/pull/64.
- PR review state at creation: 0 review comments and 0 reviews; GitHub checks pending.

## Lessons Learned And Recommendations

1. Keep lifecycle-safety specs server-only until adapter/UI consumers exist. The SPEC-014A split held because helper, schema, fake owners, and read API form one reviewable boundary.
2. Preserve static non-goal guards for future SPEC-014B-D work. They make scope drift cheap to detect.
3. Run native-module verification under the repo-pinned runtime first. Node 26 introduced noise that `direnv exec .` with Node 22 avoided.
4. Track the stale generated doctor wrapper path outside SPEC-014A if it keeps recurring. The installed extension path passed, so this is tooling hygiene rather than a feature blocker.

## File Traceability Appendix

| File | Role |
|---|---|
| `src/lib/migrations.ts` | M79 lifecycle/event schema and indexes. |
| `docs/migrations/rollback-M79.sql` | Manual rollback for M79. |
| `docs/migrations/rollback-procedure.md` | Operator rollback procedure entry. |
| `src/lib/feature-flags.ts` | `FEATURE_AGENT_RUNNER_SANDBOXES` registry/default. |
| `src/lib/agent-sandbox-lifecycle.ts` | Owner/status vocabulary, key/path validation, lifecycle mutations, fake owners, read model, safe metadata. |
| `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts` | Viewer-authenticated, workspace/task-scoped read-only route. |
| `src/app/api/index/route.ts` | API index registration. |
| `openapi.json` | OpenAPI path and response schema for `sandbox_lifecycle.v1`. |
| `src/lib/__tests__/migrations-M79-agent-sandbox-lifecycles.test.ts` | Schema, index, rerun, and rollback coverage. |
| `src/lib/__tests__/agent-sandbox-lifecycle.test.ts` | Helper, fake owner, path, metadata, flag, cleanup, rollback, read-model, and scope guard coverage. |
| `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts` | Route auth/scope/filter/no-write/API parity coverage. |
| `tsconfig.spec-strict.json` | Strict-compatible SPEC-014A helper/test scope. |
| `eslint.config.mjs` | New SPEC-014A module lint scope. |
| `specs/014a-sandbox-lifecycle-contract/quickstart.md` | Focused commands and manual UAT procedure. |
| `specs/014a-sandbox-lifecycle-contract/verify-tasks-report.md` | Post-implementation phantom-task verification report. |
| `docs/ai/specs/SPEC-014A-workflow.md` | Workflow, verification, PR, review, and post-gate evidence. |

## Self-Assessment Checklist

- PASS: Evidence completeness. Major deviations and process notes include file/task/workflow evidence.
- PASS: Coverage integrity. All FR-001..FR-040 and SC-001..SC-010 are covered.
- PASS: Metrics sanity. Completion and adherence formulas are applied against 58 tasks and 50 requirements.
- PASS: Severity consistency. No critical/significant runtime deviations; minor findings are process or verification-scope refinements.
- PASS: Constitution review. All applicable articles are assessed and no violations are listed.
- PASS: Human Gate readiness. No spec changes are proposed, so no spec-modifying action is pending.
- PASS: Actionability. Recommendations are specific and tied to observed evidence.
