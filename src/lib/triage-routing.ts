import { createHash } from 'node:crypto'
import { resolveFlag } from './feature-flags'
import {
  TRIAGE_ROUTING_SCHEMA_VERSION,
  SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS,
  TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE,
  TRIAGE_ROUTING_DISPOSITION_TO_LANE,
  buildNeedsSpecTriageRoutingPayload,
  type SupportedTriageRoutingDisposition,
  type TriageRoutingArtifactType,
  type TriageRoutingLane,
} from './triage-routing-payloads'
import type Database from 'better-sqlite3'

const PILOT_FLAG = 'PILOT_MISSION_CONTROL_E2E'
const SOURCE_TEMPLATE_SLUG = 'mission-control_issue_triage'
const SOURCE_REPO = 'racecraft-lab/mission-control'
const ACTIONABLE_REMEDIATION = 'ACTIONABLE_REMEDIATION'
const NEEDS_SPEC = 'NEEDS_SPEC'

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
}

export interface TriageRoutingRoute {
  readonly lane: TriageRoutingLane
  readonly artifactType: TriageRoutingArtifactType
}

export interface RecordedTriageRoutingArtifact {
  readonly id: number
  readonly type: 'triage_speckit_handoff'
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
      readonly disposition: typeof NEEDS_SPEC
      readonly source: TriageRoutingSource
      readonly route: {
        readonly lane: 'speckit_handoff'
        readonly artifactType: 'triage_speckit_handoff'
      }
      readonly effects: TriageRoutingEffects & { readonly publishArtifact: true }
      readonly artifact: RecordedTriageRoutingArtifact
      readonly activity: RecordedTriageRoutingActivity
    }
  | {
      readonly ok: true
      readonly status: 'recordable'
      readonly disposition: Exclude<SupportedTriageRoutingDisposition, typeof NEEDS_SPEC>
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
}

interface RecordNeedsSpecRoutingResult {
  readonly artifact: RecordedTriageRoutingArtifact
  readonly activity: RecordedTriageRoutingActivity
}

export function routeTriageDisposition(
  db: Database.Database,
  input: RouteTriageDispositionInput,
): TriageRoutingResult {
  if (!pilotFlagEnabled(db, input.workspaceId)) {
    return failure('pilot_flag_disabled', undefined, {
      code: 'pilot_flag_disabled',
      path: PILOT_FLAG,
      message: 'Mission Control pilot routing is disabled for this workspace.',
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
      message: 'Only Mission Control issue triage source tasks can enter SPEC-009F routing.',
    })
  }

  if (source.githubRepo !== SOURCE_REPO) {
    return failure('unsupported_source_repo', source, {
      code: 'unsupported_source_repo',
      path: 'task.github_repo',
      message: 'Only racecraft-lab/mission-control issue triage tasks can enter SPEC-009F routing.',
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

  if (input.disposition === NEEDS_SPEC) {
    const recorded = recordNeedsSpecRouting(db, source, input)
    return {
      ok: true,
      status: 'recorded',
      disposition: NEEDS_SPEC,
      source,
      route: {
        lane: 'speckit_handoff',
        artifactType: 'triage_speckit_handoff',
      },
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

function recordNeedsSpecRouting(
  db: Database.Database,
  source: TriageRoutingSource,
  input: RouteTriageDispositionInput,
): RecordNeedsSpecRoutingResult {
  const tx = db.transaction(() => {
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(
      'done',
      unixNow(),
      source.taskId,
      source.workspaceId,
    )

    const payload = buildNeedsSpecPayload(source, input)
    const payloadJson = JSON.stringify(payload)
    const artifactInfo = db
      .prepare(`
        INSERT INTO task_artifacts (
          task_id, workspace_id, workflow_template_slug, artifact_type, schema_version,
          storage_kind, content_json, mime_type, byte_size, sha256, preview_text,
          redaction_status, security_scan_status, created_at
        )
        VALUES (?, ?, ?, 'triage_speckit_handoff', ?, 'inline_json', ?, 'application/json',
          ?, ?, ?, 'clean', 'scanned_clean', ?)
      `)
      .run(
        source.taskId,
        source.workspaceId,
        source.workflowTemplateSlug,
        TRIAGE_ROUTING_SCHEMA_VERSION,
        payloadJson,
        Buffer.byteLength(payloadJson, 'utf8'),
        createHash('sha256').update(payloadJson, 'utf8').digest('hex'),
        `NEEDS_SPEC speckit_handoff ${payload.recommended_next_action}`,
        unixNow(),
      )
    const artifactId = Number(artifactInfo.lastInsertRowid)

    const activityData = {
      source_task_id: source.taskId,
      workspace_id: source.workspaceId,
      disposition: NEEDS_SPEC,
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      artifact_id: artifactId,
      idempotency_key: payload.idempotency_key,
      deferred_side_effects: {
        github_mutation: true,
        speckit_setup: true,
        successor_task: true,
      },
    }
    const activityInfo = db
      .prepare(`
        INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
        VALUES ('triage_routing_recorded', 'task', ?, 'mission-control', ?, ?, ?, ?)
      `)
      .run(
        source.taskId,
        'Recorded terminal triage routing for NEEDS_SPEC',
        JSON.stringify(activityData),
        source.workspaceId,
        unixNow(),
      )

    return {
      artifact: {
        id: artifactId,
        type: 'triage_speckit_handoff' as const,
        schemaVersion: TRIAGE_ROUTING_SCHEMA_VERSION,
        idempotencyKey: payload.idempotency_key,
      },
      activity: {
        id: Number(activityInfo.lastInsertRowid),
        type: 'triage_routing_recorded' as const,
      },
    }
  })

  return tx()
}

function buildNeedsSpecPayload(source: TriageRoutingSource, input: RouteTriageDispositionInput) {
  const result = buildNeedsSpecTriageRoutingPayload({
    source_task_id: source.taskId,
    workspace_id: source.workspaceId,
    source_issue: {
      repo: source.githubRepo ?? undefined,
      number: source.githubIssueNumber ?? undefined,
      url:
        source.githubIssueNumber === null
          ? undefined
          : `https://github.com/${SOURCE_REPO}/issues/${String(source.githubIssueNumber)}`,
    },
    triage_rationale: input.rationale ?? 'Issue triage determined this needs a SpecKit specification before implementation.',
    recommended_next_action: 'Owner reviews this handoff and decides whether to start SpecKit setup manually.',
    proposed_labels: ['mc:triage-routing', 'mc:needs-spec'],
    evidence_links:
      source.githubIssueNumber === null
        ? []
        : [
            {
              type: 'github_issue',
              label: `Issue #${String(source.githubIssueNumber)}`,
              url: `https://github.com/${SOURCE_REPO}/issues/${String(source.githubIssueNumber)}`,
            },
          ],
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

function unixNow(): number {
  return Math.floor(Date.now() / 1000)
}

function pilotFlagEnabled(db: Database.Database, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as
    | { feature_flags: string | null }
    | undefined
  return resolveFlag(PILOT_FLAG, { env: {}, workspaceFlags: row?.feature_flags ?? null })
}

function readSourceTask(
  db: Database.Database,
  input: RouteTriageDispositionInput,
): TriageRoutingSource | null {
  const row = db
    .prepare(`
      SELECT id, workspace_id, workflow_template_slug, github_repo, github_issue_number
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
