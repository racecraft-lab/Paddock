import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
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

type CanonicalJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue }

type CrabTrapSupportedMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

interface NormalizedCrabTrapSummary {
  readonly schema_version: 'crabtrap_denial_summary.v1'
  readonly source: string
  readonly event_id: string
  readonly signed_at: string
  readonly occurred_at: string
  readonly decision: 'deny'
  readonly method: CrabTrapSupportedMethod
  readonly url_host: string
  readonly url_path: string
  readonly reason_code: CrabTrapReasonCode
  readonly safe_request_hash: string
  readonly denial_count: number
  readonly actor_kind: string
  readonly signature: string
  readonly source_instance_hash?: string
  readonly actor_ref_hash?: string
  readonly workspace_id?: number
  readonly project_id?: number
  readonly probe_kind?: string
  readonly url_path_hash?: string
  readonly distinct_host_count?: number
  readonly distinct_path_count?: number
  readonly distinct_actor_count?: number
}

type CrabTrapReasonCode =
  | 'static_rule_denied'
  | 'llm_policy_denied'
  | 'fallback_denied'
  | 'ssrf_blocked'
  | 'rate_limited'
  | 'policy_denied'
  | 'unknown_denied'

interface NormalizedSummaryResult {
  readonly ok: true
  readonly summary: NormalizedCrabTrapSummary
  readonly landingWorkspaceId: number
}

interface RejectedSummaryResult {
  readonly ok: false
  readonly failureCode: CrabTrapIntakeFailureCode
  readonly diagnostic?: CrabTrapIntakeDiagnostic
}

type SummaryNormalizationResult = NormalizedSummaryResult | RejectedSummaryResult

interface ActivityDataRow {
  readonly data: string | null
}

interface RunResultLike {
  readonly lastInsertRowid?: unknown
}

const CRABTRAP_SCHEMA_VERSION = 'crabtrap_denial_summary.v1'
const CRABTRAP_ACTIVITY_ACTOR = 'crabtrap-adapter'
const MAX_COUNT = 1_000_000
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/
const SIGNATURE_PATTERN = /^sha256=[a-f0-9]{64}$/
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const HOST_PATTERN = /^[a-z0-9.-]{1,253}$/
const PATH_PATTERN = /^\/[^?#\r\n]{0,2047}$/
const LOWER_SAFE_PATTERN = /^[a-z][a-z0-9_:-]{0,63}$/
const SUPPORTED_METHODS = new Set<CrabTrapSupportedMethod>([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])
const REASON_CODES = new Set<CrabTrapReasonCode>([
  'static_rule_denied',
  'llm_policy_denied',
  'fallback_denied',
  'ssrf_blocked',
  'rate_limited',
  'policy_denied',
  'unknown_denied',
])
const ALLOWED_FIELDS = new Set([
  'schema_version',
  'source',
  'event_id',
  'signed_at',
  'occurred_at',
  'decision',
  'method',
  'url_host',
  'url_path',
  'reason_code',
  'safe_request_hash',
  'denial_count',
  'actor_kind',
  'signature',
  'source_instance_hash',
  'actor_ref_hash',
  'workspace_id',
  'project_id',
  'probe_kind',
  'url_path_hash',
  'distinct_host_count',
  'distinct_path_count',
  'distinct_actor_count',
])

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

  const maxPayloadBytes = input.config.maxPayloadBytes ?? DEFAULT_CRABTRAP_MAX_PAYLOAD_BYTES
  if (Buffer.byteLength(input.rawPayload, 'utf8') > maxPayloadBytes) {
    return rejected('payload_too_large')
  }

  const parsed = parsePayload(input.rawPayload)
  if (!parsed.ok) {
    return rejected(parsed.failureCode)
  }

  const normalized = normalizeSummary(parsed.value, input.context)
  if (!normalized.ok) {
    return rejected(normalized.failureCode, normalized.diagnostic)
  }

  if (!verifySummarySignature(normalized.summary, input.config)) {
    return rejected('signature_invalid')
  }

  const replayKeyHash = deriveReplayKeyHash(normalized.summary)

  try {
    if (hasReplay(input.context.db, normalized.landingWorkspaceId, replayKeyHash)) {
      return rejected('replay_detected')
    }

    const activityId = insertSecurityActivity(
      input.context.db,
      normalized.summary,
      normalized.landingWorkspaceId,
      replayKeyHash,
    )

    return {
      status: 'accepted',
      ...(activityId === undefined ? {} : { activityId }),
    }
  } catch {
    return {
      status: 'failed',
      failureCode: 'activity_write_failed',
    }
  }
}

function noop(failureCode: CrabTrapIntakeFailureCode): CrabTrapIntakeResult {
  return {
    status: 'noop',
    failureCode,
  }
}

function rejected(
  failureCode: CrabTrapIntakeFailureCode,
  diagnostic?: CrabTrapIntakeDiagnostic,
): CrabTrapIntakeResult {
  return {
    status: 'rejected',
    failureCode,
    ...(diagnostic === undefined ? {} : { diagnostic }),
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

function parsePayload(
  rawPayload: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly failureCode: CrabTrapIntakeFailureCode } {
  try {
    return {
      ok: true,
      value: JSON.parse(rawPayload) as unknown,
    }
  } catch {
    return {
      ok: false,
      failureCode: 'malformed_json',
    }
  }
}

function normalizeSummary(value: unknown, context: CrabTrapAdapterContext): SummaryNormalizationResult {
  if (!isRecord(value)) {
    return normalizationFailure('payload_schema_invalid')
  }

  for (const field of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(field)) {
      return normalizationFailure('payload_schema_invalid', field)
    }
  }

  if (!Object.hasOwn(value, 'signature')) {
    return normalizationFailure('signature_missing')
  }

  const signature = readString(value, 'signature')
  if (signature === undefined || !SIGNATURE_PATTERN.test(signature)) {
    return normalizationFailure('signature_invalid', 'signature')
  }

  const timestampFailure = validateTimestamps(value)
  if (timestampFailure !== undefined) {
    return normalizationFailure(timestampFailure)
  }

  const landingWorkspaceId = selectLandingWorkspaceId(context)
  if (landingWorkspaceId === undefined) {
    return normalizationFailure('payload_schema_invalid', 'workspace_id')
  }

  const decision = readString(value, 'decision')
  if (decision === undefined) return normalizationFailure('payload_schema_invalid', 'decision')
  if (decision !== 'deny') return normalizationFailure('unsupported_decision', 'decision')

  const method = readString(value, 'method')
  if (method === undefined) return normalizationFailure('payload_schema_invalid', 'method')
  if (!isSupportedMethod(method)) return normalizationFailure('unsupported_method', 'method')

  const reasonCode = readString(value, 'reason_code')
  if (reasonCode === undefined || !isReasonCode(reasonCode)) {
    return normalizationFailure('payload_schema_invalid', 'reason_code')
  }

  const schemaVersion = readString(value, 'schema_version')
  const source = readString(value, 'source')
  const eventId = readString(value, 'event_id')
  const signedAt = readString(value, 'signed_at')
  const occurredAt = readString(value, 'occurred_at')
  const urlHost = normalizeHost(readString(value, 'url_host'))
  const urlPath = normalizePathname(readString(value, 'url_path'))
  const safeRequestHash = readHash(value, 'safe_request_hash')
  const denialCount = readCount(value, 'denial_count')
  const actorKind = readString(value, 'actor_kind')

  if (
    schemaVersion !== CRABTRAP_SCHEMA_VERSION ||
    source === undefined ||
    !SOURCE_PATTERN.test(source) ||
    eventId === undefined ||
    !EVENT_ID_PATTERN.test(eventId) ||
    signedAt === undefined ||
    occurredAt === undefined ||
    urlHost === undefined ||
    urlPath === undefined ||
    safeRequestHash === undefined ||
    denialCount === undefined ||
    actorKind === undefined ||
    !LOWER_SAFE_PATTERN.test(actorKind)
  ) {
    return normalizationFailure('payload_schema_invalid')
  }

  const workspaceId = readOptionalContextId(value, 'workspace_id', context.workspaceId ?? context.facilityWorkspaceId)
  if (workspaceId === false) {
    return normalizationFailure('payload_schema_invalid', 'workspace_id')
  }

  const projectId = readOptionalContextId(value, 'project_id', context.projectId)
  if (projectId === false) {
    return normalizationFailure('payload_schema_invalid', 'project_id')
  }

  const sourceInstanceHash = readOptionalHash(value, 'source_instance_hash')
  const actorRefHash = readOptionalHash(value, 'actor_ref_hash')
  const probeKind = readOptionalLowerSafe(value, 'probe_kind')
  const urlPathHash = readOptionalHash(value, 'url_path_hash')
  const distinctHostCount = readOptionalCount(value, 'distinct_host_count')
  const distinctPathCount = readOptionalCount(value, 'distinct_path_count')
  const distinctActorCount = readOptionalCount(value, 'distinct_actor_count')

  if (
    sourceInstanceHash === false ||
    actorRefHash === false ||
    probeKind === false ||
    urlPathHash === false ||
    distinctHostCount === false ||
    distinctPathCount === false ||
    distinctActorCount === false
  ) {
    return normalizationFailure('payload_schema_invalid')
  }

  const summary: NormalizedCrabTrapSummary = {
    schema_version: CRABTRAP_SCHEMA_VERSION,
    source,
    event_id: eventId,
    signed_at: signedAt,
    occurred_at: occurredAt,
    decision: 'deny',
    method,
    url_host: urlHost,
    url_path: urlPath,
    reason_code: reasonCode,
    safe_request_hash: safeRequestHash,
    denial_count: denialCount,
    actor_kind: actorKind,
    signature,
    ...(workspaceId === undefined ? {} : { workspace_id: workspaceId }),
    ...(projectId === undefined ? {} : { project_id: projectId }),
    ...(sourceInstanceHash === undefined ? {} : { source_instance_hash: sourceInstanceHash }),
    ...(actorRefHash === undefined ? {} : { actor_ref_hash: actorRefHash }),
    ...(probeKind === undefined ? {} : { probe_kind: probeKind }),
    ...(urlPathHash === undefined ? {} : { url_path_hash: urlPathHash }),
    ...(distinctHostCount === undefined ? {} : { distinct_host_count: distinctHostCount }),
    ...(distinctPathCount === undefined ? {} : { distinct_path_count: distinctPathCount }),
    ...(distinctActorCount === undefined ? {} : { distinct_actor_count: distinctActorCount }),
  }

  return {
    ok: true,
    summary,
    landingWorkspaceId,
  }
}

function normalizationFailure(
  failureCode: CrabTrapIntakeFailureCode,
  fieldPath?: string,
): RejectedSummaryResult {
  return {
    ok: false,
    failureCode,
    ...(fieldPath === undefined ? {} : { diagnostic: { code: failureCode, fieldPath } }),
  }
}

function validateTimestamps(value: Record<string, unknown>): CrabTrapIntakeFailureCode | undefined {
  const signedAt = readString(value, 'signed_at')
  const occurredAt = readString(value, 'occurred_at')
  if (signedAt === undefined || occurredAt === undefined) return 'timestamp_missing'
  if (!isValidTimestamp(signedAt) || !isValidTimestamp(occurredAt)) return 'timestamp_invalid'
  return undefined
}

function isValidTimestamp(value: string): boolean {
  const time = Date.parse(value)
  return Number.isFinite(time)
}

function selectLandingWorkspaceId(context: CrabTrapAdapterContext): number | undefined {
  if (context.workspaceId !== undefined && isPositiveSafeInteger(context.workspaceId)) {
    return context.workspaceId
  }

  if (context.facilityWorkspaceId !== undefined && isPositiveSafeInteger(context.facilityWorkspaceId)) {
    return context.facilityWorkspaceId
  }

  return undefined
}

function readOptionalContextId(
  value: Record<string, unknown>,
  key: string,
  approvedId: number | undefined,
): number | undefined | false {
  if (!Object.hasOwn(value, key)) return undefined
  const id = readPositiveId(value, key)
  if (id === undefined || approvedId === undefined || id !== approvedId) return false
  return id
}

function readPositiveId(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key]
  return typeof field === 'number' && isPositiveSafeInteger(field) ? field : undefined
}

function readHash(value: Record<string, unknown>, key: string): string | undefined {
  const field = readString(value, key)
  return field !== undefined && HASH_PATTERN.test(field) ? field : undefined
}

function readOptionalHash(value: Record<string, unknown>, key: string): string | undefined | false {
  if (!Object.hasOwn(value, key)) return undefined
  return readHash(value, key) ?? false
}

function readCount(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key]
  return typeof field === 'number' && isBoundedCount(field) ? field : undefined
}

function readOptionalCount(value: Record<string, unknown>, key: string): number | undefined | false {
  if (!Object.hasOwn(value, key)) return undefined
  return readCount(value, key) ?? false
}

function isBoundedCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT
}

function readOptionalLowerSafe(
  value: Record<string, unknown>,
  key: string,
): string | undefined | false {
  if (!Object.hasOwn(value, key)) return undefined
  const field = readString(value, key)
  return field !== undefined && LOWER_SAFE_PATTERN.test(field) ? field : false
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

function normalizeHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const host = value.toLowerCase()
  return HOST_PATTERN.test(host) ? host : undefined
}

function normalizePathname(value: string | undefined): string | undefined {
  if (!value?.startsWith('/')) return undefined

  try {
    const pathname = new URL(value, 'http://crabtrap.invalid').pathname
    return PATH_PATTERN.test(pathname) && pathname === value ? pathname : undefined
  } catch {
    return undefined
  }
}

function isSupportedMethod(value: string): value is CrabTrapSupportedMethod {
  return SUPPORTED_METHODS.has(value as CrabTrapSupportedMethod)
}

function isReasonCode(value: string): value is CrabTrapReasonCode {
  return REASON_CODES.has(value as CrabTrapReasonCode)
}

function verifySummarySignature(
  summary: NormalizedCrabTrapSummary,
  config: CrabTrapAdapterConfig,
): boolean {
  const unsignedSummary = unsignedCanonicalSummary(summary)
  const canonicalPayloadSha256 = sha256Hex(canonicalJson(unsignedSummary))
  const message = `v1:${summary.signed_at}:${summary.event_id}:${canonicalPayloadSha256}`
  const expectedSignature = createHmac('sha256', config.signingSecret)
    .update(message, 'utf8')
    .digest('hex')
  const actualSignature = summary.signature.slice('sha256='.length)

  return constantTimeHexEqual(actualSignature, expectedSignature)
}

function unsignedCanonicalSummary(summary: NormalizedCrabTrapSummary): Record<string, CanonicalJsonValue> {
  const unsignedSummary: Record<string, CanonicalJsonValue> = {}

  for (const [key, value] of Object.entries(summary)) {
    if (key !== 'signature') {
      unsignedSummary[key] = value as CanonicalJsonValue
    }
  }

  return unsignedSummary
}

function deriveReplayKeyHash(summary: NormalizedCrabTrapSummary): string {
  return `sha256:${sha256Hex(`${summary.source}\0${summary.event_id}\0${summary.occurred_at}`)}`
}

function hasReplay(
  db: CrabTrapActivityStore,
  landingWorkspaceId: number,
  replayKeyHash: string,
): boolean {
  const rows = db
    .prepare(
      `SELECT data
       FROM activities
       WHERE type = ?
         AND entity_type = 'workspace'
         AND entity_id = ?
         AND workspace_id = ?`,
    )
    .all(CRABTRAP_SECURITY_ACTIVITY_TYPE, landingWorkspaceId, landingWorkspaceId) as ActivityDataRow[]

  return rows.some((row) => {
    if (typeof row.data !== 'string') return false
    try {
      const data = JSON.parse(row.data) as unknown
      return isRecord(data) && data['replay_key_hash'] === replayKeyHash
    } catch {
      return false
    }
  })
}

function insertSecurityActivity(
  db: CrabTrapActivityStore,
  summary: NormalizedCrabTrapSummary,
  landingWorkspaceId: number,
  replayKeyHash: string,
): number | undefined {
  const result = db
    .prepare(
      `INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
       VALUES (?, 'workspace', ?, ?, ?, ?, ?)`,
    )
    .run(
      CRABTRAP_SECURITY_ACTIVITY_TYPE,
      landingWorkspaceId,
      CRABTRAP_ACTIVITY_ACTOR,
      'CrabTrap denial summary accepted',
      JSON.stringify(activityData(summary, replayKeyHash)),
      landingWorkspaceId,
    ) as RunResultLike

  return readLastInsertRowid(result)
}

function activityData(
  summary: NormalizedCrabTrapSummary,
  replayKeyHash: string,
): Record<string, CanonicalJsonValue> {
  return omitUndefined({
    source: summary.source,
    decision: summary.decision,
    method: summary.method,
    url_host: summary.url_host,
    url_path: summary.url_path,
    reason_code: summary.reason_code,
    safe_request_hash: summary.safe_request_hash,
    denial_count: summary.denial_count,
    actor_kind: summary.actor_kind,
    source_instance_hash: summary.source_instance_hash,
    actor_ref_hash: summary.actor_ref_hash,
    project_id: summary.project_id,
    probe_kind: summary.probe_kind,
    url_path_hash: summary.url_path_hash,
    distinct_host_count: summary.distinct_host_count,
    distinct_path_count: summary.distinct_path_count,
    distinct_actor_count: summary.distinct_actor_count,
    replay_key_hash: replayKeyHash,
  })
}

function readLastInsertRowid(result: RunResultLike): number | undefined {
  const id = result.lastInsertRowid
  if (typeof id === 'number' && Number.isSafeInteger(id)) return id
  if (typeof id === 'bigint' && id <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(id)
  return undefined
}

function canonicalJson(value: CanonicalJsonValue): string {
  if (isCanonicalArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }

  if (isCanonicalObject(value)) {
    const keys = Object.keys(value).sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false
  }

  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
}

function omitUndefined(value: Record<string, CanonicalJsonValue | undefined>): Record<string, CanonicalJsonValue> {
  const result: Record<string, CanonicalJsonValue> = {}
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      result[key] = field
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCanonicalArray(value: CanonicalJsonValue): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value)
}

function isCanonicalObject(value: CanonicalJsonValue): value is Readonly<Record<string, CanonicalJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
