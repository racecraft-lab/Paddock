import type Database from 'better-sqlite3'

export const TASK_EVIDENCE_SCHEMA_VERSION = 'task_evidence.v1'

export const ALLOWED_EVIDENCE_STATES = [
  'eligible',
  'not_eligible',
  'incomplete',
  'available',
  'missing',
  'stale',
  'redacted',
  'quarantined',
  'superseded',
  'unavailable',
  'deferred',
] as const

export type EvidenceState = typeof ALLOWED_EVIDENCE_STATES[number]

export const SECTION_STATE_MATRIX = {
  task: ['available', 'missing', 'unavailable'],
  pilot_eligibility: ['eligible', 'not_eligible', 'incomplete', 'missing', 'unavailable'],
  identity: ['available', 'missing', 'stale', 'incomplete', 'unavailable'],
  packet_artifacts: ['available', 'missing', 'stale', 'redacted', 'quarantined', 'superseded', 'unavailable'],
  smoke: ['available', 'missing', 'incomplete', 'unavailable'],
  current_stage: ['available', 'missing', 'stale', 'unavailable'],
  warnings: ['available', 'missing'],
  deferrals: ['deferred'],
  source_map: ['available', 'missing', 'stale', 'unavailable', 'deferred'],
} as const satisfies Record<string, readonly EvidenceState[]>

export type EvidenceSection = keyof typeof SECTION_STATE_MATRIX

export type EvidenceWarningReason =
  | 'artifact_storage_disabled'
  | 'artifact_storage_unavailable'
  | 'missing_proof'
  | 'source_disagreement'
  | 'stale'
  | 'superseded'
  | 'malformed'
  | 'oversized'
  | 'unsafe'
  | 'secret_bearing'
  | 'cleaned_uat_rows'

export type EvidenceWarningCode =
  | 'section_unavailable'
  | 'evidence_incomplete'
  | 'source_conflict'
  | 'stale_evidence'
  | 'unsafe_evidence'
  | 'cleanup_rationale'

export interface EvidenceWarning {
  code: EvidenceWarningCode
  section: EvidenceSection
  reason: EvidenceWarningReason
  message: string
}

export interface GitHubReference {
  number: number
  url?: string
  label?: string
}

export interface TaskEvidenceTask {
  id: string
  title?: string
  status?: string
  state: EvidenceState
  workspace_id?: string
  github_repo?: string
  github_issue_number?: number
  github_pr_number?: number
}

export interface PilotEligibilityEvidence {
  state: EvidenceState
  reasons: string[]
  inputs?: string[]
}

export interface IdentityEvidence {
  state: EvidenceState
  repository?: string
  issue?: GitHubReference
  pull_request?: GitHubReference
  missing: string[]
}

export type ArtifactReferenceKind = 'packet_json' | 'packet_markdown' | 'source_map' | 'smoke_reference' | 'other'

export interface ArtifactReference {
  state: EvidenceState
  artifact_id?: string
  kind: ArtifactReferenceKind
  display_name: string
  sha256?: string
  mime_type?: string
  size_bytes?: number
  created_at?: string
  warning_codes: EvidenceWarningReason[]
}

export interface PacketArtifactsEvidence {
  state: EvidenceState
  unavailable_reason?: 'artifact_storage_disabled' | 'artifact_storage_unavailable'
  references: ArtifactReference[]
  missing: string[]
}

export interface SmokeEvidence {
  state: EvidenceState
  references: string[]
  missing: string[]
}

export interface CurrentStageEvidence {
  state: EvidenceState
  current_status?: string
  activity_reference?: string
  snapshot_status?: string
  warnings: string[]
}

export type DeferralCategory =
  | 'run_state'
  | 'sync_automation'
  | 'claim_authority'
  | 'retry_debug_controls'
  | 'sandbox_lifecycle'
  | 'adapter_registry'
  | 'real_harness_execution'

export interface DeferralEvidence {
  category: DeferralCategory
  state: 'deferred'
  owner_spec: 'SPEC-013A' | 'SPEC-013A1' | 'SPEC-013B' | 'SPEC-013C' | 'SPEC-014A-D'
  label: string
}

export type SourceMapType =
  | 'task'
  | 'activity'
  | 'artifact'
  | 'packet'
  | 'quality_review'
  | 'governance'
  | 'github_sync'
  | 'retained_github_issue'
  | 'retained_github_pr'
  | 'static_uat_link'
  | 'cleanup_note'

export interface SourceMapEntry {
  section: EvidenceSection
  source_type: SourceMapType
  source_id?: string
  state: EvidenceState
  note?: string
}

export interface TaskEvidenceResponse {
  schema_version: typeof TASK_EVIDENCE_SCHEMA_VERSION
  task: TaskEvidenceTask
  pilot_eligibility: PilotEligibilityEvidence
  identity: IdentityEvidence
  packet_artifacts: PacketArtifactsEvidence
  smoke: SmokeEvidence
  current_stage: CurrentStageEvidence
  warnings: EvidenceWarning[]
  deferrals: DeferralEvidence[]
  source_map: SourceMapEntry[]
}

export interface BuildTaskEvidenceOptions {
  taskId: number
  scopeSql: string
  scopeParams: unknown[]
  artifactStorageEnabled: boolean
}

interface TaskRow {
  id: number
  workspace_id: number
  title: string | null
  status: string | null
  github_repo: string | null
  github_issue_number: number | null
  github_pr_number: number | null
  github_synced_at: number | string | null
  chain_stage: number | string | null
  created_at: number | string | null
  updated_at: number | string | null
}

interface ArtifactRow {
  id: number
  artifact_type: string | null
  schema_version: string | null
  storage_kind: string | null
  original_filename: string | null
  mime_type: string | null
  byte_size: number | null
  sha256: string | null
  preview_text: string | null
  redaction_status: string | null
  security_scan_status: string | null
  supersedes_artifact_id: number | null
  created_at: number | string | null
}

interface ActivityRow {
  id: number
  type: string | null
  description: string | null
  data: string | null
  created_at: number | string | null
}

interface IdRow {
  id: number
}

interface GitHubSyncRow {
  id: number
  status: string | null
  last_synced_at: number | string | null
}

export const TASK_EVIDENCE_DEFERRALS: readonly DeferralEvidence[] = [
  { category: 'run_state', state: 'deferred', owner_spec: 'SPEC-013A', label: 'Run state' },
  { category: 'sync_automation', state: 'deferred', owner_spec: 'SPEC-013A1', label: 'GitHub sync automation' },
  { category: 'claim_authority', state: 'deferred', owner_spec: 'SPEC-013B', label: 'Claim authority' },
  { category: 'retry_debug_controls', state: 'deferred', owner_spec: 'SPEC-013C', label: 'Retry/debug controls' },
  { category: 'sandbox_lifecycle', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Sandbox lifecycle' },
  { category: 'adapter_registry', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Adapter registry' },
  { category: 'real_harness_execution', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Real harness execution' },
]

const OVERSIZED_ARTIFACT_BYTES = 64 * 1024
const RETAINED_PILOT_REPO = 'racecraft-lab/mission-control'
const RETAINED_PILOT_ISSUE = 50
const RETAINED_PILOT_PR = 51
const STATIC_UAT_REFERENCE = 'docs/qa/pilot-smoke-checklist.md#spec-009e'

const UNSAFE_SCHEME_PATTERN = /\b(?:javascript|data|vbscript|file):[^\s)]+/gi

export function toInertEvidenceText(input: string): string {
  return input
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 $2')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeEvidenceDisplayText(input: string): string {
  return toInertEvidenceText(input)
    .replace(UNSAFE_SCHEME_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isAllowedEvidenceState(state: unknown): state is EvidenceState {
  return typeof state === 'string' && ALLOWED_EVIDENCE_STATES.includes(state as EvidenceState)
}

export function buildTaskEvidence(
  db: Database.Database,
  options: BuildTaskEvidenceOptions,
): TaskEvidenceResponse | null {
  const task = db.prepare(`
    SELECT
      t.id,
      t.workspace_id,
      t.title,
      t.status,
      t.github_repo,
      t.github_issue_number,
      t.github_pr_number,
      t.github_synced_at,
      t.chain_stage,
      t.created_at,
      t.updated_at
    FROM tasks t
    WHERE t.id = ? AND ${options.scopeSql}
    LIMIT 1
  `).get(options.taskId, ...options.scopeParams) as TaskRow | undefined

  if (!task) return null

  const warnings: EvidenceWarning[] = []
  const sourceMap: SourceMapEntry[] = [
    source('task', 'task', String(task.id), 'available', 'authorized task row'),
  ]

  const taskEvidence: TaskEvidenceTask = {
    id: String(task.id),
    state: 'available',
    workspace_id: String(task.workspace_id),
  }
  if (task.title) taskEvidence.title = sanitizeEvidenceDisplayText(task.title)
  if (task.status) taskEvidence.status = task.status
  const taskRepository = safeRepository(task.github_repo)
  const taskIssue = positiveInteger(task.github_issue_number)
  const taskPullRequest = positiveInteger(task.github_pr_number)
  if (taskRepository) taskEvidence.github_repo = taskRepository
  if (taskIssue) taskEvidence.github_issue_number = taskIssue
  if (taskPullRequest) taskEvidence.github_pr_number = taskPullRequest

  const identity = buildIdentityEvidence(task, sourceMap)
  const artifacts = buildPacketArtifactEvidence(db, task, options.artifactStorageEnabled, warnings, sourceMap)
  const latestActivity = readLatestActivity(db, task)
  const smoke = buildSmokeEvidence(task, artifacts, latestActivity, sourceMap)
  const currentStage = buildCurrentStageEvidence(task, latestActivity, sourceMap)
  addSupportingSourceRows(db, task, sourceMap)

  const pilotEligibility = buildPilotEligibilityEvidence(task, identity, artifacts, smoke)
  if (pilotEligibility.state === 'incomplete' && pilotEligibility.reasons.length > 0) {
    warnings.push({
      code: 'evidence_incomplete',
      section: 'pilot_eligibility',
      reason: 'missing_proof',
      message: `Missing proof: ${pilotEligibility.reasons.join(', ')}`,
    })
  }

  for (const deferral of TASK_EVIDENCE_DEFERRALS) {
    sourceMap.push(source('deferrals', 'cleanup_note', deferral.category, 'deferred', `${deferral.label} owned by ${deferral.owner_spec}`))
  }

  return {
    schema_version: TASK_EVIDENCE_SCHEMA_VERSION,
    task: taskEvidence,
    pilot_eligibility: pilotEligibility,
    identity,
    packet_artifacts: artifacts,
    smoke,
    current_stage: currentStage,
    warnings: dedupeWarnings(warnings),
    deferrals: TASK_EVIDENCE_DEFERRALS.map((entry) => ({ ...entry })),
    source_map: sourceMap,
  }
}

function buildIdentityEvidence(task: TaskRow, sourceMap: SourceMapEntry[]): IdentityEvidence {
  const repository = safeRepository(task.github_repo)
  const issueNumber = positiveInteger(task.github_issue_number)
  const prNumber = positiveInteger(task.github_pr_number)
  const missing: string[] = []

  if (!repository) missing.push('missing_github_repo')
  if (!issueNumber) missing.push('missing_github_issue_number')
  if (!prNumber && (repository || issueNumber || task.github_synced_at != null)) missing.push('missing_github_pr_number')

  const issue = repository && issueNumber ? githubIssueReference(repository, issueNumber) : undefined
  const pullRequest = repository && prNumber ? githubPullRequestReference(repository, prNumber) : undefined

  if (issue) {
    sourceMap.push(source('identity', 'retained_github_issue', issue.label ?? 'stored issue', 'available', 'stored GitHub issue identity'))
  }
  if (pullRequest) {
    sourceMap.push(source('identity', 'retained_github_pr', pullRequest.label ?? 'stored pull request', 'available', 'stored GitHub pull request identity'))
  }

  if (!repository && !issueNumber && !prNumber) {
    return { state: 'missing', missing }
  }

  if (missing.length > 0) {
    const evidence: IdentityEvidence = {
      state: 'incomplete',
      missing,
    }
    if (repository) evidence.repository = repository
    if (issue) evidence.issue = issue
    if (pullRequest) evidence.pull_request = pullRequest
    return evidence
  }

  const evidence: IdentityEvidence = {
    state: 'available',
    missing,
  }
  if (repository) evidence.repository = repository
  if (issue) evidence.issue = issue
  if (pullRequest) evidence.pull_request = pullRequest
  return evidence
}

function buildPacketArtifactEvidence(
  db: Database.Database,
  task: TaskRow,
  artifactStorageEnabled: boolean,
  warnings: EvidenceWarning[],
  sourceMap: SourceMapEntry[],
): PacketArtifactsEvidence {
  if (!artifactStorageEnabled) {
    warnings.push(sectionUnavailableWarning('artifact_storage_disabled'))
    sourceMap.push(source('packet_artifacts', 'artifact', undefined, 'unavailable', 'artifact storage disabled'))
    return {
      state: 'unavailable',
      unavailable_reason: 'artifact_storage_disabled',
      references: [],
      missing: [],
    }
  }

  if (!tableExists(db, 'task_artifacts')) {
    warnings.push(sectionUnavailableWarning('artifact_storage_unavailable'))
    sourceMap.push(source('packet_artifacts', 'artifact', undefined, 'unavailable', 'artifact storage unavailable'))
    return {
      state: 'unavailable',
      unavailable_reason: 'artifact_storage_unavailable',
      references: [],
      missing: [],
    }
  }

  const rows = db.prepare(`
    SELECT
      id,
      artifact_type,
      schema_version,
      storage_kind,
      original_filename,
      mime_type,
      byte_size,
      sha256,
      preview_text,
      redaction_status,
      security_scan_status,
      supersedes_artifact_id,
      created_at
    FROM task_artifacts
    WHERE task_id = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(task.id, task.workspace_id) as ArtifactRow[]

  if (rows.length === 0) {
    sourceMap.push(source('packet_artifacts', 'artifact', undefined, 'missing', 'no task artifacts found'))
    return {
      state: 'missing',
      references: [],
      missing: ['missing_packet_artifacts'],
    }
  }

  const references = rows.map((row) => {
    const reference = artifactReference(row)
    for (const warningCode of reference.warning_codes) {
      warnings.push(artifactWarning(warningCode, row.id))
    }
    sourceMap.push(source('packet_artifacts', 'artifact', String(row.id), reference.state, reference.display_name))
    return reference
  })

  return {
    state: aggregateArtifactState(references),
    references,
    missing: references.some((ref) => ref.kind === 'packet_json' || ref.kind === 'packet_markdown')
      ? []
      : ['missing_packet_artifacts'],
  }
}

function buildSmokeEvidence(
  task: TaskRow,
  artifacts: PacketArtifactsEvidence,
  latestActivity: ActivityRow | null,
  sourceMap: SourceMapEntry[],
): SmokeEvidence {
  const references: string[] = []
  const smokeFromActivity = latestActivity
    ? /smoke|checklist/i.test(`${latestActivity.description ?? ''} ${latestActivity.data ?? ''}`)
    : false
  const smokeFromArtifacts = artifacts.references.some((ref) => /smoke|checklist/i.test(ref.display_name))
  const retainedPilotTrail = task.github_repo === RETAINED_PILOT_REPO
    && task.github_issue_number === RETAINED_PILOT_ISSUE
    && task.github_pr_number === RETAINED_PILOT_PR

  if (smokeFromActivity || smokeFromArtifacts || retainedPilotTrail) {
    references.push(STATIC_UAT_REFERENCE)
    sourceMap.push(source('smoke', 'static_uat_link', STATIC_UAT_REFERENCE, 'available', 'retained smoke checklist reference'))
    return { state: 'available', references, missing: [] }
  }

  if (artifacts.state === 'available' || artifacts.state === 'redacted' || artifacts.state === 'quarantined') {
    sourceMap.push(source('smoke', 'static_uat_link', undefined, 'missing', 'no stored smoke proof found'))
    return { state: 'incomplete', references, missing: ['missing_smoke_proof'] }
  }

  sourceMap.push(source('smoke', 'static_uat_link', undefined, 'missing', 'no stored smoke proof found'))
  return { state: 'missing', references, missing: ['missing_smoke_proof'] }
}

function buildCurrentStageEvidence(task: TaskRow, latestActivity: ActivityRow | null, sourceMap: SourceMapEntry[]): CurrentStageEvidence {
  const currentStatus = typeof task.chain_stage === 'string' && task.chain_stage.trim()
    ? sanitizeEvidenceDisplayText(task.chain_stage)
    : task.status ?? undefined
  const activityReference = latestActivity ? `activity:${String(latestActivity.id)}` : undefined

  if (latestActivity) {
    sourceMap.push(source('current_stage', 'activity', String(latestActivity.id), 'available', 'latest task activity'))
  }

  const evidence: CurrentStageEvidence = {
    state: currentStatus ? 'available' : 'missing',
    warnings: [],
  }
  if (currentStatus) evidence.current_status = currentStatus
  if (activityReference) evidence.activity_reference = activityReference
  return evidence
}

function buildPilotEligibilityEvidence(
  task: TaskRow,
  identity: IdentityEvidence,
  artifacts: PacketArtifactsEvidence,
  smoke: SmokeEvidence,
): PilotEligibilityEvidence {
  const reasons: string[] = []
  const inputs: string[] = []
  const repository = safeRepository(task.github_repo)
  const issueNumber = positiveInteger(task.github_issue_number)
  const prNumber = positiveInteger(task.github_pr_number)

  if (repository) inputs.push('github_repo')
  if (issueNumber) inputs.push('github_issue')
  if (prNumber) inputs.push('github_pr')
  if (task.github_synced_at != null) inputs.push('github_sync')
  if (artifacts.references.length > 0) inputs.push('packet_artifacts')
  if (smoke.state === 'available') inputs.push('smoke')

  if (!repository) reasons.push('missing_github_repo')
  if (!issueNumber) reasons.push('missing_github_issue_number')
  if (task.github_synced_at == null) reasons.push('missing_github_synced_at')

  if (!repository || !issueNumber || task.github_synced_at == null) {
    return { state: 'not_eligible', reasons, inputs }
  }

  if (!prNumber) reasons.push('missing_github_pr_number')
  if (identity.state !== 'available') {
    for (const missing of identity.missing) {
      if (!reasons.includes(missing)) reasons.push(missing)
    }
  }
  if (artifacts.state === 'missing') reasons.push('missing_packet_artifacts')
  if (artifacts.state === 'unavailable') reasons.push(artifacts.unavailable_reason ?? 'artifact_storage_unavailable')
  if (smoke.state !== 'available') reasons.push(...smoke.missing)

  if (reasons.length === 0) return { state: 'eligible', reasons, inputs }
  return { state: 'incomplete', reasons: Array.from(new Set(reasons)), inputs }
}

function artifactReference(row: ArtifactRow): ArtifactReference {
  const warningCodes: EvidenceWarningReason[] = []
  const kind = artifactKind(row.artifact_type)
  const state = artifactState(row)
  const rawDisplayName = row.original_filename ?? artifactLabel(row.artifact_type, row.schema_version, row.id)
  const sanitizedDisplayName = sanitizeEvidenceDisplayText(rawDisplayName)
  const displayName = sanitizedDisplayName.trim().length > 0 ? sanitizedDisplayName : `artifact ${String(row.id)}`

  if (state === 'superseded') warningCodes.push('superseded')
  if (state === 'quarantined') warningCodes.push('unsafe')
  if (row.byte_size != null && row.byte_size > OVERSIZED_ARTIFACT_BYTES) warningCodes.push('oversized')
  if (!row.artifact_type || !row.storage_kind) warningCodes.push('malformed')
  if (row.security_scan_status && /secret/i.test(row.security_scan_status)) warningCodes.push('secret_bearing')

  const reference: ArtifactReference = {
    state,
    artifact_id: String(row.id),
    kind,
    display_name: displayName,
    warning_codes: Array.from(new Set(warningCodes)),
  }
  const sha256 = safeSha(row.sha256)
  const sizeBytes = positiveInteger(row.byte_size)
  const createdAt = toIso(row.created_at)
  if (sha256) reference.sha256 = sha256
  if (row.mime_type) reference.mime_type = sanitizeEvidenceDisplayText(row.mime_type)
  if (sizeBytes) reference.size_bytes = sizeBytes
  if (createdAt) reference.created_at = createdAt
  return reference
}

function artifactState(row: ArtifactRow): EvidenceState {
  const redaction = normalizeStatus(row.redaction_status)
  const security = normalizeStatus(row.security_scan_status)
  if (
    redaction === 'quarantined'
    || redaction === 'rejected'
    || security === 'scanned_with_findings'
    || security === 'hash_mismatch'
    || security === 'file_missing'
    || security.includes('secret')
  ) {
    return 'quarantined'
  }
  if (redaction === 'superseded' || row.supersedes_artifact_id != null) return 'superseded'
  if (redaction === 'redacted') return 'redacted'
  return 'available'
}

function aggregateArtifactState(references: ArtifactReference[]): EvidenceState {
  if (references.some((ref) => ref.state === 'quarantined')) return 'quarantined'
  if (references.some((ref) => ref.state === 'available')) return 'available'
  if (references.some((ref) => ref.state === 'redacted')) return 'redacted'
  if (references.some((ref) => ref.state === 'stale')) return 'stale'
  if (references.some((ref) => ref.state === 'superseded')) return 'superseded'
  return 'missing'
}

function artifactKind(artifactType: string | null): ArtifactReferenceKind {
  if (artifactType === 'pilot_review_packet_json') return 'packet_json'
  if (artifactType === 'pilot_review_packet_markdown') return 'packet_markdown'
  if (artifactType?.includes('source_map')) return 'source_map'
  if (artifactType && /smoke|checklist/i.test(artifactType)) return 'smoke_reference'
  return 'other'
}

function artifactLabel(artifactType: string | null, schemaVersion: string | null, id: number): string {
  const type = artifactType ? artifactType.replace(/_/g, ' ') : 'artifact'
  const schema = schemaVersion ? ` ${schemaVersion}` : ''
  return `${type}${schema} #${String(id)}`
}

function readLatestActivity(db: Database.Database, task: TaskRow): ActivityRow | null {
  if (!tableExists(db, 'activities')) return null
  const row = db.prepare(`
    SELECT id, type, description, data, created_at
    FROM activities
    WHERE entity_type = 'task' AND entity_id = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(task.id, task.workspace_id) as ActivityRow | undefined
  return row ?? null
}

function addSupportingSourceRows(db: Database.Database, task: TaskRow, sourceMap: SourceMapEntry[]): void {
  if (tableExists(db, 'quality_reviews')) {
    const row = db.prepare(`
      SELECT id FROM quality_reviews
      WHERE task_id = ? AND workspace_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(task.id, task.workspace_id) as IdRow | undefined
    if (row) sourceMap.push(source('source_map', 'quality_review', String(row.id), 'available', 'quality review evidence'))
  }

  if (tableExists(db, 'resource_policy_events')) {
    const hasWorkspaceColumn = columnExists(db, 'resource_policy_events', 'workspace_id')
    const row = hasWorkspaceColumn
      ? db.prepare(`
          SELECT id FROM resource_policy_events
          WHERE task_id = ? AND workspace_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `).get(task.id, task.workspace_id) as IdRow | undefined
      : db.prepare(`
          SELECT id FROM resource_policy_events
          WHERE task_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `).get(task.id) as IdRow | undefined
    if (row) sourceMap.push(source('source_map', 'governance', String(row.id), 'available', 'governance evidence'))
  }

  if (tableExists(db, 'github_syncs') && task.github_repo) {
    const row = db.prepare(`
      SELECT id, status, last_synced_at FROM github_syncs
      WHERE repo = ? AND (workspace_id = ? OR workspace_id IS NULL)
      ORDER BY last_synced_at DESC, id DESC
      LIMIT 1
    `).get(task.github_repo, task.workspace_id) as GitHubSyncRow | undefined
    if (row) sourceMap.push(source('source_map', 'github_sync', String(row.id), 'available', 'stored GitHub sync evidence'))
  }
}

function githubIssueReference(repo: string, number: number): GitHubReference {
  const numeric = String(number)
  return {
    number,
    url: `https://github.com/${repo}/issues/${numeric}`,
    label: `${repo}#${numeric}`,
  }
}

function githubPullRequestReference(repo: string, number: number): GitHubReference {
  const numeric = String(number)
  return {
    number,
    url: `https://github.com/${repo}/pull/${numeric}`,
    label: `PR #${numeric}`,
  }
}

function sectionUnavailableWarning(reason: 'artifact_storage_disabled' | 'artifact_storage_unavailable'): EvidenceWarning {
  return {
    code: 'section_unavailable',
    section: 'packet_artifacts',
    reason,
    message: reason === 'artifact_storage_disabled'
      ? 'Artifact storage is disabled for this scope.'
      : 'Artifact storage is unavailable for this scope.',
  }
}

function artifactWarning(reason: EvidenceWarningReason, artifactId: number): EvidenceWarning {
  return {
    code: reason === 'superseded' ? 'stale_evidence' : 'unsafe_evidence',
    section: 'packet_artifacts',
    reason,
    message: `Artifact ${String(artifactId)} has ${reason} evidence metadata.`,
  }
}

function source(
  section: EvidenceSection,
  sourceType: SourceMapType,
  sourceId: string | undefined,
  state: EvidenceState,
  note: string,
): SourceMapEntry {
  const entry: SourceMapEntry = {
    section,
    source_type: sourceType,
    state,
    note: sanitizeEvidenceDisplayText(note),
  }
  if (sourceId) entry.source_id = sanitizeEvidenceDisplayText(sourceId)
  return entry
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName) as { name?: string } | undefined
  return Boolean(row?.name)
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return rows.some((row) => row.name === columnName)
}

function safeRepository(repo: string | null): string | null {
  const value = repo ? sanitizeEvidenceDisplayText(repo) : ''
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ? value : null
}

function positiveInteger(value: number | null): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function safeSha(value: string | null): string | null {
  if (!value) return null
  return /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null
}

function toIso(value: number | string | null): string | null {
  if (value == null) return null
  if (typeof value === 'number') {
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    return new Date(timestamp).toISOString()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeStatus(value: string | null): string {
  return value ? value.trim().toLowerCase() : ''
}

function dedupeWarnings(warnings: EvidenceWarning[]): EvidenceWarning[] {
  const seen = new Set<string>()
  const result: EvidenceWarning[] = []
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.section}:${warning.reason}:${warning.message}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(warning)
  }
  return result
}
