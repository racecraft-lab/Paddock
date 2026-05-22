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

### Attempt Ordering

- Sort by `stage_key` ascending.
- Within each stage, sort by `attempt_number` descending.
- Lifecycle snippets sort by `observed_at` ascending, then event id ascending.

### Run Link States

- `none`: attempt has no `run_id`.
- `linked`: `run_id` is present and a same-workspace run summary is visible.
- `missing_unavailable`: `run_id` is present but no same-workspace run summary is available.

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

## Runtime Write Endpoint

SPEC-013A does not add a runtime fixture/UAT write endpoint. Representative rows are created through tests or disposable UAT seed setup only.

