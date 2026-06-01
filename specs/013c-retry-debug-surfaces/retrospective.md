---
feature: "SPEC-013C - Retry/Backoff and Debug API Surfaces"
branch: "013c-retry-debug-surfaces"
date: "2026-05-28"
completion_rate: 100
spec_adherence: 100
requirements:
  functional: 55
  user_stories: 5
  acceptance_scenarios: 14
  success_criteria: 10
coverage:
  implemented: 75
  partial: 0
  modified: 0
  not_implemented: 0
  unspecified: 0
findings:
  critical: 0
  significant: 1
  minor: 1
  positive: 4
uat_blocked: true
pr_blocked: true
pr_block_reason: "Draft PR #63 is open; CI/checks and post-merge target API-and-audit UAT are pending."
---

# Retrospective: SPEC-013C

## Executive Summary

SPEC-013C completed 75/75 generated tasks and implemented backend API/debug authority for retry, release, and cancel on SPEC-013B claimed stages. The implementation adds M79 operator release reasons and scoped idempotency replay storage, `POST /api/tasks/[id]/claim-control`, an optional `claim_control` read-model extension on `task_claim_reconciliation.v1`, bounded audit evidence, OpenAPI/API index updates, UAT scaffolding, and a PR review packet.

Local verification is green under Node 22.22.2: focused SPEC-013C Vitest passed 6 files / 39 tests, `pnpm typecheck`, `pnpm lint`, `pnpm api:parity`, `pnpm check:strict-scope`, `pnpm knowledge:index:check`, and `git diff --check` passed; full `pnpm test` passed outside the sandbox with 308 files / 3190 tests; `pnpm build` passed outside the sandbox. Draft PR #63 is open at `https://github.com/racecraft-lab/Paddock/pull/63`.

## Requirement Coverage Matrix

| Requirement / Area | Status | Evidence |
| --- | --- | --- |
| Retry/release/cancel mutation API | Implemented | `src/app/api/tasks/[id]/claim-control/route.ts`, `src/lib/task-claim-control.ts`, focused route/domain tests. |
| Idempotency and races | Implemented | `task_claim_control_idempotency_keys`, idempotency helper tests, route replay/mismatch tests, storage-failure rollback test. |
| Backoff and override evidence | Implemented | Domain tests cover active backoff, override reason, redaction, and backoff reset. |
| Cancel block until retry | Implemented | Domain tests prove automatic pickup blocks after cancel and resumes after explicit retry. |
| Read-model handoff to SPEC-013D | Implemented | `claim_control` read-model fields and route tests expose authorization, available actions, expected state, backoff, and last action/error. |
| Audit safety and scope boundaries | Implemented | Positive allowlist/redaction code, static forbidden-import tests, cleanup scan, and PR packet non-goals. |
| API-and-audit UAT | Scaffolded | `specs/013c-retry-debug-surfaces/uat-report.md`; target deployment UAT remains post-merge. |

## Significant Deviations

### SIGNIFICANT: Reviewability Scale Requires Transition Exception

- Evidence: reviewability diff gate reports `status=exception`, `pass=true`, 6296 reviewable LOC, 17 production files, 41 total files, and 6 primary surfaces.
- Impact: Review cost is higher than a normal slice, but the branch includes focused tests, local full-suite/build evidence, a PR packet, and explicit SPEC-013D/SPEC-014C boundaries.
- Root cause: Retry/release/cancel semantics, idempotency, compare-and-set, audit, read model, and M79 storage need one transactional contract.
- Prevention: Keep SPEC-013D UI strictly separate and avoid reopening backend semantics there.

## Minor Findings

### MINOR: Post-Agent Orchestration Stalled

- Evidence: post-review and verify-chain subagents stayed silent after status pings and were closed.
- Impact: Does not block PR #63 because the parent ran direct fallback checks, fixed a real code-review issue, and recorded command evidence.
- Prevention: Treat silent post-agent stalls as orchestration/tooling issues and preserve parent-session fallback paths.

## Review Remediation

Parent-session review found one real issue: idempotency response storage failure could return an error after the claim-control mutation committed. The route now wraps mutation plus idempotency recording in one transaction, and `src/lib/__tests__/task-claim-control-route.test.ts` verifies rollback by forcing idempotency insert failure with a SQLite trigger.

The same review tightened the read model so disabled actions report explicit authorization/flag reasons and `last_sanitized_error` remains null when the latest action has no error category.

## Constitution Compliance

| Principle | Result | Evidence |
| --- | --- | --- |
| Zero-Regression Contract | Pass | Flag-off mutation rejection is route-tested; no UI/CLI/MCP/scheduler launch surface was added. |
| Test-First Development | Pass | Focused migration, idempotency, domain, route, and read-model tests cover behavior changes. |
| Feature-Flag Resolution Discipline | Pass | Runtime mutation/read eligibility uses `FEATURE_TASK_CONTROL_PLANE` workspace scope. |
| Additive Migration Policy | Pass | M79 is data-preserving and rollback SQL refuses unsafe contraction. |
| Successor Side-Effect Parity | Pass | Static guard prevents `advanceTaskChain`/`createTask` authority in claim control. |
| Observability and Auditability | Pass | Mutation outcomes write bounded activities and expose read-model evidence without raw payloads. |
| Reviewability And Verification Debt Control | Pass with ratified exception | Reviewability gate passes as `exception`; PR body and workflow disclose the larger branch diff. |

Constitution violations: None.

## Open Gates

- PR #63 is draft and requires review.
- GitHub checks were still in progress at creation time; `visual-review-approval/playwright` showed failure pending visual workflow resolution.
- Target deployment promotion and post-merge API-and-audit UAT are required before roadmap status can move to `Complete`.

## Follow-Up

SPEC-013D remains the operator UX adoption blocker. SPEC-014C remains blocked until SPEC-013D and SPEC-014B are complete.
