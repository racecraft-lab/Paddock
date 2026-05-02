# Quickstart: SPEC-005 ready_for_owner State and Two-Step Terminal Event

## Setup

```bash
pnpm install
```

Use a workspace where `FEATURE_TASK_PIPELINES` is already enabled before enabling `FEATURE_TWO_STEP_TERMINAL`, because the flag registry declares that dependency.

## Focused Verification Flow

1. Verify static no-migration guardrails:

```bash
git diff --name-only origin/main...HEAD
rg "ALTER TABLE|CREATE TABLE|CHECK \\(status|terminal_event" src/lib/migrations.ts docs/migrations specs/005-ready-for-owner
```

Expected: no SPEC-005 migration, no DB status CHECK, no terminal-event table.

2. Verify status vocabulary and labels:

```bash
pnpm test src/lib/__tests__/github-label-map.test.ts
```

Expected: `ready_for_owner` maps to `mc:ready-for-owner`, color `14b8a6`, and inverse status mapping works.

3. Verify transition guards:

```bash
pnpm test src/lib/__tests__/task-status.test.ts
pnpm test src/lib/__tests__/task-dispatch.test.ts
pnpm test src/app/api/quality-review/__tests__/route.test.ts
pnpm test src/lib/__tests__/tasks-route-ready-for-owner.test.ts
```

Expected:

- Flag OFF preserves direct `done`.
- Flag ON plus `produces_pr=false` preserves direct `done`.
- Flag ON plus `produces_pr=true` routes approval to `ready_for_owner`.
- Non-merge `done` attempts return the uniform 409 conflict.
- `advanceTaskChain` does not run at `ready_for_owner`.

4. Verify GitHub terminal evidence and reconciliation:

```bash
pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts
```

Expected:

- Matching merged PR evidence moves `ready_for_owner -> done`.
- Closed issue without merged PR leaves task `ready_for_owner`.
- Reconciliation activity and notification are deduped.
- Production `pullFromGitHub` callsites pass no fixture.

5. Verify notifications:

```bash
pnpm test src/lib/__tests__/db-helpers.test.ts
pnpm test src/app/api/notifications/deliver/__tests__/route.test.ts
```

Expected: `task_ready_for_owner` creates, renders, and formats owner-action-required copy with assignee then creator fallback.

6. Verify running-app operator UI:

```bash
pnpm test:e2e tests/e2e/ready-for-owner-kanban.spec.ts
```

Expected:

- Kanban shows `quality_review`, `ready_for_owner`, `done` in the required order.
- Existing `awaiting_owner` lane remains distinct.
- A task in `ready_for_owner` is visible even with `FEATURE_TWO_STEP_TERMINAL` OFF.

## Final Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Record any environment-only failure with command output and rerun evidence. Merge readiness requires no unresolved SPEC-005 transition, label, notification, or Kanban regressions.
