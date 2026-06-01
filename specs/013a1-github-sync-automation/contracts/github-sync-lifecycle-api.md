# Contract: GitHub Sync Lifecycle API v1

## Authentication And Scope

- All endpoints require authenticated `operator` role unless an existing endpoint is already stricter.
- Product Line/workspace scope is resolved through the existing workspace scope helpers.
- `GET /api/github/sync` keeps the current scope-resolution behavior for the existing `syncs` and `poller` fields, and `github_sync_lifecycle.scopes` MUST include only lifecycle scopes visible to the resolved Product Line/workspace context.
- Invalid, duplicate, or conflicting scope carriers return the existing structured `{ "error": "<scope error>" }` route behavior before lifecycle data is generated.
- `PATCH /api/github/sync/control` requires an explicit workspace scope.
- Enabling automation requires `FEATURE_GITHUB_SYNC_AUTOMATION` to resolve true for the target workspace through `resolveFlag`.
- This API does not mutate production feature flags.

## GET /api/github/sync

Preserves existing response fields and adds a versioned lifecycle envelope.

Response 200:

```json
{
  "syncs": [],
  "poller": {
    "running": false,
    "interval": 60000,
    "lastRun": 1779500000
  },
  "github_sync_lifecycle": {
    "version": "github_sync_lifecycle.v1",
    "generated_at": "2026-05-23T00:00:00.000Z",
    "flag": {
      "key": "FEATURE_GITHUB_SYNC_AUTOMATION",
      "enabled": false,
      "reason": "default_off"
    },
    "scopes": [
      {
        "scope": {
          "workspace_id": 4,
          "github_repo": "racecraft-lab/Paddock",
          "owner_project_id": 3
        },
        "controls": {
          "enabled": true,
          "interval_seconds": 300,
          "max_pages": 10,
          "max_issues": 1000,
          "max_duration_seconds": 45,
          "disabled_reason": null,
          "next_eligible_at": "2026-05-23T00:05:00.000Z"
        },
        "active_run": {
          "run_id": "ghsync_01J...",
          "trigger": "automatic",
          "lease_owner": "scheduler:pid-123",
          "started_at": "2026-05-23T00:00:00.000Z",
          "lease_expires_at": "2026-05-23T00:02:00.000Z"
        },
        "last_run": {
          "run_id": "ghsync_01J...",
          "trigger": "manual",
          "result": "success",
          "started_at": "2026-05-22T23:50:00.000Z",
          "completed_at": "2026-05-22T23:50:03.000Z",
          "pulled": 1,
          "pushed": 0,
          "partial_run_reason": null,
          "failure_reason": null,
          "cursor_advanced": true
        },
        "last_success_cursor": "2026-05-22T23:49:59.000Z",
        "last_error": null,
        "backoff": {
          "seconds": 0,
          "next_retry_at": null,
          "reason": null,
          "signal_source": null,
          "cap_applied": false,
          "fallback_applied": false
        },
        "counters": {
          "successes": 12,
          "failures": 1,
          "partials": 2,
          "overlap_rejections": 0
        },
        "skipped": {
          "owner": 0,
          "non_owner": 3
        },
        "diagnostics": {
          "latest_partial_run_reason": null,
          "ownership": "owner_selected",
          "lease": {
            "age_seconds": 0,
            "stale": false
          },
          "cursor_effect": "advanced",
          "manual_fallback_available": true,
          "failure": {
            "category": null,
            "sanitized_message": null,
            "redaction_applied": false
          },
          "health_summary": {
            "severity": "green",
            "reason": "last run succeeded",
            "source_updated_at": "2026-05-23T00:00:03.000Z",
            "state_drivers": [],
            "manual_fallback_available": true,
            "runbook_links": [
              {
                "id": "github_sync_lifecycle",
                "href": "/docs/runbook/migration-rollback.md"
              }
            ],
            "recovery_affordances": [
              {
                "id": "manual_sync",
                "endpoint": "/api/github/sync"
              },
              {
                "id": "reset_backoff",
                "endpoint": "/api/github/sync/control"
              }
            ]
          }
        }
      }
    ],
    "diagnostics": {
      "scheduler_task_registered": true,
      "schema_version": "077_github_sync_lifecycle",
      "telemetry_service": "none"
    }
  }
}
```

Diagnostics rules:
- `health_summary.severity` is `disabled` when the feature flag or scope control is off, `green` when the latest terminal run succeeded and no stale lease/backoff is active, `amber` for active backoff, partial runs, overlap or skipped-ownership increases, or transient failure, and `red` for stale leases, repeated failures, ownership unresolved, or schema unavailable.
- `health_summary` is derived from M77 lifecycle control/run state and existing local Paddock diagnostics patterns; this contract does not introduce an external telemetry service.
- `failure.category` MUST be one of `transport_timeout`, `transport_network`, `github_rate_limited`, `github_auth_or_scope`, `github_not_found`, `github_http_4xx`, `github_http_5xx`, `github_malformed_json`, `github_unexpected_shape`, `github_issue_schema_invalid`, `database_error`, or `unknown`.
- `github_malformed_json`, `github_unexpected_shape`, and `github_issue_schema_invalid` MUST be distinguishable in diagnostics so malformed transport payloads are not confused with valid empty pages.
- `failure.sanitized_message`, `last_error`, run `failure_reason`, diagnostics, activity payloads, and health summaries MUST be constructed from explicit safe-field allowlists and MUST NOT contain `GITHUB_TOKEN`, authorization headers, raw GitHub response bodies, personal access tokens, API keys, credentials, or matched secret substrings.
- Lifecycle diagnostics may include status code class, GitHub request id when present, endpoint category, rate-limit counters, retry count, redacted error class, timestamp, and internal correlation ids. Raw request/response headers and bodies are excluded by default unless a future contract explicitly allowlists and redacts a specific field.
- Automatic retry timing MUST choose retry signals in this order: valid `Retry-After`, valid future `X-RateLimit-Reset`, bounded exponential backoff.
- `backoff.signal_source` MUST be `retry_after`, `x_ratelimit_reset`, `exponential`, or `none`.
- `backoff.cap_applied` MUST be true when the selected retry time exceeds the Product Line/workspace maximum and is capped.
- Invalid, past, or unparsable retry headers MUST set `fallback_applied=true` when exponential backoff is used instead.
- A run stopped by a malformed later page reports `last_run.result='partial'` and `last_run.partial_run_reason='malformed_page'` only when a prior safe resume boundary exists; a malformed first page or unsafe malformed page reports `last_run.result='failed'` with the matching `failure.category`; in both cases, `last_success_cursor` remains unchanged unless a success-only safe cursor advancement rule is satisfied.
- `manual_fallback_available` indicates whether the existing manual `POST /api/github/sync` fallback remains available after applying feature flag, lifecycle control, role, and overlap state.

## POST /api/github/sync

Existing manual contract is preserved.

Request:

```json
{ "action": "trigger", "project_id": 3, "workspace_id": 4 }
```

Success response 200:

```json
{ "ok": true, "pulled": 1, "pushed": 0 }
```

Same-scope manual overlap is deterministic rejection in API v1. No queued or serialized manual response is introduced.

Single-project same-scope overlap response 409:

```json
{
  "ok": false,
  "error": "GitHub sync already running for this scope",
  "code": "github_sync_overlap",
  "active_run": {
    "run_id": "ghsync_01J...",
    "trigger": "automatic",
    "workspace_id": 4,
    "github_repo": "racecraft-lab/Paddock",
    "started_at": "2026-05-23T00:00:00.000Z",
    "lease_expires_at": "2026-05-23T00:02:00.000Z"
  },
  "retry_after_seconds": 30
}
```

Rules:
- `trigger-all` keeps the existing success shape when every requested scope acquires its lease.
- `trigger-all` preflights requested repository scopes before starting work. If one or more requested scopes are already leased, the request returns deterministic 409 and no new manual sync starts for the batch.
- `trigger-all` overlap response includes a `conflicts` array:

```json
{
  "ok": false,
  "error": "GitHub sync already running for one or more requested scopes",
  "code": "github_sync_overlap",
  "conflicts": [
    {
      "workspace_id": 4,
      "github_repo": "racecraft-lab/Paddock",
      "active_run": {
        "run_id": "ghsync_01J...",
        "trigger": "automatic",
        "started_at": "2026-05-23T00:00:00.000Z",
        "lease_expires_at": "2026-05-23T00:02:00.000Z"
      },
      "retry_after_seconds": 30
    }
  ]
}
```

- Manual sync may bypass automatic backoff only after acquiring the same scope lease.
- Manual sync never becomes the automatic lifecycle control endpoint.
- Non-overlapping Product Line/workspace/repository scopes may proceed independently.

## PATCH /api/github/sync/control

Mutates lifecycle controls for one Product Line/workspace repository sync scope.

Request enable/update:

```json
{
  "workspace_id": 4,
  "github_repo": "racecraft-lab/Paddock",
  "enabled": true,
  "interval_seconds": 300,
  "max_pages": 10,
  "max_issues": 1000,
  "max_duration_seconds": 45
}
```

Request disable:

```json
{
  "workspace_id": 4,
  "github_repo": "racecraft-lab/Paddock",
  "enabled": false,
  "disabled_reason": "operator_disabled"
}
```

Request reset backoff:

```json
{
  "workspace_id": 4,
  "github_repo": "racecraft-lab/Paddock",
  "reset_backoff": true
}
```

Success response 200:

```json
{
  "ok": true,
  "control": {
    "workspace_id": 4,
    "github_repo": "racecraft-lab/Paddock",
    "enabled": true,
    "interval_seconds": 300,
    "max_pages": 10,
    "max_issues": 1000,
    "max_duration_seconds": 45,
    "next_eligible_at": "2026-05-23T00:05:00.000Z",
    "backoff_seconds": 0
  }
}
```

Disable response 200 while a run is active:

```json
{
  "ok": true,
  "control": {
    "workspace_id": 4,
    "github_repo": "racecraft-lab/Paddock",
    "enabled": false,
    "disabled_reason": "operator_disabled",
    "next_eligible_at": null,
    "backoff_seconds": 0
  },
  "active_run": {
    "run_id": "ghsync_01J...",
    "trigger": "automatic",
    "started_at": "2026-05-23T00:00:00.000Z",
    "lease_expires_at": "2026-05-23T00:02:00.000Z"
  }
}
```

Disablement rules:
- Disablement is rollback-safe and non-blocking in API v1.
- `enabled=false` prevents future automatic ticks for the scope immediately.
- An already-owned run may finish and release its lease, be marked terminal stopped or partial, or be recovered later through stale lease recovery.
- Manual sync remains available after disablement if it acquires the same scope lease.

Validation errors:
- 400 `workspace_id_required`
- 400 `github_repo_required`
- 400 `interval_out_of_bounds`
- 400 `max_pages_out_of_bounds`
- 400 `max_issues_out_of_bounds`
- 400 `max_duration_out_of_bounds`
- 403 `feature_flag_disabled` when enabling without `FEATURE_GITHUB_SYNC_AUTOMATION`

Bounds:
- `interval_seconds >= 60`
- `max_pages` default 10, maximum 100
- `max_issues` default 1000, maximum 5000
- `max_duration_seconds` default 45, maximum 600
- Lease TTL is `max(120 seconds, 2x max_duration_seconds)` capped at 600 seconds.
