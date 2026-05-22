# Contract: Task Stage Attempts API

## GET `/api/tasks/[id]/stage-attempts`

Read-only task-scoped inspection of durable task-stage attempts.

### Auth

- Requires `viewer` or higher through existing `requireRole` semantics.
- Uses existing workspace-scope masking:
  - malformed scope returns `400 invalid_workspace_scope`
  - forbidden explicit scope returns `403 forbidden_workspace_scope`
  - nonexistent and out-of-scope tasks both return masked `404 task_not_found`
- Available when `FEATURE_TASK_CONTROL_PLANE=false`.
- Does not create, update, archive, claim, retry, release, cancel, launch, reconcile, or schedule work.

### Query Parameters

Existing workspace scope parameters are supported through the shared workspace resolver:

- `workspace_id=<positive integer>`
- `workspace_scope=facility`

No action or mutation parameters are accepted.

### Success Response: `200`

```json
{
  "schema_version": "task_stage_attempts.v1",
  "task": {
    "id": "123",
    "workspace_id": "1",
    "title": "Task title",
    "status": "in_progress"
  },
  "attempts": [
    {
      "id": "44",
      "workspace_id": "1",
      "task_id": "123",
      "stage_key": "remediation",
      "attempt_number": 2,
      "status": "running",
      "created_at": "2026-05-22T12:00:00.000Z",
      "updated_at": "2026-05-22T12:03:00.000Z",
      "started_at": "2026-05-22T12:01:00.000Z",
      "completed_at": null,
      "archived_at": null,
      "workflow_template_id": 7,
      "workflow_template_slug": "mission-control_issue_remediation",
      "run_link": {
        "state": "linked",
        "run_id": "run-123"
      },
      "run_summary": {
        "id": "run-123",
        "status": "running",
        "started_at": "2026-05-22T12:01:00.000Z",
        "ended_at": null,
        "agent_name": "aegis",
        "runtime": "mission-control",
        "git_branch": "013a-run-state-spine",
        "git_commit": "abc123",
        "error": null
      },
      "lifecycle": [
        {
          "status": "created",
          "observed_at": "2026-05-22T12:00:00.000Z",
          "message": "created for UAT"
        },
        {
          "status": "running",
          "observed_at": "2026-05-22T12:01:00.000Z",
          "message": "runtime observed"
        }
      ]
    }
  ],
  "warnings": []
}
```

### No Attempts Response: `200`

When the task is visible in the resolved workspace scope but no task-stage attempts exist, the route returns the same envelope with `attempts: []` and `warnings: []`. It does not return `404`, `204`, or an omitted attempts field.

```json
{
  "schema_version": "task_stage_attempts.v1",
  "task": {
    "id": "123",
    "workspace_id": "1",
    "title": "Task title",
    "status": "todo"
  },
  "attempts": [],
  "warnings": []
}
```

### Attempt Ordering

- Sort by `stage_key` ascending.
- Within each stage, sort by `attempt_number` descending.
- Lifecycle snippets sort by `observed_at` ascending, then event id ascending.
- Each attempt returns at most 10 most-recent lifecycle entries after applying chronological output ordering.

### Run Link States

- `none`: attempt has no `run_id`.
- `linked`: `run_id` is present and a same-workspace run summary is visible.
- `missing_unavailable`: `run_id` is present but no same-workspace run summary is available.

### Invalid Stored State Handling

Writes fail closed before unknown lifecycle states can be persisted. If legacy, fixture, or manually-edited data nevertheless contains a status outside the SPEC-013A vocabulary, read inspection remains safe and returns the attempt with:

- `status: "invalid_state"`
- `warnings[]` entry `{ "code": "invalid_attempt_state", "attempt_id": "<id>", "field": "status" }`
- no action controls, scheduler calls, retry/release/cancel behavior, or hidden repair mutation

Lifecycle entries with unknown states are omitted from the bounded `lifecycle` snippet and reported through `{ "code": "invalid_lifecycle_state", "attempt_id": "<id>", "field": "lifecycle.status" }`.

### Projection Drift Handling

If the stored attempt projection contains valid SPEC-013A vocabulary but disagrees with the latest valid lifecycle history, the route returns the stored attempt projection and adds warning entries:

```json
{
  "code": "projection_drift",
  "attempt_id": "44",
  "field": "status",
  "projection_value": "running",
  "expected_value": "failed",
  "latest_valid_lifecycle": {
    "status": "failed",
    "observed_at": "2026-05-22T12:05:00.000Z"
  }
}
```

Drift warnings may apply to `status`, `updated_at`, `started_at`, `completed_at`, or `archived_at`. Unknown lifecycle entries remain omitted and reported as `invalid_lifecycle_state`; they are not used as latest valid lifecycle events. The route performs no hidden repair mutation, event synthesis, scheduler call, retry/release/cancel behavior, claim behavior, or launch behavior.

### Error Responses

Unauthenticated:

```json
{ "error": "unauthenticated" }
```

Forbidden role or workspace scope:

```json
{ "error": "forbidden_workspace_scope" }
```

Malformed workspace scope:

```json
{ "error": "invalid_workspace_scope" }
```

Task not found or out of scope:

```json
{ "error": "task_not_found" }
```

### Security And Safety Requirements

- Response strings are bounded and sanitized before UI render.
- Raw run steps, cost, eval, provenance, tags, full metadata, tool payloads, storage URIs, and raw secret-bearing values are not returned.
- The route must not call scheduler, dispatch, task-chain advancement, GitHub sync, packet generation, retry, sandbox, harness, or auto-merge code.
- Existing `GET /api/tasks/[id]/evidence` remains table-blind to `task_stage_attempts` and `task_stage_attempt_events`.
- The route is listed in `openapi.json` and `src/app/api/index/route.ts` as a read-only task endpoint with viewer authentication and the `task_stage_attempts.v1` response envelope.

## Runtime Write Endpoint

SPEC-013A does not add a runtime fixture/UAT write endpoint. Representative rows are created through tests or disposable UAT seed setup only.
