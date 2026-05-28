# SPEC-013C PR Review Packet

## Summary

SPEC-013C adds backend API/debug authority for operator retry, release, and cancel actions on SPEC-013B claimed stages. The implementation adds a narrow claim-control domain module, authenticated mutation route, M79 persistence support, idempotency replay, read-model eligibility fields, bounded audit evidence, and local UAT scaffolding.

SPEC-013C provides backend API/debug authority only. In-app operator adoption remains blocked on SPEC-013D, and first real harness operation remains blocked on SPEC-013D plus SPEC-014B.

## Review Order

1. Migration and rollback: `src/lib/migrations.ts`, `docs/migrations/rollback-M79.sql`, `src/lib/__tests__/migrations-M79-task-claim-control.test.ts`.
2. Closed contracts and idempotency: `src/lib/task-claim-control-types.ts`, `src/lib/task-claim-control-idempotency.ts`, related tests.
3. Domain semantics: `src/lib/task-claim-control.ts`, `src/lib/__tests__/task-claim-control.test.ts`.
4. Route behavior: `src/app/api/tasks/[id]/claim-control/route.ts`, route tests.
5. Read-model extension: `src/lib/task-claim-reconciliation.ts`, `src/app/api/tasks/[id]/claim-reconciliation/route.ts`, reconciliation tests.
6. API/docs evidence: `openapi.json`, `src/app/api/index/route.ts`, `specs/013c-retry-debug-surfaces/quickstart.md`, `specs/013c-retry-debug-surfaces/uat-report.md`.

## Scope Budget

- Primary surface: API/debug authority.
- Secondary surfaces: claim reconciliation read model, audit/evidence, M79 schema support, docs/process.
- Explicitly out of scope: in-app UI controls, CLI/MCP action surface, new dashboard, sandbox lifecycle, adapter registry, harness execution, direct GitHub mutation, successor selection, task creation.
- Ratified exception: retry/release/cancel semantics, idempotency, compare-and-set, audit, read-model fields, and M79 persistence must agree transactionally; operator UX remains split to SPEC-013D.

## Traceability

| Requirement Area | Files | Evidence |
|------------------|-------|----------|
| Flag/auth-gated mutation route | `src/app/api/tasks/[id]/claim-control/route.ts` | route tests, typecheck, lint |
| Retry/release/cancel semantics | `src/lib/task-claim-control.ts` | domain tests including active claims, cancel block, backoff, stale state, non-retryable states |
| Durable idempotency replay | `src/lib/task-claim-control-idempotency.ts`, M79 table | idempotency helper tests and route replay tests |
| M79 migration/rollback | `src/lib/migrations.ts`, `docs/migrations/rollback-M79.sql` | migration tests for rerun and rollback refusal |
| Read-model handoff | `src/lib/task-claim-reconciliation.ts` | side-effect-free read-model tests and route tests |
| Audit safety | `src/lib/task-claim-control.ts` | secret-shaped value redaction test and static forbidden-authority test |
| Contract docs | `openapi.json`, `src/app/api/index/route.ts` | API documentation tests and `pnpm api:parity` |

## Verification

- `direnv exec . pnpm exec vitest run src/lib/__tests__/migrations-M79-task-claim-control.test.ts src/lib/__tests__/task-claim-control-idempotency.test.ts src/lib/__tests__/task-claim-control.test.ts src/lib/__tests__/task-claim-control-route.test.ts src/lib/__tests__/task-claim-reconciliation.test.ts src/lib/__tests__/task-claim-reconciliation-route.test.ts --reporter=verbose` passed: 6 files, 39 tests.
- `direnv exec . pnpm typecheck` passed.
- `direnv exec . pnpm lint` passed.
- `direnv exec . pnpm api:parity` passed.
- `direnv exec . pnpm check:strict-scope` passed.
- `direnv exec . pnpm test` passed outside the Codex sandbox after the known provisioner socket sandbox failure: 308 files, 3190 tests, 3 skipped, 84 todo.
- `direnv exec . pnpm build` passed outside the Codex sandbox after the known Turbopack port-binding sandbox failure.
- `direnv exec . pnpm knowledge:index:check` passed.
- `git diff --check` passed.
- `pnpm test:e2e` was not run because SPEC-013C changes no browser-visible operator UI.

## Known Gaps And Follow-Ups

- SPEC-013D is required before non-terminal operators have a complete in-app control experience.
- SPEC-014C remains blocked until SPEC-013D and SPEC-014B are complete.
- Target-deployment API-and-audit UAT must run post-merge using the matrix in `specs/013c-retry-debug-surfaces/uat-report.md`.

## Review Remediation Notes

- Parent-session code review found that idempotency response storage failure could previously return an error after the claim-control mutation had committed. The route now wraps mutation plus idempotency record in one database transaction.
- Regression coverage: `src/lib/__tests__/task-claim-control-route.test.ts` creates an insert-failing idempotency trigger and verifies the active claim plus audit state roll back.
- Read-model disabled action descriptors now return explicit `insufficient_role`/`feature_flag_off` style reasons instead of disabled actions with `null` reasons.

## Rollback And Flag Notes

- Rollback is flag-first: remove or disable `FEATURE_TASK_CONTROL_PLANE` for the target workspace/product-line scope.
- M79 rollback path: `docs/migrations/rollback-M79.sql`.
- M79 rollback refuses to contract the release-reason CHECK while `operator_released`, `operator_cancelled`, or `operator_retry_requested` rows exist.
