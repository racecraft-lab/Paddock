import { createHash } from 'node:crypto'
import {
  CODEX_APP_SERVER_MANIFEST,
  CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET,
} from './manifest'
import type { CodexAppServerProtocolStep, CodexAppServerWireMessage } from './runner'

export const CODEX_APP_SERVER_RUN_SCHEMA_VERSION = 'codex_app_server_run.v1' as const

export type CodexAppServerRunStatus =
  | 'blocked'
  | 'launched'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'abandoned'
  | 'cleanup_failed'

export type CodexAppServerRunOutcome =
  | 'pending'
  | 'success'
  | 'failed'
  | 'blocked'
  | 'abandoned'

export type CodexAppServerRunPhase =
  | 'eligibility'
  | 'lifecycle_prepare'
  | 'spawn'
  | 'initialize'
  | 'thread_start'
  | 'turn_start'
  | 'running'
  | 'terminal'
  | 'artifact_safety'
  | 'cleanup'
  | 'subprocess_termination'
  | 'lifecycle_cleanup'

export type CodexAppServerReasonCode =
  | 'feature_disabled'
  | 'adapter_unassigned'
  | 'not_github_linked'
  | 'manifest_invalid'
  | 'manifest_mismatch'
  | 'missing_claim'
  | 'stale_claim'
  | 'missing_attempt'
  | 'governance_denied'
  | 'capability_unsupported'
  | 'sandbox_lifecycle_missing'
  | 'sandbox_lifecycle_not_paddock_owned'
  | 'sandbox_lifecycle_not_ready'
  | 'workspace_mismatch'
  | 'repository_mismatch'
  | 'authorization_denied'
  | 'user_input_unsupported'
  | 'approval_unsupported'
  | 'tool_file_unsupported'
  | 'timeout_budget_expired'
  | 'binary_unavailable'
  | 'malformed_protocol'
  | 'unsafe_evidence_rejected'
  | 'abandoned_by_claim_control'
  | 'cleanup_failed'

export interface CodexAppServerTerminalMappingCase {
  readonly label: string
  readonly caseKind: 'launched' | 'success' | 'blocked' | 'failed' | 'timeout' | 'abandoned' | 'cleanup_failed'
  readonly runStatus: CodexAppServerRunStatus
  readonly outcome: CodexAppServerRunOutcome
  readonly phase: CodexAppServerRunPhase
  readonly reasonCode: CodexAppServerReasonCode | null
  readonly launchedIdsRequired: boolean
}

export interface CodexAppServerUsageSummary {
  readonly availability: 'available' | 'partial' | 'unavailable'
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
  readonly source: 'thread_token_usage_updated' | 'final_turn' | 'none'
}

export interface CodexAppServerEvidenceSafety {
  readonly rawTranscriptRetained: false
  readonly rawProtocolRetained: false
  readonly providerPayloadRetained: false
  readonly toolPayloadRetained: false
  readonly promptBodyRetained: false
  readonly hostPathRetained: false
  readonly secretRetained: false
  readonly redactionApplied: boolean
}

export interface CodexAppServerSafeArtifactRef {
  readonly artifactId: string
  readonly artifactType: 'codex_app_server_summary'
  readonly schemaVersion: typeof CODEX_APP_SERVER_RUN_SCHEMA_VERSION
  readonly mimeType: 'application/json'
  readonly byteSize: number
  readonly itemCount: number
  readonly sha256: string
  readonly redactionStatus: 'not_needed' | 'redacted'
  readonly securityScanStatus: 'passed'
  readonly producedAt: string
  readonly safeSummary: string
  readonly safeLabel: string
}

export interface CodexAppServerRunFailure {
  readonly safeDiagnosticCategory: string
  readonly relatedIds: readonly string[]
  readonly rejectedFieldPaths?: readonly string[]
  readonly safeHash?: string
  readonly safeSize?: number
  readonly runErrorLabel?: string
}

export interface CodexAppServerRunEvidence {
  readonly schemaVersion: typeof CODEX_APP_SERVER_RUN_SCHEMA_VERSION
  readonly adapterId: 'codex-app-server'
  readonly runId: string
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly attemptId?: string
  readonly claimId?: string
  readonly claimRunId?: string
  readonly manifestId?: string
  readonly lifecycleId?: string
  readonly status: CodexAppServerRunStatus
  readonly outcome: CodexAppServerRunOutcome
  readonly phase: CodexAppServerRunPhase
  readonly reasonCode?: CodexAppServerReasonCode
  readonly protocol?: {
    readonly threadId: string
    readonly threadSessionId: string
    readonly turnIds: readonly string[]
    readonly notificationsSeen: Record<string, number>
  }
  readonly usage: CodexAppServerUsageSummary
  readonly artifactRefs?: readonly CodexAppServerSafeArtifactRef[]
  readonly failure?: CodexAppServerRunFailure
  readonly safety: CodexAppServerEvidenceSafety
  readonly timestamps: {
    readonly startedAt: string
    readonly completedAt?: string
  }
}

export interface CodexAppServerActivityPayload {
  readonly activityType: string
  readonly entityType: 'task'
  readonly entityId: string
  readonly workspaceId: string
  readonly runId: string
  readonly attemptId: string | undefined
  readonly claimId: string | undefined
  readonly claimRunId: string | undefined
  readonly manifestId: string | undefined
  readonly lifecycleId: string | undefined
  readonly artifactIds: readonly string[]
  readonly phase: string
  readonly reasonCode: string | undefined
  readonly status: string
  readonly outcome: string
  readonly safeDiagnosticCategory: string | undefined
  readonly counts: Record<string, number>
  readonly safeHash: string | undefined
  readonly safeSize: number | undefined
  readonly createdAt: string
}

export interface CodexAppServerArtifactPolicy {
  readonly allowArtifactPublication: boolean
  readonly allowSecretRedaction: boolean
  readonly maxSafeSummaryChars: number
  readonly maxArtifacts: number
}

export type CodexAppServerJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CodexAppServerJsonValue[]
  | { readonly [key: string]: CodexAppServerJsonValue }

export interface BuildCodexAppServerEvidenceArtifactsInput {
  readonly runEvidence: CodexAppServerRunEvidence
  readonly output: CodexAppServerJsonValue
  readonly artifactPolicy: CodexAppServerArtifactPolicy
  readonly now: () => string
}

export interface CodexAppServerEvidenceArtifactSafetyResult {
  readonly accepted: boolean
  readonly reasonCode: 'unsafe_evidence_rejected' | null
  readonly safeDiagnosticCategory: string | null
  readonly rejectedFieldPaths: readonly string[]
  readonly safeSummary: string | null
  readonly artifactRefs: readonly CodexAppServerSafeArtifactRef[]
  readonly safety: CodexAppServerEvidenceSafety
}

const descriptorOnlySafety: CodexAppServerEvidenceSafety = {
  rawTranscriptRetained: false,
  rawProtocolRetained: false,
  providerPayloadRetained: false,
  toolPayloadRetained: false,
  promptBodyRetained: false,
  hostPathRetained: false,
  secretRetained: false,
  redactionApplied: false,
}

const DEFAULT_IDS = {
  workspaceId: 'ws_spec_014c_codex',
  taskId: 'task_spec_014c_001',
  stageKey: 'implementation',
  runId: 'run_spec_014c_001',
  attemptId: 'attempt_spec_014c_001',
  claimId: 'claim_spec_014c_001',
  claimRunId: 'claim_run_spec_014c_001',
  manifestId: CODEX_APP_SERVER_MANIFEST.manifestId,
  lifecycleId: 'lifecycle_spec_014c_001',
  threadId: 'thr_spec_014c_001',
  threadSessionId: 'thr_spec_014c_001',
  turnId: 'turn_spec_014c_001',
  artifactId: 'artifact_spec_014c_001',
} as const

const DEFAULT_STARTED_AT = '2026-06-05T12:00:00.000Z'
const DEFAULT_COMPLETED_AT = '2026-06-05T12:01:15.000Z'
const DEFAULT_SAFE_SHA256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const SAFE_ARTIFACT_KEYS = new Set([
  'artifactId',
  'artifactType',
  'schemaVersion',
  'mimeType',
  'byteSize',
  'itemCount',
  'sha256',
  'redactionStatus',
  'securityScanStatus',
  'producedAt',
  'safeSummary',
  'safeLabel',
])

const UNSAFE_KEY_CATEGORIES: Readonly<Record<string, string>> = {
  transcript: 'raw_transcript',
  rawTranscript: 'raw_transcript',
  protocolPayload: 'raw_protocol',
  rawProtocol: 'raw_protocol',
  rawContent: 'raw_content',
  previewText: 'raw_content',
  promptBody: 'prompt_body',
  providerPayload: 'provider_payload',
  toolPayload: 'tool_payload',
  mcpPayload: 'mcp_payload',
  storageUri: 'storage_uri',
  originalFilename: 'original_filename',
  cwd: 'host_path',
  sandboxPath: 'host_path',
  hostPath: 'host_path',
  url: 'external_url',
  commandDetails: 'command_details',
  fileChangeDetails: 'file_change_details',
}

const HOST_PATH_PATTERN = /(?:^|[\s"'`])(?:\/(?:Users|private|tmp|var|etc|home)\/|[A-Za-z]:\\)/
const STORAGE_URI_PATTERN = /\b(?:file|data|javascript):/i
const EXTERNAL_URL_PATTERN = /\bhttps?:\/\//i
const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY|bearer\s+[A-Za-z0-9._-]{20,}|token\s*[:=]|secret\s*[:=]|password\s*[:=]|api[_-]?key\s*[:=])/gi

function safety(redactionApplied = false): CodexAppServerEvidenceSafety {
  return {
    ...descriptorOnlySafety,
    redactionApplied,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function safeHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function pathFor(parent: string, key: string, inArray = false): string {
  if (inArray) return `${parent}[${key}]`
  return parent === '$' ? `$.${key}` : `${parent}.${key}`
}

function notificationMethod(step: CodexAppServerProtocolStep): string | null {
  const method = step.message.method
  return typeof method === 'string' ? method : null
}

function readParams(message: CodexAppServerWireMessage): Record<string, unknown> | null {
  return isRecord(message.params) ? message.params : null
}

function readResult(message: CodexAppServerWireMessage): Record<string, unknown> | null {
  return isRecord(message.result) ? message.result : null
}

function readUsageObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function usageFromObject(
  value: unknown,
  source: CodexAppServerUsageSummary['source'],
): CodexAppServerUsageSummary | null {
  const usage = readUsageObject(value)
  if (!usage) return null

  const inputTokens = usage['inputTokens']
  const outputTokens = usage['outputTokens']
  const totalTokens = usage['totalTokens']
  const hasInput = isSafeInteger(inputTokens)
  const hasOutput = isSafeInteger(outputTokens)
  const hasTotal = isSafeInteger(totalTokens)

  if (hasInput && hasOutput && hasTotal) {
    return {
      availability: 'available',
      inputTokens,
      outputTokens,
      totalTokens,
      source,
    }
  }

  if (hasInput || hasOutput || hasTotal) {
    return {
      availability: 'partial',
      ...(hasInput ? { inputTokens } : {}),
      ...(hasOutput ? { outputTokens } : {}),
      ...(hasTotal ? { totalTokens } : {}),
      source,
    }
  }

  return null
}

export function summarizeCodexAppServerUsage(
  protocolSteps: readonly CodexAppServerProtocolStep[],
): CodexAppServerUsageSummary {
  for (const step of protocolSteps) {
    if (notificationMethod(step) !== 'thread/tokenUsage/updated') continue
    const params = readParams(step.message)
    const summary = usageFromObject(params?.['usage'], 'thread_token_usage_updated')
    if (summary) return summary
  }

  for (const step of protocolSteps) {
    if (notificationMethod(step) !== 'turn/completed') continue
    const params = readParams(step.message)
    const turn = params?.['turn']
    if (!isRecord(turn)) continue
    const summary = usageFromObject(turn['usage'], 'final_turn')
    if (summary?.availability === 'available') return summary
  }

  return {
    availability: 'unavailable',
    source: 'none',
  }
}

function protocolEvidence(
  protocolSteps: readonly CodexAppServerProtocolStep[],
): CodexAppServerRunEvidence['protocol'] | undefined {
  let threadId: string | null = null
  let threadSessionId: string | null = null
  const turnIds = new Set<string>()
  const notificationsSeen: Record<string, number> = {}

  for (const step of protocolSteps) {
    const method = notificationMethod(step)
    if (method) notificationsSeen[method] = (notificationsSeen[method] ?? 0) + 1

    const result = readResult(step.message)
    const resultThread = result?.['thread']
    if (isRecord(resultThread)) {
      const id = resultThread['id']
      const sessionId = resultThread['sessionId']
      if (typeof id === 'string' && id.length > 0) threadId = id
      if (typeof sessionId === 'string' && sessionId.length > 0) threadSessionId = sessionId
    }

    const params = readParams(step.message)
    const paramsThread = params?.['thread']
    if (isRecord(paramsThread)) {
      const id = paramsThread['id']
      if (typeof id === 'string' && id.length > 0) threadId = id
    }
    const paramsTurn = params?.['turn']
    if (isRecord(paramsTurn)) {
      const id = paramsTurn['id']
      if (typeof id === 'string' && id.length > 0) turnIds.add(id)
    }
    const turnId = params?.['turnId']
    if (typeof turnId === 'string' && turnId.length > 0) turnIds.add(turnId)
  }

  if (!threadId && turnIds.size === 0 && Object.keys(notificationsSeen).length === 0) return undefined

  return {
    threadId: threadId ?? DEFAULT_IDS.threadId,
    threadSessionId: threadSessionId ?? threadId ?? DEFAULT_IDS.threadSessionId,
    turnIds: turnIds.size > 0 ? [...turnIds].slice(0, 8) : [DEFAULT_IDS.turnId],
    notificationsSeen,
  }
}

function defaultProtocol(): NonNullable<CodexAppServerRunEvidence['protocol']> {
  return {
    threadId: DEFAULT_IDS.threadId,
    threadSessionId: DEFAULT_IDS.threadSessionId,
    turnIds: [DEFAULT_IDS.turnId],
    notificationsSeen: {
      'thread/started': 1,
      'turn/started': 1,
      'turn/completed': 1,
    },
  }
}

function defaultArtifactRef(): CodexAppServerSafeArtifactRef {
  return {
    artifactId: DEFAULT_IDS.artifactId,
    artifactType: 'codex_app_server_summary',
    schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
    mimeType: 'application/json',
    byteSize: 512,
    itemCount: 1,
    sha256: DEFAULT_SAFE_SHA256,
    redactionStatus: 'not_needed',
    securityScanStatus: 'passed',
    producedAt: DEFAULT_COMPLETED_AT,
    safeSummary: 'Descriptor-only Codex app-server fixture artifact.',
    safeLabel: 'codex-app-server-summary',
  }
}

export function buildCodexAppServerRunEvidence(
  mappingCase: CodexAppServerTerminalMappingCase = {
    label: 'successful app-server turn',
    caseKind: 'success',
    runStatus: 'completed',
    outcome: 'success',
    phase: 'terminal',
    reasonCode: null,
    launchedIdsRequired: true,
  },
  overrides: Partial<CodexAppServerRunEvidence> = {},
): CodexAppServerRunEvidence {
  const launchedIds = mappingCase.launchedIdsRequired
    ? {
        attemptId: DEFAULT_IDS.attemptId,
        claimId: DEFAULT_IDS.claimId,
        claimRunId: DEFAULT_IDS.claimRunId,
        manifestId: DEFAULT_IDS.manifestId,
        lifecycleId: DEFAULT_IDS.lifecycleId,
      }
    : {}
  const failure = mappingCase.reasonCode
    ? {
        failure: {
          safeDiagnosticCategory: mappingCase.reasonCode,
          relatedIds: [DEFAULT_IDS.runId],
          safeHash: DEFAULT_SAFE_SHA256,
          safeSize: 128,
          runErrorLabel: mappingCase.label,
        },
      }
    : {}

  return {
    schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
    adapterId: CODEX_APP_SERVER_MANIFEST.adapterId,
    runId: DEFAULT_IDS.runId,
    workspaceId: DEFAULT_IDS.workspaceId,
    taskId: DEFAULT_IDS.taskId,
    stageKey: DEFAULT_IDS.stageKey,
    ...launchedIds,
    status: mappingCase.runStatus,
    outcome: mappingCase.outcome,
    phase: mappingCase.phase,
    ...(mappingCase.reasonCode ? { reasonCode: mappingCase.reasonCode } : {}),
    ...(mappingCase.launchedIdsRequired ? { protocol: defaultProtocol() } : {}),
    usage: mappingCase.caseKind === 'success'
      ? {
          availability: 'available',
          inputTokens: 321,
          outputTokens: 123,
          totalTokens: 444,
          source: 'thread_token_usage_updated',
        }
      : {
          availability: 'unavailable',
          source: 'none',
        },
    artifactRefs: mappingCase.caseKind === 'success' ? [defaultArtifactRef()] : [],
    ...failure,
    safety: safety(false),
    timestamps: {
      startedAt: DEFAULT_STARTED_AT,
      completedAt: DEFAULT_COMPLETED_AT,
    },
    ...overrides,
  }
}

export function buildCodexAppServerRunEvidenceFromProtocol(
  input: {
    readonly mappingCase?: CodexAppServerTerminalMappingCase
    readonly protocolSteps: readonly CodexAppServerProtocolStep[]
    readonly startedAt: string
    readonly completedAt?: string
    readonly artifactRefs?: readonly CodexAppServerSafeArtifactRef[]
    readonly failure?: CodexAppServerRunFailure
  },
): CodexAppServerRunEvidence {
  const protocol = protocolEvidence(input.protocolSteps)
  const overrides = {
    usage: summarizeCodexAppServerUsage(input.protocolSteps),
    artifactRefs: input.artifactRefs ?? [],
    timestamps: {
      startedAt: input.startedAt,
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    },
    ...(protocol ? { protocol } : {}),
    ...(input.failure ? { failure: input.failure } : {}),
  } satisfies Partial<CodexAppServerRunEvidence>
  const evidence = buildCodexAppServerRunEvidence(input.mappingCase, overrides)
  if (protocol) return evidence
  const withoutProtocol = { ...evidence } as Record<string, unknown>
  delete withoutProtocol['protocol']
  return withoutProtocol as unknown as CodexAppServerRunEvidence
}

export function buildCodexAppServerActivityPayload(
  evidence: CodexAppServerRunEvidence,
  options: { readonly activityType?: string; readonly createdAt?: string } = {},
): CodexAppServerActivityPayload {
  const artifactRefs = evidence.artifactRefs ?? []
  const failure = evidence.failure
  return {
    activityType: options.activityType ?? `codex_app_server_${evidence.status}`,
    entityType: 'task',
    entityId: evidence.taskId,
    workspaceId: evidence.workspaceId,
    runId: evidence.runId,
    attemptId: evidence.attemptId,
    claimId: evidence.claimId,
    claimRunId: evidence.claimRunId,
    manifestId: evidence.manifestId,
    lifecycleId: evidence.lifecycleId,
    artifactIds: artifactRefs.map((ref) => ref.artifactId),
    phase: evidence.phase,
    reasonCode: evidence.reasonCode,
    status: evidence.status,
    outcome: evidence.outcome,
    safeDiagnosticCategory: failure?.safeDiagnosticCategory,
    counts: {
      artifactRefs: artifactRefs.length,
      rejectedFieldPaths: failure?.rejectedFieldPaths?.length ?? 0,
    },
    safeHash: failure?.safeHash,
    safeSize: failure?.safeSize,
    createdAt: options.createdAt ?? evidence.timestamps.completedAt ?? evidence.timestamps.startedAt,
  }
}

interface UnsafeScanFinding {
  readonly path: string
  readonly category: string
}

function scanUnsafe(value: unknown, path = '$'): UnsafeScanFinding | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = scanUnsafe(value[index], `${path}[${index.toString()}]`)
      if (finding) return finding
    }
    return null
  }

  if (!isRecord(value)) {
    if (typeof value === 'string') {
      if (HOST_PATH_PATTERN.test(value)) return { path, category: 'host_path' }
      if (STORAGE_URI_PATTERN.test(value)) return { path, category: 'storage_uri' }
      if (EXTERNAL_URL_PATTERN.test(value)) return { path, category: 'external_url' }
    }
    return null
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathFor(path, key)
    const category = UNSAFE_KEY_CATEGORIES[key]
    if (category) return { path: childPath, category }
    if (typeof child === 'string') {
      if (HOST_PATH_PATTERN.test(child)) return { path: childPath, category: 'host_path' }
      if (STORAGE_URI_PATTERN.test(child)) return { path: childPath, category: 'storage_uri' }
      if (EXTERNAL_URL_PATTERN.test(child)) return { path: childPath, category: 'external_url' }
    }
    const finding = scanUnsafe(child, childPath)
    if (finding) return finding
  }

  return null
}

function redactSecrets(value: string): { readonly text: string; readonly redactionApplied: boolean } {
  const text = value.replace(SECRET_PATTERN, '[redacted]')
  return {
    text,
    redactionApplied: text !== value,
  }
}

function rejectArtifact(
  category: string,
  rejectedFieldPaths: readonly string[],
  redactionApplied = false,
): CodexAppServerEvidenceArtifactSafetyResult {
  return {
    accepted: false,
    reasonCode: 'unsafe_evidence_rejected',
    safeDiagnosticCategory: category,
    rejectedFieldPaths,
    safeSummary: null,
    artifactRefs: [],
    safety: safety(redactionApplied),
  }
}

function parseSafeArtifactRef(value: unknown, path: string): CodexAppServerSafeArtifactRef | UnsafeScanFinding {
  if (!isRecord(value)) return { path, category: 'artifact_ref' }
  for (const key of Object.keys(value)) {
    if (!SAFE_ARTIFACT_KEYS.has(key)) return { path: pathFor(path, key), category: UNSAFE_KEY_CATEGORIES[key] ?? 'artifact_ref' }
  }

  const artifactId = value['artifactId']
  const artifactType = value['artifactType']
  const schemaVersion = value['schemaVersion']
  const mimeType = value['mimeType']
  const byteSize = value['byteSize']
  const itemCount = value['itemCount']
  const sha256 = value['sha256']
  const redactionStatus = value['redactionStatus']
  const securityScanStatus = value['securityScanStatus']
  const producedAt = value['producedAt']
  const safeSummaryValue = value['safeSummary']
  const safeLabelValue = value['safeLabel']

  if (
    !boundedString(artifactId, 128) ||
    artifactType !== 'codex_app_server_summary' ||
    schemaVersion !== CODEX_APP_SERVER_RUN_SCHEMA_VERSION ||
    mimeType !== 'application/json' ||
    !isSafeInteger(byteSize) ||
    byteSize > 262144 ||
    !isSafeInteger(itemCount) ||
    itemCount > 1024 ||
    !boundedString(sha256, 64) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !(redactionStatus === 'not_needed' || redactionStatus === 'redacted') ||
    securityScanStatus !== 'passed' ||
    !boundedString(producedAt, 80) ||
    !boundedString(safeSummaryValue, 1000) ||
    !boundedString(safeLabelValue, 160)
  ) {
    return { path, category: 'artifact_ref' }
  }

  const safeSummary = safeSummaryValue
  const safeLabel = safeLabelValue
  if (HOST_PATH_PATTERN.test(safeSummary) || HOST_PATH_PATTERN.test(safeLabel)) return { path, category: 'host_path' }
  if (STORAGE_URI_PATTERN.test(safeSummary) || STORAGE_URI_PATTERN.test(safeLabel)) return { path, category: 'storage_uri' }
  if (EXTERNAL_URL_PATTERN.test(safeSummary) || EXTERNAL_URL_PATTERN.test(safeLabel)) return { path, category: 'external_url' }
  if (SECRET_PATTERN.test(safeSummary) || SECRET_PATTERN.test(safeLabel)) return { path, category: 'secret' }

  return {
    artifactId,
    artifactType,
    schemaVersion,
    mimeType,
    byteSize,
    itemCount,
    sha256,
    redactionStatus,
    securityScanStatus,
    producedAt,
    safeSummary,
    safeLabel,
  }
}

function artifactRefsFromOutput(
  output: Record<string, unknown>,
  policy: CodexAppServerArtifactPolicy,
): readonly CodexAppServerSafeArtifactRef[] | UnsafeScanFinding {
  const rawRefs = output['artifactRefs']
  if (rawRefs === undefined) return []
  if (!Array.isArray(rawRefs)) return { path: '$.artifactRefs', category: 'artifact_ref' }
  if (!policy.allowArtifactPublication) return { path: '$.artifactRefs', category: 'artifact_policy' }
  if (rawRefs.length > policy.maxArtifacts) return { path: '$.artifactRefs', category: 'artifact_policy' }

  const refs: CodexAppServerSafeArtifactRef[] = []
  for (let index = 0; index < rawRefs.length; index += 1) {
    const refPath = `$.artifactRefs[${index.toString()}]`
    const ref = parseSafeArtifactRef(rawRefs[index], refPath)
    if ('category' in ref) return ref
    refs.push(ref)
  }
  return refs
}

export function buildCodexAppServerEvidenceArtifacts(
  input: BuildCodexAppServerEvidenceArtifactsInput,
): CodexAppServerEvidenceArtifactSafetyResult {
  const output = isRecord(input.output) ? input.output : {}
  const unsafeFinding = scanUnsafe(output)
  if (unsafeFinding) {
    return rejectArtifact(unsafeFinding.category, [unsafeFinding.path])
  }

  let redactionApplied = false
  let safeSummary: string | null = null
  const rawSummary = output['safeSummary']
  if (rawSummary !== undefined) {
    if (typeof rawSummary !== 'string' || rawSummary.length > input.artifactPolicy.maxSafeSummaryChars) {
      return rejectArtifact('safe_summary', ['$.safeSummary'])
    }
    const redacted = redactSecrets(rawSummary)
    redactionApplied = redacted.redactionApplied
    if (redactionApplied && !input.artifactPolicy.allowSecretRedaction) {
      return rejectArtifact('secret', ['$.safeSummary'])
    }
    safeSummary = redacted.text.trim()
    if (safeSummary.length === 0 || safeSummary === '[redacted]') {
      return rejectArtifact('redaction_empty', ['$.safeSummary'], redactionApplied)
    }
  }

  const artifactRefsResult = artifactRefsFromOutput(output, input.artifactPolicy)
  if ('category' in artifactRefsResult) {
    return rejectArtifact(artifactRefsResult.category, [artifactRefsResult.path])
  }

  return {
    accepted: true,
    reasonCode: null,
    safeDiagnosticCategory: null,
    rejectedFieldPaths: [],
    safeSummary,
    artifactRefs: artifactRefsResult,
    safety: safety(redactionApplied),
  }
}

export function buildCodexAppServerSafeArtifactRef(
  input: {
    readonly artifactId?: string
    readonly safeSummary: string
    readonly safeLabel?: string
    readonly itemCount?: number
    readonly producedAt?: string
    readonly redactionApplied?: boolean
  },
): CodexAppServerSafeArtifactRef {
  const producedAt = input.producedAt ?? new Date().toISOString()
  const summary = input.safeSummary.slice(0, 1000)
  return {
    artifactId: input.artifactId ?? `codex-app-server:${safeHash(`${producedAt}:${summary}`).slice(0, 32)}`,
    artifactType: 'codex_app_server_summary',
    schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
    mimeType: 'application/json',
    byteSize: Buffer.byteLength(summary, 'utf8'),
    itemCount: input.itemCount ?? 1,
    sha256: safeHash(summary),
    redactionStatus: input.redactionApplied ? 'redacted' : 'not_needed',
    securityScanStatus: 'passed',
    producedAt,
    safeSummary: summary,
    safeLabel: input.safeLabel ?? 'codex-app-server-summary',
  }
}

export const CODEX_APP_SERVER_EVIDENCE_CAPABILITY_PACKET = CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET
