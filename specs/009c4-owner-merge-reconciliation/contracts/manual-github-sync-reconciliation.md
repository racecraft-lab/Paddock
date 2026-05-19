# Contract: Manual GitHub Sync Reconciliation

## Scope

This contract covers the existing manual GitHub sync path used by SPEC-009C4 to reconcile one linked PR-producing pilot task from `ready_for_owner` to `done` after the operator performs `G_PILOT_MERGE`.

## Entrypoints

### API

```http
POST /api/github/sync
Content-Type: application/json
```

```json
{
  "action": "trigger",
  "project_id": 123
}
```

### UI Equivalent

The GitHub Sync panel per-project sync button is the UI equivalent when it calls the same underlying `pullFromGitHub(project, workspaceId)` path.

## Preconditions

- A pilot task exists in `ready_for_owner`.
- The task has linked PR identity: workspace/project scope, `github_repo`, `github_issue_number`, and `github_pr_number`.
- The operator has manually merged the fresh synthetic C4 PR at `G_PILOT_MERGE` for the happy path.
- Production API/UI/manual sync callsites do not pass fixture payloads.

## Completion Rule

The linked task may transition to `done` only when current GitHub PR state for the exact `github_repo` and `github_pr_number` explicitly reports the pull request as merged.

Supporting fields such as `merge_commit_sha`, `merged_at`, labels, issue closed state, or timeline metadata may be recorded for audit, but do not satisfy completion without exact merged PR truth.

## Fail-Closed Rules

Manual sync must leave the task in `ready_for_owner` and emit reconciliation-required evidence when:

- The linked PR evidence is missing.
- The linked PR exists but is unmerged.
- The GitHub issue is closed without matching merged PR evidence.
- A different PR number is merged.
- A PR in a different repo is merged.
- Fixture or mocked evidence appears outside tests.
- Local task status was changed without verified GitHub merged PR evidence.

## Successful Side Effects

On the first valid reconciliation:

- `tasks.status` becomes `done`.
- `tasks.completed_at` is populated through existing task completion behavior.
- Done label projection is applied or observed.
- Stale `mc:ready-for-owner` projection is removed.
- Terminal activity records `terminal_event='github_pr_merged'`.
- Existing notification rows remain traceable and bounded.
- `advanceTaskChain` runs only after verified terminal evidence.
- Exactly one successor launch or terminal advancement outcome exists.

## Idempotency

Repeating manual sync with the same merged PR evidence must leave:

- Task status stable at `done`.
- No duplicate downstream launch.
- No duplicate terminal activity flood.
- No duplicate owner-action notification.
- No reconciliation-required notification flood.
- No duplicate cleanup work.

## Test Fixture Boundary

Automated tests may inject fixture GitHub state into direct `pullFromGitHub` coverage. Live API, UI, and future poller callsites must not pass fixtures. Live smoke proof must come from real GitHub state for the fresh synthetic C4 PR.

## Out Of Scope

- New webhook listener.
- Automatic scheduler or polling lifecycle.
- New sync API.
- Claim/run schema.
- Sandbox lifecycle.
- Harness adapter.
- Packet persistence, packet UI, evidence dashboard, or lifecycle snapshot API.
- New terminal-done notification type.
