# Quickstart: SPEC-013B - Claim and Reconciliation Authority

## Preconditions

- Use Node.js >=22 and `pnpm`.
- Work from branch `013b-claim-reconciliation`.
- Keep `.claude/` untouched.
- Do not enable `FEATURE_TASK_CONTROL_PLANE` through env force-on; workspace JSON is the only opt-in path.

## Implementation Order

1. Add failing M78 migration tests for table shape, partial unique active claim index, `UNIQUE(task_stage_attempt_id)`, rerun idempotency, and rollback SQL.
2. Implement migration `078_task_stage_claims` in `src/lib/migrations.ts` and `docs/migrations/rollback-M78.sql`.
3. Add failing helper tests for claim eligibility, duplicate prevention, stale recovery, governance deferral, stale truth deferral, release compare-and-set, payload allowlist, and no successor side effects.
4. Implement `src/lib/task-claim-reconciliation.ts`.
5. Add failing dispatch integration tests for flag-off parity and flag-on one-claim/one-launch admission.
6. Hook `dispatchAssignedTasks` before the legacy `in_progress` mutation.
7. Add failing read-only route tests.
8. Implement `GET /api/tasks/[id]/claim-reconciliation`, register it in `src/app/api/index/route.ts`, and update `openapi.json`.
9. Add all new TS files to `tsconfig.spec-strict.json` and `eslint.config.mjs`.

## Focused Test Commands

```bash
pnpm vitest run src/lib/__tests__/migrations-M78-task-stage-claims.test.ts
pnpm vitest run src/lib/__tests__/task-claim-reconciliation.test.ts
pnpm vitest run src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts
pnpm vitest run src/lib/__tests__/task-claim-reconciliation-route.test.ts
```

## Full Verification

Run before PR packaging:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:all
```

Codex sandbox note: repository guidance says `pnpm test` should run outside the sandbox because the suite uses local runtime resources.

## Implementation Evidence Packet

Captured on `013b-claim-reconciliation` from `/Users/fredrickgabelmann/.codex/worktrees/6b95/racecraft-mission-control/.worktrees/013b-claim-reconciliation`.

### Scope Evidence

- Production code stayed within the planned claim/reconciliation surface:
  - `src/lib/task-claim-reconciliation.ts`
  - `src/lib/task-dispatch.ts`
  - `src/lib/migrations.ts`
  - `src/app/api/tasks/[id]/claim-reconciliation/route.ts`
  - `src/app/api/index/route.ts`
  - `openapi.json`
- No `.claude/` files were modified.
- No runner, sandbox lifecycle, harness adapter, retry/cancel/manual-release control, auto-merge, automatic triage, primary dashboard UI, or successor-selection implementation was added.
- `FEATURE_TASK_CONTROL_PLANE=false` remains the legacy path; flag-on claim behavior requires workspace opt-in.

### Verification Results

All commands were run with `direnv exec .` so the worktree used Node.js v22.22.2.

```bash
direnv exec . pnpm exec vitest run src/lib/__tests__/migrations-M78-task-stage-claims.test.ts src/lib/__tests__/task-claim-reconciliation.test.ts src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts src/lib/__tests__/task-claim-reconciliation-route.test.ts
```

Result: 4 files passed, 27 tests passed.

```bash
direnv exec . pnpm test
```

Result: 304 files passed, 33 skipped; 3167 tests passed, 3 skipped, 84 todo.

```bash
direnv exec . pnpm build
```

Result: passed outside the Codex sandbox; the route table includes `/api/tasks/[id]/claim-reconciliation`.

```bash
direnv exec . pnpm test:e2e
```

Result: 651 passed.

```bash
direnv exec . pnpm test:all
```

Result: passed. Package-script order completed `pnpm check:strict-scope`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. The final Vitest step reported 3167 passed tests and the final e2e step reported 651 passed.

### Reviewability And Guard Notes

- `tsconfig.spec-strict.json` owns the new strict SPEC-013B module and focused tests.
- `eslint.config.mjs` includes the new module, tests, dispatch integration tests, and read-only API route.
- Route and dispatch integration remain covered by root `pnpm typecheck`, lint, focused Vitest, and full `pnpm test:all`; they are not pulled into `tsconfig.spec-strict.json` because that would import legacy non-strict route/dispatch graphs outside SPEC-013B ownership.
- Manual rollback is documented in `docs/migrations/rollback-M78.sql`.
- Archive sweep stayed dry-run only and excluded the active target `specs/013b-claim-reconciliation`.

## UAT Replay Evidence

Record these fields for a post-merge human validation replay:

- `uat_replay_id`
- feature flag state
- `workspace_id`
- `task_id`
- `stage_key`
- GitHub repo and issue number
- concurrent `scheduler_tick_id[]`
- claim attempt count
- acquired claim id
- duplicate-prevented activity ids
- exactly one legacy `task_dispatched` or launch-handoff activity id
- `task_stage_attempt_id`
- release activity id and release reason
- final active-claim count `0`
- source references for activity, claim, and attempt rows

Manual pre-merge replay evidence captured on 2026-05-27 is recorded in `specs/013b-claim-reconciliation/uat-report.md`. Replay id: `spec-013b-manual-uat-2026-05-27T22-24-30-806Z`.

### Post-Merge UAT Replay Procedure

1. Enable `FEATURE_TASK_CONTROL_PLANE` for one Product Line workspace only.
2. Identify or seed one `assigned` task with a canonical `github_repo`, positive `github_issue_number`, a same-workspace sync-owner project, fresh GitHub sync truth, and a healthy SPEC-013A1 lifecycle row.
3. Trigger two scheduler ticks against the same eligible task stage.
4. Confirm exactly one `task_stage_claims` row is active during launch handoff and exactly one dispatch/launch-handoff activity exists.
5. Confirm the competing tick records `task_stage_claim_duplicate_prevented` without launching.
6. Transition the task, GitHub issue/PR, governance state, or linked passive attempt to a terminal or gated condition.
7. Confirm the active claim releases with the correct closed `release_reason`, final active-claim count is `0`, and evidence is visible through `GET /api/tasks/:id/claim-reconciliation`.
8. Confirm local-only, repo-only, non-issue-linked, and non-`assigned` tasks do not enter autonomous claim intake.

## Non-Goals Check

Implementation must not add:

- runner, fake runner, or harness adapter behavior
- sandbox lifecycle
- Linear or external tracker client behavior
- retry, cancel, or manual release controls
- primary dashboard UI
- auto-merge, automatic triage, or successor-selection behavior
