export const CLAIM_CONTROL_ACTIONS = Object.freeze(['retry', 'release', 'cancel'] as const)
export type ClaimControlAction = (typeof CLAIM_CONTROL_ACTIONS)[number]

export const CLAIM_CONTROL_OUTCOMES = Object.freeze([
  'retry_ready',
  'retry_backoff_active',
  'released',
  'cancelled',
  'already_applied',
  'stale_state',
  'conflict',
  'not_eligible',
  'flag_off',
  'unauthorized',
  'validation_error',
] as const)
export type ClaimControlOutcome = (typeof CLAIM_CONTROL_OUTCOMES)[number]

export const CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES = Object.freeze([
  'unauthenticated',
  'forbidden_role',
  'feature_flag_disabled',
  'invalid_json',
  'validation_failed',
  'missing_idempotency_key',
  'idempotency_key_body_mismatch',
  'unsafe_payload',
  'task_not_found',
  'stage_not_found',
  'not_eligible',
  'stale_state',
  'conflict',
  'backoff_active',
  'rate_limited',
  'redaction_failed',
  'idempotency_storage_unavailable',
  'internal_error',
] as const)
export type ClaimControlSanitizedErrorCategory = (typeof CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES)[number]

export interface ClaimControlExpectedState {
  readonly claim_id?: string | null
  readonly claim_run_id?: string | null
  readonly attempt_id?: string | null
  readonly attempt_status?: string | null
  readonly operator_action_activity_id?: string | null
}

export interface ClaimControlRequestBody {
  readonly action: ClaimControlAction
  readonly stage_key: string
  readonly expected: ClaimControlExpectedState
  readonly override_backoff: boolean
  readonly override_reason: string | null
  readonly reason: string | null
  readonly client_correlation_id: string | null
}

export type ClaimControlValidationResult =
  | { readonly ok: true; readonly value: ClaimControlRequestBody }
  | { readonly ok: false; readonly code: string; readonly status: 400 | 422; readonly error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null
  return boundedText(value, maxLength)
}

function optionalExpectedText(record: Record<string, unknown>, key: string): string | null {
  return optionalText(record[key], 256)
}

export function validateClaimControlRequestBody(value: unknown): ClaimControlValidationResult {
  if (!isRecord(value)) {
    return { ok: false, code: 'invalid_json', status: 400, error: 'Request body must be a JSON object' }
  }

  const action = value['action']
  if (!CLAIM_CONTROL_ACTIONS.includes(action as ClaimControlAction)) {
    return { ok: false, code: 'invalid_action', status: 422, error: 'action must be retry, release, or cancel' }
  }

  const stageKey = boundedText(value['stage_key'], 128)
  if (stageKey === null) {
    return { ok: false, code: 'invalid_stage_key', status: 422, error: 'stage_key is required' }
  }

  const expectedRaw = value['expected']
  if (!isRecord(expectedRaw)) {
    return { ok: false, code: 'invalid_expected_state', status: 422, error: 'expected object is required' }
  }

  const overrideBackoff = value['override_backoff'] === true
  const overrideReason = optionalText(value['override_reason'], 512)
  if (overrideBackoff && overrideReason === null) {
    return { ok: false, code: 'missing_override_reason', status: 422, error: 'override_reason is required when override_backoff is true' }
  }

  return {
    ok: true,
    value: {
      action: action as ClaimControlAction,
      stage_key: stageKey,
      expected: {
        claim_id: optionalExpectedText(expectedRaw, 'claim_id'),
        claim_run_id: optionalExpectedText(expectedRaw, 'claim_run_id'),
        attempt_id: optionalExpectedText(expectedRaw, 'attempt_id'),
        attempt_status: optionalExpectedText(expectedRaw, 'attempt_status'),
        operator_action_activity_id: optionalExpectedText(expectedRaw, 'operator_action_activity_id'),
      },
      override_backoff: overrideBackoff,
      override_reason: overrideReason,
      reason: optionalText(value['reason'], 512),
      client_correlation_id: optionalText(value['client_correlation_id'], 128),
    },
  }
}
