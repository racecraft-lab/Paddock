import {
  publishArtifact,
  type PublishArtifactInput,
  type PublishArtifactResult,
} from './task-artifacts'
import type Database from 'better-sqlite3'

export const PILOT_REVIEW_PACKET_SCHEMA_VERSION = 'spec-009d.packet.v1'
export const PILOT_REVIEW_PACKET_JSON_ARTIFACT_TYPE = 'pilot_review_packet_json'
export const PILOT_REVIEW_PACKET_MARKDOWN_ARTIFACT_TYPE = 'pilot_review_packet_markdown'

export const EVIDENCE_STATES = Object.freeze([
  'available',
  'redacted',
  'quarantined',
  'oversized',
  'missing',
  'malformed',
  'superseded',
  'stale',
] as const)

export type PacketEvidenceState = (typeof EVIDENCE_STATES)[number]

export const DEFERRAL_OWNER_SPECS = Object.freeze({
  run_state: ['SPEC-013A'],
  github_sync_automation: ['SPEC-013A1'],
  claim_authority: ['SPEC-013B'],
  retry_controls: ['SPEC-013C'],
  sandbox_lifecycle: ['SPEC-014A'],
  adapter_registry: ['SPEC-014B'],
  real_harness_execution: ['SPEC-014C', 'SPEC-014D'],
} as const)

export type PilotDeferralKey = keyof typeof DEFERRAL_OWNER_SPECS

export type PilotCandidateState =
  | 'not_evaluated'
  | 'eligible'
  | 'proven'
  | 'published'
  | 'incomplete'
  | 'published_incomplete'
  | 'local_only_excluded'

export type JsonPointer = `/${string}`

export interface SourceMapReference {
  readonly source_type: 'table' | 'smoke_checklist' | 'github' | 'artifact' | 'generated'
  readonly table?: string
  readonly row_id?: number | string
  readonly field?: string
  readonly json_path?: string
  readonly artifact_id?: number
  readonly checklist_path?: string
  readonly checklist_anchor?: string
  readonly github_repo?: string
  readonly github_issue_number?: number
  readonly github_pr_number?: number
  readonly observed_at?: string
}

export interface PilotTaskRecord {
  readonly id: number
  readonly workspace_id: number
  readonly title: string
  readonly status: string
  readonly github_repo?: string | null
  readonly github_issue_number?: number | null
  readonly github_pr_number?: number | null
  readonly github_synced_at?: string | number | null
  readonly parent_task_id?: number | null
  readonly root_task_id?: number | null
  readonly chain_id?: string | null
  readonly chain_stage?: string | null
  readonly created_at?: string | number | null
  readonly updated_at?: string | number | null
}

export interface PilotActivityRecord {
  readonly id: number
  readonly task_id?: number | null
  readonly workspace_id?: number | null
  readonly type: string
  readonly description?: string | null
  readonly actor?: string | null
  readonly data?: unknown
  readonly created_at?: string | number | null
}

export interface PilotNotificationRecord {
  readonly id: number
  readonly workspace_id?: number | null
  readonly recipient?: string | null
  readonly type: string
  readonly title?: string | null
  readonly message?: string | null
  readonly source_type?: string | null
  readonly source_id?: number | null
  readonly created_at?: string | number | null
}

export interface PilotArtifactEvidenceRecord {
  readonly id: number
  readonly task_id: number
  readonly workspace_id?: number | null
  readonly artifact_type: string
  readonly schema_version?: string | null
  readonly storage_kind?: string | null
  readonly redaction_status: string
  readonly security_scan_status: string
  readonly sha256?: string | null
  readonly byte_size?: number | null
  readonly mime?: string | null
  readonly mime_type?: string | null
  readonly preview_text?: string | null
  readonly storage_uri?: string | null
  readonly supersedes_artifact_id?: number | null
  readonly created_at?: string | number | null
  readonly stale?: boolean
  readonly malformed?: boolean
  readonly evidence_state_override?: PacketEvidenceState
}

export interface PilotQualityReviewRecord {
  readonly id: number
  readonly task_id: number
  readonly workspace_id?: number | null
  readonly reviewer: string
  readonly status: string
  readonly notes?: string | null
  readonly created_at?: string | number | null
}

export interface PilotResourcePolicyEventRecord {
  readonly id: number
  readonly task_id?: number | null
  readonly workspace_id?: number | null
  readonly decision?: string | null
  readonly reason?: string | null
  readonly details_json?: string | null
  readonly created_at?: string | number | null
}

export interface PilotGithubSyncRecord {
  readonly id: number
  readonly task_id?: number | null
  readonly workspace_id?: number | null
  readonly github_repo: string
  readonly github_issue_number?: number | null
  readonly github_pr_number?: number | null
  readonly status?: string | null
  readonly synced_at?: string | number | null
  readonly last_sync_at?: string | number | null
  readonly created_at?: string | number | null
}

export interface PilotSmokeChecklistReference {
  readonly id: string
  readonly checklist_path: string
  readonly checklist_anchor: string
  readonly summary: string
  readonly github_repo?: string | null
  readonly github_issue_number?: number | null
  readonly github_pr_number?: number | null
  readonly observed_at?: string | number | null
  readonly cleanup_applied?: boolean
}

export interface BuildPilotReviewPacketInput {
  readonly generated_at?: string | number | Date
  readonly root_task: PilotTaskRecord
  readonly descendant_tasks?: readonly PilotTaskRecord[]
  readonly activities?: readonly PilotActivityRecord[]
  readonly notifications?: readonly PilotNotificationRecord[]
  readonly artifacts?: readonly PilotArtifactEvidenceRecord[]
  readonly quality_reviews?: readonly PilotQualityReviewRecord[]
  readonly resource_policy_events?: readonly PilotResourcePolicyEventRecord[]
  readonly github_syncs?: readonly PilotGithubSyncRecord[]
  readonly smoke_checklist_references?: readonly PilotSmokeChecklistReference[]
}

export interface PacketTaskSummary {
  readonly id: number
  readonly title: string
  readonly status: string
  readonly chain_stage: string | null
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly github_pr_number: number | null
}

export interface PacketActivitySummary {
  readonly id: number
  readonly type: string
  readonly description: string | null
  readonly created_at: string | null
}

export interface PacketErrorSummary {
  readonly id: number
  readonly type: string
  readonly summary: string
  readonly created_at: string | null
}

export interface PacketWarning {
  readonly code: string
  readonly severity: 'warning'
  readonly reason: string
  readonly source_map: readonly JsonPointer[]
}

export interface PacketArtifactEvidence {
  readonly artifact_id: number
  readonly artifact_type: string
  readonly evidence_state: PacketEvidenceState
  readonly redaction_status: string
  readonly security_scan_status: string
  readonly sha256: string | null
  readonly byte_size: number | null
  readonly mime: string | null
  readonly schema_version: string | null
  readonly preview_text: string | null
  readonly storage_uri: string | null
  readonly supersedes_artifact_id: number | null
  readonly source_map: readonly JsonPointer[]
}

export interface PacketEvidenceEntry {
  readonly kind: string
  readonly evidence_state: PacketEvidenceState
  readonly summary: string
  readonly warning_code: string | null
  readonly source_map: readonly JsonPointer[]
}

export interface PacketArtifactEvidenceEntry {
  readonly kind: 'task_artifacts'
  readonly evidence_state: PacketEvidenceState
  readonly summary: string
  readonly warning_code: string | null
  readonly source_map: readonly JsonPointer[]
  readonly items: readonly PacketArtifactEvidence[]
}

export interface PacketEvidence {
  readonly github_sync: PacketEvidenceEntry
  readonly smoke_checklist: PacketEvidenceEntry
  readonly latest_error: PacketEvidenceEntry
  readonly artifacts: PacketArtifactEvidenceEntry
}

export interface PacketCandidate {
  readonly state: PilotCandidateState
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly github_pr_number: number | null
  readonly github_synced_at: string | null
  readonly missing_proof: readonly string[]
  readonly reason: string | null
}

export interface PacketIdentity {
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly github_pr_number: number | null
  readonly root_task_id: number
  readonly artifact_owner_task_id: number
  readonly lifecycle_descendant_ids: readonly number[]
}

export interface PacketLifecycle {
  readonly root_task: PacketTaskSummary
  readonly descendants: readonly PacketTaskSummary[]
  readonly current_stage: string
  readonly latest_terminal_activity: PacketActivitySummary | null
  readonly latest_error: PacketErrorSummary | null
  readonly duplicate_active_stage_evidence: {
    readonly evidence_state: PacketEvidenceState
    readonly duplicate_active_stage: boolean | null
    readonly source_map: readonly JsonPointer[]
  }
  readonly cleaned_replay_evidence: {
    readonly evidence_state: PacketEvidenceState
    readonly cleanup_applied: boolean
    readonly source_map: readonly JsonPointer[]
  }
}

export interface PacketGates {
  readonly owner_gate: {
    readonly state: 'ready_for_owner' | 'not_available'
    readonly notification_id: number | null
    readonly source_map: readonly JsonPointer[]
  }
  readonly aegis_decision: {
    readonly reviewer: string | null
    readonly status: string | null
    readonly review_id: number | null
    readonly source_map: readonly JsonPointer[]
  }
  readonly governance_evidence: {
    readonly decision: string | null
    readonly event_id: number | null
    readonly source_map: readonly JsonPointer[]
  }
}

export interface PilotDeferralEntry {
  readonly state: 'deferred' | 'not_available'
  readonly owner_specs: readonly string[]
  readonly reason_code: string
  readonly reason: string
  readonly source_map: readonly JsonPointer[]
}

export type PacketDeferrals = Readonly<Record<PilotDeferralKey, PilotDeferralEntry>>

export interface PilotReviewPacket {
  readonly schema_version: typeof PILOT_REVIEW_PACKET_SCHEMA_VERSION
  readonly generated_at: string
  readonly packet_identity: PacketIdentity
  readonly candidate: PacketCandidate
  readonly lifecycle: PacketLifecycle
  readonly gates: PacketGates
  readonly evidence: PacketEvidence
  readonly deferrals: PacketDeferrals
  readonly warnings: readonly PacketWarning[]
  readonly source_map: Record<JsonPointer, readonly SourceMapReference[]>
}

export type PacketArtifactPublisher = (input: PublishArtifactInput) => PublishArtifactResult

export interface PublishPilotReviewPacketArtifactsInput {
  readonly packet: PilotReviewPacket
  readonly task_id: number
  readonly active_workspace_id: number
  readonly is_facility_caller: boolean
  readonly db?: Database.Database
  readonly producer_agent_id?: number
  readonly workflow_template_slug?: string
  readonly supersedes_json_artifact_id?: number
  readonly supersedes_markdown_artifact_id?: number
  readonly publish?: PacketArtifactPublisher
}

export interface PublishedPilotReviewPacketArtifacts {
  readonly json: PublishArtifactResult
  readonly markdown: PublishArtifactResult
  readonly json_content: string
  readonly markdown_content: string
}

interface CandidateProof {
  readonly repo: string | null
  readonly issueNumber: number | null
  readonly prNumber: number | null
  readonly syncedAt: string | null
  readonly missing: readonly string[]
  readonly state: PilotCandidateState
  readonly reason: string | null
}

function asIso(value: string | number | Date | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') {
    const ms = value > 9_999_999_999 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value
  }
  return null
}

function timeValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value > 9_999_999_999 ? value : value * 1000
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function latestByTime<T extends { readonly id: number; readonly created_at?: string | number | null }>(
  rows: readonly T[],
): T | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => {
    const byTime = timeValue(b.created_at ?? null) - timeValue(a.created_at ?? null)
    if (byTime !== 0) return byTime
    return b.id - a.id
  })[0] ?? null
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function sourceRef(
  table: string,
  rowId: number | string,
  field: string,
  observedAt: string,
): SourceMapReference {
  return {
    source_type: 'table',
    table,
    row_id: rowId,
    field,
    observed_at: observedAt,
  }
}

function smokeRef(row: PilotSmokeChecklistReference): SourceMapReference {
  const observed = asIso(row.observed_at)
  const repo = normalizeString(row.github_repo)
  const issueNumber = positiveInt(row.github_issue_number)
  const prNumber = positiveInt(row.github_pr_number)
  return {
    source_type: 'smoke_checklist',
    row_id: row.id,
    checklist_path: row.checklist_path,
    checklist_anchor: row.checklist_anchor,
    ...(repo !== null ? { github_repo: repo } : {}),
    ...(issueNumber !== null ? { github_issue_number: issueNumber } : {}),
    ...(prNumber !== null ? { github_pr_number: prNumber } : {}),
    ...(observed !== null ? { observed_at: observed } : {}),
  }
}

function addSource(
  sourceMap: Record<JsonPointer, SourceMapReference[]>,
  pointer: JsonPointer,
  refs: readonly SourceMapReference[],
): void {
  if (refs.length === 0) return
  const existing = sourceMap[pointer] ?? []
  sourceMap[pointer] = [...existing, ...refs]
}

function summarizeTask(task: PilotTaskRecord): PacketTaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    chain_stage: normalizeString(task.chain_stage),
    github_repo: normalizeString(task.github_repo),
    github_issue_number: positiveInt(task.github_issue_number),
    github_pr_number: positiveInt(task.github_pr_number),
  }
}

function selectArtifactOwner(root: PilotTaskRecord, descendants: readonly PilotTaskRecord[]): PilotTaskRecord {
  const prTask = descendants.find((task) => positiveInt(task.github_pr_number) !== null)
  return prTask ?? root
}

function selectCandidateProof(
  root: PilotTaskRecord,
  descendants: readonly PilotTaskRecord[],
  githubSyncs: readonly PilotGithubSyncRecord[],
  smokeRefs: readonly PilotSmokeChecklistReference[],
): CandidateProof {
  const repo = normalizeString(root.github_repo)
  const issueNumber = positiveInt(root.github_issue_number)
  const syncProof = asIso(root.github_synced_at)
    ?? asIso(latestByTime(githubSyncs)?.synced_at)
    ?? asIso(latestByTime(githubSyncs)?.last_sync_at)
  const matchesCandidate = (
    rowRepo: string | null | undefined,
    rowIssue: number | null | undefined,
  ): boolean => {
    return repo !== null
      && issueNumber !== null
      && normalizeString(rowRepo) === repo
      && positiveInt(rowIssue) === issueNumber
  }
  const descendantPr = descendants
    .filter((task) => matchesCandidate(task.github_repo, task.github_issue_number))
    .map((task) => positiveInt(task.github_pr_number))
    .find((value): value is number => value !== null) ?? null
  const syncPr = githubSyncs
    .filter((row) => matchesCandidate(row.github_repo, row.github_issue_number))
    .map((row) => positiveInt(row.github_pr_number))
    .find((value): value is number => value !== null) ?? null
  const smokePr = smokeRefs
    .filter((row) => matchesCandidate(row.github_repo, row.github_issue_number))
    .map((row) => positiveInt(row.github_pr_number))
    .find((value): value is number => value !== null) ?? null
  const rootPr = matchesCandidate(root.github_repo, root.github_issue_number)
    ? positiveInt(root.github_pr_number)
    : null
  const prNumber = rootPr ?? descendantPr ?? syncPr ?? smokePr

  const missing: string[] = []
  if (repo === null) missing.push('github_repo')
  if (issueNumber === null) missing.push('github_issue_number')
  if (syncProof === null) missing.push('github_synced_at')
  if (prNumber === null) missing.push('github_pr_number_or_checklist_pr')

  if (repo === null || issueNumber === null || syncProof === null) {
    return {
      repo,
      issueNumber,
      prNumber,
      syncedAt: syncProof,
      missing,
      state: 'local_only_excluded',
      reason: 'Stored GitHub linkage or sync proof is missing.',
    }
  }
  if (prNumber === null) {
    return {
      repo,
      issueNumber,
      prNumber,
      syncedAt: syncProof,
      missing,
      state: 'incomplete',
      reason: 'Stored PR evidence or checklist-backed PR proof is missing.',
    }
  }
  return {
    repo,
    issueNumber,
    prNumber,
    syncedAt: syncProof,
    missing,
    state: 'proven',
    reason: null,
  }
}

function isTerminalActivity(activity: PilotActivityRecord): boolean {
  const t = activity.type.toLowerCase()
  return t.includes('ready_for_owner')
    || t.includes('terminal')
    || t.includes('done')
    || t.includes('completed')
    || t.includes('github_pr_merged')
}

function isErrorActivity(activity: PilotActivityRecord): boolean {
  const haystack = `${activity.type} ${activity.description ?? ''} ${JSON.stringify(activity.data ?? {})}`.toLowerCase()
  return haystack.includes('error') || haystack.includes('failed') || haystack.includes('failure')
}

function summarizeActivity(activity: PilotActivityRecord): PacketActivitySummary {
  return {
    id: activity.id,
    type: activity.type,
    description: activity.description ?? null,
    created_at: asIso(activity.created_at),
  }
}

function summarizeError(activity: PilotActivityRecord): PacketErrorSummary {
  return {
    id: activity.id,
    type: activity.type,
    summary: activity.description ?? activity.type,
    created_at: asIso(activity.created_at),
  }
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function latestDuplicateStageActivity(
  activities: readonly PilotActivityRecord[],
): PilotActivityRecord | null {
  return latestByTime(activities.filter((activity) => activity.type.toLowerCase().includes('duplicate_active_stage')))
}

function artifactMime(row: PilotArtifactEvidenceRecord): string | null {
  return normalizeString(row.mime) ?? normalizeString(row.mime_type)
}

function isTextMime(mime: string | null): boolean {
  if (mime === null) return false
  const lower = mime.toLowerCase()
  return lower.startsWith('text/') || lower === 'application/json' || lower === 'application/x-yaml'
}

function normalizeArtifactEvidenceState(row: PilotArtifactEvidenceRecord): PacketEvidenceState {
  if (row.evidence_state_override !== undefined) return row.evidence_state_override
  if (row.malformed === true) return 'malformed'
  if (row.stale === true) return 'stale'
  if (row.redaction_status === 'superseded' || positiveInt(row.supersedes_artifact_id) !== null) {
    return 'superseded'
  }
  if (row.redaction_status === 'quarantined') return 'quarantined'
  if (row.security_scan_status === 'scanned_with_findings' && !isTextMime(artifactMime(row))) {
    return 'quarantined'
  }
  if ((row.byte_size ?? 0) > 64 * 1024) return 'oversized'
  if (row.redaction_status === 'redacted') return 'redacted'
  return 'available'
}

function warningForArtifact(item: PacketArtifactEvidence): PacketWarning | null {
  switch (item.evidence_state) {
    case 'superseded':
      return {
        code: 'artifact_superseded',
        severity: 'warning',
        reason: `Artifact ${String(item.artifact_id)} is superseded and is retained only as trace evidence.`,
        source_map: item.source_map,
      }
    case 'malformed':
      return {
        code: 'artifact_malformed',
        severity: 'warning',
        reason: `Artifact ${String(item.artifact_id)} is malformed for packet evidence.`,
        source_map: item.source_map,
      }
    case 'stale':
      return {
        code: 'artifact_stale',
        severity: 'warning',
        reason: `Artifact ${String(item.artifact_id)} is structurally stale because newer stored evidence supersedes it.`,
        source_map: item.source_map,
      }
    case 'oversized':
      return {
        code: 'artifact_oversized',
        severity: 'warning',
        reason: `Artifact ${String(item.artifact_id)} is oversized and rendered from metadata only.`,
        source_map: item.source_map,
      }
    case 'quarantined':
      return {
        code: 'artifact_quarantined_metadata_only',
        severity: 'warning',
        reason: `Artifact ${String(item.artifact_id)} is quarantined or unsafe and rendered from metadata only.`,
        source_map: item.source_map,
      }
    default:
      return null
  }
}

function buildArtifactEvidenceItems(
  artifacts: readonly PilotArtifactEvidenceRecord[],
  generatedAt: string,
  sourceMap: Record<JsonPointer, SourceMapReference[]>,
): { readonly items: PacketArtifactEvidence[]; readonly warnings: PacketWarning[] } {
  const items = artifacts.map((row) => {
    const pointer = `/evidence/artifacts/items/${String(row.id)}` as JsonPointer
    addSource(sourceMap, pointer, [
      sourceRef('task_artifacts', row.id, 'artifact_type', generatedAt),
    ])
    const state = normalizeArtifactEvidenceState(row)
    const safePreview = state === 'quarantined' ? null : row.preview_text ?? null
    const storageUri = state === 'quarantined' ? null : row.storage_uri ?? null
    return {
      artifact_id: row.id,
      artifact_type: row.artifact_type,
      evidence_state: state,
      redaction_status: row.redaction_status,
      security_scan_status: row.security_scan_status,
      sha256: row.sha256 ?? null,
      byte_size: row.byte_size ?? null,
      mime: artifactMime(row),
      schema_version: row.schema_version ?? null,
      preview_text: safePreview,
      storage_uri: storageUri,
      supersedes_artifact_id: positiveInt(row.supersedes_artifact_id),
      source_map: [pointer],
    } satisfies PacketArtifactEvidence
  })
  const warnings = items
    .map(warningForArtifact)
    .filter((warning): warning is PacketWarning => warning !== null)
  return { items, warnings }
}

function aggregateArtifactState(items: readonly PacketArtifactEvidence[]): PacketEvidenceState {
  if (items.length === 0) return 'missing'
  const order: PacketEvidenceState[] = [
    'quarantined',
    'malformed',
    'stale',
    'oversized',
    'superseded',
    'redacted',
    'available',
    'missing',
  ]
  for (const state of order) {
    if (items.some((item) => item.evidence_state === state)) return state
  }
  return 'available'
}

function buildDeferrals(): PacketDeferrals {
  return {
    run_state: deferral('run_state', 'Durable run-state is outside SPEC-009D.'),
    github_sync_automation: deferral('github_sync_automation', 'Automatic GitHub sync orchestration is outside SPEC-009D.'),
    claim_authority: deferral('claim_authority', 'Durable claim authority is outside SPEC-009D.'),
    retry_controls: deferral('retry_controls', 'Retry controls are outside SPEC-009D.'),
    sandbox_lifecycle: deferral('sandbox_lifecycle', 'Sandbox lifecycle control is outside SPEC-009D.'),
    adapter_registry: deferral('adapter_registry', 'Adapter registry capability is outside SPEC-009D.'),
    real_harness_execution: deferral('real_harness_execution', 'Real harness execution belongs to future SPEC-014 work.'),
  }
}

function deferral(key: PilotDeferralKey, reason: string): PilotDeferralEntry {
  return {
    state: 'deferred',
    owner_specs: DEFERRAL_OWNER_SPECS[key],
    reason_code: 'future_spec_owns_capability',
    reason,
    source_map: [],
  }
}

export function buildPilotReviewPacket(input: BuildPilotReviewPacketInput): PilotReviewPacket {
  const generatedAt = asIso(input.generated_at) ?? new Date().toISOString()
  const descendants = input.descendant_tasks ?? []
  const activities = input.activities ?? []
  const notifications = input.notifications ?? []
  const artifacts = input.artifacts ?? []
  const reviews = input.quality_reviews ?? []
  const governanceEvents = input.resource_policy_events ?? []
  const githubSyncs = input.github_syncs ?? []
  const smokeRefs = input.smoke_checklist_references ?? []
  const sourceMap: Record<JsonPointer, SourceMapReference[]> = {}
  const warnings: PacketWarning[] = []

  const ownerTask = selectArtifactOwner(input.root_task, descendants)
  const proof = selectCandidateProof(input.root_task, descendants, githubSyncs, smokeRefs)

  addSource(sourceMap, '/packet_identity/github_issue', [
    sourceRef('tasks', input.root_task.id, 'github_issue_number', generatedAt),
  ])
  addSource(sourceMap, '/packet_identity/github_pr', [
    sourceRef('tasks', ownerTask.id, 'github_pr_number', generatedAt),
    ...smokeRefs.map(smokeRef),
  ])
  addSource(sourceMap, '/candidate/state', [
    sourceRef('tasks', input.root_task.id, 'github_repo', generatedAt),
    ...githubSyncs.map((row) => sourceRef('github_syncs', row.id, 'synced_at', generatedAt)),
    ...smokeRefs.map(smokeRef),
  ])
  addSource(sourceMap, '/lifecycle/root_task', [
    sourceRef('tasks', input.root_task.id, 'id', generatedAt),
  ])
  addSource(sourceMap, '/lifecycle/descendants', descendants.map((task) => (
    sourceRef('tasks', task.id, 'parent_task_id', generatedAt)
  )))
  addSource(sourceMap, '/lifecycle/current_stage', [
    sourceRef('tasks', ownerTask.id, 'status', generatedAt),
  ])

  const terminalActivity = latestByTime(activities.filter(isTerminalActivity))
  if (terminalActivity !== null) {
    addSource(sourceMap, '/lifecycle/latest_terminal_activity', [
      sourceRef('activities', terminalActivity.id, 'type', generatedAt),
    ])
  }
  const latestError = latestByTime(activities.filter(isErrorActivity))
  if (latestError !== null) {
    addSource(sourceMap, '/lifecycle/latest_error', [
      sourceRef('activities', latestError.id, 'type', generatedAt),
    ])
  }

  const duplicateActivity = latestDuplicateStageActivity(activities)
  let duplicateActiveStage: boolean | null = null
  if (duplicateActivity !== null) {
    const payload = dataRecord(duplicateActivity.data)
    const value = payload?.['duplicate_active_stage']
    duplicateActiveStage = typeof value === 'boolean' ? value : null
    addSource(sourceMap, '/lifecycle/duplicate_active_stage_evidence', [
      sourceRef('activities', duplicateActivity.id, 'data', generatedAt),
    ])
  }

  const cleanedReplay = smokeRefs.find((row) => row.cleanup_applied === true) ?? null
  if (cleanedReplay !== null) {
    addSource(sourceMap, '/lifecycle/cleaned_replay_evidence', [smokeRef(cleanedReplay)])
  }

  const ownerNotification = latestByTime(notifications.filter((row) => row.type === 'task_ready_for_owner'))
  if (ownerNotification !== null) {
    addSource(sourceMap, '/gates/owner_gate', [
      sourceRef('notifications', ownerNotification.id, 'type', generatedAt),
    ])
  } else {
    warnings.push({
      code: 'missing_owner_gate',
      severity: 'warning',
      reason: 'No ready-for-owner notification evidence is stored for this candidate.',
      source_map: [],
    })
  }

  const aegisReview = latestByTime(reviews.filter((row) => row.reviewer.toLowerCase() === 'aegis'))
  if (aegisReview !== null) {
    addSource(sourceMap, '/gates/aegis_decision', [
      sourceRef('quality_reviews', aegisReview.id, 'status', generatedAt),
    ])
  } else {
    warnings.push({
      code: 'missing_aegis_decision',
      severity: 'warning',
      reason: 'No canonical Aegis quality review row is stored for this candidate.',
      source_map: [],
    })
  }

  const governanceEvent = latestByTime(governanceEvents)
  if (governanceEvent !== null) {
    addSource(sourceMap, '/gates/governance_evidence', [
      sourceRef('resource_policy_events', governanceEvent.id, 'decision', generatedAt),
    ])
  } else {
    warnings.push({
      code: 'missing_governance_evidence',
      severity: 'warning',
      reason: 'No resource policy event is stored for this candidate.',
      source_map: [],
    })
  }

  const latestSync = latestByTime(githubSyncs)
  if (latestSync !== null) {
    addSource(sourceMap, '/evidence/github_sync', [
      sourceRef('github_syncs', latestSync.id, 'synced_at', generatedAt),
    ])
  }

  if (smokeRefs.length > 0) {
    addSource(sourceMap, '/evidence/smoke_checklist', smokeRefs.map(smokeRef))
  }

  const artifactEvidence = buildArtifactEvidenceItems(artifacts, generatedAt, sourceMap)
  warnings.push(...artifactEvidence.warnings)
  if (artifactEvidence.items.length === 0) {
    warnings.push({
      code: 'missing_artifacts',
      severity: 'warning',
      reason: 'No task artifact rows are stored for this candidate.',
      source_map: [],
    })
  }

  return {
    schema_version: PILOT_REVIEW_PACKET_SCHEMA_VERSION,
    generated_at: generatedAt,
    packet_identity: {
      github_repo: proof.repo,
      github_issue_number: proof.issueNumber,
      github_pr_number: proof.prNumber,
      root_task_id: input.root_task.id,
      artifact_owner_task_id: ownerTask.id,
      lifecycle_descendant_ids: descendants.map((task) => task.id),
    },
    candidate: {
      state: proof.state,
      github_repo: proof.repo,
      github_issue_number: proof.issueNumber,
      github_pr_number: proof.prNumber,
      github_synced_at: proof.syncedAt,
      missing_proof: proof.missing,
      reason: proof.reason,
    },
    lifecycle: {
      root_task: summarizeTask(input.root_task),
      descendants: descendants.map(summarizeTask),
      current_stage: normalizeString(ownerTask.chain_stage) ?? ownerTask.status,
      latest_terminal_activity: terminalActivity === null ? null : summarizeActivity(terminalActivity),
      latest_error: latestError === null ? null : summarizeError(latestError),
      duplicate_active_stage_evidence: {
        evidence_state: duplicateActivity === null ? 'missing' : 'available',
        duplicate_active_stage: duplicateActiveStage,
        source_map: duplicateActivity === null ? [] : ['/lifecycle/duplicate_active_stage_evidence'],
      },
      cleaned_replay_evidence: {
        evidence_state: cleanedReplay === null ? 'missing' : 'available',
        cleanup_applied: cleanedReplay?.cleanup_applied === true,
        source_map: cleanedReplay === null ? [] : ['/lifecycle/cleaned_replay_evidence'],
      },
    },
    gates: {
      owner_gate: {
        state: ownerNotification === null ? 'not_available' : 'ready_for_owner',
        notification_id: ownerNotification?.id ?? null,
        source_map: ownerNotification === null ? [] : ['/gates/owner_gate'],
      },
      aegis_decision: {
        reviewer: aegisReview?.reviewer ?? null,
        status: aegisReview?.status ?? null,
        review_id: aegisReview?.id ?? null,
        source_map: aegisReview === null ? [] : ['/gates/aegis_decision'],
      },
      governance_evidence: {
        decision: governanceEvent?.decision ?? null,
        event_id: governanceEvent?.id ?? null,
        source_map: governanceEvent === null ? [] : ['/gates/governance_evidence'],
      },
    },
    evidence: {
      github_sync: {
        kind: 'github_sync',
        evidence_state: latestSync === null ? 'missing' : 'available',
        summary: latestSync === null ? 'No stored GitHub sync row is available.' : `Stored GitHub sync ${String(latestSync.id)} is available.`,
        warning_code: latestSync === null ? 'missing_github_sync' : null,
        source_map: latestSync === null ? [] : ['/evidence/github_sync'],
      },
      smoke_checklist: {
        kind: 'smoke_checklist',
        evidence_state: smokeRefs.length === 0 ? 'missing' : 'available',
        summary: smokeRefs.length === 0 ? 'No smoke checklist reference is available.' : smokeRefs.map((row) => row.summary).join(' '),
        warning_code: smokeRefs.length === 0 ? 'missing_smoke_checklist' : null,
        source_map: smokeRefs.length === 0 ? [] : ['/evidence/smoke_checklist'],
      },
      latest_error: {
        kind: 'latest_error',
        evidence_state: latestError === null ? 'missing' : 'available',
        summary: latestError?.description ?? 'No stored latest error is available.',
        warning_code: latestError === null ? 'missing_latest_error' : null,
        source_map: latestError === null ? [] : ['/lifecycle/latest_error'],
      },
      artifacts: {
        kind: 'task_artifacts',
        evidence_state: aggregateArtifactState(artifactEvidence.items),
        summary: artifactEvidence.items.length === 0
          ? 'No task artifacts are available.'
          : `${String(artifactEvidence.items.length)} task artifact row(s) are represented.`,
        warning_code: artifactEvidence.items.length === 0 ? 'missing_artifacts' : null,
        source_map: artifactEvidence.items.flatMap((item) => item.source_map),
        items: artifactEvidence.items,
      },
    },
    deferrals: buildDeferrals(),
    warnings,
    source_map: sourceMap,
  }
}

function escapeMarkdownCodeText(value: string): string {
  return value
    .replace(/javascript:/gi, 'javascript&#58;')
    .replace(/`/g, '&#96;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;')
}

function escapeMarkdownLinkText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[`*_{}\[\]()#+\-.!|]/g, '\\$&')
}

function mdValue(value: string | number | boolean | null): string {
  if (value === null) return '`not_available`'
  return `\`${escapeMarkdownCodeText(String(value))}\``
}

function githubIssueMarkdown(repo: string | null, issueNumber: number | null): string {
  if (repo === null || issueNumber === null) return '`not_available`'
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return mdValue(`${repo}#${String(issueNumber)}`)
  }
  return `[${escapeMarkdownLinkText(repo)}#${String(issueNumber)}](https://github.com/${repo}/issues/${String(issueNumber)})`
}

function githubPrMarkdown(repo: string | null, prNumber: number | null): string {
  if (repo === null || prNumber === null) return '`not_available`'
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return mdValue(`${repo}#${String(prNumber)}`)
  }
  return `[PR #${String(prNumber)}](https://github.com/${repo}/pull/${String(prNumber)})`
}

function sourcePointerSummary(packet: PilotReviewPacket): string {
  return Object.keys(packet.source_map)
    .sort()
    .map((pointer) => `- ${mdValue(pointer)}`)
    .join('\n')
}

function artifactSummary(packet: PilotReviewPacket): string {
  if (packet.evidence.artifacts.items.length === 0) return '- `not_available`'
  return packet.evidence.artifacts.items.map((item) => {
    const preview = item.preview_text === null ? '' : ` preview=${mdValue(item.preview_text)}`
    return `- artifact ${mdValue(item.artifact_id)} type=${mdValue(item.artifact_type)} state=${mdValue(item.evidence_state)} sha256=${mdValue(item.sha256)}${preview}`
  }).join('\n')
}

export function renderPilotReviewPacketMarkdown(
  packet: PilotReviewPacket,
  options: { readonly json_artifact?: { readonly id: number; readonly sha256: string } } = {},
): string {
  const jsonArtifact = options.json_artifact
  const jsonLine = jsonArtifact === undefined
    ? 'JSON artifact not yet published.'
    : `JSON artifact #${String(jsonArtifact.id)} hash ${jsonArtifact.sha256}`
  const warnings = packet.warnings.length === 0
    ? '- `none`'
    : packet.warnings.map((warning) => `- ${mdValue(warning.code)}: ${mdValue(warning.reason)}`).join('\n')
  const deferrals = Object.entries(packet.deferrals)
    .map(([key, entry]) => `- ${mdValue(key)} -> ${entry.owner_specs.map(mdValue).join(', ')} (${mdValue(entry.reason_code)})`)
    .join('\n')

  return [
    '# Pilot Review Packet',
    '',
    '## Packet identity',
    `- Root task: ${mdValue(packet.packet_identity.root_task_id)}`,
    `- Artifact owner task: ${mdValue(packet.packet_identity.artifact_owner_task_id)}`,
    `- GitHub issue: ${githubIssueMarkdown(packet.packet_identity.github_repo, packet.packet_identity.github_issue_number)}`,
    `- GitHub PR evidence: ${githubPrMarkdown(packet.packet_identity.github_repo, packet.packet_identity.github_pr_number)}`,
    `- ${jsonLine}`,
    '',
    '## Candidate eligibility',
    `- State: ${mdValue(packet.candidate.state)}`,
    `- Missing proof: ${packet.candidate.missing_proof.length === 0 ? '`none`' : packet.candidate.missing_proof.map(mdValue).join(', ')}`,
    '',
    '## Current lifecycle stage',
    `- Current lifecycle stage: ${mdValue(packet.lifecycle.current_stage)}`,
    `- Root title: ${mdValue(packet.lifecycle.root_task.title)}`,
    `- Descendants: ${packet.lifecycle.descendants.map((task) => mdValue(task.id)).join(', ') || '`none`'}`,
    `- Latest terminal activity: ${mdValue(packet.lifecycle.latest_terminal_activity?.type ?? null)}`,
    `- Latest error: ${mdValue(packet.lifecycle.latest_error?.summary ?? null)}`,
    '',
    '## Owner gate',
    `- State: ${mdValue(packet.gates.owner_gate.state)}`,
    `- Notification: ${mdValue(packet.gates.owner_gate.notification_id)}`,
    '',
    '## Aegis decision',
    `- Reviewer: ${mdValue(packet.gates.aegis_decision.reviewer)}`,
    `- Status: ${mdValue(packet.gates.aegis_decision.status)}`,
    '',
    '## Artifacts',
    artifactSummary(packet),
    '',
    '## Governance evidence',
    `- Decision: ${mdValue(packet.gates.governance_evidence.decision)}`,
    `- Event: ${mdValue(packet.gates.governance_evidence.event_id)}`,
    '',
    '## Deferred fields',
    deferrals,
    '',
    '## Warnings',
    warnings,
    '',
    '## Source map',
    sourcePointerSummary(packet),
    '',
  ].join('\n')
}

function validatePacketForPublication(packet: PilotReviewPacket): void {
  const runtimeSchemaVersion = (packet as { readonly schema_version: string }).schema_version
  if (runtimeSchemaVersion !== PILOT_REVIEW_PACKET_SCHEMA_VERSION) {
    throw new Error('invalid_packet_schema_version')
  }
  if (packet.candidate.state === 'proven' && packet.candidate.missing_proof.length > 0) {
    throw new Error('proven_candidate_missing_required_proof')
  }
  for (const pointer of Object.keys(packet.source_map)) {
    if (!pointer.startsWith('/')) {
      throw new Error(`invalid_source_map_pointer:${pointer}`)
    }
  }
}

function commonPublishFields(
  input: PublishPilotReviewPacketArtifactsInput,
): Pick<PublishArtifactInput, 'task_id' | 'active_workspace_id' | 'is_facility_caller'>
  & Partial<Pick<PublishArtifactInput, 'db' | 'producer_agent_id' | 'workflow_template_slug'>> {
  return {
    task_id: input.task_id,
    active_workspace_id: input.active_workspace_id,
    is_facility_caller: input.is_facility_caller,
    ...(input.db !== undefined ? { db: input.db } : {}),
    ...(input.producer_agent_id !== undefined ? { producer_agent_id: input.producer_agent_id } : {}),
    ...(input.workflow_template_slug !== undefined ? { workflow_template_slug: input.workflow_template_slug } : {}),
  }
}

export function publishPilotReviewPacketArtifacts(
  input: PublishPilotReviewPacketArtifactsInput,
): PublishedPilotReviewPacketArtifacts {
  validatePacketForPublication(input.packet)
  const publisher = input.publish ?? publishArtifact
  const common = commonPublishFields(input)
  const jsonContent = JSON.stringify(input.packet, null, 2)
  const json = publisher({
    ...common,
    artifact_type: PILOT_REVIEW_PACKET_JSON_ARTIFACT_TYPE,
    storage_kind: 'inline_json',
    content: jsonContent,
    mime: 'application/json',
    schema_version: PILOT_REVIEW_PACKET_SCHEMA_VERSION,
    ...(input.supersedes_json_artifact_id !== undefined ? { supersedes: input.supersedes_json_artifact_id } : {}),
  })
  const markdownContent = renderPilotReviewPacketMarkdown(input.packet, {
    json_artifact: { id: json.id, sha256: json.sha256 },
  })
  const markdown = publisher({
    ...common,
    artifact_type: PILOT_REVIEW_PACKET_MARKDOWN_ARTIFACT_TYPE,
    storage_kind: 'inline_markdown',
    content: markdownContent,
    mime: 'text/markdown',
    schema_version: PILOT_REVIEW_PACKET_SCHEMA_VERSION,
    ...(input.supersedes_markdown_artifact_id !== undefined ? { supersedes: input.supersedes_markdown_artifact_id } : {}),
  })
  return {
    json,
    markdown,
    json_content: jsonContent,
    markdown_content: markdownContent,
  }
}
