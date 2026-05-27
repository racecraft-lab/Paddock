# Data Model: SPEC-013B - Claim and Reconciliation Authority

## Entity: Task Stage Claim

Persistence table: `task_stage_claims` in migration `078_task_stage_claims`.

Fields:

- `id`: Integer primary key.
- `workspace_id`: Workspace owning the task and claim.
- `task_id`: Claimed Mission Control task.
- `stage_key`: Stable workflow stage key, derived from workflow template slug, workflow template id, or fallback `assigned_dispatch`.
- `task_stage_attempt_id`: Required link to one `task_stage_attempts` row.
- `claim_run_id`: Scheduler tick or launch correlation id for the owner attempting dispatch.
- `claim_state`: `active`, `released`, or `stale_recovered`.
- `lease_owner`: Scheduler or dispatch owner string for the launch critical section.
- `lease_started_at`: Epoch seconds when active claim started.
- `lease_expires_at`: Epoch seconds when stale recovery may begin.
- `released_at`: Epoch seconds when the claim left active state.
- `release_reason`: Closed reason for release/recovery: `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, `stale_claim_recovered`, or `boundary_error_deferred`.
- `released_by_run_id`: Run id that released or recovered the claim.
- `stale_recovered_from_claim_id`: Prior claim id when a stale claim is replaced.
- `metadata_json`: Positive-allowlisted scalar diagnostics only.
- `created_at`: Epoch seconds.
- `updated_at`: Epoch seconds.

Constraints:

- `UNIQUE(task_stage_attempt_id)`.
- Unique partial index on `(workspace_id, task_id, stage_key)` where `claim_state = 'active'`.
- The partial unique index includes only active rows; historical `released` and `stale_recovered` rows for the same `(workspace_id, task_id, stage_key)` may coexist with one current active row.
- `claim_state` check constraint over the closed enum.
- `release_reason` is nullable only while active and otherwise uses the closed release/recovery vocabulary above.
- `stage_key`, `claim_run_id`, and `lease_owner` must be non-empty after trim.
- Replacement claim can be inserted only after the stale predecessor is transitioned out of `active`.
- Replacement claims created after stale recovery must use a distinct `task_stage_attempt_id` because each claim row is unique to one attempt row.

Release reason vocabulary:

- `launch_handoff_completed`: normal release after the protected dispatch boundary reaches launch handoff completion.
- `dispatch_failed`: release because the existing dispatch handoff failed before successful launch completion.
- `task_terminal_done`: release because local Mission Control task status became `done`.
- `task_terminal_failed`: release because local Mission Control task status became `failed`.
- `github_issue_terminal`: release because persisted linked GitHub issue truth is closed.
- `github_pr_terminal`: release because persisted linked GitHub PR truth is closed or merged.
- `governance_blocked`: release because governance changed to `block` after an active claim existed.
- `governance_deferred`: release because governance changed to `defer` after an active claim existed.
- `attempt_terminal_reconciled`: release because linked passive task-stage attempt lifecycle reached `succeeded`, `failed`, `released`, or `cancelled`.
- `stale_claim_recovered`: recovery of an expired active claim by a later run; this reason maps to `claim_state='stale_recovered'`.
- `boundary_error_deferred`: release because a sanitized claim/release boundary error occurred after a claim was already acquired and must be safely released.

Local terminal task statuses:

- For active-claim release decisions, Mission Control terminal task statuses are exactly `done` and `failed`.
- `awaiting_owner` and `ready_for_owner` are not terminal for SPEC-013B claim release; owner handoff remains non-terminal and guarded by later PR merge evidence.

State transitions:

- `active -> released`: normal launch handoff completion, dispatch failure release, Mission Control terminal state (`done` or `failed`), GitHub issue/PR terminal reconciliation, passive attempt terminal reconciliation (`succeeded`, `failed`, `released`, or `cancelled`), governance block/defer, or boundary-error deferral after a claim was already acquired and must be safely released.
- `active -> stale_recovered`: lease expiry recovered by a later run before replacement claim acquisition, using `release_reason='stale_claim_recovered'`.
- `released` and `stale_recovered` are terminal for that row.

## Entity: Claim Attempt Evidence

Persistence table: existing `task_stage_attempts` and `task_stage_attempt_events`.

Fields consumed:

- `id`, `workspace_id`, `task_id`, `stage_key`, `attempt_number`, `status`, `run_id`, `workflow_template_id`, `workflow_template_slug`, and lifecycle event metadata.

Rules:

- Attempt rows are created or appended as evidence for claim lifecycle.
- Attempt statuses remain passive evidence and never enforce active uniqueness.
- Claim acquisition links to exactly one attempt through `task_stage_claims.task_stage_attempt_id`.
- Terminal passive attempt statuses `succeeded`, `failed`, `released`, and `cancelled` can release a separate active claim with `attempt_terminal_reconciled`, but they do not create, own, or enforce the active claim.
- Stale recovery appends recovery evidence to the stale predecessor's attempt, then the replacement claim links to a distinct replacement attempt row.
- Duplicate-prevented and deferral paths append lifecycle evidence when an attempt exists, but they do not make `running` the active lock.
- Duplicate-prevented and deferral paths must not reuse an already-claimed attempt id for a new `task_stage_claims` row; when no claim row is inserted, attempt evidence remains passive activity context only.
- Not-claimable paths record `task_stage_claim_not_claimable` activity evidence with `outcome='not_claimable'` and a closed linkage/input reason. When a task-stage attempt already exists for the task/stage, they append passive lifecycle evidence using an existing lifecycle status and metadata; they do not create a new `not_claimable` attempt status and do not insert a `task_stage_claims` row.

## Entity: Reconciliation Decision

Persistence surface: `activities.data`, optional `resource_policy_events`, and optional `task_stage_attempt_events.metadata_json`.

Fields:

- `outcome`: One of `claim_acquired`, `duplicate_prevented`, `released`, `stale_recovered`, `governance_deferred`, `terminal_reconciled`, `stale_truth_deferred`, `boundary_deferred`, `not_claimable`.
- `workspace_id`, `task_id`, `stage_key`.
- `claim_id`, `task_stage_attempt_id`, `claim_run_id`, `lease_owner`, `lease_started_at`, `lease_expires_at`, `released_at`, `release_reason` from the closed `task_stage_claims.release_reason` vocabulary.
- `github_repo`, `github_issue_number`, `github_pr_number`, `github_synced_at`, `github_truth_age_seconds`, `freshness_threshold_seconds`.
- `lifecycle_result`, `lifecycle_health`, `lifecycle_interval_seconds`, `lifecycle_lease_stale`.
- `governance_decision`, `governance_policy_event_id`, `governance_audit_id`, `governance_reason_codes`.
- `boundary_error_category`: one of `sqlite_constraint_race`, `sqlite_busy`, `sqlite_database_error`, `malformed_claim_input`, `governance_evaluator_error`, `release_compare_failed`, or `unknown`.
- `correlation_id`, `redaction_applied`.

Safety rules:

- Only allowlisted fields above are persisted or exposed.
- Raw issue bodies, prompts, auth headers, tokens, raw provider responses, raw gateway/session payloads, secret-shaped values, stack traces, raw SQLite error messages, and matched secret substrings are rejected or redacted.
- Activity kinds are closed: `task_stage_claim_acquired`, `task_stage_claim_duplicate_prevented`, `task_stage_claim_released`, `task_stage_claim_stale_recovered`, `task_stage_claim_governance_deferred`, `task_stage_claim_terminal_reconciled`, `task_stage_claim_stale_truth_deferred`, `task_stage_claim_boundary_deferred`, and `task_stage_claim_not_claimable`.

## Entity: GitHub Issue-Linked Task

Persistence surface: existing `tasks` plus `projects`.

Fields consumed:

- `tasks.id`, `tasks.workspace_id`, `tasks.status`, `tasks.assigned_to`, `tasks.github_repo`, `tasks.github_issue_number`, `tasks.github_pr_number`, `tasks.github_synced_at`, `tasks.workflow_template_id`, `tasks.workflow_template_slug`, `tasks.project_id`, `tasks.priority`.
- `projects.workspace_id`, `projects.github_repo`, `projects.github_sync_enabled`, `projects.is_repo_sync_owner`.

Eligibility:

- Task status is `assigned`.
- Assignee is present.
- `github_repo` is a canonical GitHub full name in `owner/repo` form. The owner segment matches `[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?`; the repo segment matches `[A-Za-z0-9._-]{1,100}`; the value has exactly one slash, no scheme, host, query, fragment, `.git` suffix, whitespace, control characters, or `.`/`..` path segment.
- `github_issue_number` is a positive integer.
- The task workspace has an active sync-enabled repository owner for the same `github_repo`.
- Local-only, repo-only, non-issue-linked, and arbitrary non-terminal tasks are not claimable.

## Entity: GitHub Sync Lifecycle Scope

Persistence surface: existing M77 `github_sync_lifecycle_controls` and `github_sync_lifecycle_runs`.

Fields consumed:

- `workspace_id`, `github_repo`, `enabled`, `interval_seconds`, `lease_run_id`, `lease_expires_at`, `last_completed_at`, `last_error`, counters, ownership diagnostics, health severity, and state drivers.

Freshness rule:

- Threshold = `min(max(2 * interval_seconds, 600), 3600)`.
- If no lifecycle control exists, default `interval_seconds` to `300` and defer because lifecycle state is unavailable/unresolved.
- If `github_synced_at` is missing or older than threshold, defer claim and record `task_stage_claim_stale_truth_deferred`.
- Disabled, red, ownership-unresolved, stale-lease, or otherwise unhealthy lifecycle state defers claim.

## Entity: Claim Reconciliation Read Model

Endpoint: `GET /api/tasks/[id]/claim-reconciliation`.

Envelope version: `task_claim_reconciliation.v1`.

Fields:

- `version`, `generated_at`.
- `task`: scoped task identity, status, assignee, GitHub identity, and stage key.
- `flag`: `FEATURE_TASK_CONTROL_PLANE` resolution.
- `eligibility`: current claimability and reasons.
- `active_claim`: current active claim or `null`.
- `claim_history`: bounded recent claim rows.
- `latest_decisions`: bounded recent claim/reconciliation activities.
- `attempt_links`: ids and route links for matching task-stage attempts.
- `diagnostics`: schema availability and redaction status.

Rules:

- Viewer auth and workspace scoping are required.
- The route is read-only and exposes no mutation URLs or command affordances.
- Missing or unauthorized task returns `404` or scoped auth errors consistent with existing task routes.
- `eligibility.state` is closed to `claimable`, `flag_off_legacy`, `not_claimable`, `duplicate_active_claim`, `stale_truth_deferred`, `governance_deferred`, `terminal_reconciled`, `stale_recovered`, `boundary_deferred`, and `schema_unavailable`.
- Reason codes are closed and grouped by linkage/input, sync ownership/lifecycle, GitHub truth freshness, local terminal state, governance, duplicate/recovery, boundary errors, flag-off legacy behavior, and eligible state as defined in the API contract.
- When `FEATURE_TASK_CONTROL_PLANE=false`, the read model returns `flag.enabled=false`, `eligibility.state=flag_off_legacy`, `active_claim=null`, bounded empty arrays when no rows exist, and diagnostics showing claim, attempt, and GitHub sync write paths were not touched.
- The read model may link to existing `task_stage_attempts` evidence and summarize persisted local GitHub/lifecycle fields, but it must not call attempt write helpers, claim acquire/release/recovery helpers, governance writers, GitHub sync trigger/control paths, lifecycle lease/run writers, or live GitHub/client fetches.
