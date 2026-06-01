import {
  CLAIM_CONTROL_ACTIONS,
  CLAIM_CONTROL_OUTCOMES,
  CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES,
  type ClaimControlAction,
  type ClaimControlExpectedState,
  type ClaimControlOutcome,
  type ClaimControlRequestBody,
  type ClaimControlSanitizedErrorCategory,
} from '@/lib/task-claim-control-types'
import { sanitizeEvidenceDisplayText } from '@/lib/task-evidence'
import type { ClaimControlReadModel, TaskClaimReconciliationEnvelope } from '@/lib/task-claim-reconciliation'

const MAX_REASON_LENGTH = 512
const MAX_CORRELATION_LENGTH = 128

const ACTION_LABELS = {
  retry: 'Retry stage',
  release: 'Release claim',
  cancel: 'Cancel stage',
} as const satisfies Record<ClaimControlAction, string>

const ACTION_DESCRIPTIONS = {
  retry: 'Ask the scheduler to retry this stage.',
  release: 'Release the active claim without cancelling the attempt.',
  cancel: 'Cancel the active attempt and release the claim.',
} as const satisfies Record<ClaimControlAction, string>

const OUTCOME_LABELS = {
  retry_ready: 'Retry requested',
  retry_backoff_active: 'Retry is still in backoff',
  released: 'Claim released',
  cancelled: 'Attempt cancelled',
  already_applied: 'Already applied',
  stale_state: 'State changed before submit',
  conflict: 'Claim conflict',
  not_eligible: 'Action not eligible',
  flag_off: 'Task control plane is off',
  unauthorized: 'Not authorized',
  validation_error: 'Request was not accepted',
} as const satisfies Record<ClaimControlOutcome, string>

const OUTCOME_TONES = {
  retry_ready: 'success',
  retry_backoff_active: 'warning',
  released: 'success',
  cancelled: 'success',
  already_applied: 'status',
  stale_state: 'warning',
  conflict: 'warning',
  not_eligible: 'warning',
  flag_off: 'status',
  unauthorized: 'error',
  validation_error: 'error',
} as const satisfies Record<ClaimControlOutcome, ClaimControlTone>

const ERROR_LABELS = {
  unauthenticated: 'Sign in again before submitting.',
  forbidden_role: 'Operator role is required.',
  feature_flag_disabled: 'Task control plane is disabled.',
  invalid_json: 'Request payload was invalid.',
  validation_failed: 'Request validation failed.',
  missing_idempotency_key: 'Idempotency key was missing.',
  idempotency_key_body_mismatch: 'Retry body changed for the same idempotency key.',
  unsafe_payload: 'Request included unsafe content.',
  task_not_found: 'Task was not found.',
  stage_not_found: 'Stage was not found.',
  not_eligible: 'Stage is not eligible for this action.',
  stale_state: 'Expected state is stale.',
  conflict: 'Claim state conflicts with this request.',
  backoff_active: 'Retry backoff is active.',
  rate_limited: 'Mutation rate limit was reached.',
  redaction_failed: 'Response could not be safely displayed.',
  idempotency_storage_unavailable: 'Idempotency storage was unavailable.',
  internal_error: 'Claim-control request failed.',
} as const satisfies Record<ClaimControlSanitizedErrorCategory, string>

const DEFAULT_REASON_BY_ACTION = {
  retry: null,
  release: 'operator_released',
  cancel: null,
} as const satisfies Record<ClaimControlAction, string | null>

export type ClaimControlTone = 'success' | 'status' | 'warning' | 'error'

export interface ClaimControlDraftInput {
  readonly readModel: TaskClaimReconciliationEnvelope
  readonly action: ClaimControlAction
  readonly reason?: string | null
  readonly overrideBackoff?: boolean
  readonly overrideReason?: string | null
  readonly clientCorrelationId?: string | null
}

export interface ClaimControlOutcomeReceipt {
  readonly action: ClaimControlAction
  readonly outcome: ClaimControlOutcome
  readonly stage_key: string
  readonly refreshed_availability: string
  readonly activity_reference: string | null
  readonly idempotency_replayed: boolean
  readonly sanitized_error_category: ClaimControlSanitizedErrorCategory | null
  readonly tone: ClaimControlTone
}

export interface ClaimControlRequestInit {
  readonly method: 'POST'
  readonly headers: {
    readonly 'Content-Type': 'application/json'
    readonly 'Idempotency-Key': string
  }
  readonly body: string
}

export function actionLabel(action: ClaimControlAction): string {
  return ACTION_LABELS[action]
}

export function actionDescription(action: ClaimControlAction): string {
  return ACTION_DESCRIPTIONS[action]
}

export function outcomeLabel(outcome: ClaimControlOutcome): string {
  return OUTCOME_LABELS[outcome]
}

export function outcomeTone(outcome: ClaimControlOutcome): ClaimControlTone {
  return OUTCOME_TONES[outcome]
}

export function sanitizedErrorLabel(category: ClaimControlSanitizedErrorCategory | null | undefined): string | null {
  return category ? ERROR_LABELS[category] : null
}

export function safeSanitizedErrorDisplay(value: unknown): string | null {
  const category = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)['sanitized_error_category']
      : null
  return isClaimControlSanitizedErrorCategory(category)
    ? sanitizedErrorLabel(category)
    : null
}

export function defaultReasonForAction(action: ClaimControlAction): string | null {
  return DEFAULT_REASON_BY_ACTION[action]
}

export function isClaimControlAction(value: unknown): value is ClaimControlAction {
  return typeof value === 'string' && CLAIM_CONTROL_ACTIONS.includes(value as ClaimControlAction)
}

export function isClaimControlOutcome(value: unknown): value is ClaimControlOutcome {
  return typeof value === 'string' && CLAIM_CONTROL_OUTCOMES.includes(value as ClaimControlOutcome)
}

export function isClaimControlSanitizedErrorCategory(value: unknown): value is ClaimControlSanitizedErrorCategory {
  return typeof value === 'string' && CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES.includes(value as ClaimControlSanitizedErrorCategory)
}

export function boundClaimControlText(value: string | null | undefined, maxLength = MAX_REASON_LENGTH): string | null {
  if (value == null) return null
  const sanitized = sanitizeEvidenceDisplayText(value)
  if (sanitized.length === 0) return null
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) : sanitized
}

export function safeClaimControlDisplay(value: unknown, fallback = 'not provided'): string {
  if (value == null) return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return boundClaimControlText(String(value), 160) ?? fallback
  }
  if (typeof value !== 'object' || Array.isArray(value)) return fallback
  const record = value as Record<string, unknown>
  const preferredKeys = ['category', 'code', 'outcome', 'action', 'reason', 'message', 'activity_id']
  const parts = preferredKeys
    .map((key) => boundClaimControlText(typeof record[key] === 'string' ? record[key] : null, 80))
    .filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' ') : fallback
}

export function copyExpectedState(model: ClaimControlReadModel): ClaimControlExpectedState {
  return {
    claim_id: model.expected_state.claim_id,
    claim_run_id: model.expected_state.claim_run_id,
    attempt_id: model.expected_state.attempt_id,
    attempt_status: model.expected_state.attempt_status,
    operator_action_activity_id: model.expected_state.operator_action_activity_id,
  }
}

export function createClientCorrelationId(): string {
  const generated = typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return boundClaimControlText(`spec013d-${generated}`, MAX_CORRELATION_LENGTH) ?? 'spec013d-client'
}

export function buildClaimControlDraft(input: ClaimControlDraftInput): ClaimControlRequestBody {
  const control = input.readModel.claim_control
  if (!control) {
    throw new Error('claim_control read model is required before submitting')
  }

  const reason = input.action === 'release'
    ? boundClaimControlText(input.reason) ?? defaultReasonForAction('release')
    : boundClaimControlText(input.reason)
  const overrideBackoff = input.overrideBackoff === true

  return {
    action: input.action,
    stage_key: control.stage_key,
    expected: copyExpectedState(control),
    override_backoff: overrideBackoff,
    override_reason: overrideBackoff ? boundClaimControlText(input.overrideReason) : null,
    reason,
    client_correlation_id: boundClaimControlText(input.clientCorrelationId, MAX_CORRELATION_LENGTH) ?? createClientCorrelationId(),
  }
}

export function buildClaimControlRequestInit(draft: ClaimControlRequestBody, idempotencyKey: string): ClaimControlRequestInit {
  const boundedKey = boundClaimControlText(idempotencyKey, 256)
  if (!boundedKey) {
    throw new Error('Idempotency key is required')
  }

  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': boundedKey,
    },
    body: JSON.stringify(draft),
  }
}

export function buildReceipt(input: {
  readonly action: unknown
  readonly outcome: unknown
  readonly stageKey: unknown
  readonly availableActions?: unknown
  readonly activityId: unknown
  readonly idempotencyReplayed: unknown
  readonly sanitizedErrorCategory: unknown
}): ClaimControlOutcomeReceipt {
  const action = isClaimControlAction(input.action) ? input.action : 'retry'
  const outcome = isClaimControlOutcome(input.outcome) ? input.outcome : 'validation_error'
  const category = isClaimControlSanitizedErrorCategory(input.sanitizedErrorCategory)
    ? input.sanitizedErrorCategory
    : null

  return {
    action,
    outcome,
    stage_key: boundClaimControlText(typeof input.stageKey === 'string' ? input.stageKey : null, 128) ?? 'unknown-stage',
    refreshed_availability: summarizeRefreshedAvailability(input.availableActions),
    activity_reference: boundClaimControlText(typeof input.activityId === 'string' ? input.activityId : null, 128),
    idempotency_replayed: input.idempotencyReplayed === true,
    sanitized_error_category: category,
    tone: outcomeTone(outcome),
  }
}

function summarizeRefreshedAvailability(value: unknown): string {
  if (!Array.isArray(value)) return 'Availability refresh completed.'
  const summaries = value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const record = item as Record<string, unknown>
      if (!isClaimControlAction(record['action'])) return null
      const label = actionLabel(record['action'])
      if (record['enabled'] === true) return label
      const reason = boundClaimControlText(
        typeof record['unavailable_reason'] === 'string' ? record['unavailable_reason'] : null,
        80,
      )
      return reason ? `${label} disabled: ${reason}` : `${label} disabled`
    })
    .filter((item): item is string => item !== null)
  return summaries.length > 0
    ? `Available after refresh: ${summaries.join('; ')}.`
    : 'Available after refresh: none.'
}
