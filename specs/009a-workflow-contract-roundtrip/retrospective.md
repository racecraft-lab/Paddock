---
feature: 009a-workflow-contract-roundtrip
branch: 009a-workflow-contract-roundtrip
date: 2026-05-06
completion_rate: 100
spec_adherence: 100
counts:
  total_requirements: 60
  fr: 52
  nfr: 0
  sc: 8
  implemented: 60
  partial: 0
  modified: 0
  not_implemented: 0
  unspecified: 0
  critical_findings: 0
  significant_findings: 0
  minor_findings: 2
  positive_findings: 3
status: implementation-complete-pr-open
pr: https://github.com/racecraft-lab/mission-control/pull/28
---

# SPEC-009A Retrospective: Workflow Contract Format and Roundtrip

## Executive Summary

SPEC-009A reached implementation-complete status on branch
`009a-workflow-contract-roundtrip` with 65/65 tasks complete and all 60
trackable requirements implemented. The slice stayed inside the intended
process-only boundary: it adds repo-owned workflow contract files,
operator-run import/apply/export/recover tooling, generic diagnostics, and
read-only UI/API inspection without starting product-line seed, GitHub sync,
dispatch, runner, harness, sandbox lifecycle, or governance-evaluator work.

Post-implementation review found one real ownership issue before PR handoff:
same-workspace templates absent from the current contract could have been
treated as contract-disabled/exportable even when they were unrelated. The
fix scopes disable/export/snapshot/recovery to explicit contract slugs or
`created_by = 'workflow-contract'` rows and adds legacy-snapshot regression
coverage.

Draft PR #28 is open. Automated checks passed except the manual
`visual-review-approval` status, which remains an operator approval gate. Two
visual-report bot comments note that no previous target artifact existed, so
the current Storybook and Playwright artifacts become the next baseline.

## Proposed Spec Changes

None recommended. The implementation matches the final spec and plan. No
`spec.md` edits are proposed, so no human gate for spec modification is
required.

## Requirement Coverage Matrix

Spec adherence formula:

```text
((IMPLEMENTED + MODIFIED + (PARTIAL * 0.5)) / (Total Requirements - UNSPECIFIED)) * 100
((60 + 0 + (0 * 0.5)) / (60 - 0)) * 100 = 100%
```

| Requirement set | Status | Evidence |
|---|---|---|
| FR-001..FR-004 canonical source, Markdown review boundary, YAML block prompts, typed canonical model | Implemented | `docs/ai/workflows/mission-control/workflow-contract.yaml`, `src/lib/workflow-contracts/types.ts`, `yaml-loader.ts`, `exporter.ts`; YAML loader/exporter/hash tests |
| FR-005..FR-015 validation model, allowed variables, tracker/capability/adapter/flag/governance/concurrency/retry/sandbox/prompt/hash validation | Implemented | `schema.ts`, `validator.ts`, `hash.ts`; validator/hash/guardrail tests |
| FR-016..FR-023 dry-run/apply, owned mutation boundary, transactionality, fail-closed behavior, last-known-good recovery | Implemented | `importer.ts`, `recovery.ts`, `diagnostics.ts`; importer/recovery/CLI tests; CLI import/apply/recover evidence |
| FR-024..FR-030 deterministic export, parity hashes, diagnostics UI/API, behavior preservation, strict process-only boundary | Implemented | `exporter.ts`, diagnostics route/UI, OpenAPI/API-index updates, Playwright diagnostics test, guardrail grep |
| FR-031..FR-038 exact direct YAML dependency, AJV reuse, YAML safety rules, prompt line endings, default dry-run, deterministic exit codes | Implemented | `package.json`, `pnpm-lock.yaml`, `yaml-loader.ts`, `schema.ts`, CLI parser/tests |
| FR-039..FR-045 full diff before mutation, workspace+slug identity, canonical/routing/output-schema hashes, default export path, deterministic recovery command, dry-run recovery | Implemented | `importer.ts`, `hash.ts`, `exporter.ts`, `recovery.ts`, generated Markdown export; focused Vitest and CLI evidence |
| FR-046..FR-052 generic diagnostics schema, M71/rollback-M71, read-only UI, no downstream evaluator/dispatch/sync calls, stable redacted errors | Implemented | M71 migration, rollback SQL, diagnostics route/UI, `errors.ts`, guardrails, OpenAPI parity |
| SC-001 invalid fixtures rejected before mutation | Met | Validator/importer/CLI tests and fail-closed fixture coverage |
| SC-002 dry-run reports create/update/disable/no-op without mutation | Met | Importer tests and dry-run CLI evidence |
| SC-003 apply preserves unrelated workflow templates | Met | Review remediation tests for same-workspace manual rows and legacy snapshots |
| SC-004 unchanged contract parity across repeated runs | Met | Hash/import/export tests and stable contract hash evidence |
| SC-005 deterministic Markdown ordering/hash output | Met | Exporter tests and generated export evidence |
| SC-006 last-known-good survives failed reload/import | Met | Recovery tests and recover dry-run evidence |
| SC-007 diagnostics show validation outcome, diffs, paths, counts, hashes, recovery state | Met | Diagnostics route/UI tests and focused Playwright diagnostic journey |
| SC-008 zero pilot/dispatch/runner/sandbox/auto-merge/self-hosting actions | Met | Guardrail tests and final grep over SPEC-009A paths |

## Success Criteria Assessment

All eight success criteria are met. The highest-risk criteria were SC-003 and
SC-008. SC-003 was strengthened during review by adding contract ownership
filtering for disable/export/snapshot/recovery and tests for unrelated
same-workspace templates. SC-008 was verified by both static guardrail tests
and a final grep over SPEC-009A-owned paths.

## Architecture Drift

| Plan of record | As built | Drift |
|---|---|---|
| Cohesive `src/lib/workflow-contracts/` boundary | Implemented as planned with parser, schema, hash, diff, import, export, diagnostics, recovery, and errors modules | None |
| Additive diagnostics schema at M71 with rollback | Implemented as M71 after resolving the existing M70 collision during Analyze | None; documented rebase |
| CLI under `scripts/workflow-contracts/` using Node type stripping | Implemented; CLI uses a minimal direct SQLite bootstrap instead of importing app `db.ts` because Node type stripping cannot resolve app extensionless ESM imports reliably | Minor implementation detail, no behavior drift |
| Read-only Workflows diagnostics surface | Implemented inside `orchestration-bar.tsx` with no apply/edit/dispatch/governance controls | None |
| Governance/concurrency/retry/sandbox as inert data | Implemented and covered by validation/guardrail tests | None |

## Significant Deviations

None. No requirement was dropped, partially implemented, or re-scoped outside
the final spec.

## Minor Findings

1. The CLI emits Node `MODULE_TYPELESS_PACKAGE_JSON` warnings when run through
   `node --experimental-strip-types`. This is harmless but visible. Adding
   package-level `"type": "module"` would be broader app risk and is not
   recommended in this spec.
2. The SpecKit prerequisite script rejected the suffixed branch name
   `009a-workflow-contract-roundtrip` even though the roadmap explicitly makes
   suffixed spec IDs first-class. Autopilot worked around this through
   workflow state, but future SpecKit tooling should align branch validation
   with suffixed spec IDs.

## Innovations And Best Practices

1. Contract ownership filtering is now explicit and reusable:
   `created_by = 'workflow-contract'` or membership in the current canonical
   slug set. This protects unrelated same-workspace templates and old
   snapshots.
2. Recovery is hardened against legacy snapshots that captured all workspace
   templates. It filters snapshot rows before applying, so older bad snapshots
   cannot resurrect unrelated manual templates.
3. The final GitNexus rebuild surfaced a generated-symbol collision around a
   generic local `tx` transaction variable. Renaming it to `applyRecovery`
   improved code readability and kept the repository indexable.

## Constitution Compliance

| Principle | Verdict | Evidence |
|---|---|---|
| I. Zero-Regression Contract | Pass | Existing workflow-template behavior changes only under explicit apply; unrelated rows preserved. |
| II. Upstream Compatibility Discipline | Pass | Additive schema and isolated CLI/library/UI changes. |
| IV. Test-First Development | Pass | Tests were authored before implementation tasks and final focused/full suites passed. |
| V. Feature-Flag Resolution Discipline | Pass | No new runtime flag; future flags roundtrip as data only. |
| VI. Dependency Supply-Chain Hygiene | Pass | Exact direct `yaml@2.8.2`; no second schema stack. |
| VII. Additive Migration Policy | Pass | M71 plus rollback-M71; no destructive migration. |
| IX. Safe Evaluation Discipline | Pass | Routing/output schemas are validated as data; no eval or dispatch execution. |
| X. Observability and Auditability | Pass | Generic runs/errors/snapshots and redacted operator-visible errors. |
| XII. Avoid Speculative Generality | Pass | Future governance/runtime fields are declarations, not enforcement. |
| XIV. Browser Evidence for UI Changes | Pass | Focused Playwright diagnostics journey passed locally and docker UI e2e visual report passed on PR #28. |

Constitution violations: None.

## Unspecified Implementations

None. Generated GitNexus skills and the copied `.gitnexus/` index are
operator-requested post-implementation artifacts, not product behavior.

## Task Execution Analysis

| Phase | Tasks | Status | Notes |
|---|---:|---|---|
| Setup | T001-T007 | Complete | Dependency, CLI script, canonical contract, fixtures, M71, rollback, strict scope. |
| Foundation | T008-T018 | Complete | YAML loader, validator, hashes, diff, errors, diagnostics primitives. |
| US1 preview | T019-T024 | Complete | Dry-run import/CLI and quickstart evidence. |
| US2 apply | T025-T031 | Complete | Transactional apply, LKG snapshots, diagnostics, M71 tests. |
| US3 export | T032-T037 | Complete | Deterministic Markdown export and parity evidence. |
| US4 fail-closed recovery | T038-T044 | Complete | Invalid fixtures, stable errors, recovery CLI/docs. |
| US5 diagnostics | T045-T051 | Complete | API/UI/e2e diagnostics with no mutation controls. |
| US6 future data | T052-T056 | Complete | Inert governance/runtime declarations and guardrails. |
| Polish | T057-T065 | Complete | Status docs, focused/full verification, GitNexus embeddings, task evidence. |

Raw completion: 65/65 tasks = 100%.

## Lessons Learned And Recommendations

1. Keep ownership semantics explicit in the spec and implementation. Workspace
   identity alone is not enough once operators can have manual templates in
   the same workspace.
2. Generated-index tooling can surface symbol quality issues that tests do not
   catch. Prefer descriptive local transaction names over generic `tx` in
   index-sensitive code.
3. For suffixed specs, SpecKit prerequisite validation should accept IDs such
   as `009a-*`. This is a tooling-follow-up, not a SPEC-009A product gap.
4. Keep the CLI warning as a documented caveat unless the app adopts ESM
   package semantics deliberately in a separate refactor.

## Self-Assessment Checklist

| Check | Result |
|---|---|
| Evidence completeness | PASS |
| Coverage integrity | PASS |
| Metrics sanity | PASS |
| Severity consistency | PASS |
| Constitution review | PASS |
| Human Gate readiness | PASS; no spec changes proposed |
| Actionability | PASS |

Blocking-rule audit: coverage integrity, metrics sanity, human-gate readiness,
and constitution review all pass. The report is finalize-eligible.

## File Traceability Appendix

Primary implementation files:

- `docs/ai/workflows/mission-control/workflow-contract.yaml`
- `docs/ai/workflows/mission-control/exports/workflow-contract.md`
- `scripts/workflow-contracts/workflow-contract-cli.ts`
- `src/lib/workflow-contracts/*.ts`
- `src/lib/migrations.ts`
- `docs/migrations/rollback-M71.sql`
- `src/app/api/workflow-contracts/diagnostics/route.ts`
- `src/components/panels/orchestration-bar.tsx`
- `tests/e2e/workflow-contract-diagnostics.spec.ts`

Primary verification evidence is recorded in
`docs/ai/specs/SPEC-009A-workflow.md` and the PR #28 body.
