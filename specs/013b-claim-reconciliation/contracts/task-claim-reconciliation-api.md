# Contract: Task Claim Reconciliation API

## GET `/api/tasks/{id}/claim-reconciliation`

Read-only task-scoped claim and reconciliation evidence.

### Auth

- Required role: `viewer`.
- Workspace scoping: same semantics as existing task routes.
- No mutation affordances are exposed.

### Parameters

- `id`: positive integer task id.

### Success Response

Status: `200`

```json
{
  "version": "task_claim_reconciliation.v1",
  "generated_at": "2026-05-27T00:00:00.000Z",
  "task": {
    "id": "123",
    "workspace_id": "4",
    "status": "assigned",
    "assigned_to": "codex",
    "stage": {
      "stage_key": "paddock_issue_remediation",
      "workflow_template_id": 17,
      "workflow_template_slug": "paddock_issue_remediation"
    },
    "github": {
      "repo": "racecraft-lab/Paddock",
      "issue_number": 42,
      "pr_number": null,
      "synced_at": "2026-05-27T12:00:00.000Z",
      "truth_age_seconds": 120,
      "freshness_threshold_seconds": 600
    }
  },
  "flag": {
    "key": "FEATURE_TASK_CONTROL_PLANE",
    "enabled": true,
    "reason": "workspace_override"
  },
  "eligibility": {
    "state": "claimable",
    "reasons": []
  },
  "active_claim": {
    "id": "7",
    "claim_state": "active",
    "task_stage_attempt_id": "11",
    "claim_run_id": "dispatch-20260527-abc",
    "lease_owner": "scheduler:task_dispatch",
    "lease_started_at": "2026-05-27T12:02:00.000Z",
    "lease_expires_at": "2026-05-27T12:07:00.000Z"
  },
  "claim_history": [
    {
      "id": "7",
      "claim_state": "active",
      "release_reason": null,
      "created_at": "2026-05-27T12:02:00.000Z",
      "updated_at": "2026-05-27T12:02:00.000Z"
    }
  ],
  "latest_decisions": [
    {
      "activity_id": "91",
      "type": "task_stage_claim_acquired",
      "outcome": "claim_acquired",
      "reason": "eligible",
      "claim_id": "7",
      "task_stage_attempt_id": "11",
      "created_at": "2026-05-27T12:02:00.000Z"
    }
  ],
  "attempt_links": [
    {
      "task_stage_attempt_id": "11",
      "href": "/api/tasks/123/stage-attempts"
    }
  ],
  "diagnostics": {
    "schema_version": "078_task_stage_claims",
    "redaction_applied": false
  }
}
```

### Read Model States And Reasons

`eligibility.state` is a closed API enum:

- `claimable`: persisted local task state, GitHub truth, lifecycle health, governance, stage, and feature-flag state allow claim acquisition.
- `flag_off_legacy`: `FEATURE_TASK_CONTROL_PLANE=false`; legacy dispatch remains authoritative and the route is diagnostic only.
- `not_claimable`: the task is visible but outside SPEC-013B autonomous claim intake.
- `duplicate_active_claim`: another active claim already protects the same `(workspace_id, task_id, stage_key)`.
- `stale_truth_deferred`: persisted GitHub task fields or SPEC-013A1 lifecycle status are missing, stale, disabled, unhealthy, or unresolved.
- `governance_deferred`: governance returned `block` or `defer`, so launch is not claimable.
- `terminal_reconciled`: persisted local task, GitHub issue, or linked PR truth is terminal.
- `stale_recovered`: latest persisted evidence records stale claim recovery for this task and stage.
- `boundary_deferred`: claim/release boundary classification failed closed for this task because a safe launch decision could not be completed.
- `schema_unavailable`: the task is visible but the M78 claim schema is unavailable, so the response is limited to task identity and diagnostics.

`eligibility.reasons[]` and `latest_decisions[].reason` use this closed reason vocabulary:

- Linkage/input: `not_assigned`, `missing_assignee`, `missing_github_repo`, `invalid_github_repo`, `missing_github_issue_number`, `workspace_repo_owner_missing`.
- GitHub truth/lifecycle: `github_truth_missing`, `github_truth_stale`, `lifecycle_unavailable`, `lifecycle_disabled`, `lifecycle_unhealthy`, `lifecycle_stale_lease`.
- Terminal state: `github_issue_terminal`, `github_pr_terminal`.
- Governance: `governance_blocked`, `governance_deferred`.
- Duplicate/recovery: `active_claim_exists`, `stale_claim_recovered`.
- Boundary errors: `sqlite_constraint_race`, `sqlite_busy`, `sqlite_database_error`, `malformed_claim_input`, `governance_evaluator_error`, `release_compare_failed`, `unknown_boundary_error`.
- Flag/schema: `feature_flag_disabled`, `schema_unavailable`.
- Eligible: `eligible`.

`latest_decisions[].outcome` is a closed API enum aligned with persisted reconciliation evidence:

- `claim_acquired`
- `duplicate_prevented`
- `released`
- `stale_recovered`
- `governance_deferred`
- `terminal_reconciled`
- `stale_truth_deferred`
- `boundary_deferred`
- `not_claimable`

Business deferrals and reconciliation outcomes above remain represented in the `200` read model. Transport errors are reserved for authentication, workspace scope, malformed task identity, or invisible task conditions.

### Identifier And Release Vocabularies

`task.github.repo` is serialized only after validation as canonical `owner/repo`: owner matches `[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?`, repo matches `[A-Za-z0-9._-]{1,100}`, exactly one slash is present, and URL, scp-like, path traversal, whitespace/control-character, multi-segment, missing-owner, missing-repo, and `.git`-suffix values are rejected from claimability with `invalid_github_repo`.

`latest_decisions[].type` is built from the closed claim activity taxonomy:

- `task_stage_claim_acquired` -> `claim_acquired`
- `task_stage_claim_duplicate_prevented` -> `duplicate_prevented`
- `task_stage_claim_released` -> `released`
- `task_stage_claim_stale_recovered` -> `stale_recovered`
- `task_stage_claim_governance_deferred` -> `governance_deferred`
- `task_stage_claim_terminal_reconciled` -> `terminal_reconciled`
- `task_stage_claim_stale_truth_deferred` -> `stale_truth_deferred`
- `task_stage_claim_boundary_deferred` -> `boundary_deferred`
- `task_stage_claim_not_claimable` -> `not_claimable`

`claim_history[].release_reason` is null for active claims and otherwise closed to `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, `stale_claim_recovered`, and `boundary_error_deferred`.

### Flag-Off Response

For a visible task when `FEATURE_TASK_CONTROL_PLANE=false`, the route still returns HTTP `200` with the same versioned envelope:

```json
{
  "version": "task_claim_reconciliation.v1",
  "flag": {
    "key": "FEATURE_TASK_CONTROL_PLANE",
    "enabled": false,
    "reason": "default_off"
  },
  "eligibility": {
    "state": "flag_off_legacy",
    "reasons": ["feature_flag_disabled"]
  },
  "active_claim": null,
  "claim_history": [],
  "latest_decisions": [],
  "attempt_links": [],
  "diagnostics": {
    "schema_version": "078_task_stage_claims",
    "redaction_applied": false
  }
}
```

If historical claim, decision, or attempt evidence already exists, the route may return those records as read-only history. It must not delete, hide, rewrite, or synthesize historical records merely because the flag is currently off. The flag-off response must not acquire a claim, release a claim, recover a stale claim, write reconciliation decisions, refresh GitHub sync lifecycle state, or perform any live GitHub fetch.

### Preservation And Read-Only Boundary

The claim-reconciliation read route may:

- read and serialize existing `task_stage_claims` rows;
- link to existing SPEC-013A task-stage attempts through `/api/tasks/{id}/stage-attempts`;
- summarize persisted local task GitHub fields such as repo, issue, PR, and `github_synced_at`;
- summarize persisted SPEC-013A1 lifecycle health/status fields already stored locally.

The claim-reconciliation read route must not:

- call stage-attempt write helpers such as `createTaskStageAttempt`, `appendTaskStageAttemptEvent`, or `archiveTaskStageAttempt`;
- call claim admission, release, stale recovery, or acquisition helpers;
- call resource-governance writers or create `resource_policy_events`;
- call `pullFromGitHub`, GitHub clients, external tracker fetches, or sync/pull functions;
- call lifecycle lease/run writers such as lifecycle acquire, run-start, complete, release, rejected-overlap, or retry writers;
- trigger `/api/github/sync`, `/api/github/sync` POST behavior, `/api/github/sync/control` behavior, manual sync, automatic sync, lease acquisition, or backoff reset;
- create or mutate `tasks`, `task_stage_claims`, `task_stage_attempts`, `task_stage_attempt_events`, `activities`, `github_syncs`, `github_sync_lifecycle_controls`, or `github_sync_lifecycle_runs`;
- expose action URLs or mutation affordances derived from GitHub sync recovery affordances.

The existing GitHub Sync API contracts, including `syncs`, `poller`, `github_sync_lifecycle.v1`, manual sync fallback, overlap behavior, lifecycle controls, and sync-health envelope, are preserved unchanged by SPEC-013B.

### Error Responses

- `401`: `{ "error": "unauthenticated" }`
- `403`: `{ "error": "forbidden_workspace_scope" }`
- `404`: `{ "error": "task_not_found" }`

### Contract Rules

- The response must not include raw issue bodies, prompts, auth headers, tokens, raw provider responses, raw gateway/session payloads, or matched secret substrings.
- Boundary failure diagnostics must expose only closed reason/category codes, redaction flags, or content hashes; raw SQLite errors, stack traces, governance exception messages, provider payloads, and secret-shaped substrings are not serialized.
- `latest_decisions` must be built from the closed claim activity taxonomy.
- `active_claim` is `null` when no active claim exists.
- The route does not expose `actions`, `retry`, `release`, `cancel`, `POST`, `PATCH`, or `DELETE` affordances.
- OpenAPI and `/api/index` must register only the GET route and must not imply action URLs, mutation controls, manual release, retry, cancel, sync trigger, or dashboard-control affordances.
- Tests must snapshot row counts before and after GET for `tasks`, `task_stage_claims`, `task_stage_attempts`, `task_stage_attempt_events`, `activities`, `github_sync_lifecycle_controls`, and `github_sync_lifecycle_runs` to prove the read route has no persistence side effects.
