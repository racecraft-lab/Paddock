import { resolveFlag, type FeatureFlagContext } from '@/lib/feature-flags'

export const CRABTRAP_SECURITY_ACTIVITY_TYPE = 'security_intrusion_detected'
export const DEFAULT_CRABTRAP_MAX_PAYLOAD_BYTES = 16 * 1024

export type CrabTrapIntakeFailureCode =
  | 'feature_disabled'
  | 'config_missing'
  | 'config_invalid'
  | 'payload_too_large'
  | 'malformed_json'
  | 'payload_schema_invalid'
  | 'signature_missing'
  | 'timestamp_missing'
  | 'timestamp_invalid'
  | 'timestamp_stale'
  | 'signature_invalid'
  | 'unsafe_field_present'
  | 'unsupported_decision'
  | 'unsupported_method'
  | 'replay_detected'
  | 'activity_write_failed'

export type CrabTrapIntakeStatus = 'noop' | 'rejected' | 'accepted' | 'failed'

export interface CrabTrapIntakeDiagnostic {
  readonly code: CrabTrapIntakeFailureCode
  readonly fieldPath?: string
  readonly category?: string
}

export interface CrabTrapIntakeResult {
  readonly status: CrabTrapIntakeStatus
  readonly failureCode?: CrabTrapIntakeFailureCode
  readonly activityId?: number
  readonly diagnostic?: CrabTrapIntakeDiagnostic
}

export interface CrabTrapAdapterConfig {
  readonly signingSecret: string | Uint8Array
  readonly freshnessWindowSeconds?: number
  readonly maxPayloadBytes?: number
  readonly clock?: () => Date
}

export interface CrabTrapPreparedStatement {
  run(...params: readonly unknown[]): unknown
  get(...params: readonly unknown[]): unknown
  all(...params: readonly unknown[]): unknown[]
}

export interface CrabTrapActivityStore {
  prepare(sql: string): CrabTrapPreparedStatement
}

export interface CrabTrapAdapterContext {
  readonly db: CrabTrapActivityStore
  readonly workspaceId?: number
  readonly projectId?: number
  readonly facilityWorkspaceId?: number
  readonly flagContext?: FeatureFlagContext
}

export interface ProcessCrabTrapDenialSummaryInput {
  readonly rawPayload: string
  readonly config?: CrabTrapAdapterConfig | null
  readonly context: CrabTrapAdapterContext
}

export function processCrabTrapDenialSummary(
  input: ProcessCrabTrapDenialSummaryInput,
): CrabTrapIntakeResult {
  if (!resolveFlag('FEATURE_CRABTRAP_HONEYPOT', input.context.flagContext)) {
    return noop('feature_disabled')
  }

  if (input.config == null) {
    return noop('config_missing')
  }

  if (!isValidConfig(input.config)) {
    return noop('config_invalid')
  }

  return {
    status: 'rejected',
    failureCode: 'payload_schema_invalid',
  }
}

function noop(failureCode: CrabTrapIntakeFailureCode): CrabTrapIntakeResult {
  return {
    status: 'noop',
    failureCode,
  }
}

function isValidConfig(config: CrabTrapAdapterConfig): boolean {
  if (!isValidSigningSecret(config.signingSecret)) {
    return false
  }

  if (
    config.freshnessWindowSeconds !== undefined &&
    !isPositiveSafeInteger(config.freshnessWindowSeconds)
  ) {
    return false
  }

  if (
    config.maxPayloadBytes !== undefined &&
    !isPositiveSafeInteger(config.maxPayloadBytes)
  ) {
    return false
  }

  if (config.clock !== undefined && !isValidClock(config.clock)) {
    return false
  }

  return true
}

function isValidSigningSecret(secret: CrabTrapAdapterConfig['signingSecret']): boolean {
  if (typeof secret === 'string') {
    return secret.trim().length > 0
  }

  return secret instanceof Uint8Array && secret.byteLength > 0
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function isValidClock(clock: () => Date): boolean {
  try {
    const now = clock()
    return now instanceof Date && Number.isFinite(now.getTime())
  } catch {
    return false
  }
}
