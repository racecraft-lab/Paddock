# Quickstart: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

## Prerequisites

- Node >=22 and pnpm.
- Worktree branch: `009c4-owner-merge-reconciliation`.
- Manual GitHub sync remains the production reconciliation trigger.
- A fresh synthetic C4 PR exists or will be created for live UAT; do not use SPEC-009C3 PR #49.

## Focused Test Flow

1. Write RED Vitest coverage for a linked pilot task that remains `ready_for_owner` before `G_PILOT_MERGE`.
2. Add RED coverage where a closed issue without exact merged PR evidence leaves the task `ready_for_owner` and emits reconciliation-required evidence.
3. Add RED coverage where a merged wrong repo or wrong PR number does not complete the linked task.
4. Add RED coverage where exact merged PR evidence reconciles `ready_for_owner` to `done`, projects done labels, removes stale ready-for-owner projection, records terminal activity, and calls task-chain advancement only after verified `github_pr_merged`.
5. Add RED coverage where duplicate manual sync after successful reconciliation is idempotent and creates no duplicate downstream launch, terminal activity flood, owner-action notification, reconciliation-required notification flood, or cleanup work.
6. Change production code only for the focused failures above.

## Manual Sync Contract Check

Use the existing API shape:

```bash
curl -sS -X POST "$MC_URL/api/github/sync" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MC_API_KEY" \
  --data '{"action":"trigger","project_id":123}'
```

The UI equivalent is the GitHub Sync panel per-project sync button when it calls the shared `pullFromGitHub(project, workspaceId)` path.

## Live UAT Evidence

Update `docs/qa/pilot-smoke-checklist.md` with text evidence only:

- Timestamp.
- Target deployment.
- Workspace and project identity.
- Fresh synthetic C4 PR URL/number.
- Linked PR-producing task id.
- Pre-merge `ready_for_owner` state.
- Explicit operator manual merge action at `G_PILOT_MERGE`.
- Manual GitHub sync result.
- Resulting task status, done label projection, activity evidence, notification evidence, and sync evidence.
- Duplicate sync evidence.
- Cleanup status or explicit retention rationale.
- Explicit statement that closed/unmerged SPEC-009C3 PR #49 was not used.

Do not create packet YAML/JSON, packet persistence, lifecycle snapshot API, evidence dashboard, packet UI, or committed binary screenshot evidence for C4.

## Verification Commands

Run focused tests first during RED/GREEN loops:

```bash
pnpm test
```

Run full verification before completion:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Playwright is required only if C4 changes Task Board, GitHub Sync UI, smoke-checklist rendering, or another visible evidence surface. If no UI surface changes, record Playwright as not applicable with rationale unless the broader phase gate requires `pnpm test:e2e`.
