# SPEC-013A1 Review Packet - GitHub Sync Automation And Poller Lifecycle

## Scope

SPEC-013A1 adds default-off automatic GitHub sync lifecycle controls, bounded scheduler-owned polling, durable leases, cursor-safe terminal records, overlap protection, failure/backoff diagnostics, shared-repository owner selection, and operator visibility in the existing GitHub Sync panel.

Out of scope: task claim authority, task dispatch, task launch, Issue Remediation execution, sandbox lifecycle, harness adapter behavior, auto-merge, automatic triage, and SPEC-013B+/SPEC-014+ run/execution control surfaces.

## Review Order

1. Migration and rollback: `src/lib/migrations.ts`, `docs/migrations/rollback-M77.sql`, `docs/runbook/migration-rollback.md`.
2. Lifecycle state machine: `src/lib/github-sync-lifecycle.ts`, `src/lib/github-sync-lifecycle-api.ts`, `src/lib/github-sync-lifecycle-types.ts`.
3. Scheduler/poller integration: `src/lib/github-sync-poller.ts`, `src/lib/scheduler-tasks.ts`.
4. API contracts: `src/app/api/github/sync/route.ts`, `src/app/api/github/sync/control/route.ts`, `openapi.json`, `src/app/api/index/route.ts`.
5. Operator UI/UAT: `src/components/panels/github-sync-panel.tsx`, `tests/e2e/spec-013a1-github-sync-automation.spec.ts`.
6. Guardrails/docs/status: `scripts/spec-013a1/check-github-sync-scope.mjs`, `specs/013a1-github-sync-automation/`, `docs/ai/specs/SPEC-013A1-workflow.md`, `docs/ai/repo-knowledge-index.json`.

## Traceability

- US1 Enable and Observe: lifecycle envelope, PATCH controls, scheduler tick, bounded automatic pull seam, panel controls, first Playwright journey.
- US2 Manual Sync Fallback: same-scope 409 overlap responses, trigger-all preflight conflicts, independent manual sync scopes, lease release coverage, panel retry guidance.
- US3 Failure Recovery: success-only cursor advancement, bounded partials, malformed-page failures, retry signal/cap/fallback diagnostics, sanitized failure payloads, stale recovery UAT.
- US4 Duplicate Prevention: `(workspace_id, github_repo)` grouping, single-owner polling, skipped non-owner evidence, ownership-unresolved red health, duplicate-ingestion prevention tests.
- Polish: quickstart, rollback, OpenAPI/API index, repo knowledge index, archive/screenshot/forbidden-authority guard evidence, full verification, and this review packet.

## Verification Evidence

- `direnv exec . pnpm api:parity` -> passed.
- `direnv exec . pnpm knowledge:index:check` -> passed with 0 warnings.
- `direnv exec . pnpm guardrails -- --suite spec-evidence-screenshots` -> checked 0 committed spec screenshots; policy passed.
- `direnv exec . pnpm guardrails:spec-013a1` -> passed, 19 changed files scanned at the time of the guard run.
- Focused lifecycle/API matrix: `direnv exec . pnpm exec vitest run src/lib/__tests__/github-sync-lifecycle.test.ts src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts src/app/api/github/sync/__tests__/route.test.ts src/app/api/github/sync/control/__tests__/route.test.ts` -> 4 files, 27 tests passed.
- Focused ownership/API/UI matrix: `direnv exec . pnpm exec vitest run src/lib/__tests__/github-sync-lifecycle-ownership.test.ts src/lib/__tests__/spec006-poller.test.ts src/app/api/github/sync/__tests__/route.test.ts src/components/panels/__tests__/github-sync-panel.test.tsx` -> 4 files, 30 tests passed.
- Focused UAT: `direnv exec . pnpm test:e2e -- tests/e2e/spec-013a1-github-sync-automation.spec.ts --project=chromium` -> 2 tests passed.
- Full build/typecheck/lint/unit/e2e ladder:
  - `direnv exec . pnpm build` -> passed outside sandbox.
  - `direnv exec . pnpm typecheck` -> passed outside sandbox.
  - `direnv exec . pnpm lint` -> passed.
  - `direnv exec . pnpm test` -> 300 files passed, 3,137 tests passed, 3 skipped, 84 todo.
  - `direnv exec . pnpm test:e2e` -> 651 tests passed.

## Known Gaps

- Automatic polling remains default-off and requires operator enablement before live rollout.
- No external GitHub network UAT was run in this branch; GitHub API interactions are covered through existing sync seams, mocks, and e2e route stubs.
- Reviewability remains under the recorded transition exception because this spec intentionally spans migration, scheduler, API, UI, docs, and verification surfaces.

## Rollback And Flags

- `FEATURE_GITHUB_SYNC_AUTOMATION` defaults off and every automatic tick re-checks the flag before work.
- Per-scope lifecycle controls can disable future automatic ticks without disabling manual sync.
- `docs/migrations/rollback-M77.sql` removes lifecycle tables only; existing GitHub-linked tasks and `github_syncs` remain readable.
- Manual sync remains the compatibility fallback when the flag, controls, or lifecycle schema are unavailable.

## Deferred Boundaries

- SPEC-013B/C own claim, retry/release/cancel, merge/reconciliation authority, and broader run control.
- SPEC-014+ owns sandbox lifecycle, harness adapters, execution environments, and real remediation execution.
- This spec does not create task dispatch, launch, auto-merge, automatic triage, or issue-remediation execution behavior.
