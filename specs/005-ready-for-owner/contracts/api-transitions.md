# Contract: Task Status Transitions and API Conflicts

## Uniform Conflict Response

Every blocked non-merge completion attempt for a PR-producing task returns:

```json
{
  "error": "transition_conflict",
  "reason": "ready_for_owner_pr_merge_required",
  "task_ids": [123]
}
```

Rules:

- HTTP status is `409 Conflict`.
- Single-task routes return one task id.
- Bulk routes return every blocked task id in the attempted update.
- The response is side-effect-free: no task status update, activity, notification, label sync, completed timestamp, or chain advancement.

## Detail Task Update

**Route**: `PUT /api/tasks/{id}`

**Blocked request example**:

```json
{
  "status": "done"
}
```

**Blocked when**:

- `FEATURE_TWO_STEP_TERMINAL` resolves ON for the task workspace.
- The task is bound to a workflow template with `produces_pr=true`.
- The write is not caused by verified GitHub PR merge evidence.

**Response**: uniform `409 Conflict` body with one-item `task_ids`.

## Bulk Task Update

**Route**: `PUT /api/tasks`

**Blocked request example**:

```json
{
  "tasks": [
    { "id": 101, "status": "done" },
    { "id": 102, "status": "done" }
  ]
}
```

**Blocked when** any task in the batch is a PR-producing task that requires verified merge evidence before `done`.

**Response**:

```json
{
  "error": "transition_conflict",
  "reason": "ready_for_owner_pr_merge_required",
  "task_ids": [101, 102]
}
```

The route preflights the batch before mutation so unblocked tasks are not partially updated when the request includes blocked ids.

## Quality Review Approval

**Route**: `POST /api/quality-review`

**Request shape remains existing**:

```json
{
  "taskId": 123,
  "reviewer": "aegis",
  "status": "approved",
  "notes": "Approved"
}
```

**Outcomes**:

- Flag OFF: existing direct `done` behavior.
- Flag ON and `produces_pr=false`: existing direct `done` behavior.
- Flag ON and `produces_pr=true`: route task to `ready_for_owner`, create ready-for-owner activity/notification, sync `mc:ready-for-owner`, do not advance chain.

If a request explicitly tries to force `done` for a PR-producing task outside the approved routing behavior, it returns the uniform conflict.

## Aegis Review Automation

**Function**: `runAegisReviews()`

**Outcomes**:

- Approved PR-producing task with flag ON: `quality_review -> ready_for_owner`.
- Approved non-PR task or flag OFF: `quality_review -> done`.
- Rejected task: existing rejection/retry behavior unchanged.

The automation does not expose an override to force PR-producing tasks to `done`.

## Validation Boundary

Static status schemas accept `ready_for_owner` so reads and existing-row updates can round trip. Write routes call the shared transition guard before mutation. This keeps read vocabulary separate from feature-flag-aware write authorization.
