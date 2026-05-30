# Contract: Task Claim Control API

## Mutation Endpoint

`POST /api/tasks/{id}/claim-control`

Authorization: `operator` or `admin` through the existing role hierarchy.

Required headers:

- `Content-Type: application/json`
- `Idempotency-Key: <opaque token>`

The raw idempotency key is never persisted or returned. Responses may include only `idempotency_key_hash`.

## Request Body

```json
{
  "action": "retry",
  "stage_key": "dev_implementation",
  "expected": {
    "claim_id": "7",
    "claim_run_id": "run-123",
    "attempt_id": "12",
    "attempt_status": "failed",
    "operator_action_activity_id": null
  },
  "override_backoff": false,
  "override_reason": null,
  "reason": "operator verified the boundary condition is clear",
  "client_correlation_id": "spec013c-uat-001"
}
```

Rules:

- `action` is one of `retry`, `release`, `cancel`.
- `stage_key` must be a non-empty string and match current task stage.
- `expected.claim_id` and `expected.claim_run_id` are required for active-claim actions.
- `expected.attempt_id` and latest retry-eligible status/evidence are required for non-active retry.
- `override_reason` is required when `action=retry` and `override_backoff=true`.
- Request fields outside the allowlist are rejected or ignored before persistence; no broad diagnostics are stored.

## Success Response

HTTP `200`

```json
{
  "schema_version": "task_claim_control.v1",
  "task": {
    "id": "44",
    "workspace_id": "9",
    "status": "assigned",
    "stage_key": "dev_implementation"
  },
  "action": "retry",
  "outcome": "retry_ready",
  "claim": {
    "id": "7",
    "claim_state": "released",
    "release_reason": "operator_retry_requested"
  },
  "attempt": {
    "id": "12",
    "status": "released"
  },
  "backoff": {
    "decision": "not_active",
    "seconds_remaining": 0,
    "next_retry_at": null,
    "override_applied": false,
    "override_reason": null
  },
  "available_actions": [],
  "audit": {
    "activity_id": "91",
    "activity_type": "task_stage_claim_control_retry",
    "redaction_applied": false
  },
  "idempotency": {
    "idempotency_key_hash": "sha256:...",
    "request_body_hash": "sha256:...",
    "replayed": false,
    "expires_at": "2026-05-29T18:00:00.000Z"
  },
  "correlation_id": "spec013c-uat-001",
  "diagnostics": {
    "warnings": [],
    "sanitized_error_category": null
  }
}
```

Same-key same-body replay returns the cached successful response body without rerunning the side effect.

## Business Outcomes

| Outcome | HTTP | Meaning |
|---------|------|---------|
| `retry_ready` | 200 | Retry accepted; stage becomes eligible for a later scheduler attempt |
| `retry_backoff_active` | 200 | Retry request accepted but backoff remains active; no immediate pickup |
| `released` | 200 | Active claim ownership cleared without retry eligibility |
| `cancelled` | 200 | Stage cancelled and automatic pickup blocked until explicit retry |
| `already_applied` | 200 | New-key request targets a state already transitioned by the same action |
| `flag_off` | 403 | Feature disabled for target workspace |
| `validation_error` | 400 or 422 | Malformed input, unsafe payload, missing override reason, or body mismatch |
| `not_eligible` | 409 | Current state does not support requested action |
| `stale_state` | 409 | Expected-state predicates no longer match current state |
| `conflict` | 409 | Concurrent scheduler/operator transition won |
| `unauthorized` | 401 or 403 | Unauthenticated or insufficient role |

## Error Responses

Transport errors use JSON with `schema_version: "task_claim_control_error.v1"` when enough context exists to construct the envelope.

```json
{
  "schema_version": "task_claim_control_error.v1",
  "outcome": "validation_error",
  "error": {
    "code": "missing_idempotency_key",
    "message": "Idempotency-Key header is required"
  },
  "diagnostics": {
    "sanitized_error_category": "missing_idempotency_key",
    "redaction_applied": false
  }
}
```

Closed status mapping:

- `200`: successful, backoff-active, already-applied, same-key replay
- `400`: malformed JSON or missing required routing/idempotency fields
- `401`: unauthenticated
- `403`: insufficient role or feature-flag-off mutation
- `404`: invisible task/stage target
- `409`: stale-state, conflict, or not-eligible current state
- `422`: semantic validation such as idempotency body mismatch, unsafe payload, missing override reason
- `429`: mutation rate limit
- `500`: sanitized unexpected failure only

## Read Model Extension

`GET /api/tasks/{id}/claim-reconciliation`

The route keeps `schema_version: "task_claim_reconciliation.v1"` and adds optional `claim_control`.

The read model remains viewer-accessible and side-effect-free. It may show whether the current caller can mutate, but mutation still requires the POST route and fresh authorization.

Required `claim_control` sections:

- `authorization`
- `available_actions`
- `retry_eligibility`
- `backoff`
- `expected_state`
- `last_operator_action`
- `last_sanitized_error`

SPEC-013D must use this read model to render controls and must not recompute eligibility client-side.
