# Data Model: SPEC-013D Claim-Control Operator UX

SPEC-013D introduces no database migration and no persisted UI state. This model describes the client-side view state and the existing backend fields consumed by the task detail UI.

## Existing Backend Read Model

### ClaimControlReadModel

Source: `GET /api/tasks/[id]/claim-reconciliation`, field `claim_control`.

Consumed fields:

- `stage_key`: stage affected by claim-control actions.
- `authorization.required_role`: expected backend role for mutation, currently `operator`.
- `authorization.current_role`: viewer/operator/admin role reported by the read model.
- `authorization.can_mutate`: whether the current user may mutate this stage.
- `available_actions[]`: sole source for rendered retry, release, and cancel action availability.
- `retry_eligibility`: backend eligibility summary for retry.
- `backoff`: active retry backoff state and override requirements.
- `expected_state`: predicate copied into `POST /api/tasks/[id]/claim-control`.
- `last_operator_action`: bounded backend-provided last operator action context, rendered only through safe display helpers.
- `last_sanitized_error`: bounded sanitized error category/context, rendered only through safe display helpers.

Validation rules:

- The UI must not synthesize additional actions beyond `available_actions[]`.
- The UI must not derive action availability from task status, evidence, attempts, local role checks, activities, or board state.
- The UI may suppress submission locally only for missing required local fields such as cancel or override reason.

## UI Entities

### ClaimControlSectionProps

Fields:

- `taskId`: task id from the modal.
- `readModel`: latest claim reconciliation envelope or null.
- `loading`: claim-control read loading state.
- `error`: bounded claim-control read error string or null.
- `submitting`: current mutation submission state.
- `receipt`: latest `OutcomeReceipt` or null.
- `networkRetry`: current `IdempotencyAttempt` retry metadata or null.
- `onSubmit(actionDraft)`: callback owned by `TaskDetailModal`.
- `onRefresh()`: callback owned by `TaskDetailModal`.

Validation rules:

- When `claim_control` is absent, render no noisy controls.
- When backend explicitly returns disabled/flag-off/debug state, render a compact disabled state.
- Disabled action descriptors remain visible as real disabled controls with associated reason text.

### AvailableActionDescriptor

Fields:

- `action`: `retry`, `release`, or `cancel`.
- `enabled`: backend-provided boolean.
- `unavailable_reason`: backend-provided reason or null.
- `requires_confirmation`: backend-provided boolean.
- `requires_idempotency_key`: must be true.
- `requires_expected_state`: must be true.
- `requires_override_reason`: true only when retry override needs a reason.
- `backoff_policy`: backend-provided policy label.

Validation rules:

- All descriptors are rendered, including disabled descriptors.
- Action labels come from the local closed copy map.
- Backend unavailable reasons are displayed only as bounded/sanitized text.

### ConfirmationDraft

Fields:

- `action`: selected action.
- `stage_key`: selected stage key.
- `expected`: exact expected-state object copied from latest read model.
- `reason`: cancel/release reason text or null.
- `override_backoff`: retry override flag.
- `override_reason`: retry override reason text or null.
- `client_correlation_id`: bounded generated id.

Validation rules:

- Cancel requires a non-empty bounded reason before submit.
- Backoff override requires a non-empty bounded override reason before submit.
- Release may use a default reason when the operator leaves it blank.
- Changing any field clears any prior idempotency attempt.

### IdempotencyAttempt

Fields:

- `key`: raw generated idempotency key, in memory only.
- `requestBodyHash`: local non-secret comparison hash for same-submission checks.
- `taskId`
- `action`
- `stage_key`
- `expected`
- `body`
- `state`: `in_flight` or `network_failed_retry_available`.

Validation rules:

- Raw `key` is never rendered, persisted, logged to fixture manifests, or written to screenshots.
- The key may be reused only for an immediate retry after a network failure with the exact same task, action, stage, expected state, and request body.
- Any server response, task change, modal close, cancel, changed request body, changed expected state, or new operator decision clears the attempt.

### OutcomeReceipt

Fields:

- `action`: closed action code.
- `outcome`: closed backend outcome code.
- `stage_key`: stage key from response or request context.
- `refreshedAvailability`: post-refresh action availability summary.
- `activityReference`: audit/activity reference when present.
- `idempotencyReplayed`: replay status when present.
- `sanitizedErrorCategory`: closed sanitized category when present.
- `messageTone`: `success`, `status`, `warning`, or `error`.

Validation rules:

- Copy comes from the local closed action/outcome/error map.
- Receipts must not contain raw request bodies, raw idempotency keys, auth headers, prompts, transcripts, provider payloads, tokens, GitHub bodies, or raw backend internals.
- Final receipts receive focus after refresh.

### FixtureEvidenceManifest

Fields:

- `schema_version`: `spec013d.claim-control.fixture.v1`.
- `fixture_marker`: starts with `spec013d-claim-control-`.
- `generated_at`
- `disposable_tasks`
- `seeded_rows`: counts or ids for claim, stage-attempt, idempotency, activity, and feature-flag rows.
- `feature_flag_restore`: before/after flag proof.
- `cleanup_scope`
- `cleanup_result`
- `screenshots`
- `visual_snapshots`
- `redaction_assertions`

Validation rules:

- Manifest includes cleanup proof and feature-flag restoration proof.
- Manifest does not include raw idempotency keys, auth headers, raw request bodies, prompts, transcripts, provider payloads, tokens, GitHub bodies, or raw backend diagnostics.

## State Transitions

```text
absent
  -> loading
  -> readonly_ready | operator_ready | disabled_flag_off | error

operator_ready
  -> confirming(action)
  -> submitting(action, idempotency_attempt)
  -> refreshing(server_envelope)
  -> receipt(refreshed_state)

submitting(action, idempotency_attempt)
  -> network_failed_retry_available(same_attempt)
  -> refreshing(server_envelope)
  -> receipt(refreshed_state)

network_failed_retry_available(same_attempt)
  -> submitting(action, same_attempt)
  -> abandoned(clears_key)

confirming(action)
  -> operator_ready(clears_draft)
  -> submitting(action, new_attempt)
```

Server envelopes always lead through refresh before final availability is presented. Pure client validation errors remain inside `confirming(action)` and do not call the mutation route.
