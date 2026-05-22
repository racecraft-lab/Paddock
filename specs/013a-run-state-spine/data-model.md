# Data Model: SPEC-013A Run-State Persistence Spine

## Entity: Task-Stage Attempt

**Table**: `task_stage_attempts`

Represents one observed execution attempt for one task stage. It is durable attempt identity and current-state projection, not claim ownership.

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | yes | Internal attempt row id |
| `workspace_id` | INTEGER | yes | Existing workspace scope; fallback-compatible with workspace 1 |
| `task_id` | INTEGER | yes | Existing task id; should reference `tasks(id)` with app-level workspace masking |
| `stage_key` | TEXT | yes | Non-empty stage identity; no claim semantics |
| `attempt_number` | INTEGER | yes | Positive integer unique per workspace/task/stage |
| `status` | TEXT | yes | One of `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, `archived` |
| `created_at` | TEXT | yes | ISO-like timestamp created by helper/migration default |
| `updated_at` | TEXT | yes | Updated when projection changes |
| `started_at` | TEXT | no | Passive observed start timestamp |
| `completed_at` | TEXT | no | Passive observed terminal timestamp |
| `archived_at` | TEXT | no | Set when archived; archived rows stay queryable |
| `run_id` | TEXT | no | Soft nullable link to `runs.id`; no DB foreign key |
| `workflow_template_id` | INTEGER | no | Copied task context if present |
| `workflow_template_slug` | TEXT | no | Copied task context if present |
| `metadata_json` | TEXT | no | Bounded safe JSON for fixture/test context only; no run snapshots |

### Constraints And Indexes

- `UNIQUE(workspace_id, task_id, stage_key, attempt_number)`.
- `CHECK(length(trim(stage_key)) > 0)`.
- Status validation in helper and database `CHECK`.
- No one-active-attempt uniqueness.
- No claim token, owner, lock, lease, scheduler, retry, sandbox, harness, GitHub reconciliation, or auto-merge columns.
- Indexes:
  - `idx_task_stage_attempts_task_stage_attempt` on `(workspace_id, task_id, stage_key, attempt_number DESC)`
  - `idx_task_stage_attempts_task_status` on `(workspace_id, task_id, status, updated_at DESC)`
  - `idx_task_stage_attempts_run_id` on `(workspace_id, run_id)` where `run_id IS NOT NULL`
  - `idx_task_stage_attempts_archived` on `(workspace_id, archived_at)` where `archived_at IS NOT NULL`

### Lifecycle Rules

- Creating an attempt inserts an attempt row and a `created` event.
- Recording an observed lifecycle event appends an event and updates the projection columns on the attempt row.
- Archiving sets `status='archived'`, sets `archived_at`, updates `updated_at`, and appends an `archived` event.
- `released` and `cancelled` are passive observed states only.
- Unknown statuses fail closed on writes.
- Reads may safely mark unknown stored states as warnings, but writes must not create them.

## Entity: Attempt Lifecycle Entry

**Table**: `task_stage_attempt_events`

Represents append-only observed lifecycle history for one task-stage attempt.

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | yes | Internal event row id |
| `attempt_id` | INTEGER | yes | Parent `task_stage_attempts.id`, cascade delete for rollback/cleanup only |
| `workspace_id` | INTEGER | yes | Duplicated for scoped query/indexing and guard evidence |
| `task_id` | INTEGER | yes | Duplicated for task-scoped event lookup |
| `stage_key` | TEXT | yes | Duplicated for lifecycle ordering/debug |
| `attempt_number` | INTEGER | yes | Duplicated for lifecycle ordering/debug |
| `status` | TEXT | yes | Same lifecycle vocabulary as attempts |
| `observed_at` | TEXT | yes | Event timestamp |
| `actor_type` | TEXT | no | `test`, `fixture`, `operator`, `system`, or null; no authorization semantics |
| `actor_id` | TEXT | no | Bounded display/audit value; no secrets |
| `message` | TEXT | no | Bounded sanitized context |
| `metadata_json` | TEXT | no | Bounded safe JSON; no raw run snapshots or secrets |

### Constraints And Indexes

- `FOREIGN KEY(attempt_id) REFERENCES task_stage_attempts(id) ON DELETE CASCADE`.
- Status validation in helper and database `CHECK`.
- Indexes:
  - `idx_task_stage_attempt_events_attempt_order` on `(attempt_id, observed_at ASC, id ASC)`
  - `idx_task_stage_attempt_events_task_order` on `(workspace_id, task_id, stage_key, attempt_number, observed_at ASC, id ASC)`

## Read Model: Attempt Inspection Envelope

**Schema version**: `task_stage_attempts.v1`

### Shape

```json
{
  "schema_version": "task_stage_attempts.v1",
  "task": {
    "id": "123",
    "workspace_id": "1",
    "title": "Issue remediation task",
    "status": "in_progress"
  },
  "attempts": [
    {
      "id": "44",
      "workspace_id": "1",
      "task_id": "123",
      "stage_key": "remediation",
      "attempt_number": 1,
      "status": "archived",
      "created_at": "2026-05-22T12:00:00.000Z",
      "updated_at": "2026-05-22T12:10:00.000Z",
      "started_at": "2026-05-22T12:01:00.000Z",
      "completed_at": null,
      "archived_at": "2026-05-22T12:10:00.000Z",
      "workflow_template_id": 7,
      "workflow_template_slug": "mission-control_issue_remediation",
      "run_link": {
        "state": "missing_unavailable",
        "run_id": "run-123"
      },
      "run_summary": null,
      "lifecycle": [
        { "status": "created", "observed_at": "2026-05-22T12:00:00.000Z", "message": "fixture seed" },
        { "status": "archived", "observed_at": "2026-05-22T12:10:00.000Z", "message": "uat cleanup" }
      ]
    }
  ],
  "warnings": []
}
```

### Ordering

- Attempts are ordered by `stage_key` ascending and `attempt_number` descending.
- Lifecycle snippets are ordered chronologically.
- Lifecycle snippets are bounded by the helper; tests must prove the bound.

## Runtime Run Summary

Resolved at read time from `runs` when `run_id` is present and visible in the same workspace.

Fields:

- `id`
- `status`
- `started_at`
- `ended_at`
- `agent_name`
- `runtime`
- `git_branch`
- `git_commit`
- `error`

Not copied into attempts:

- steps
- cost
- eval
- provenance
- tags
- full metadata
- tool payloads

## Feature Flag Registry Entry

Add `FEATURE_TASK_CONTROL_PLANE` to `src/lib/feature-flags.ts`:

- `defaultValue: false`
- `spec: 'Run-State Persistence Spine'`
- `phase: 11`
- `upstreamImpact: 'upstream-divergent'`
- `activationScope: 'productLineWorkspace'`
- `riskTier: 'critical'`
- `adminManageable: false` for SPEC-013A
- `implementationStatus: 'not_implemented'`
- `enableRequires`: existing pilot/control-plane prerequisites as appropriate, with no env force-on behavior

## Guarded Non-Entities

SPEC-013A must not add:

- claim owner/token/lease fields
- one-active-attempt constraints
- scheduler launch fields
- retry/backoff controls
- release/cancel action controls
- GitHub reconciliation fields
- sandbox lifecycle fields
- harness adapter fields
- auto-merge fields
- global dashboard state

