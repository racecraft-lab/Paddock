# Pilot Smoke Checklist

SPEC-009C1 live smoke is operator-controlled. Automated tests must not create,
edit, close, or sync live GitHub issues outside mocked fixtures.

## Candidate Selection

- Record the target deployment URL, workspace id, and timestamp.
- Search GitHub with:

  ```text
  repo:racecraft-lab/mission-control is:issue is:open label:"mc:inbox" -linked:pr
  ```

- Confirm the candidate is an issue, not a PR; is open; has `mc:inbox`; has at
  least one `priority:*`; has exactly one routable `area:*`; has no linked PR;
  and has no terminal/conflicting status label such as `mc:done` or `mc:failed`.
- If no safe candidate exists, run the synthetic fallback script only with an
  explicit mutation opt-in. It must reuse an existing open
  `[mc-pilot] synthetic e2e issue` before creating one.

## Synthetic Fallback

- Command shape:

  ```bash
  GITHUB_TOKEN=<token> node scripts/pilot-issue-smoke.mjs --allow-live-mutation
  ```

- The created or reused fallback must have exactly the required pilot labels:
  `mc:inbox`, `priority:medium`, and `area:dev`.
- Do not auto-close, auto-delete, or auto-repair the synthetic issue. If labels
  are wrong, fix or close it manually in GitHub, then rerun the smoke path.

## Sync Proof

- Trigger existing GitHub sync manually through the existing operator route or
  equivalent local operator action. Do not enable cron or automatic pollers for
  this spec.
- Record cleanup-safe evidence only: repo slug, issue number or URL, workspace
  id, task id, sync timestamp, booleans, reason codes, and row counts.
- Verify exactly one root task exists:

  ```sql
  SELECT COUNT(*)
  FROM tasks
  WHERE workspace_id = :workspace_id
    AND github_repo = 'racecraft-lab/mission-control'
    AND github_issue_number = :issue_number
    AND github_synced_at IS NOT NULL
    AND parent_task_id IS NULL;
  ```

- Re-run the same sync once and verify the count remains `1`.

## Local-Only Exclusion

- Create or identify a local-only lookalike task through normal Mission Control
  task creation.
- Verify it does not count as pilot evidence because `github_repo`,
  `github_issue_number`, and `github_synced_at` linkage are absent.

## Side-Effect Absence

- Verify the pilot task has no child tasks, no task-chain lineage,
  `dispatch_attempts = 0`, `assigned_to IS NULL`, no linked `runs`,
  `task_dispositions`, or `task_artifacts`, and no dispatch, pipeline, or
  remediation `activities`.
- If future claim, runner, or sandbox tables exist, check them only with
  table-if-exists guards. SPEC-009C1 must not add placeholder schema.

## Evidence Redaction

- Do not paste raw terminal scrollback, environment dumps, tokens,
  Authorization headers, API keys, credential values, or matched secret
  substrings into the PR or checklist notes.
- Acceptable evidence includes issue URL, task id, workspace id, timestamps,
  `token_set` booleans, stable error codes, counts, and content hashes.

## Cleanup

- If a synthetic issue was created, record its issue URL and intended cleanup
  owner. Cleanup is manual; SPEC-009C1 does not auto-close synthetic issues.
