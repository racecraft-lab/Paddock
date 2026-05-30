# Contract: sandbox_lifecycle.v1

## Route

Expected route:

```text
GET /api/tasks/{id}/sandbox-lifecycles
GET /api/tasks/{id}/sandbox-lifecycles?lifecycle_id={lifecycle_id}
```

Plan may choose a nested detail route if it better matches the App Router layout, but lifecycle-specific reads must remain task/workspace-authorized. No global unscoped lifecycle route is allowed in SPEC-014A.

## Authorization

- Requires `requireRole(request, 'viewer')`.
- Resolves workspace scope through the existing workspace-scope helpers.
- Looks up `tasks.id = {id}` with the caller's authorized workspace predicate before reading lifecycle rows.
- Unauthorized or nonexistent tasks return the same not-found/forbidden shape used by existing task-scoped evidence routes.

## Response

```json
{
  "schema_version": "sandbox_lifecycle.v1",
  "feature_flag": {
    "key": "FEATURE_AGENT_RUNNER_SANDBOXES",
    "enabled": false,
    "mutation_state": "disabled"
  },
  "task": {
    "id": "123",
    "workspace_id": "1",
    "stage_key": "issue_remediation"
  },
  "lifecycles": [
    {
      "id": "9",
      "owner": "mission_control",
      "sandbox_key": "workspace/1/product-line/mission-control/task/123/stage/issue_remediation/attempt/456/owner/mission_control",
      "status": "cleaned_up",
      "root_id": "mission_control_data_sandboxes",
      "sanitized_relative_path": "workspace/1/product-line/mission-control/task/123/stage/issue_remediation/attempt/456/owner/mission_control",
      "handle_id": null,
      "task_stage_attempt_id": "456",
      "task_stage_claim_id": "789",
      "created_at": "2026-05-28T00:00:00.000Z",
      "updated_at": "2026-05-28T00:03:00.000Z",
      "events": [
        {
          "id": "21",
          "event_type": "cleaned_up",
          "status": "cleaned_up",
          "reason_code": "fake_cleanup_complete",
          "observed_at": "2026-05-28T00:03:00.000Z"
        }
      ]
    }
  ],
  "diagnostics": {
    "warnings": []
  }
}
```

## Read Guarantees

- GET is side-effect free. Route tests must snapshot row counts before and after reads for lifecycle/event, task, attempt, claim, and activity tables.
- When the feature flag is OFF, the route remains readable and reports disabled-state evidence.
- Responses must not include absolute host paths, raw input fragments, prompts, tokens, auth headers, provider payloads, or raw session data.
- Event lists are bounded to a documented recent-event limit.

## API Documentation Parity

Any added route must be represented in:

- `src/app/api/index/route.ts`
- `openapi.json`
- focused parity tests or existing API parity check coverage
