# Data Model: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

## Poller Lifecycle Control

Table: `github_sync_lifecycle_controls`

One durable control record per repository sync scope.

Fields:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `workspace_id INTEGER NOT NULL`
- `github_repo TEXT NOT NULL`
- `enabled INTEGER NOT NULL DEFAULT 0`
- `interval_seconds INTEGER NOT NULL DEFAULT 300`
- `max_pages INTEGER NOT NULL DEFAULT 10`
- `max_issues INTEGER NOT NULL DEFAULT 1000`
- `max_duration_seconds INTEGER NOT NULL DEFAULT 45`
- `owner_project_id INTEGER`
- `disabled_reason TEXT`
- `next_retry_at INTEGER`
- `next_retry_reason TEXT`
- `backoff_seconds INTEGER NOT NULL DEFAULT 0`
- `consecutive_failures INTEGER NOT NULL DEFAULT 0`
- `lease_run_id TEXT`
- `lease_owner TEXT`
- `lease_started_at INTEGER`
- `lease_expires_at INTEGER`
- `last_started_at INTEGER`
- `last_completed_at INTEGER`
- `last_success_cursor TEXT`
- `last_error TEXT`
- `latest_partial_run_reason TEXT`
- `total_successes INTEGER NOT NULL DEFAULT 0`
- `total_failures INTEGER NOT NULL DEFAULT 0`
- `total_partials INTEGER NOT NULL DEFAULT 0`
- `total_overlap_rejections INTEGER NOT NULL DEFAULT 0`
- `skipped_owner_count INTEGER NOT NULL DEFAULT 0`
- `skipped_non_owner_count INTEGER NOT NULL DEFAULT 0`
- `created_at INTEGER NOT NULL DEFAULT (unixepoch())`
- `updated_at INTEGER NOT NULL DEFAULT (unixepoch())`

Validation:
- Unique `(workspace_id, github_repo)`.
- `interval_seconds >= 60`.
- `max_pages BETWEEN 1 AND 100`.
- `max_issues BETWEEN 1 AND 5000`.
- `max_duration_seconds BETWEEN 5 AND 600`.
- `enabled IN (0, 1)`.
- Lease is active only when `lease_run_id IS NOT NULL AND lease_expires_at > unixepoch()`.

State transitions:
- `disabled -> enabled`: validate `FEATURE_GITHUB_SYNC_AUTOMATION`, bounds, and workspace scope; set `next_retry_at` to now or next interval.
- `enabled -> running`: acquire lease transactionally and set `last_started_at`.
- `running -> success`: release lease, update `last_completed_at`, advance `last_success_cursor`, reset backoff, increment success counters.
- `running -> failed`: release lease, preserve `last_success_cursor`, set `last_error`, increment failures, compute bounded backoff.
- `running -> partial`: release lease, preserve success cursor unless safe resume boundary is proven, set `latest_partial_run_reason`, increment partials.
- `running -> stale_recovered`: expired lease is recorded in run history before replacement lease is acquired.
- `enabled -> disabled`: set `enabled=0`, set disabled reason, prevent future automatic ticks; manual sync remains available.

## Sync Run

Tables: compatibility `github_syncs` plus detail `github_sync_lifecycle_runs`

`github_syncs` remains the public summary history row used by existing APIs and UI. `github_sync_lifecycle_runs` stores SPEC-013A1 lifecycle detail and links to `github_syncs.id` when a summary row exists.

Fields:
- `run_id TEXT PRIMARY KEY`
- `sync_id INTEGER`
- `workspace_id INTEGER NOT NULL`
- `github_repo TEXT NOT NULL`
- `project_id INTEGER`
- `trigger TEXT NOT NULL` (`manual`, `automatic`)
- `requested_by TEXT`
- `lease_owner TEXT`
- `started_at INTEGER NOT NULL`
- `completed_at INTEGER`
- `result TEXT NOT NULL`
- `failure_reason TEXT`
- `partial_run_reason TEXT`
- `cursor_before TEXT`
- `cursor_after TEXT`
- `cursor_advanced INTEGER NOT NULL DEFAULT 0`
- `pages_fetched INTEGER NOT NULL DEFAULT 0`
- `issues_seen INTEGER NOT NULL DEFAULT 0`
- `issues_pulled INTEGER NOT NULL DEFAULT 0`
- `issues_pushed INTEGER NOT NULL DEFAULT 0`
- `duration_ms INTEGER`
- `stale_recovered_from_run_id TEXT`
- `diagnostics_json TEXT`

Valid results:
- `running`
- `success`
- `failed`
- `partial`
- `skipped_disabled`
- `skipped_overlap`
- `rejected_overlap`
- `skipped_non_owner`
- `skipped_owner`
- `ownership_unresolved`
- `stale_recovered`

Cursor rules:
- `cursor_advanced=1` only when `result='success'` and `cursor_after` is non-null.
- Failed, overlap, skipped, unresolved, and stale-recovered records keep `cursor_after=cursor_before`.
- Partial records preserve cursor unless implementation stores a provably safe resume boundary.

## Repository Sync Scope

Logical scope: `(workspace_id, github_repo)`.

Candidate fields from `projects`:
- `projects.id`
- `projects.workspace_id`
- `projects.github_repo`
- `projects.github_sync_enabled`
- `projects.is_repo_sync_owner`
- `projects.status`
- `projects.github_default_branch`

Selection rules:
- Only active projects with `github_sync_enabled=1` and non-null `github_repo` are candidates.
- Group candidates by `(workspace_id, github_repo)`.
- One candidate: may poll.
- Multiple candidates and exactly one `is_repo_sync_owner=1`: owner may poll; non-owners record skipped ownership outcomes.
- Multiple candidates and zero or multiple owners: record `ownership_unresolved`; do not poll duplicate candidates.

## Sync Ownership Decision

Value object emitted per candidate group.

Fields:
- `workspace_id`
- `github_repo`
- `owner_project_id`
- `eligible_project_ids`
- `skipped_project_ids`
- `decision` (`single_project`, `owner_selected`, `skipped_non_owner`, `ownership_unresolved`, `disabled`)
- `reason`

Validation:
- Automatic polling cannot call `pullFromGitHub` until decision is `single_project` or `owner_selected`.
- Owner semantics do not require `FEATURE_AREA_LABEL_ROUTING` to be enabled.

## Sync Cursor

Stored on `github_sync_lifecycle_controls.last_success_cursor`.

Format:
- ISO timestamp matching GitHub `updated_at` cursor semantics for the first implementation.
- Future opaque cursor formats may be added only if the contract version changes or remains backward-compatible.

Rules:
- Initial value null means full bounded sync.
- Success updates the cursor to the maximum safely drained GitHub `updated_at`.
- Failure and rejected/skipped outcomes never advance it.

## Partial Run State

Stored on both control summary and run detail.

Reasons:
- `max_pages`
- `max_issues`
- `max_duration`
- `rate_limit_window`
- `operator_disabled_during_run`

Rules:
- Partial state must include enough diagnostics for the next run to explain why it resumes from the last success cursor.
- Partial run visibility appears in GET lifecycle envelope and GitHub Sync panel.

## Lifecycle Status Envelope

Returned by `GET /api/github/sync` as `github_sync_lifecycle`.

Top-level fields:
- `version`
- `generated_at`
- `flag`
- `scopes`
- `diagnostics`

Per-scope fields:
- `scope`
- `controls`
- `active_run`
- `last_run`
- `last_success_cursor`
- `last_error`
- `backoff`
- `counters`
- `skipped`
- `diagnostics`
