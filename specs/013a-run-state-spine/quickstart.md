# Quickstart: SPEC-013A Run-State Persistence Spine

## Purpose

Verify that durable task-stage attempt rows can be created by deterministic test/UAT setup, inspected through a dedicated read route, rendered in the existing task detail UI, archived non-destructively, and ignored by existing runtime paths when `FEATURE_TASK_CONTROL_PLANE=false`.

## Setup

Use the SPEC-013A worktree and package manager detected from `pnpm-lock.yaml`.

```bash
pnpm install
```

## Focused Verification

Run the migration/helper/route/component tests first.

```bash
pnpm test src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/__tests__/task-stage-attempts-section.test.tsx
```

Run the scope guardrail.

```bash
node scripts/spec-013a/check-run-state-scope-guards.mjs
```

Run the real task detail UI journey.

```bash
pnpm exec playwright test tests/e2e/spec-013a-task-stage-attempts.spec.ts
```

## Full Local Gates

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Per repository guidance, run `pnpm test` outside the Codex sandbox if the full suite is needed.

## Manual UAT Shape

1. Start Mission Control with a disposable data directory.
2. Apply migrations through normal app startup or test setup.
3. Seed one task with:
   - one attempt with no `run_id`
   - one attempt with a linked visible `runs.id`
   - one attempt with a missing/unavailable `run_id`
   - one archived attempt
4. Authenticate as a viewer-or-higher operator.
5. Open the task detail Details tab.
6. Verify the `Run state` / `Stage attempts` section shows:
   - task/workspace/stage identity
   - attempt number
   - lifecycle status
   - created/updated/started/completed/archived timestamps when present
   - workflow template context when present
   - `none`, `linked`, and `missing_unavailable` run-link states
   - bounded recent lifecycle events
   - no claim, retry, release, cancel, scheduler, launch, GitHub sync, sandbox, harness, or auto-merge controls

## Runtime Safety Check

With `FEATURE_TASK_CONTROL_PLANE=false`, representative attempt rows must not change behavior in:

- scheduler
- dispatch
- task-chain advancement
- Aegis review
- GitHub sync/poller
- runtime runs
- pilot review packet
- existing task evidence route/helper

The guard script plus focused tests must fail if those paths import the attempt helper or reference `task_stage_attempts` / `task_stage_attempt_events`.

## Rollback Check

Review `docs/migrations/rollback-M76.sql` before merge. It must:

- warn that rollback removes attempt history unless backed up/exported first
- drop `task_stage_attempt_events` before `task_stage_attempts`
- delete only migration marker `076_task_stage_attempts`
- include or instruct `PRAGMA foreign_key_check`

