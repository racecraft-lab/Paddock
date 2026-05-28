# Data Model: SPEC-013C - Retry/Backoff and Debug API Surfaces

## Existing Entities Reused

### Task

- Source: `tasks`
- Relevant fields: `id`, `workspace_id`, `status`, `assigned_to`, `github_repo`, `github_issue_number`, `github_pr_number`, `github_issue_state`, `github_pr_state`, `github_synced_at`, `workflow_template_id`, `workflow_template_slug`
- Role: target task and tracker-truth carrier for claim-control eligibility.

### Task Stage Attempt

- Source: `task_stage_attempts`, `task_stage_attempt_events`
- Existing statuses: `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, `archived`
- Role: attempt lifecycle evidence for retry/cancel/release state and read-model summaries.

### Task Stage Claim

- Source: `task_stage_claims`
- Existing states: `active`, `released`, `stale_recovered`
- Existing release reasons: SPEC-013B terminal, governance, stale, and boundary reasons
- SPEC-013C adds operator release reasons: `operator_released`, `operator_cancelled`, `operator_retry_requested`
- M79 widens the existing SQLite `release_reason` `CHECK` constraint through a data-preserving rebuild so these reasons are valid claim history values, not activity-only metadata
- Role: active ownership and claim history source.

### Activity

- Source: `activities`
- Role: bounded task-scoped audit evidence. SPEC-013C writes one activity for each successful mutation and each authenticated task-visible semantic rejection.

## Migration M79: Claim-Control Schema Support

M79 has two required persistence changes:

1. Rebuild `task_stage_claims` with the same columns, foreign keys, indexes, active-claim uniqueness, and existing rows while adding `operator_released`, `operator_cancelled`, and `operator_retry_requested` to the `release_reason` `CHECK` constraint.
2. Create `task_claim_control_idempotency_keys` for hashed, task/stage-scoped successful response replay.

Rollback must be guarded: it may drop the idempotency table, but it must refuse to contract `task_stage_claims.release_reason` if any rows still contain SPEC-013C operator reasons.

## New Entity: Claim-Control Idempotency Record

**Table**: `task_claim_control_idempotency_keys` (M79)

| Field | Type | Rules |
|-------|------|-------|
| `actor_user_id` | INTEGER | Authenticated `users.id`; part of primary key |
| `workspace_id` | INTEGER | Positive target workspace id; part of primary key |
| `task_id` | INTEGER | Positive target task id; part of primary key |
| `stage_key` | TEXT | Trimmed non-empty stage key; part of primary key |
| `idempotency_key_hash` | TEXT | SHA-256 hex of header value; part of primary key; raw key is never stored |
| `action` | TEXT | `retry`, `release`, or `cancel` |
| `request_body_hash` | TEXT | SHA-256 hex of canonical parsed request body |
| `response_body_json` | TEXT | Successful JSON response body to replay |
| `response_status` | INTEGER | Successful 2xx status, normally 200 |
| `response_headers_json` | TEXT nullable | Selected response headers only |
| `claim_control_activity_id` | INTEGER nullable | Activity row for the original successful mutation or semantic outcome |
| `created_at` | TEXT | ISO timestamp |
| `expires_at` | TEXT | ISO timestamp, default TTL 24h |

Primary key: `(actor_user_id, workspace_id, task_id, stage_key, idempotency_key_hash)`.

Indexes:

- `idx_task_claim_control_idempotency_expires_at(expires_at)`
- `idx_task_claim_control_idempotency_task(workspace_id, task_id, stage_key, created_at DESC)`

Validation:

- Same actor/workspace/task/stage/key and same body hash returns cached response.
- Same actor/workspace/task/stage/key and different body hash returns `idempotency_key_body_mismatch`.
- Non-2xx responses are not cached.

## Claim-Control Request

| Field | Type | Rules |
|-------|------|-------|
| `action` | string | Required: `retry`, `release`, `cancel` |
| `stage_key` | string | Required, non-empty, must match current task stage key |
| `expected` | object | Required CAS predicates |
| `expected.claim_id` | string optional | Required for active-claim release/cancel/active retry |
| `expected.claim_run_id` | string optional | Required for active-claim release/cancel/active retry |
| `expected.attempt_id` | string optional | Required for non-active retry evidence |
| `expected.attempt_status` | string optional | Required when retry targets attempt state |
| `expected.operator_action_activity_id` | string optional | Used to clear cancel block or detect already-applied |
| `override_backoff` | boolean optional | Retry only |
| `override_reason` | string optional | Required when `override_backoff=true` |
| `reason` | string optional | Release/cancel operator reason, sanitized and bounded |
| `client_correlation_id` | string optional | Bounded, sanitized, carried into audit/debug |

The `Idempotency-Key` header is always required for mutation requests.

## Claim-Control Response

`schema_version`: `task_claim_control.v1`

Required sections:

- `task`: id, workspace id, status, stage key
- `action`: requested action
- `outcome`: closed mutation outcome
- `claim`: current or affected claim summary
- `attempt`: current or affected attempt summary
- `backoff`: state, seconds remaining, next retry, reason, override fields
- `available_actions`: post-mutation read-model action descriptors
- `audit`: activity id/type and redaction proof
- `idempotency`: key hash, request hash, replayed boolean, expires-at
- `correlation_id`: server or client correlation id
- `diagnostics`: warnings and sanitized error category

## State Transitions

### Release

1. Validate active claim matches workspace/task/stage/claim id/claim run id.
2. Update active claim to `released` with reason `operator_released`.
3. Append attempt lifecycle status `released`.
4. Write one bounded activity.
5. Do not schedule or make immediate retry eligible.

### Cancel

1. Validate active claim or explicitly cancellable running/stuck evidence.
2. Update active claim to `released` with reason `operator_cancelled` when a claim exists.
3. Append attempt lifecycle status `cancelled`.
4. Write one bounded activity.
5. Mark latest operator action as cancellation so automatic pickup remains blocked until explicit retry.
6. Do not set the whole task to `failed` or `done`.

### Retry

1. Validate active claim targeted for retry or latest non-active retry-eligible evidence.
2. If active claim exists, release it with reason `operator_retry_requested`.
3. If active backoff exists and no override reason is supplied, return `retry_backoff_active` without clearing backoff or scheduling work.
4. If override is supplied, record actor/reason and clear or bypass backoff according to the claim-control policy.
5. Clear a prior cancel block only after a successful retry-ready transition.
6. Return `retry_ready` or `retry_backoff_active`; do not synchronously launch work.

## Read-Model Extension

Existing envelope: `task_claim_reconciliation.v1`

New optional field: `claim_control`

```json
{
  "authorization": {
    "required_role": "operator",
    "current_role": "operator",
    "can_mutate": true
  },
  "available_actions": [
    {
      "action": "retry",
      "enabled": true,
      "unavailable_reason": null,
      "requires_confirmation": true,
      "requires_idempotency_key": true,
      "requires_expected_state": true,
      "requires_override_reason": false,
      "backoff_policy": "respect_backoff"
    }
  ],
  "retry_eligibility": {
    "state": "eligible",
    "reason": "failed_attempt",
    "evidence_type": "attempt",
    "evidence_id": "12"
  },
  "backoff": {
    "state": "none",
    "seconds_remaining": 0,
    "next_retry_at": null,
    "reason": null,
    "override_allowed": true,
    "override_requires_reason": true
  },
  "expected_state": {
    "claim_id": "7",
    "claim_run_id": "run-123",
    "attempt_id": "12",
    "attempt_status": "failed",
    "operator_action_activity_id": null
  },
  "last_operator_action": null,
  "last_sanitized_error": null
}
```

The read model is side-effect-free and must not trigger scheduler, dispatch, GitHub sync, or claim mutation paths.
