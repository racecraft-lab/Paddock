import { resolveFlag } from './feature-flags'
import { publishArtifact } from './task-artifacts'
import {
  TRIAGE_ROUTING_ARTIFACT_TYPES,
  TRIAGE_ROUTING_SCHEMA_VERSION,
  SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS,
  TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE,
  TRIAGE_ROUTING_DISPOSITION_TO_LANE,
  buildClosureRecommendationTriageRoutingPayload,
  buildNeedsHumanTriageRoutingPayload,
  buildNeedsSpecialistTriageRoutingPayload,
  buildNeedsSpecTriageRoutingPayload,
  buildTriageRoutingIdempotencyKey,
  type SupportedTriageRoutingDisposition,
  type TriageRoutingArtifactType,
  type TriageRoutingLane,
  type TriageRoutingPayloadEnvelope,
} from './triage-routing-payloads'
import type Database from 'better-sqlite3'

const PILOT_FLAG = 'PILOT_PADDOCK_E2E'
const SOURCE_TEMPLATE_SLUG = 'paddock_issue_triage'
const SOURCE_REPO = 'racecraft-lab/Paddock'
const ACTIONABLE_REMEDIATION = 'ACTIONABLE_REMEDIATION'
const NEEDS_SPEC = 'NEEDS_SPEC'
const NEEDS_HUMAN = 'NEEDS_HUMAN'
const NEEDS_SPECIALIST = 'NEEDS_SPECIALIST'

export interface TriageRoutingIssue {
  readonly code: string
  readonly path: string
  readonly message: string
}

export interface TriageRoutingEffects {
  readonly createSuccessor: false
  readonly mutateExternal: false
  readonly publishArtifact: boolean
  readonly dispatchAgent: false
}

export interface TriageRoutingSource {
  readonly taskId: number
  readonly workspaceId: number
  readonly workflowTemplateSlug: string | null
  readonly githubRepo: string | null
  readonly githubIssueNumber: number | null
  readonly projectId: number | null
}

export interface TriageRoutingRoute {
  readonly lane: TriageRoutingLane
  readonly artifactType: TriageRoutingArtifactType
}

export interface RecordedTriageRoutingArtifact {
  readonly id: number
  readonly type: TriageRoutingArtifactType
  readonly schemaVersion: typeof TRIAGE_ROUTING_SCHEMA_VERSION
  readonly idempotencyKey: string
}

export interface RecordedTriageRoutingActivity {
  readonly id: number
  readonly type: 'triage_routing_recorded'
}

export type TriageRoutingFailureReason =
  | 'pilot_flag_disabled'
  | 'source_task_missing'
  | 'unsupported_source_template'
  | 'unsupported_source_repo'
  | 'unsupported_disposition'
  | 'artifact_storage_disabled'
  | 'conflicting_disposition'
  | 'payload_validation_failed'
  | 'artifact_publish_failed'

export type TriageRoutingResult =
  | {
      readonly ok: false
      readonly status: 'failed'
      readonly reason: TriageRoutingFailureReason
      readonly source?: TriageRoutingSource
      readonly effects: TriageRoutingEffects
      readonly issues: TriageRoutingIssue[]
    }
  | {
      readonly ok: true
      readonly status: 'recorded'
      readonly disposition: SupportedTriageRoutingDisposition
      readonly source: TriageRoutingSource
      readonly route: TriageRoutingRoute
      readonly effects: TriageRoutingEffects & { readonly publishArtifact: true }
      readonly artifact: RecordedTriageRoutingArtifact
      readonly activity: RecordedTriageRoutingActivity
    }
  | {
      readonly ok: true
      readonly status: 'recordable'
      readonly disposition: never
      readonly source: TriageRoutingSource
      readonly route: TriageRoutingRoute
      readonly effects: TriageRoutingEffects
    }
  | {
      readonly ok: true
      readonly status: 'skipped'
      readonly reason: 'actionable_remediation_preserved'
      readonly disposition: typeof ACTIONABLE_REMEDIATION
      readonly source: TriageRoutingSource
      readonly preserveExistingRemediationFlow: true
      readonly effects: TriageRoutingEffects
    }

export interface RouteTriageDispositionInput {
  readonly taskId: number
  readonly workspaceId: number
  readonly disposition: string
  readonly rationale?: string | null
}

const NO_EFFECTS: TriageRoutingEffects = {
  createSuccessor: false,
  mutateExternal: false,
  publishArtifact: false,
  dispatchAgent: false,
}
const RECORDED_NEEDS_SPEC_EFFECTS: TriageRoutingEffects & { readonly publishArtifact: true } = {
  createSuccessor: false,
  mutateExternal: false,
  publishArtifact: true,
  dispatchAgent: false,
}

interface SourceTaskRow {
  readonly id: number
  readonly workspace_id: number
  readonly workflow_template_slug: string | null
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly project_id: number | null
}

interface RecordTriageRoutingResult {
  readonly artifact: RecordedTriageRoutingArtifact
  readonly activity: RecordedTriageRoutingActivity
}

type RecordableNowDisposition = SupportedTriageRoutingDisposition

interface ExistingTriageRoutingArtifactRow {
  readonly id: number
  readonly artifact_type: string | null
  readonly content_json: string | null
  readonly redaction_status: string | null
  readonly security_scan_status: string | null
  readonly supersedes_artifact_id: number | null
  readonly created_at: number | string | null
}

type SpecialistResolution =
  | {
      readonly specialist_state: 'recommended'
      readonly recommended_lane: string
      readonly recommended_owner: string
      readonly matching_basis: string[]
    }
  | {
      readonly specialist_state: 'unassigned'
      readonly missing_metadata: string[]
      readonly owner_action: string
    }

export function routeTriageDisposition(
  db: Database.Database,
  input: RouteTriageDispositionInput,
): TriageRoutingResult {
  if (!pilotFlagEnabled(db, input.workspaceId)) {
    return failure('pilot_flag_disabled', undefined, {
      code: 'pilot_flag_disabled',
      path: PILOT_FLAG,
      message: 'Paddock pilot routing is disabled for this workspace.',
    })
  }

  const source = readSourceTask(db, input)
  if (!source) {
    return failure('source_task_missing', undefined, {
      code: 'source_task_missing',
      path: 'task.id',
      message: 'Source task was not found in the requested workspace.',
    })
  }

  if (source.workflowTemplateSlug !== SOURCE_TEMPLATE_SLUG) {
    return failure('unsupported_source_template', source, {
      code: 'unsupported_source_template',
      path: 'task.workflow_template_slug',
      message: 'Only Paddock issue triage source tasks can enter SPEC-009F routing.',
    })
  }

  if (source.githubRepo !== SOURCE_REPO) {
    return failure('unsupported_source_repo', source, {
      code: 'unsupported_source_repo',
      path: 'task.github_repo',
      message: 'Only racecraft-lab/Paddock issue triage tasks can enter SPEC-009F routing.',
    })
  }

  if (input.disposition === ACTIONABLE_REMEDIATION) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'actionable_remediation_preserved',
      disposition: ACTIONABLE_REMEDIATION,
      source,
      preserveExistingRemediationFlow: true,
      effects: NO_EFFECTS,
    }
  }

  if (!isSupportedDisposition(input.disposition)) {
    return failure('unsupported_disposition', source, {
      code: 'unsupported_disposition',
      path: 'disposition',
      message: 'Disposition is not supported by SPEC-009F non-remediation routing.',
    })
  }

  if (!taskArtifactsEnabled(db, input.workspaceId)) {
    return failure('artifact_storage_disabled', source, {
      code: 'artifact_storage_disabled',
      path: 'FEATURE_TASK_ARTIFACTS',
      message: 'Task artifact storage is disabled for this workspace.',
    })
  }

  if (isRecordableNowDisposition(input.disposition)) {
    const route = {
      lane: TRIAGE_ROUTING_DISPOSITION_TO_LANE[input.disposition],
      artifactType: TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE[input.disposition],
    }
    const payload = tryBuildRoutingPayload(db, source, input)
    if (!payload.ok) {
      recordRoutingFailureActivity(db, source, input.disposition, 'triage_routing_validation_failed', {
        failure_code: 'payload_validation_failed',
        issue: payload.issue,
      })
      return failure('payload_validation_failed', source, {
        code: 'payload_validation_failed',
        path: payload.issue.path,
        message: 'Triage routing payload validation failed before artifact publication.',
      })
    }

    const currentArtifact = readCurrentTriageRoutingArtifact(db, source)
    const currentPayload = currentArtifact ? parseStoredRoutingPayload(currentArtifact) : null
    if (currentArtifact && currentPayload && currentPayload.disposition !== input.disposition) {
      recordRoutingConflictActivity(db, source, currentPayload, input.disposition)
      return failure('conflicting_disposition', source, {
        code: 'conflicting_disposition',
        path: 'disposition',
        message: 'A terminal routing disposition is already recorded for this source task.',
      })
    }

    let recorded: RecordTriageRoutingResult
    try {
      recorded = recordTriageRouting(db, source, payload.value, currentArtifact, currentPayload)
    } catch {
      recordRoutingFailureActivity(db, source, input.disposition, 'triage_routing_artifact_publish_failed', {
        failure_code: 'artifact_publish_failed',
      })
      return failure('artifact_publish_failed', source, {
        code: 'artifact_publish_failed',
        path: 'task_artifacts',
        message: 'Triage routing artifact publication failed; sanitized failure evidence was recorded.',
      })
    }
    return {
      ok: true,
      status: 'recorded',
      disposition: input.disposition,
      source,
      route,
      effects: RECORDED_NEEDS_SPEC_EFFECTS,
      artifact: recorded.artifact,
      activity: recorded.activity,
    }
  }

  return {
    ok: true,
    status: 'recordable',
    disposition: input.disposition,
    source,
    route: {
      lane: TRIAGE_ROUTING_DISPOSITION_TO_LANE[input.disposition],
      artifactType: TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE[input.disposition],
    },
    effects: NO_EFFECTS,
  }
}

function recordTriageRouting(
  db: Database.Database,
  source: TriageRoutingSource,
  payload: TriageRoutingPayloadEnvelope,
  currentArtifact: ExistingTriageRoutingArtifactRow | null,
  currentPayload: TriageRoutingPayloadEnvelope | null,
): RecordTriageRoutingResult {
  const tx = db.transaction(() => {
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(
      'done',
      unixNow(),
      source.taskId,
      source.workspaceId,
    )

    if (
      currentArtifact &&
      currentPayload?.disposition === payload.disposition &&
      canonicalRoutingPayloadJson(currentPayload) === canonicalRoutingPayloadJson(payload)
    ) {
      const existingActivity = readRecordedRoutingActivity(
        db,
        source,
        currentArtifact.id,
        currentPayload.idempotency_key,
        currentPayload.disposition,
      )
      const activity = existingActivity ?? insertRecordedRoutingActivity(db, source, currentPayload, currentArtifact.id)
      return {
        artifact: {
          id: currentArtifact.id,
          type: currentPayload.artifact_type,
          schemaVersion: TRIAGE_ROUTING_SCHEMA_VERSION,
          idempotencyKey: currentPayload.idempotency_key,
        },
        activity,
      }
    }

    const supersedesArtifactId = currentArtifact && currentPayload?.disposition === payload.disposition
      ? currentArtifact.id
      : undefined
    const artifactId = insertRoutingArtifact(db, source, payload, supersedesArtifactId)
    const activity = insertRecordedRoutingActivity(db, source, payload, artifactId, supersedesArtifactId)

    return {
      artifact: {
        id: artifactId,
        type: payload.artifact_type,
        schemaVersion: TRIAGE_ROUTING_SCHEMA_VERSION,
        idempotencyKey: payload.idempotency_key,
      },
      activity,
    }
  })

  return tx()
}

function tryBuildRoutingPayload(
  db: Database.Database,
  source: TriageRoutingSource,
  input: RouteTriageDispositionInput,
): { ok: true; value: TriageRoutingPayloadEnvelope } | { ok: false; issue: TriageRoutingIssue } {
  try {
    return { ok: true, value: buildRoutingPayload(db, source, input) }
  } catch (error) {
    return {
      ok: false,
      issue: validationIssueFromError(error),
    }
  }
}

function insertRoutingArtifact(
  db: Database.Database,
  source: TriageRoutingSource,
  payload: TriageRoutingPayloadEnvelope,
  supersedesArtifactId?: number,
): number {
  const payloadJson = JSON.stringify(payload)
  const artifact = publishArtifact({
    task_id: source.taskId,
    artifact_type: payload.artifact_type,
    storage_kind: 'inline_json',
    content: payloadJson,
    mime: 'application/json',
    schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
    active_workspace_id: source.workspaceId,
    is_facility_caller: false,
    db,
    ...(supersedesArtifactId !== undefined ? { supersedes: supersedesArtifactId } : {}),
    ...(source.workflowTemplateSlug !== null ? { workflow_template_slug: source.workflowTemplateSlug } : {}),
  })
  return artifact.id
}

function insertRecordedRoutingActivity(
  db: Database.Database,
  source: TriageRoutingSource,
  payload: TriageRoutingPayloadEnvelope,
  artifactId: number,
  supersedesArtifactId?: number,
): RecordedTriageRoutingActivity {
  const activityData = {
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    disposition: payload.disposition,
    lane: payload.lane,
    routing_status: 'recorded',
    artifact_id: artifactId,
    ...(supersedesArtifactId ? { supersedes_artifact_id: supersedesArtifactId } : {}),
    idempotency_key: payload.idempotency_key,
    deferred_side_effects: activityDeferredSideEffects(payload),
  }
  const activityInfo = db
    .prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
      VALUES ('triage_routing_recorded', 'task', ?, 'paddock', ?, ?, ?, ?)
    `)
    .run(
      source.taskId,
      `Recorded terminal triage routing for ${payload.disposition}`,
      JSON.stringify(activityData),
      source.workspaceId,
      unixNow(),
    )
  return {
    id: Number(activityInfo.lastInsertRowid),
    type: 'triage_routing_recorded',
  }
}

function readRecordedRoutingActivity(
  db: Database.Database,
  source: TriageRoutingSource,
  artifactId: number,
  idempotencyKey: string,
  disposition: SupportedTriageRoutingDisposition,
): RecordedTriageRoutingActivity | null {
  const rows = db.prepare(`
    SELECT id, data
    FROM activities
    WHERE type = 'triage_routing_recorded'
      AND entity_type = 'task'
      AND entity_id = ?
      AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(source.taskId, source.workspaceId) as { id: number; data: string | null }[]
  for (const row of rows) {
    const data = parseJsonRecord(row.data)
    if (
      data?.['artifact_id'] === artifactId &&
      data['idempotency_key'] === idempotencyKey &&
      data['disposition'] === disposition
    ) {
      return { id: row.id, type: 'triage_routing_recorded' }
    }
  }
  return null
}

function readCurrentTriageRoutingArtifact(
  db: Database.Database,
  source: TriageRoutingSource,
): ExistingTriageRoutingArtifactRow | null {
  const placeholders = TRIAGE_ROUTING_ARTIFACT_TYPES.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT id, artifact_type, content_json, redaction_status, security_scan_status,
           supersedes_artifact_id, created_at
    FROM task_artifacts
    WHERE task_id = ?
      AND workspace_id = ?
      AND schema_version = ?
      AND artifact_type IN (${placeholders})
    ORDER BY created_at DESC, id DESC
  `).all(source.taskId, source.workspaceId, TRIAGE_ROUTING_SCHEMA_VERSION, ...TRIAGE_ROUTING_ARTIFACT_TYPES) as ExistingTriageRoutingArtifactRow[]
  return rows.find(isCurrentRoutingArtifact) ?? null
}

function isCurrentRoutingArtifact(row: ExistingTriageRoutingArtifactRow): boolean {
  const redaction = normalizeStatus(row.redaction_status)
  const security = normalizeStatus(row.security_scan_status)
  return redaction !== 'superseded'
    && redaction !== 'quarantined'
    && redaction !== 'rejected'
    && security !== 'scanned_with_findings'
    && security !== 'hash_mismatch'
    && security !== 'file_missing'
    && !security.includes('secret')
}

function parseStoredRoutingPayload(row: ExistingTriageRoutingArtifactRow): TriageRoutingPayloadEnvelope | null {
  if (!row.content_json) return null
  try {
    const parsed = JSON.parse(row.content_json) as Partial<TriageRoutingPayloadEnvelope>
    const disposition = parsed.disposition
    if (typeof disposition !== 'string' || !isSupportedDisposition(disposition)) return null
    return parsed.schema_version === TRIAGE_ROUTING_SCHEMA_VERSION
      && parsed.artifact_type === TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE[disposition]
      ? parsed as TriageRoutingPayloadEnvelope
      : null
  } catch {
    return null
  }
}

function canonicalRoutingPayloadJson(payload: TriageRoutingPayloadEnvelope): string {
  return stableJsonWithoutProducedAt(payload)
}

function stableJsonWithoutProducedAt(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonWithoutProducedAt(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'produced_at')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonWithoutProducedAt(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function recordRoutingConflictActivity(
  db: Database.Database,
  source: TriageRoutingSource,
  currentPayload: TriageRoutingPayloadEnvelope,
  attemptedDisposition: SupportedTriageRoutingDisposition,
): void {
  recordRoutingFailureActivity(db, source, attemptedDisposition, 'triage_routing_conflict', {
    failure_code: 'conflicting_disposition',
    existing_disposition: currentPayload.disposition,
    attempted_disposition: attemptedDisposition,
    existing_idempotency_key: currentPayload.idempotency_key,
  })
}

function recordRoutingFailureActivity(
  db: Database.Database,
  source: TriageRoutingSource,
  disposition: SupportedTriageRoutingDisposition,
  type: 'triage_routing_conflict' | 'triage_routing_validation_failed' | 'triage_routing_artifact_publish_failed',
  details: Record<string, unknown>,
): void {
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES (?, 'task', ?, 'paddock', ?, ?, ?, ?)
  `).run(
    type,
    source.taskId,
    type === 'triage_routing_conflict'
      ? `Detected conflicting triage routing for ${disposition}`
      : `Failed terminal triage routing for ${disposition}`,
    JSON.stringify({
      source_task_id: source.taskId,
      workspace_id: source.workspaceId,
      disposition,
      routing_status: type === 'triage_routing_conflict' ? 'conflict' : 'failed',
      idempotency_key: buildTriageRoutingIdempotencyKey({
        workspace_id: source.workspaceId,
        source_task_id: source.taskId,
        disposition,
      }),
      ...details,
    }),
    source.workspaceId,
    unixNow(),
  )
}

function validationIssueFromError(error: unknown): TriageRoutingIssue {
  const message = error instanceof Error ? error.message : String(error)
  const match = /^invalid_[^:]+:(.+)$/.exec(message)
  const path = match?.[1] ?? 'payload'
  return {
    code: 'payload_validation_failed',
    path,
    message: 'Triage routing payload validation failed.',
  }
}

function buildRoutingPayload(
  db: Database.Database,
  source: TriageRoutingSource,
  input: RouteTriageDispositionInput,
): TriageRoutingPayloadEnvelope {
  if (input.disposition === NEEDS_HUMAN) return buildNeedsHumanPayload(source, input)
  if (input.disposition === NEEDS_SPECIALIST) return buildNeedsSpecialistPayload(db, source, input)
  if (isClosureDisposition(input.disposition)) return buildClosurePayload(source, input)
  return buildNeedsSpecPayload(source, input)
}

function buildNeedsSpecPayload(source: TriageRoutingSource, input: RouteTriageDispositionInput): TriageRoutingPayloadEnvelope {
  const result = buildNeedsSpecTriageRoutingPayload({
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    source_issue: sourceIssue(source),
    triage_rationale: input.rationale ?? 'Issue triage determined this needs a SpecKit specification before implementation.',
    recommended_next_action: 'Owner reviews this handoff and decides whether to start SpecKit setup manually.',
    proposed_labels: ['pd:triage-routing', 'pd:needs-spec'],
    evidence_links: sourceEvidenceLinks(source),
    proposed_scope: 'Specify the production behavior change from the retained triage evidence.',
    non_goals: ['Do not create a spec worktree automatically.', 'Do not enter Issue Remediation.'],
    deferred_setup_action: {
      owner_action: 'Owner decides whether to start SpecKit setup from this handoff.',
    },
    produced_at: new Date().toISOString(),
  })

  if (!result.ok) {
    throw new Error(`invalid_needs_spec_triage_routing_payload:${result.issues[0]?.path ?? 'unknown'}`)
  }
  return result.value
}

function buildNeedsHumanPayload(source: TriageRoutingSource, input: RouteTriageDispositionInput): TriageRoutingPayloadEnvelope {
  const result = buildNeedsHumanTriageRoutingPayload({
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    source_issue: sourceIssue(source),
    triage_rationale: input.rationale ?? 'Issue triage needs owner clarification before routing can continue.',
    recommended_next_action: 'Owner answers the blocking questions in Paddock.',
    proposed_labels: ['pd:triage-routing', 'pd:needs-human'],
    evidence_links: sourceEvidenceLinks(source),
    blocking_questions: [
      'What user-visible behavior should change?',
      'Which environment or reproduction proves the issue?',
    ],
    target_audience: 'Issue owner',
    evidence_needed: ['Minimal reproduction notes', 'Expected result confirmation'],
    produced_at: new Date().toISOString(),
  })

  if (!result.ok) {
    throw new Error(`invalid_needs_human_triage_routing_payload:${result.issues[0]?.path ?? 'unknown'}`)
  }
  return result.value
}

function buildNeedsSpecialistPayload(
  db: Database.Database,
  source: TriageRoutingSource,
  input: RouteTriageDispositionInput,
): TriageRoutingPayloadEnvelope {
  const resolution = resolveSpecialistMetadata(db, source)
  const result = buildNeedsSpecialistTriageRoutingPayload({
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    source_issue: sourceIssue(source),
    triage_rationale: input.rationale ?? 'Issue triage needs a specialist recommendation.',
    recommended_next_action: resolution.specialist_state === 'recommended'
      ? 'Owner reviews the specialist recommendation in Paddock.'
      : resolution.owner_action,
    proposed_labels: resolution.specialist_state === 'recommended'
      ? ['pd:triage-routing', 'pd:needs-specialist', `area:${resolution.recommended_lane.replace(/-specialist$/, '')}`]
      : ['pd:triage-routing', 'pd:needs-specialist'],
    evidence_links: sourceEvidenceLinks(source),
    ...resolution,
    produced_at: new Date().toISOString(),
  })

  if (!result.ok) {
    throw new Error(`invalid_needs_specialist_triage_routing_payload:${result.issues[0]?.path ?? 'unknown'}`)
  }
  return result.value
}

function buildClosurePayload(source: TriageRoutingSource, input: RouteTriageDispositionInput): TriageRoutingPayloadEnvelope {
  const detail = closurePayloadDetail(input.disposition)
  const result = buildClosureRecommendationTriageRoutingPayload({
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    source_issue: sourceIssue(source),
    disposition: input.disposition,
    triage_rationale: input.rationale ?? `Issue triage recommends ${input.disposition} closure handling.`,
    recommended_next_action: `Owner reviews the ${input.disposition} closure recommendation in Paddock.`,
    proposed_labels: ['pd:triage-routing', `pd:${input.disposition.toLowerCase()}`],
    evidence_links: sourceEvidenceLinks(source),
    ...detail,
    produced_at: new Date().toISOString(),
  })

  if (!result.ok) {
    throw new Error(`invalid_closure_triage_routing_payload:${result.issues[0]?.path ?? 'unknown'}`)
  }
  return result.value
}

function closurePayloadDetail(disposition: string): Record<string, unknown> {
  if (disposition === 'DUPLICATE') {
    return {
      suspected_duplicate_target: 'owner_confirmation_required',
      comparison_rationale:
        'Triage marked this issue as duplicate, but no duplicate target was provided in the triage output. Owner must confirm the target before external closure.',
    }
  }
  if (disposition === 'OBSOLETE') {
    return {
      superseding_condition: 'owner_confirmation_required',
      non_actionability_rationale:
        'Triage marked this issue as obsolete, but no superseding condition was provided in the triage output. Owner must confirm the condition before external closure.',
    }
  }
  return {
    invalidity_reason: 'owner_confirmation_required',
    validation_evidence: ['Triage marked this issue as invalid, but no validation evidence was provided in the triage output.'],
    missing_reproducibility_context: ['owner confirmation before external closure'],
  }
}

function sourceIssue(source: TriageRoutingSource): {
  readonly repo?: string
  readonly number?: number
  readonly url?: string
} {
  const issue: { repo?: string; number?: number; url?: string } = {}
  if (source.githubRepo) issue.repo = source.githubRepo
  if (source.githubIssueNumber !== null) {
    issue.number = source.githubIssueNumber
    issue.url = `https://github.com/${SOURCE_REPO}/issues/${String(source.githubIssueNumber)}`
  }
  return issue
}

function sourceEvidenceLinks(
  source: TriageRoutingSource,
): { readonly type: 'github_issue'; readonly label: string; readonly url: string }[] {
  return source.githubIssueNumber === null
    ? []
    : [
        {
          type: 'github_issue',
          label: `Issue #${String(source.githubIssueNumber)}`,
          url: `https://github.com/${SOURCE_REPO}/issues/${String(source.githubIssueNumber)}`,
        },
      ]
}

function resolveSpecialistMetadata(db: Database.Database, source: TriageRoutingSource): SpecialistResolution {
  const ownerAction = 'Owner chooses or supplies specialist context.'
  if (source.projectId === null) {
    return { specialist_state: 'unassigned', missing_metadata: ['missing_project'], owner_action: ownerAction }
  }
  if (!tableExists(db, 'projects') || !tableExists(db, 'project_agent_assignments') || !tableExists(db, 'agents')) {
    return { specialist_state: 'unassigned', missing_metadata: ['missing_specialist_metadata_tables'], owner_action: ownerAction }
  }

  const project = db.prepare(`
    SELECT id, area_slug, status
    FROM projects
    WHERE id = ? AND workspace_id = ?
    LIMIT 1
  `).get(source.projectId, source.workspaceId) as { id: number; area_slug: string | null; status: string | null } | undefined
  if (!project) return { specialist_state: 'unassigned', missing_metadata: ['missing_project'], owner_action: ownerAction }
  if (project.status && ['inactive', 'disabled', 'archived'].includes(project.status.toLowerCase())) {
    return { specialist_state: 'unassigned', missing_metadata: ['inactive_project'], owner_action: ownerAction }
  }

  const areaSlug = normalizeAreaSlug(project.area_slug)
  if (!areaSlug) return { specialist_state: 'unassigned', missing_metadata: ['missing_area'], owner_action: ownerAction }
  const expectedLane = `${areaSlug}-specialist`
  const rows = db.prepare(`
    SELECT paa.agent_name, paa.role, a.status
    FROM project_agent_assignments paa
    INNER JOIN agents a
      ON a.name = paa.agent_name
     AND a.workspace_id = paa.workspace_id
    WHERE paa.project_id = ?
      AND paa.workspace_id = ?
      AND paa.role = ?
    ORDER BY paa.id ASC
  `).all(project.id, source.workspaceId, expectedLane) as { agent_name: string; role: string | null; status: string | null }[]
  const activeRows = rows.filter((row) => !row.status || ['online', 'active', 'idle'].includes(row.status.toLowerCase()))
  if (rows.length === 0) {
    return { specialist_state: 'unassigned', missing_metadata: ['missing_specialist_assignment'], owner_action: ownerAction }
  }
  if (activeRows.length === 0) {
    return { specialist_state: 'unassigned', missing_metadata: ['missing_same_workspace_agent'], owner_action: ownerAction }
  }
  if (activeRows.length !== 1) {
    return { specialist_state: 'unassigned', missing_metadata: ['ambiguous_specialist_assignment'], owner_action: ownerAction }
  }
  const activeRow = activeRows[0]
  if (!activeRow) {
    return { specialist_state: 'unassigned', missing_metadata: ['missing_same_workspace_agent'], owner_action: ownerAction }
  }

  return {
    specialist_state: 'recommended',
    recommended_lane: expectedLane,
    recommended_owner: activeRow.agent_name,
    matching_basis: [
      `project.area_slug=${areaSlug}`,
      `area:${areaSlug}`,
      'single same-workspace assignment',
      `agent status ${activeRow.status ?? 'available'}`,
    ],
  }
}

function activityDeferredSideEffects(payload: TriageRoutingPayloadEnvelope): Record<string, true> {
  const deferred: Record<string, true> = {}
  for (const sideEffect of payload.deferred_side_effects) {
    deferred[sideEffect.side_effect] = true
    if (sideEffect.side_effect.startsWith('github_')) deferred['github_mutation'] = true
  }
  if (payload.disposition === NEEDS_SPEC) {
    deferred['github_mutation'] = true
    deferred['speckit_setup'] = true
    deferred['successor_task'] = true
  }
  return deferred
}

function normalizeAreaSlug(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9]$|^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(normalized) ? normalized : null
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000)
}

function pilotFlagEnabled(db: Database.Database, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as
    | { feature_flags: string | null }
    | undefined
  return resolveFlag(PILOT_FLAG, { workspaceFlags: row?.feature_flags ?? null })
}

function taskArtifactsEnabled(db: Database.Database, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as
    | { feature_flags: string | null }
    | undefined
  return resolveFlag('FEATURE_TASK_ARTIFACTS', { workspaceFlags: row?.feature_flags ?? null })
}

function readSourceTask(
  db: Database.Database,
  input: RouteTriageDispositionInput,
): TriageRoutingSource | null {
  const row = db
    .prepare(`
      SELECT id, workspace_id, workflow_template_slug, github_repo, github_issue_number, project_id
      FROM tasks
      WHERE id = ? AND workspace_id = ?
      LIMIT 1
    `)
    .get(input.taskId, input.workspaceId) as SourceTaskRow | undefined
  if (!row) return null
  return {
    taskId: row.id,
    workspaceId: row.workspace_id,
    workflowTemplateSlug: row.workflow_template_slug,
    githubRepo: row.github_repo,
    githubIssueNumber: row.github_issue_number,
    projectId: row.project_id,
  }
}

function failure(
  reason: TriageRoutingFailureReason,
  source: TriageRoutingSource | undefined,
  issue: TriageRoutingIssue,
): TriageRoutingResult {
  return {
    ok: false,
    status: 'failed',
    reason,
    ...(source ? { source } : {}),
    effects: NO_EFFECTS,
    issues: [issue],
  }
}

function isSupportedDisposition(input: string): input is SupportedTriageRoutingDisposition {
  return SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS.includes(input as SupportedTriageRoutingDisposition)
}

function isRecordableNowDisposition(disposition: SupportedTriageRoutingDisposition): disposition is RecordableNowDisposition {
  return isSupportedDisposition(disposition)
}

function isClosureDisposition(disposition: string): disposition is 'DUPLICATE' | 'OBSOLETE' | 'INVALID' {
  return disposition === 'DUPLICATE' || disposition === 'OBSOLETE' || disposition === 'INVALID'
}

function parseJsonRecord(input: string | null): Record<string, unknown> | null {
  if (!input) return null
  try {
    const parsed = JSON.parse(input) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function normalizeStatus(value: string | null): string {
  return value?.trim().toLowerCase() ?? ''
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName) as { name?: string } | undefined
  return Boolean(row?.name)
}
