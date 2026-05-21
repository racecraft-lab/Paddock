import { resolveFlag } from './feature-flags'
import {
  SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS,
  TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE,
  TRIAGE_ROUTING_DISPOSITION_TO_LANE,
  type SupportedTriageRoutingDisposition,
  type TriageRoutingArtifactType,
  type TriageRoutingLane,
} from './triage-routing-payloads'
import type Database from 'better-sqlite3'

const PILOT_FLAG = 'PILOT_MISSION_CONTROL_E2E'
const SOURCE_TEMPLATE_SLUG = 'mission-control_issue_triage'
const SOURCE_REPO = 'racecraft-lab/mission-control'
const ACTIONABLE_REMEDIATION = 'ACTIONABLE_REMEDIATION'

export interface TriageRoutingIssue {
  readonly code: string
  readonly path: string
  readonly message: string
}

export interface TriageRoutingEffects {
  readonly createSuccessor: false
  readonly mutateExternal: false
  readonly publishArtifact: false
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
      readonly status: 'recordable'
      readonly disposition: SupportedTriageRoutingDisposition
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

interface SourceTaskRow {
  readonly id: number
  readonly workspace_id: number
  readonly workflow_template_slug: string | null
  readonly github_repo: string | null
  readonly github_issue_number: number | null
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
