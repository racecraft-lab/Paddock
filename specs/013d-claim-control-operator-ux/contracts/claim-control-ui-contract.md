# Contract: SPEC-013D Claim-Control UI

This contract binds the task detail UI to the existing SPEC-013C backend routes. It does not define new backend behavior.

## Read Contract

Endpoint:

```text
GET /api/tasks/{taskId}/claim-reconciliation
```

Task detail consumes:

```ts
interface ConsumedClaimReconciliation {
  schema_version: 'task_claim_reconciliation.v1'
  task: {
    id: string
    workspace_id: string
    status: string | null
    stage_key: string | null
  } | null
  feature_flag: {
    key: 'FEATURE_TASK_CONTROL_PLANE'
    enabled: boolean
  }
  claim_control?: {
    stage_key: string
    authorization: {
      required_role: 'operator'
      current_role: 'viewer' | 'operator' | 'admin'
      can_mutate: boolean
    }
    available_actions: Array<{
      action: 'retry' | 'release' | 'cancel'
      enabled: boolean
      unavailable_reason: string | null
      requires_confirmation: boolean
      requires_idempotency_key: true
      requires_expected_state: true
      requires_override_reason: boolean
      backoff_policy: 'respect_backoff' | 'not_applicable'
    }>
    retry_eligibility: {
      state: 'active_claim' | 'eligible' | 'ineligible'
      reason: string | null
      evidence_type: 'claim' | 'attempt' | 'none'
      evidence_id: string | null
    }
    backoff: {
      state: 'none' | 'active'
      seconds_remaining: number
      next_retry_at: number | null
      reason: string | null
      override_allowed: boolean
      override_requires_reason: boolean
    }
    expected_state: {
      claim_id: string | null
      claim_run_id: string | null
      attempt_id: string | null
      attempt_status: string | null
      operator_action_activity_id: string | null
    }
    last_operator_action: unknown
    last_sanitized_error: unknown
  } | null
}
```

Rules:

- `claim_control.available_actions[]` is the only source for action availability.
- Missing `claim_control` renders no noisy action controls.
- Disabled backend actions remain visible with bounded unavailable reasons.
- UI copy must use closed local labels for known action/outcome/error codes.
- Raw unknown objects from `last_operator_action` and `last_sanitized_error` must be rendered only through bounded safe display helpers or not rendered.

## Mutation Contract

Endpoint:

```text
POST /api/tasks/{taskId}/claim-control
Idempotency-Key: <generated per confirmation attempt>
Content-Type: application/json
```

Request body:

```ts
interface ClaimControlRequestBody {
  action: 'retry' | 'release' | 'cancel'
  stage_key: string
  expected: {
    claim_id?: string | null
    claim_run_id?: string | null
    attempt_id?: string | null
    attempt_status?: string | null
    operator_action_activity_id?: string | null
  }
  override_backoff: boolean
  override_reason: string | null
  reason: string | null
  client_correlation_id: string | null
}
```

Construction rules:

- `stage_key` and `expected` are copied from the latest read model for the selected stage.
- `override_backoff` defaults to `false`.
- `override_reason` defaults to `null` and is required only when retry override is selected.
- `reason` is required for cancel, optional/defaulted for release, and null for ordinary retry.
- `client_correlation_id` is generated per confirmation and bounded.
- The raw idempotency key is in memory only and is never shown or persisted.

Same-submission retry:

- After network failure only, the UI may offer one immediate retry using the same raw key and identical request body.
- The UI must clear the key after any server response, modal close, cancel, task change, expected-state refresh, changed body, or new operator decision.

## Response Handling Contract

Server responses may be success envelopes, semantic outcome envelopes, idempotent replays, or bounded error envelopes.

Refresh matrix:

| Response class | Refresh claim reconciliation | Refresh evidence | Refresh stage attempts | Refresh task list item | Receipt |
|----------------|------------------------------|------------------|------------------------|------------------------|---------|
| success | Yes | Yes | Yes | Yes | status/success |
| already_applied | Yes | Yes | Yes | Yes | status |
| idempotent replay | Yes | Yes | Yes | Yes | status with replay |
| stale_state/conflict | Yes | Yes | Yes | Yes | alert then refreshed receipt |
| not_eligible/backoff_active | Yes | Yes | Yes | Yes | alert/status |
| validation error from server | Yes | When loaded | When loaded | When loaded | alert |
| unauthorized/forbidden | Yes | When loaded | When loaded | When loaded | alert |
| flag_off | Yes | When loaded | When loaded | When loaded | status/disabled |
| client validation error | No | No | No | No | alert only |
| network failure | No until retry or abandon | No until retry or abandon | No until retry or abandon | No until retry or abandon | alert with same-submission retry |

## Component Contract

`ClaimControlSection` responsibilities:

- Render a named `Claim control` region.
- Render stage, authorization, action descriptors, retry eligibility, backoff, last operator action, sanitized error category, confirmation, loading, network-failure, and receipt states.
- Keep disabled action controls visible and associated with reason text.
- Focus confirmation heading or the first required field when entering confirmation.
- Focus final receipt after refresh.
- Emit `onSubmit(draft)` to the modal; do not call fetch directly unless implementation records a reviewed deviation.

`TaskDetailModal` responsibilities:

- Fetch claim reconciliation with `appendScopeToPath`.
- Submit mutation requests with generated idempotency keys.
- Refresh claim reconciliation, task evidence, task stage attempts, and task-list item state after bounded server responses.
- Clear pending idempotency state on close/task change/cancel/new decision.

## Evidence Contract

The Playwright suite must attach:

- `spec013d-claim-control-before-active.png`
- `spec013d-claim-control-confirm-retry.png`
- `spec013d-claim-control-after-retry.png`
- `spec013d-claim-control-disabled-reasons.png`
- `spec013d-claim-control-backoff-override.png`
- `spec013d-claim-control-stale-conflict.png`
- `spec013d-claim-control-viewer-read-only.png`
- `spec013d-claim-control-flag-off.png`
- `spec013d-claim-control-fixture-export.json`

The fixture export must include cleanup proof, feature-flag restoration, seeded row ids or counts, screenshot names, and visual snapshot manifest entries. It must not include raw idempotency keys, auth headers, raw request bodies, prompts, transcripts, provider payloads, tokens, GitHub bodies, or raw backend diagnostics.
