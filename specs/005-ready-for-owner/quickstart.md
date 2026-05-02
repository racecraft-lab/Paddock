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

## Implementation Evidence (2026-05-02)

Guardrails verified:

- `git diff --name-only origin/main...HEAD src/lib/migrations.ts docs/migrations` returned no files, confirming SPEC-005 added no database migration or rollback SQL.
- `rg "issue timeline|timeline|force-complete|force complete|operator override|terminal-event table|CREATE TABLE|ALTER TABLE|CHECK \\(status" ...` over the SPEC-005 runtime surfaces returned no matches.
- Production GitHub sync callsites in `src/app/api/github/sync/route.ts`, `src/app/api/github/route.ts`, and `src/lib/github-sync-poller.ts` call `pullFromGitHub(project, workspaceId)` or `pullFromGitHub(project, project.workspace_id)` with no third argument.
- `webhookFixture` appears only in the optional `pullFromGitHub` implementation/test seam and SPEC-005 quickstart guidance, not in production callsites.

Acceptance coverage:

- P4-AC1: T015-T023 plus `tests/e2e/ready-for-owner-kanban.spec.ts` verify flag-off direct completion, readable/visible existing `ready_for_owner` rows, and blocked new flag-off writes.
- P4-AC2, P4-AC3, and P4-AC4b: T024-T033 verify `produces_pr=false` direct completion, `produces_pr=true` owner-gate routing, missing-linkage evidence, and no chain advancement at `ready_for_owner`.
- P4-AC4 and P4-AC4a: T034-T049 verify explicit linked PR merge completion, closed-issue-without-merged-PR reconciliation, side-effect-free blocked `done` writes, and `github_pr_merged` chain advancement only after verified completion.
- P4-AC5 and P4-AC6: T050-T059 verify the dedicated Kanban lane, `awaiting_owner` separation, and idempotent `mc:ready-for-owner` label mapping/application.
- FR-019a and SC-006: T053, T058, T064, T066, T067, and T070 verify accessible lane/card/notification text, keyboard reachability, visible focus, and owner-action-required notification copy.

Final verification:

- `pnpm typecheck`: passed after final harness/doc updates.
- `pnpm lint`: passed with 0 errors and 12 existing warnings.
- `pnpm test`: passed with 169 files and 1369 tests after host-permission rerun for GPG/socket tests.
- `pnpm build`: passed after network-enabled rerun for Next.js Google Fonts; existing Turbopack NFT trace warnings were non-fatal.
- `pnpm test:e2e`: passed with 535 Playwright tests after rotating the E2E admin helper's synthetic login IP to avoid self-induced setup throttling while preserving the dedicated login rate-limit tests.
