# Contract: GitHub Sync Lifecycle API v1

## Authentication And Scope

- All endpoints require authenticated `operator` role unless an existing endpoint is already stricter.
- Product Line/workspace scope is resolved through the existing workspace scope helpers.
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
          "github_repo": "racecraft-lab/mission-control",
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
          "reason": null
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
          "ownership": "owner_selected"
        }
      }
    ],
    "diagnostics": {
      "scheduler_task_registered": true,
      "schema_version": "077_github_sync_lifecycle"
    }
  }
}
```

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

Same-scope overlap response 409:

```json
{
  "ok": false,
  "error": "GitHub sync already running for this scope",
  "code": "github_sync_overlap",
  "active_run": {
    "run_id": "ghsync_01J...",
    "trigger": "automatic",
    "workspace_id": 4,
    "github_repo": "racecraft-lab/mission-control",
    "started_at": "2026-05-23T00:00:00.000Z",
    "lease_expires_at": "2026-05-23T00:02:00.000Z"
  },
  "retry_after_seconds": 30
}
```

Rules:
- `trigger-all` keeps existing success shape.
- Manual sync may bypass automatic backoff only after acquiring the same scope lease.
- Manual sync never becomes the automatic lifecycle control endpoint.

## PATCH /api/github/sync/control

Mutates lifecycle controls for one Product Line/workspace repository sync scope.

Request enable/update:

```json
{
  "workspace_id": 4,
  "github_repo": "racecraft-lab/mission-control",
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
  "github_repo": "racecraft-lab/mission-control",
  "enabled": false,
  "disabled_reason": "operator_disabled"
}
```

Request reset backoff:

```json
{
  "workspace_id": 4,
  "github_repo": "racecraft-lab/mission-control",
  "reset_backoff": true
}
```

Success response 200:

```json
{
  "ok": true,
  "control": {
    "workspace_id": 4,
    "github_repo": "racecraft-lab/mission-control",
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

Validation errors:
- 400 `workspace_id_required`
- 400 `github_repo_required`
- 400 `interval_out_of_bounds`
- 400 `max_pages_out_of_bounds`
- 400 `max_issues_out_of_bounds`
- 400 `max_duration_out_of_bounds`
- 403 `feature_flag_disabled` when enabling without `FEATURE_GITHUB_SYNC_AUTOMATION`
- 409 `active_run_present` when disabling with a policy that requires stop-before-disable

Bounds:
- `interval_seconds >= 60`
- `max_pages` default 10, maximum 100
- `max_issues` default 1000, maximum 5000
- `max_duration_seconds` default 45, maximum 600
- Lease TTL is `max(120 seconds, 2x max_duration_seconds)` capped at 600 seconds.
