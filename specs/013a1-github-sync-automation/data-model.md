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
- `enabled -> skipped_owner`: after grouping automatic candidates by `(workspace_id, github_repo)`, if the selected owner candidate is already represented by another run decision for the same repository scope in the tick, do not acquire a lease and do not call `pullFromGitHub`; write a terminal `github_sync_lifecycle_runs` row with `result='skipped_owner'`, `trigger='automatic'`, owner/project/scope diagnostics, `cursor_after=cursor_before`, and `cursor_advanced=0`; increment `skipped_owner_count`; preserve `last_success_cursor`, backoff, and failure counters; update `last_completed_at`; emit `github_sync_skipped_owner` activity.
- `enabled -> skipped_non_owner`: when multiple eligible projects share a repository and exactly one `is_repo_sync_owner=1` project is selected, each non-owner candidate records a terminal non-ingesting automatic run with `result='skipped_non_owner'`; no lease is acquired, no cursor advances, and `pullFromGitHub` is not called; increment `skipped_non_owner_count`; preserve `last_success_cursor`, backoff, and failure counters; update `last_completed_at`; include `owner_project_id`, `project_id`, `eligible_project_ids`, and `skipped_project_ids` in safe diagnostics; emit `github_sync_skipped_non_owner` activity.
- `enabled -> ownership_unresolved`: when a repository group has multiple eligible projects and zero or multiple resolvable owners, record a terminal non-ingesting automatic run with `result='ownership_unresolved'`; no lease is acquired, no cursor advances, `pullFromGitHub` is not called, and the system MUST NOT fall back to duplicate per-project automatic polling; preserve success cursor, backoff, and failure counters except for explicit unresolved diagnostics; set `last_error` or diagnostics to sanitized category `ownership_unresolved`; update `last_completed_at`; emit `github_sync_ownership_unresolved` activity; derived health severity is `red`.

Backoff reason values:
- `github_retry_after`
- `github_rate_limit_reset`
- `exponential_backoff`
- `manual_reset`

Backoff rules:
- `Retry-After` is preferred when valid.
- `X-RateLimit-Reset` is used only when `Retry-After` is absent or invalid and the reset value is a future timestamp.
- Exponential backoff is used when no valid GitHub retry signal exists.
- All retry times are capped by the Product Line/workspace maximum; diagnostics record `retry_signal_source`, `retry_cap_applied`, and `retry_fallback_applied`.

Disabled scope rules:
- `skipped_disabled` is a terminal non-ingesting lifecycle result.
- Disabled automatic controls do not acquire leases, do not call `pullFromGitHub`, do not advance cursors, and do not block manual sync from attempting the same scope after acquiring overlap control.

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

Failure category vocabulary:
- `transport_timeout`
- `transport_network`
- `github_rate_limited`
- `github_auth_or_scope`
- `github_not_found`
- `github_http_4xx`
- `github_http_5xx`
- `github_malformed_json`
- `github_unexpected_shape`
- `github_issue_schema_invalid`
- `database_error`
- `unknown`

Failure category rules:
- Store the stable category in `failure_reason` or `diagnostics_json.failure.category`.
- Store only sanitized failure messages in `diagnostics_json.failure.sanitized_message`.
- Never store raw GitHub response bodies, raw headers, authorization values, tokens, credentials, API keys, or matched secret substrings.

Cursor rules:
- `cursor_advanced=1` only when `result='success'` and `cursor_after` is non-null.
- Failed, overlap, skipped, unresolved, and stale-recovered records keep `cursor_after=cursor_before`.
- Partial records preserve cursor unless implementation stores a provably safe resume boundary.

Ownership terminal run rules:
- `skipped_owner`, `skipped_non_owner`, and `ownership_unresolved` are terminal run results, not `running` attempts.
- These outcomes never acquire or release overlap leases, never create `github_syncs` compatibility rows unless the existing sync engine is reached, never call `pullFromGitHub`, and always preserve the cursor.

Diagnostics JSON guidance:
- Diagnostics MUST be scoped to an explicit safe-field allowlist needed for operator review: scheduler registration, flag resolution reason, schema version, lease age/expiry/stale status, cursor effect, failure category, sanitized failure message, redaction-applied flag, status code class, GitHub request id when present, endpoint category, rate-limit counters, retry count, timestamp, internal correlation ids, backoff, partial bound, ownership decision, skipped counters, and manual fallback availability.
- Diagnostics MUST NOT include raw GitHub response bodies, authorization headers, tokens, credentials, API keys, full secret detector matches, or other secret-bearing payloads.
- Raw request or response headers and bodies MUST be excluded by default unless a future artifact explicitly allowlists and redacts a specific field.

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
- Owner-selection outcomes apply independently of `FEATURE_AREA_LABEL_ROUTING`; that flag gates only area-label parsing, emission, routing, and backfill behavior.

## Sync Ownership Decision

Value object emitted per candidate group.

Fields:
- `workspace_id`
- `github_repo`
- `owner_project_id`
- `eligible_project_ids`
- `skipped_project_ids`
- `decision` (`single_project`, `owner_selected`, `skipped_owner`, `skipped_non_owner`, `ownership_unresolved`, `disabled`)
- `reason`

Validation:
- Automatic polling cannot call `pullFromGitHub` until decision is `single_project` or `owner_selected`.
- `skipped_owner`, `skipped_non_owner`, and `ownership_unresolved` decisions must be represented as terminal lifecycle transitions with run detail, control summary or counter updates, activity evidence, and cursor preservation.
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
- `malformed_page`

Rules:
- `malformed_page` means a fetched GitHub issue page was malformed JSON, not an array, had an unexpected shape, or contained issue records missing required fields after at least one earlier page in the same run had been fully validated and durably safe to resume from.
- If no safe earlier page boundary exists, malformed page responses produce `result='failed'` with the matching failure category instead of `result='partial'`.
- Partial records preserve cursor unless implementation stores a provably safe resume boundary.
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

## Lifecycle Activity Evidence

Stored in existing `activities` rows and linked by `workspace_id`, `github_repo`, and `run_id` when applicable.

Required event types:
- `github_sync_automation_enabled`
- `github_sync_automation_disabled`
- `github_sync_run_started`
- `github_sync_run_succeeded`
- `github_sync_run_failed`
- `github_sync_backoff_scheduled`
- `github_sync_backoff_reset`
- `github_sync_partial_bounded_stop`
- `github_sync_skipped_overlap`
- `github_sync_rejected_overlap`
- `github_sync_skipped_owner`
- `github_sync_skipped_non_owner`
- `github_sync_ownership_unresolved`
- `github_sync_stale_recovered`
- `github_sync_manual_fallback_completed`
- `github_sync_manual_fallback_failed`

Minimal payload fields when known:
- `workspace_id`
- `github_repo`
- `run_id`
- `trigger`
- `result`
- `project_id`
- `owner_project_id`
- `cursor_advanced`
- `failure_category`
- `partial_run_reason`
- `backoff_seconds`
- `next_retry_at`
- `retry_after_seconds`
- `lease_expires_at`

Payload rules:
- Store sanitized categories/messages only.
- Do not store raw provider response bodies, authorization headers, tokens, credentials, API keys, or matched secret substrings.

## Lifecycle Health Summary

Derived from M77 lifecycle control and run state, not from a new telemetry service.

Fields:
- `severity` (`disabled`, `green`, `amber`, `red`)
- `reason`
- `source_updated_at`
- `state_drivers`
- `manual_fallback_available`
- `runbook_links`
- `recovery_affordances`

Severity rules:
- `disabled`: feature flag is off or lifecycle control is disabled.
- `green`: latest terminal run is successful and no stale lease or backoff is active.
- `amber`: active backoff, partial run, overlap/skipped ownership increase, or transient failure.
- `red`: stale lease, repeated failure, ownership unresolved, or M77 schema unavailable.
