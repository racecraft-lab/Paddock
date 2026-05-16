# Pilot Smoke Checklist

SPEC-009C1 and SPEC-009C2 live smoke is operator-controlled. Automated tests
must not create, edit, close, route, or sync live GitHub issues outside mocked
fixtures.

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

- For SPEC-009C2, create or select a fresh issue distinct from prior SPEC-009C1
  synthetic issues. Preferred title:

  ```text
  [mc-pilot] SPEC-009C2 synthetic e2e issue YYYY-MM-DD clean run
  ```

- The SPEC-009C2 issue must have `mc:inbox`, exactly one `priority:*` label,
  and exactly one routable `area:*` label. Do not reuse a closed SPEC-009C1
  clean-run issue.
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

## SPEC-009C2 Triage Handoff Proof

- Apply or verify the current Mission Control workflow contract before the
  handoff. `mission-control_issue_triage` must expose disposition values
  `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`,
  `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`; only
  `ACTIONABLE_REMEDIATION` may route to `mission-control_remediation_plan`.
- For the fresh SPEC-009C2 synthetic issue, complete Issue Triage with:

  ```json
  {
    "disposition": "ACTIONABLE_REMEDIATION",
    "rationale": "Synthetic SPEC-009C2 handoff proof."
  }
  ```

- Verify exactly one remediation-planning successor exists for the triage task:

  ```sql
  SELECT COUNT(*)
  FROM tasks
  WHERE workspace_id = :workspace_id
    AND parent_task_id = :triage_task_id
    AND workflow_template_slug = 'mission-control_remediation_plan';
  ```

- Verify durable task-scoped evidence exists:

  ```sql
  SELECT disposition, reason
  FROM task_dispositions
  WHERE workspace_id = :workspace_id
    AND task_id = :triage_task_id;

  SELECT artifact_type, storage_kind
  FROM task_artifacts
  WHERE workspace_id = :workspace_id
    AND task_id = :triage_task_id
    AND artifact_type = 'triage_outcome';

  SELECT type, entity_type, entity_id
  FROM activities
  WHERE workspace_id = :workspace_id
    AND entity_type = 'task'
    AND entity_id = :triage_task_id
    AND type = 'pilot_triage_outcome_recorded';
  ```

- Re-run the handoff once and verify there is still exactly one remediation
  successor, one `task_dispositions` row, one `triage_outcome` artifact, and one
  `pilot_triage_outcome_recorded` task activity for the triage task.

## SPEC-009C2 Negative Fixture Checks

- Fixture-drive each non-remediation disposition in a disposable local or test
  database path: `DUPLICATE`, `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`,
  `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
- For each negative disposition, verify no remediation-planning successor is
  created and the triage task still has disposition, artifact, and task-scoped
  activity evidence.
- For `NEEDS_SPEC`, verify no SpecKit/SDD task, human clarification task,
  specialist task, close automation task, claim row, runner state, sandbox
  state, or harness adapter state is created by SPEC-009C2.

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
  owner before any cleanup action. Cleanup is manual; SPEC-009C1 does not
  auto-close synthetic issues from the script, app runtime, CI, or sync path.
- After evidence is captured, close synthetic GitHub issues manually rather
  than deleting them. Closed issues remain the external audit trail.
- Do not leave disposable `[mc-pilot]` smoke tasks active in Mission Control.
  After recording the issue URL, root task id, triage task id, remediation
  successor id if created, workspace id, sync timestamp, duplicate-sync result,
  duplicate-handoff result, and side-effect snapshot, close or remove only the
  synthetic smoke rows that were created solely for this checklist run.
- Before deleting disposable smoke task rows, take an operator-owned backup or
  export of the target database. Then verify cleanup leaves no synthetic pilot
  dirt behind:

  ```sql
  SELECT id, title, status, github_repo, github_issue_number
  FROM tasks
  WHERE title LIKE '[mc-pilot]%'
     OR (
       github_repo = 'racecraft-lab/mission-control'
       AND github_issue_number IN (:synthetic_issue_numbers)
     );
  ```
