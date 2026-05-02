# Contract: GitHub Terminal Event and `pullFromGitHub` Fixture Seam

## Function Signature

Production behavior remains unchanged for existing callsites:

```ts
pullFromGitHub(project, workspaceId)
```

SPEC-005 adds an optional third parameter for tests:

```ts
pullFromGitHub(project, workspaceId, opts?: {
  webhookFixture?: GitHubTerminalFixture
})
```

Production callsites must pass no third argument.

## Fixture Shape

```ts
type GitHubTerminalFixture = {
  repo: string
  issue_number?: number | null
  pull_request?: {
    number: number
    state?: 'open' | 'closed'
    merged?: boolean
    merged_at?: string | null
    merge_commit_sha?: string | null
  } | null
}
```

## Merge Evidence Rule

For a PR-producing task to move from `ready_for_owner` to `done`:

- Task `github_repo` must equal fixture/live PR repo.
- Task `github_pr_number` must equal fixture/live PR number.
- Evidence must include at least one of:
  - `merged=true`
  - non-empty `merged_at`
  - non-empty `merge_commit_sha`

Closed PRs without merge evidence do not complete the task.

## Closed Issue Without Merged PR

When GitHub sync sees a linked issue closed for a PR-producing task in `ready_for_owner` but no matching merged PR evidence:

- Task remains `ready_for_owner`.
- No `completed_at` is set.
- No `advanceTaskChain` call runs.
- One deduped reconciliation activity is written.
- One deduped `task_ready_for_owner` reconciliation notification is created.

## Verified Merge Completion

When verified merge evidence is present:

- Task transitions `ready_for_owner -> done`.
- Existing status-change activity and outbound sync behavior are preserved.
- `advanceTaskChain` runs only after the task status is successfully written to `done`.
- The chain trigger is `github_pr_merged`.

## Out of Scope

- Issue timeline inference.
- Inferring terminal PR from closing references.
- Adding a webhook delivery endpoint.
- Adding a terminal-event table.
- Adding a DB enum or CHECK constraint for `github_pr_merged`.
