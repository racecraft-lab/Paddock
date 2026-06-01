# Implementation Plan: SPEC-013C - Retry/Backoff and Debug API Surfaces

**Branch**: `013c-retry-debug-surfaces` | **Date**: 2026-05-28 | **Spec**: `specs/013c-retry-debug-surfaces/spec.md`
**Input**: Feature specification from `specs/013c-retry-debug-surfaces/spec.md`

## Summary

SPEC-013C adds authenticated backend claim-control authority on top of SPEC-013B claim/reconciliation state. The implementation introduces one operator/admin mutation endpoint, a narrow claim-control domain module, durable idempotency replay storage, bounded audit evidence, and a backward-compatible extension to the existing `task_claim_reconciliation.v1` read model. The slice remains API/debug only: no task-detail controls, dashboard, CLI/MCP actions, GitHub mutations, successor selection, sandbox lifecycle, adapter registry, or harness execution enter this spec.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node.js >=22  
**Primary Dependencies**: Next.js 16 App Router, React 19, `better-sqlite3`, existing feature-flag/auth/workspace helpers, existing `detectSecrets`, Node `crypto`; no new runtime dependency  
**Storage**: SQLite through `better-sqlite3`; existing `tasks`, `workspaces`, `task_stage_attempts`, `task_stage_claims`, and `activities`; M79 widens the existing claim release-reason constraint for operator reasons and adds scoped idempotency replay storage with manual rollback SQL  
**Testing**: Vitest focused unit/route/migration tests, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; Playwright only if an existing visible surface changes, which this plan avoids  
**Target Platform**: Paddock Next.js backend on Node >=22; HAL target UAT may use service-compatible Node 24 as in SPEC-013B
**Project Type**: Web-service API and backend state module inside an existing Next.js application  
**Performance Goals**: Single-task mutation/read-model path performs bounded indexed SQLite lookups; no live GitHub/network fetch; no scan over unrelated workspaces/tasks  
**Constraints**: Default-off behind `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)`; mutation route uses `requireRole(request, 'operator')`; idempotency responses replay without rerunning side effects; all writes happen in one SQLite transaction; audit payloads are positive-allowlisted and secret-scanned; no raw payload persistence  
**Scale/Scope**: One task stage per request; claim history/read model bounded to existing limits; UAT uses disposable workspace/product-line fixture scope  
**Reviewability Budget**: Primary surface API. Secondary surfaces: narrow domain module, data-preserving migration, read-model extension, audit evidence, docs/process. Projected reviewable LOC 900-1500, production files 6-8, total files 14-22. Budget result: transition exception already recorded by workflow setup; SPEC-013D owns the UI split.  
**Strict Scope**: Add new strict-owned pure modules/tests to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/task-claim-control-types.ts`, `src/lib/task-claim-control-idempotency.ts`, `src/lib/task-claim-control.ts`, `src/lib/__tests__/migrations-M79-task-claim-control.test.ts`, `src/lib/__tests__/task-claim-control-idempotency.test.ts`, `src/lib/__tests__/task-claim-control.test.ts`. Add route/API tests to `eslint.config.mjs`: `src/app/api/tasks/[id]/claim-control/route.ts`, `src/lib/__tests__/task-claim-control-route.test.ts`. The route itself stays out of `tsconfig.spec-strict.json` if importing legacy auth/db/workspace modules pulls non-strict graph, matching SPEC-013B route treatment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | Pass | New mutation behavior is default-off through `FEATURE_TASK_CONTROL_PLANE`; flag-off route returns unavailable and does not mutate; existing read-only debug behavior remains available. |
| II. Install Compatibility And Operational Impact | Pass | Class `factory-core`; new route/module/table plus data-preserving release-reason constraint expansion only; no destructive migration or compatibility-sensitive rename. |
| IV. Test-First Development | Pass | Tasks must start with failing migration, idempotency, domain, route, read-model, audit-safety, and flag-off tests before implementation. |
| V. Feature-Flag Resolution Discipline | Pass | Runtime behavior uses `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` through workspace feature flags; no inline `process.env.FEATURE_TASK_CONTROL_PLANE`. |
| VII. Additive Migration Policy | Pass with planned migration exception | M79 performs a data-preserving rebuild of `task_stage_claims` only to widen the constrained `release_reason` enum for SPEC-013C operator reasons, then adds scoped idempotency replay storage. Rollback file `docs/migrations/rollback-M79.sql` and migration rerun/rollback tests are required; rollback must refuse to contract the enum while operator-reason rows exist. |
| VIII. Successor Side-Effect Parity | Pass | Claim-control module must not import or call `createTask`, direct `INSERT INTO tasks`, or `advanceTaskChain`; static tests/grep cover this. |
| X. Observability and Auditability | Pass | Successful mutations and task-visible semantic rejections write one bounded task activity; unauth/forbidden/invisible/malformed/rate-limited requests do not write claim-control task audit rows. |
| XI. Keep It Simple | Pass | One route, one core module, one idempotency helper/table, existing read-model route extended in place. |
| XIV. Real Browser Coverage For UI | N/A | No UI changes are planned. |
| XVI. Reviewability And Verification Debt | Pass with transition exception | Scope is backend-only and documents SPEC-013D as the operator UX adoption blocker. |

UI plan: no user-facing UI files are changed. Playwright browser journeys and screenshots are not required unless implementation unexpectedly changes a visible surface; if that happens, the work must stop and the UI scope must move to SPEC-013D.

Spec/evidence retention plan:

- Archive Sweep already ran in startup dry-run mode and excluded `specs/013c-retry-debug-surfaces`.
- Cleanup of previous specs remains blocked because the worktree is dirty, the branch is not `main`, and archive success was not recorded for eligible specs.
- Generated screenshots are not planned. If any screenshot is generated, it remains a CI/Argos artifact unless a manifest-backed checked-in exception is added.

Reviewability plan:

- Primary review order: migration/idempotency, domain state machine, route contract, read model/audit, docs/UAT.
- Scope exception source: setup reviewability gate in `docs/ai/specs/SPEC-013C-workflow.md`.
- Split decision: SPEC-013C keeps backend API/debug authority because retry/release/cancel, idempotency, audit, and read-model semantics must agree transactionally; SPEC-013D remains the UI follow-up.
- PR review packet source: `specs/013c-retry-debug-surfaces/quickstart.md` plus final workflow evidence.

## Project Structure

### Documentation (this feature)

```text
specs/013c-retry-debug-surfaces/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── task-claim-control-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
src/app/api/tasks/[id]/
├── claim-control/route.ts              # new operator/admin mutation API
└── claim-reconciliation/route.ts       # existing read route, unchanged path

src/lib/
├── task-claim-control-types.ts         # new closed contracts and validation types
├── task-claim-control-idempotency.ts   # new replay-key hash/cache helpers
├── task-claim-control.ts               # new state machine and audit orchestration
├── task-claim-reconciliation.ts        # extend read model with claim_control
├── task-stage-attempts.ts              # reuse existing lifecycle helpers
└── migrations.ts                       # add M79 release-reason expansion and idempotency table

src/lib/__tests__/
├── migrations-M79-task-claim-control.test.ts
├── task-claim-control-idempotency.test.ts
├── task-claim-control.test.ts
├── task-claim-control-route.test.ts
└── task-claim-reconciliation.test.ts   # extend read-model coverage

docs/migrations/
├── rollback-M79.sql
└── rollback-procedure.md

openapi.json
src/app/api/index/route.ts
tsconfig.spec-strict.json
eslint.config.mjs
```

**Structure Decision**: Use a backend/domain-module structure. Keep mutation semantics out of the scheduler and UI. Route code handles auth/workspace/HTTP only; `src/lib/task-claim-control.ts` owns state transitions and audit; `src/lib/task-claim-control-idempotency.ts` owns replay lookup/recording; `task-claim-reconciliation.ts` remains the source of read-model truth for SPEC-013D.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Reviewable LOC may exceed 800 | Retry/release/cancel, CAS, idempotency, audit, read-model, migration, and tests must agree transactionally | Splitting mutation/read-model semantics would create conflicting contracts; UI is already split to SPEC-013D |
| Migration M79 | Same-key replay must return stable successful responses without rerunning side effects, and existing `task_stage_claims.release_reason` constraints must accept SPEC-013C operator reasons | Existing activities cannot replay response bodies; existing governance cache is actor/key-only and route-specific in naming/semantics; storing operator reasons only in activities would make claim history and read-model state inconsistent |
| More than one secondary surface | API contract necessarily touches persistence, audit, OpenAPI/API index, and docs | Moving any of these out would leave the API unreviewable or undocumented |
