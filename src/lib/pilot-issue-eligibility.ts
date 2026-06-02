import type Database from 'better-sqlite3'

export const PILOT_PADDOCK_REPO = 'racecraft-lab/Paddock'

const PILOT_PRIORITY_LABELS = ['priority:low', 'priority:medium', 'priority:high', 'priority:critical']
const GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g

export type PilotOperatorError =
  | 'missing_credentials'
  | 'insufficient_permissions'
  | 'github_api_failure'
  | 'malformed_issue_payload'
  | 'synthetic_issue_label_mismatch'
  | 'synthetic_issue_create_failed'
  | 'sync_failed'
  | 'missing_live_mutation_opt_in'

export type PilotEligibilityReason =
  | 'wrong_repository'
  | 'not_open_issue'
  | 'missing_mc_inbox'
  | 'missing_priority'
  | 'missing_area'
  | 'multiple_areas'
  | 'area_not_routable'
  | 'linked_pr'
  | 'terminal_status'
  | 'duplicate_synced_task'

export interface PilotIssueCandidate {
  repository: string
  issueNumber: number
  title: string
  state: 'open' | 'closed'
  isPullRequest: boolean
  linkedPullRequest: boolean
  labels: string[]
}

export type PilotEligibilityResult =
  | {
      eligible: true
      repository: typeof PILOT_PADDOCK_REPO
      issueNumber: number
      priorityLabels: string[]
      areaSlug: string
      areaResolution: 'single_match'
    }
  | {
      eligible: false
      repository: string
      issueNumber: number
      reason: PilotEligibilityReason
      evidence: Record<string, unknown>
      duplicateTaskId?: number
    }
  | {
      eligible: false
      error: PilotOperatorError
      operation: 'candidate_selection' | 'synthetic_fallback' | 'operator_sync'
      evidence: Record<string, unknown>
    }

export interface PilotRootTaskProof {
  count: number
  task: PilotTaskRow | null
}

export interface PilotTaskRow {
  id: number
  workspace_id: number
  project_id: number | null
  github_repo: string | null
  github_issue_number: number | null
  github_synced_at: number | null
  parent_task_id: number | null
  status: string
  created_by: string | null
  dispatch_attempts: number | null
  assigned_to: string | null
  root_task_id?: number | null
  chain_id?: string | null
  chain_stage?: string | null
}

export interface PilotSideEffectSnapshot {
  childTaskCount: number
  hasTaskChainLineage: boolean
  dispatchAttempts: number
  assignedTo: string | null
  linkedRunCount: number
  linkedDispositionCount: number
  linkedArtifactCount: number
  dispatchPipelineRemediationActivityCount: number
  optionalFutureTableChecks: {
    tableName: string
    exists: boolean
    matchingRows: number
  }[]
}

interface DuplicateTaskRow {
  id: number
}

export function evaluatePilotIssueEligibility(
  db: Database.Database,
  workspaceId: number,
  candidateInput: unknown,
): PilotEligibilityResult {
  const candidate = parseCandidate(candidateInput)
  if (!candidate.ok) {
    return {
      eligible: false,
      error: 'malformed_issue_payload',
      operation: 'candidate_selection',
      evidence: candidate.evidence,
    }
  }

  const normalizedLabels = normalizePilotLabels(candidate.value.labels)
  const baseEvidence = {
    repository: candidate.value.repository,
    issueNumber: candidate.value.issueNumber,
    labels: normalizedLabels,
  }

  if (candidate.value.repository !== PILOT_PADDOCK_REPO) {
    return ineligible(candidate.value, 'wrong_repository', baseEvidence)
  }
  if (candidate.value.isPullRequest || candidate.value.state !== 'open') {
    return ineligible(candidate.value, candidate.value.state !== 'open' ? 'terminal_status' : 'not_open_issue', baseEvidence)
  }
  if (candidate.value.linkedPullRequest) {
    return ineligible(candidate.value, 'linked_pr', baseEvidence)
  }
  if (!normalizedLabels.includes('pd:inbox')) {
    return ineligible(candidate.value, 'missing_mc_inbox', baseEvidence)
  }
  if (normalizedLabels.some((label) => label === 'pd:done' || label === 'pd:failed')) {
    return ineligible(candidate.value, 'terminal_status', baseEvidence)
  }

  const priorityLabels = normalizedLabels.filter((label) => PILOT_PRIORITY_LABELS.includes(label))
  if (priorityLabels.length === 0) {
    return ineligible(candidate.value, 'missing_priority', baseEvidence)
  }

  const areaLabels = parsePilotAreaLabels(normalizedLabels)
  if (areaLabels.length === 0) {
    return ineligible(candidate.value, 'missing_area', { ...baseEvidence, areaLabels })
  }
  if (areaLabels.length > 1) {
    return ineligible(candidate.value, 'multiple_areas', { ...baseEvidence, areaLabels })
  }

  const areaProjectId = resolveSingleAreaProjectId(db, workspaceId, areaLabels[0] ?? '')
  if (areaProjectId === null) {
    return ineligible(candidate.value, 'area_not_routable', { ...baseEvidence, areaLabels, areaResolution: 'no_match' })
  }

  const duplicate = findDuplicateSyncedTask(db, workspaceId, candidate.value.repository, candidate.value.issueNumber)
  if (duplicate) {
    return {
      eligible: false,
      repository: candidate.value.repository,
      issueNumber: candidate.value.issueNumber,
      reason: 'duplicate_synced_task',
      duplicateTaskId: duplicate.id,
      evidence: { ...baseEvidence, duplicateTaskId: duplicate.id },
    }
  }

  return {
    eligible: true,
    repository: PILOT_PADDOCK_REPO,
    issueNumber: candidate.value.issueNumber,
    priorityLabels,
    areaSlug: areaLabels[0] ?? '',
    areaResolution: 'single_match',
  }
}

export function getPilotRootTaskProof(
  db: Database.Database,
  workspaceId: number,
  repository: string,
  issueNumber: number,
): PilotRootTaskProof {
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    WHERE workspace_id = ?
      AND github_repo = ?
      AND github_issue_number = ?
      AND github_synced_at IS NOT NULL
      AND parent_task_id IS NULL
    ORDER BY id ASC
  `).all(workspaceId, repository, issueNumber) as PilotTaskRow[]

  return {
    count: rows.length,
    task: rows.length === 1 ? rows[0] ?? null : null,
  }
}

export function isLocalOnlyTaskExcludedFromPilot(task: Partial<PilotTaskRow>): boolean {
  return !task.github_repo || !task.github_issue_number || !task.github_synced_at
}

export function readPilotSideEffectSnapshot(
  db: Database.Database,
  workspaceId: number,
  taskId: number,
): PilotSideEffectSnapshot {
  const task = db.prepare(`SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`).get(taskId, workspaceId) as PilotTaskRow | undefined
  const taskColumns = tableColumns(db, 'tasks')

  const optionalFutureTableChecks = ['task_claims', 'stage_attempts', 'runner_runs', 'sandbox_runs'].map((tableName) => {
    const exists = tableExists(db, tableName)
    return {
      tableName,
      exists,
      matchingRows: exists && tableColumns(db, tableName).has('task_id')
        ? countRows(db, `SELECT COUNT(*) as count FROM ${tableName} WHERE task_id = ?`, [taskId])
        : 0,
    }
  })

  return {
    childTaskCount: taskColumns.has('parent_task_id')
      ? countRows(db, `SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND parent_task_id = ?`, [workspaceId, taskId])
      : 0,
    hasTaskChainLineage: Boolean(task?.root_task_id ?? task?.chain_id ?? task?.chain_stage),
    dispatchAttempts: task?.dispatch_attempts ?? 0,
    assignedTo: task?.assigned_to ?? null,
    linkedRunCount: countLinkedRowsIfPresent(db, 'runs', taskId),
    linkedDispositionCount: countLinkedRowsIfPresent(db, 'task_dispositions', taskId),
    linkedArtifactCount: countLinkedRowsIfPresent(db, 'task_artifacts', taskId),
    dispatchPipelineRemediationActivityCount: tableExists(db, 'activities')
      ? countRows(db, `
          SELECT COUNT(*) as count
          FROM activities
          WHERE workspace_id = ?
            AND entity_type = 'task'
            AND entity_id = ?
            AND (
              type LIKE 'dispatch%'
              OR type LIKE 'pipeline%'
              OR type LIKE 'remediation%'
              OR type LIKE 'task_pipeline%'
            )
        `, [workspaceId, taskId])
      : 0,
    optionalFutureTableChecks,
  }
}

export function summarizeOperatorSyncResult(
  repository: string,
  issueNumber: number,
  error: unknown,
): PilotEligibilityResult {
  return {
    eligible: false,
    error: 'sync_failed',
    operation: 'operator_sync',
    evidence: {
      repository,
      issueNumber,
      message: redactPilotEvidence(error instanceof Error ? error.message : String(error)),
    },
  }
}

export function normalizePilotLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of labels) {
    const label = raw.trim().toLowerCase()
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}

function parsePilotAreaLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    if (!label.startsWith('area:')) continue
    const slug = label.slice('area:'.length)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
  }
  return out
}

function ineligible(
  candidate: PilotIssueCandidate,
  reason: PilotEligibilityReason,
  evidence: Record<string, unknown>,
): PilotEligibilityResult {
  return {
    eligible: false,
    repository: candidate.repository,
    issueNumber: candidate.issueNumber,
    reason,
    evidence,
  }
}

function parseCandidate(input: unknown): { ok: true; value: PilotIssueCandidate } | { ok: false; evidence: Record<string, unknown> } {
  if (!input || typeof input !== 'object') return { ok: false, evidence: { shape: typeof input } }
  const record = input as Record<string, unknown>
  const repository = record['repository']
  const issueNumber = record['issueNumber']
  const title = record['title']
  const state = record['state']
  const isPullRequest = record['isPullRequest']
  const linkedPullRequest = record['linkedPullRequest']
  const labels = record['labels']

  if (
    typeof repository !== 'string'
    || typeof issueNumber !== 'number'
    || !Number.isInteger(issueNumber)
    || issueNumber <= 0
    || typeof title !== 'string'
    || (state !== 'open' && state !== 'closed')
    || typeof isPullRequest !== 'boolean'
    || typeof linkedPullRequest !== 'boolean'
    || !Array.isArray(labels)
    || labels.some((label) => typeof label !== 'string')
  ) {
    return {
      ok: false,
      evidence: {
        has_repository: typeof repository === 'string',
        has_issue_number: typeof issueNumber === 'number',
        has_title: typeof title === 'string',
        has_state: state === 'open' || state === 'closed',
        has_issue_identity: typeof isPullRequest === 'boolean',
        has_linked_pr_evidence: typeof linkedPullRequest === 'boolean',
        has_labels: Array.isArray(labels),
      },
    }
  }

  return {
    ok: true,
    value: {
      repository,
      issueNumber,
      title,
      state,
      isPullRequest,
      linkedPullRequest,
      labels: labels as string[],
    },
  }
}

function findDuplicateSyncedTask(
  db: Database.Database,
  workspaceId: number,
  repository: string,
  issueNumber: number,
): DuplicateTaskRow | null {
  const row = db.prepare(`
    SELECT id
    FROM tasks
    WHERE workspace_id = ?
      AND github_repo = ?
      AND github_issue_number = ?
      AND github_synced_at IS NOT NULL
    ORDER BY id ASC
    LIMIT 1
  `).get(workspaceId, repository, issueNumber) as DuplicateTaskRow | undefined
  return row ?? null
}

function resolveSingleAreaProjectId(db: Database.Database, workspaceId: number, areaSlug: string): number | null {
  const row = db.prepare(`
    SELECT id
    FROM projects
    WHERE workspace_id = ?
      AND area_slug = ?
    ORDER BY id ASC
    LIMIT 2
  `).all(workspaceId, areaSlug) as { id: number }[]

  return row.length === 1 ? row[0]?.id ?? null : null
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) as
    | { ok: number }
    | undefined
  return row?.ok === 1
}

function tableColumns(db: Database.Database, tableName: string): Set<string> {
  if (!tableExists(db, tableName)) return new Set()
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

function countLinkedRowsIfPresent(db: Database.Database, tableName: string, taskId: number): number {
  if (!tableExists(db, tableName)) return 0
  const columns = tableColumns(db, tableName)
  if (columns.has('task_id')) {
    return countRows(db, `SELECT COUNT(*) as count FROM ${tableName} WHERE task_id = ?`, [taskId])
  }
  if (columns.has('entity_id')) {
    return countRows(db, `SELECT COUNT(*) as count FROM ${tableName} WHERE entity_id = ?`, [taskId])
  }
  return 0
}

function countRows(db: Database.Database, sql: string, params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { count: number } | undefined
  return row?.count ?? 0
}

function redactPilotEvidence(value: string): string {
  return value
    .replace(GITHUB_TOKEN_PATTERN, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
}
