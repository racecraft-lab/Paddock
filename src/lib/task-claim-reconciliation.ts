import { resolveFlag } from './feature-flags'
import { detectSecrets } from './secret-detector'
import {
  appendTaskStageAttemptEvent,
  createTaskStageAttempt,
  type TaskStageAttemptLifecycleStatus,
} from './task-stage-attempts'
import type Database from 'better-sqlite3'

export const TASK_STAGE_CLAIM_RELEASE_REASONS = Object.freeze([
  'launch_handoff_completed',
  'dispatch_failed',
  'task_terminal_done',
  'task_terminal_failed',
  'github_issue_terminal',
  'github_pr_terminal',
  'governance_blocked',
  'governance_deferred',
  'attempt_terminal_reconciled',
  'stale_claim_recovered',
  'boundary_error_deferred',
] as const)

export type TaskStageClaimReleaseReason =
  (typeof TASK_STAGE_CLAIM_RELEASE_REASONS)[number]

export const TASK_STAGE_CLAIM_OUTCOMES = Object.freeze([
  'claim_acquired',
  'duplicate_prevented',
  'released',
  'stale_recovered',
  'governance_deferred',
  'terminal_reconciled',
  'stale_truth_deferred',
  'boundary_deferred',
  'not_claimable',
  'flag_off_legacy',
] as const)

export type TaskStageClaimOutcome = (typeof TASK_STAGE_CLAIM_OUTCOMES)[number]

export const TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME: Record<Exclude<TaskStageClaimOutcome, 'flag_off_legacy'>, string> = {
  claim_acquired: 'task_stage_claim_acquired',
  duplicate_prevented: 'task_stage_claim_duplicate_prevented',
  released: 'task_stage_claim_released',
  stale_recovered: 'task_stage_claim_stale_recovered',
  governance_deferred: 'task_stage_claim_governance_deferred',
  terminal_reconciled: 'task_stage_claim_terminal_reconciled',
  stale_truth_deferred: 'task_stage_claim_stale_truth_deferred',
  boundary_deferred: 'task_stage_claim_boundary_deferred',
  not_claimable: 'task_stage_claim_not_claimable',
}

const DEFAULT_LEASE_SECONDS = 300
const MAX_LEASE_SECONDS = 600
const TERMINAL_TASK_RELEASE_REASONS: Record<string, Exclude<TaskStageClaimReleaseReason, 'stale_claim_recovered'>> = {
  done: 'task_terminal_done',
  failed: 'task_terminal_failed',
}
const TERMINAL_ATTEMPT_STATUSES = new Set<TaskStageAttemptLifecycleStatus>([
  'succeeded',
  'failed',
  'released',
  'cancelled',
])

interface TaskRow {
  readonly id: number
  readonly workspace_id: number
  readonly status: string | null
  readonly assigned_to: string | null
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly github_pr_number?: number | null
  readonly github_pr_state?: string | null
  readonly github_issue_state?: string | null
  readonly github_synced_at?: number | string | null
  readonly project_id: number | null
  readonly workflow_template_id?: number | null
  readonly workflow_template_slug?: string | null
}

interface ClaimRow {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly task_stage_attempt_id: number
  readonly claim_state: 'active' | 'released' | 'stale_recovered'
  readonly lease_owner: string
  readonly lease_run_id: string | null
  readonly lease_started_at: number
  readonly lease_expires_at: number
  readonly release_reason: TaskStageClaimReleaseReason | null
  readonly released_at: number | null
  readonly recovered_from_claim_id: number | null
  readonly metadata_json: string | null
  readonly created_at: number
  readonly updated_at: number
}

export type GovernanceDecision =
  | { readonly result: 'allow'; readonly policy_id?: string | number | null }
  | { readonly result: 'block' | 'defer'; readonly reason: string; readonly policy_id?: string | number | null }

export interface ReconcileAndAcquireTaskStageClaimInput {
  readonly taskId: number
  readonly workspaceId: number
  readonly leaseOwner: string
  readonly leaseRunId?: string | null
  readonly leaseSeconds?: number | null
  readonly now?: number
  readonly governanceDecision?: GovernanceDecision | null
  readonly correlationId?: string | null
}

export type ReconcileAndAcquireTaskStageClaimResult =
  | {
      readonly outcome: 'flag_off_legacy'
      readonly stage_key: string | null
      readonly active_claim_id: null
      readonly task_stage_attempt_id: null
      readonly reason: 'feature_flag_off'
    }
  | {
      readonly outcome: Exclude<TaskStageClaimOutcome, 'flag_off_legacy'>
      readonly stage_key: string
      readonly active_claim_id: number | null
      readonly task_stage_attempt_id: number | null
      readonly reason: string
      readonly release_reason?: TaskStageClaimReleaseReason
    }

export interface ReleaseTaskStageClaimInput {
  readonly claimId: number
  readonly workspaceId: number
  readonly taskId: number
  readonly reason: Exclude<TaskStageClaimReleaseReason, 'stale_claim_recovered'>
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}

export interface TaskClaimReconciliationEnvelope {
  readonly schema_version: 'task_claim_reconciliation.v1'
  readonly task: {
    readonly id: string
    readonly workspace_id: string
    readonly status: string | null
    readonly stage_key: string | null
    readonly github: {
      readonly repo: string | null
      readonly issue_number: number | null
      readonly pr_number: number | null
    }
  } | null
  readonly feature_flag: {
    readonly key: 'FEATURE_TASK_CONTROL_PLANE'
    readonly enabled: boolean
  }
  readonly eligibility: {
    readonly state: string
    readonly reason: string | null
  }
  readonly active_claim: SerializedClaim | null
  readonly claim_history: SerializedClaim[]
  readonly activities: SerializedClaimActivity[]
  readonly diagnostics: {
    readonly warnings: string[]
  }
}

export interface SerializedClaim {
  readonly id: string
  readonly stage_key: string
  readonly task_stage_attempt_id: string
  readonly claim_state: ClaimRow['claim_state']
  readonly lease_owner: string
  readonly lease_run_id: string | null
  readonly lease_started_at: number
  readonly lease_expires_at: number
  readonly release_reason: TaskStageClaimReleaseReason | null
  readonly released_at: number | null
  readonly recovered_from_claim_id: string | null
  readonly metadata: unknown
}

export interface SerializedClaimActivity {
  readonly id: string
  readonly type: string
  readonly created_at: number | null
  readonly data: unknown
}

export function normalizeClaimLeaseSeconds(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return DEFAULT_LEASE_SECONDS
  return Math.max(1, Math.min(Math.trunc(value), MAX_LEASE_SECONDS))
}

export function deriveTaskStageKey(task: Pick<TaskRow, 'workflow_template_slug' | 'workflow_template_id'>): string {
  const slug = typeof task.workflow_template_slug === 'string' ? task.workflow_template_slug.trim() : ''
  if (slug.length > 0) return slug
  if (Number.isSafeInteger(task.workflow_template_id ?? NaN) && (task.workflow_template_id ?? 0) > 0) {
    return `workflow-template-${String(task.workflow_template_id)}`
  }
  return 'assigned'
}

export function validateGitHubRepositoryFullName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value !== value.trim()) return null
  if (/[\s\x00-\x1F\x7F]/.test(value)) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.includes(':') || value.includes('?') || value.includes('#')) return null
  if (value.endsWith('.git')) return null
  const parts = value.split('/')
  if (parts.length !== 2) return null
  const [owner, repo] = parts
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..') return null
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return null
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null
  return value
}

export function isTaskControlPlaneEnabled(db: Database.Database, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as { feature_flags: string | null } | undefined
  return resolveFlag('FEATURE_TASK_CONTROL_PLANE', { workspaceFlags: row?.feature_flags ?? null })
}

export function reconcileAndAcquireTaskStageClaim(
  db: Database.Database,
  input: ReconcileAndAcquireTaskStageClaimInput,
): ReconcileAndAcquireTaskStageClaimResult {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const task = readTask(db, input.workspaceId, input.taskId)
  const stageKey = task ? deriveTaskStageKey(task) : 'assigned'

  if (!isTaskControlPlaneEnabled(db, input.workspaceId)) {
    return {
      outcome: 'flag_off_legacy',
      stage_key: task ? stageKey : null,
      active_claim_id: null,
      task_stage_attempt_id: null,
      reason: 'feature_flag_off',
    }
  }

  if (!task) {
    return notClaimable(db, input, stageKey, now, 'task_not_found')
  }

  const terminalReleaseReason = terminalReleaseReasonForTask(task)
  if (terminalReleaseReason) {
    releaseMatchingActiveClaims(db, task, stageKey, terminalReleaseReason, now, input.correlationId ?? null)
    return evidenceOnly(db, input, task, stageKey, 'terminal_reconciled', 'task_terminal', now, terminalReleaseReason)
  }

  const githubTerminalReleaseReason = terminalReleaseReasonForGitHub(task)
  if (githubTerminalReleaseReason) {
    releaseMatchingActiveClaims(db, task, stageKey, githubTerminalReleaseReason, now, input.correlationId ?? null)
    return evidenceOnly(db, input, task, stageKey, 'terminal_reconciled', 'github_terminal', now, githubTerminalReleaseReason)
  }

  const latestTerminalAttempt = readLatestTerminalAttempt(db, task.workspace_id, task.id, stageKey)
  if (latestTerminalAttempt) {
    releaseMatchingActiveClaims(db, task, stageKey, 'attempt_terminal_reconciled', now, input.correlationId ?? null)
    return evidenceOnly(db, input, task, stageKey, 'terminal_reconciled', 'attempt_terminal', now, 'attempt_terminal_reconciled')
  }

  const eligibility = validateClaimEligibility(db, task, now)
  if (!eligibility.ok) {
    return notClaimableOrDeferred(db, input, task, stageKey, now, eligibility.reason, eligibility.defer)
  }

  if (input.governanceDecision && input.governanceDecision.result !== 'allow') {
    const releaseReason = input.governanceDecision.result === 'block' ? 'governance_blocked' : 'governance_deferred'
    const outcome = 'governance_deferred'
    writeActivity(db, {
      task,
      type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME[outcome],
      description: `Task stage claim ${input.governanceDecision.result}ed by governance`,
      data: safeMetadata({
        outcome,
        reason: input.governanceDecision.reason,
        release_reason: releaseReason,
        policy_id: input.governanceDecision.policy_id ?? null,
        stage_key: stageKey,
        correlation_id: input.correlationId ?? null,
      }),
    })
    return {
      outcome,
      stage_key: stageKey,
      active_claim_id: null,
      task_stage_attempt_id: null,
      reason: input.governanceDecision.reason,
      release_reason: releaseReason,
    }
  }

  return db.transaction(() => {
    const expired = db.prepare(`
      SELECT *
      FROM task_stage_claims
      WHERE workspace_id = ?
        AND task_id = ?
        AND stage_key = ?
        AND claim_state = 'active'
        AND lease_expires_at <= ?
      ORDER BY id ASC
      LIMIT 1
    `).get(task.workspace_id, task.id, stageKey, now) as ClaimRow | undefined

    if (expired) {
      db.prepare(`
        UPDATE task_stage_claims
        SET claim_state = 'stale_recovered',
            release_reason = 'stale_claim_recovered',
            released_at = ?,
            updated_at = ?,
            metadata_json = ?
        WHERE id = ? AND claim_state = 'active'
      `).run(now, now, JSON.stringify(safeMetadata({ recovered_by: input.leaseOwner, correlation_id: input.correlationId ?? null })), expired.id)
      writeActivity(db, {
        task,
        type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME.stale_recovered,
        description: 'Recovered stale task stage claim',
        data: safeMetadata({
          outcome: 'stale_recovered',
          stale_claim_id: expired.id,
          stage_key: stageKey,
          lease_expires_at: expired.lease_expires_at,
          correlation_id: input.correlationId ?? null,
        }),
      })
    }

    const active = readActiveClaim(db, task.workspace_id, task.id, stageKey)
    if (active) {
      writeActivity(db, {
        task,
        type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME.duplicate_prevented,
        description: 'Prevented duplicate active task stage claim',
        data: safeMetadata({
          outcome: 'duplicate_prevented',
          active_claim_id: active.id,
          stage_key: stageKey,
          lease_expires_at: active.lease_expires_at,
          correlation_id: input.correlationId ?? null,
        }),
      })
      return {
        outcome: 'duplicate_prevented',
        stage_key: stageKey,
        active_claim_id: active.id,
        task_stage_attempt_id: active.task_stage_attempt_id,
        reason: 'active_claim_exists',
      } as const
    }

    const attemptNumber = nextAttemptNumber(db, task.workspace_id, task.id, stageKey)
    const attempt = createTaskStageAttempt(db, {
      workspaceId: task.workspace_id,
      taskId: task.id,
      stageKey,
      attemptNumber,
      status: 'running',
      actorType: 'system',
      actorId: input.leaseOwner,
      runId: input.leaseRunId ?? null,
      message: 'Task stage claim acquired',
      metadata: safeMetadata({
        claim_owner: input.leaseOwner,
        correlation_id: input.correlationId ?? null,
      }),
    })
    const leaseSeconds = normalizeClaimLeaseSeconds(input.leaseSeconds)
    const result = db.prepare(`
      INSERT INTO task_stage_claims (
        workspace_id,
        task_id,
        stage_key,
        task_stage_attempt_id,
        claim_state,
        lease_owner,
        lease_run_id,
        lease_started_at,
        lease_expires_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.workspace_id,
      task.id,
      stageKey,
      Number(attempt.id),
      input.leaseOwner,
      input.leaseRunId ?? null,
      now,
      now + leaseSeconds,
      JSON.stringify(safeMetadata({
        outcome: 'claim_acquired',
        github_repo: task.github_repo,
        github_issue_number: task.github_issue_number,
        lease_seconds: leaseSeconds,
        correlation_id: input.correlationId ?? null,
      })),
      now,
      now,
    )
    const claimId = Number(result.lastInsertRowid)
    writeActivity(db, {
      task,
      type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME.claim_acquired,
      description: 'Task stage claim acquired',
      data: safeMetadata({
        outcome: 'claim_acquired',
        claim_id: claimId,
        task_stage_attempt_id: Number(attempt.id),
        stage_key: stageKey,
        github_repo: task.github_repo,
        github_issue_number: task.github_issue_number,
        lease_expires_at: now + leaseSeconds,
        correlation_id: input.correlationId ?? null,
      }),
    })
    return {
      outcome: 'claim_acquired',
      stage_key: stageKey,
      active_claim_id: claimId,
      task_stage_attempt_id: Number(attempt.id),
      reason: 'claim_acquired',
    } as const
  })()
}

export function releaseTaskStageClaim(
  db: Database.Database,
  input: ReleaseTaskStageClaimInput,
): boolean {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const row = db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE id = ? AND workspace_id = ? AND task_id = ? AND claim_state = 'active'
  `).get(input.claimId, input.workspaceId, input.taskId) as ClaimRow | undefined
  if (!row) return false

  const changed = db.prepare(`
    UPDATE task_stage_claims
    SET claim_state = 'released',
        release_reason = ?,
        released_at = ?,
        updated_at = ?,
        metadata_json = ?
    WHERE id = ? AND claim_state = 'active'
  `).run(input.reason, now, now, JSON.stringify(safeMetadata(input.metadata ?? {})), input.claimId)

  if (changed.changes !== 1) return false
  const task = readTask(db, input.workspaceId, input.taskId)
  if (task) {
    appendTaskStageAttemptEvent(db, {
      attemptId: row.task_stage_attempt_id,
      status: input.reason === 'launch_handoff_completed' ? 'released' : 'failed',
      actorType: 'system',
      actorId: 'scheduler',
      message: `Task stage claim released: ${input.reason}`,
      metadata: safeMetadata({ outcome: 'released', release_reason: input.reason, claim_id: input.claimId }),
    })
    writeActivity(db, {
      task,
      type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME.released,
      description: 'Task stage claim released',
      data: safeMetadata({
        outcome: 'released',
        claim_id: input.claimId,
        task_stage_attempt_id: row.task_stage_attempt_id,
        stage_key: row.stage_key,
        release_reason: input.reason,
        ...input.metadata,
      }),
    })
  }
  return true
}

export function classifyClaimBoundaryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/unique|constraint/i.test(message)) return 'sqlite_constraint_duplicate'
  if (/busy|locked/i.test(message)) return 'sqlite_busy'
  if (/database|sqlite/i.test(message)) return 'database_error'
  if (/governance/i.test(message)) return 'governance_error'
  if (/malformed|invalid/i.test(message)) return 'malformed_input'
  return 'unknown'
}

export function buildTaskClaimReconciliationReadModel(
  db: Database.Database,
  input: { readonly taskId: number; readonly workspaceId: number; readonly historyLimit?: number },
): TaskClaimReconciliationEnvelope {
  const task = readTask(db, input.workspaceId, input.taskId)
  const enabled = isTaskControlPlaneEnabled(db, input.workspaceId)
  if (!task) {
    return {
      schema_version: 'task_claim_reconciliation.v1',
      task: null,
      feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled },
      eligibility: { state: 'not_claimable', reason: 'task_not_found' },
      active_claim: null,
      claim_history: [],
      activities: [],
      diagnostics: { warnings: [] },
    }
  }

  const stageKey = deriveTaskStageKey(task)
  const eligibility = validateClaimEligibility(db, task, Math.floor(Date.now() / 1000))
  const claims = readClaimHistory(db, input.workspaceId, input.taskId, input.historyLimit ?? 25)
  const activities = readClaimActivities(db, input.workspaceId, input.taskId, input.historyLimit ?? 25)
  const active = claims.find((claim) => claim.claim_state === 'active') ?? null
  return {
    schema_version: 'task_claim_reconciliation.v1',
    task: {
      id: String(task.id),
      workspace_id: String(task.workspace_id),
      status: task.status,
      stage_key: stageKey,
      github: {
        repo: validateGitHubRepositoryFullName(task.github_repo),
        issue_number: positiveIssueNumber(task.github_issue_number) ? task.github_issue_number : null,
        pr_number: positiveIssueNumber(task.github_pr_number ?? null) ? task.github_pr_number ?? null : null,
      },
    },
    feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled },
    eligibility: enabled
      ? { state: eligibility.ok ? 'claimable' : eligibility.defer ? 'stale_truth_deferred' : 'not_claimable', reason: eligibility.ok ? null : eligibility.reason }
      : { state: 'flag_off_legacy', reason: 'feature_flag_off' },
    active_claim: active ? serializeClaim(active) : null,
    claim_history: claims.map(serializeClaim),
    activities: activities.map((activity) => ({
      id: String(activity.id),
      type: activity.type,
      created_at: activity.created_at,
      data: safeParseJson(activity.data),
    })),
    diagnostics: { warnings: [] },
  }
}

function validateClaimEligibility(
  db: Database.Database,
  task: TaskRow,
  now: number,
): { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly defer?: boolean } {
  if (task.status !== 'assigned') return { ok: false, reason: 'not_assigned' }
  if (!task.assigned_to || task.assigned_to.trim().length === 0) return { ok: false, reason: 'missing_assignee' }
  const repo = validateGitHubRepositoryFullName(task.github_repo)
  if (!repo) return { ok: false, reason: task.github_repo ? 'invalid_github_repo' : 'missing_github_repo' }
  if (!positiveIssueNumber(task.github_issue_number)) return { ok: false, reason: 'missing_github_issue_number' }
  if (!hasSyncOwnerProject(db, task.workspace_id, repo, task.project_id)) return { ok: false, reason: 'workspace_repo_owner_missing' }
  const freshness = gitHubTruthFreshness(db, task, repo, now)
  if (!freshness.ok) return { ok: false, reason: freshness.reason, defer: true }
  return { ok: true }
}

function notClaimableOrDeferred(
  db: Database.Database,
  input: ReconcileAndAcquireTaskStageClaimInput,
  task: TaskRow,
  stageKey: string,
  now: number,
  reason: string,
  defer?: boolean,
): ReconcileAndAcquireTaskStageClaimResult {
  const outcome = defer ? 'stale_truth_deferred' : 'not_claimable'
  writeActivity(db, {
    task,
    type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME[outcome],
    description: defer ? 'Task stage claim deferred by stale GitHub truth' : 'Task is not claimable',
    data: safeMetadata({
      outcome,
      reason,
      stage_key: stageKey,
      observed_at: now,
      correlation_id: input.correlationId ?? null,
    }),
  })
  return {
    outcome,
    stage_key: stageKey,
    active_claim_id: null,
    task_stage_attempt_id: null,
    reason,
  }
}

function notClaimable(
  db: Database.Database,
  input: ReconcileAndAcquireTaskStageClaimInput,
  stageKey: string,
  now: number,
  reason: string,
): ReconcileAndAcquireTaskStageClaimResult {
  const task = { id: input.taskId, workspace_id: input.workspaceId, status: null, assigned_to: null, github_repo: null, github_issue_number: null, project_id: null }
  writeActivity(db, {
    task,
    type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME.not_claimable,
    description: 'Task is not claimable',
    data: safeMetadata({ outcome: 'not_claimable', reason, stage_key: stageKey, observed_at: now }),
  })
  return { outcome: 'not_claimable', stage_key: stageKey, active_claim_id: null, task_stage_attempt_id: null, reason }
}

function evidenceOnly(
  db: Database.Database,
  input: ReconcileAndAcquireTaskStageClaimInput,
  task: TaskRow,
  stageKey: string,
  outcome: 'terminal_reconciled' | 'boundary_deferred',
  reason: string,
  now: number,
  releaseReason?: TaskStageClaimReleaseReason,
): ReconcileAndAcquireTaskStageClaimResult {
  writeActivity(db, {
    task,
    type: TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME[outcome],
    description: outcome === 'terminal_reconciled' ? 'Task stage terminal state reconciled' : 'Task stage claim boundary deferred',
    data: safeMetadata({
      outcome,
      reason,
      stage_key: stageKey,
      release_reason: releaseReason ?? null,
      observed_at: now,
      correlation_id: input.correlationId ?? null,
    }),
  })
  const result: ReconcileAndAcquireTaskStageClaimResult = {
    outcome,
    stage_key: stageKey,
    active_claim_id: null,
    task_stage_attempt_id: null,
    reason,
  }
  return releaseReason ? { ...result, release_reason: releaseReason } : result
}

function readTask(db: Database.Database, workspaceId: number, taskId: number): TaskRow | null {
  return (db.prepare(`
    SELECT *
    FROM tasks
    WHERE id = ? AND workspace_id = ?
  `).get(taskId, workspaceId) as TaskRow | undefined) ?? null
}

function readActiveClaim(db: Database.Database, workspaceId: number, taskId: number, stageKey: string): ClaimRow | null {
  return (db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ? AND claim_state = 'active'
    LIMIT 1
  `).get(workspaceId, taskId, stageKey) as ClaimRow | undefined) ?? null
}

function readClaimHistory(db: Database.Database, workspaceId: number, taskId: number, limit: number): ClaimRow[] {
  return db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE workspace_id = ? AND task_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(workspaceId, taskId, Math.min(Math.max(limit, 1), 100)) as ClaimRow[]
}

function readClaimActivities(db: Database.Database, workspaceId: number, taskId: number, limit: number): { id: number; type: string; data: string | null; created_at: number | null }[] {
  return db.prepare(`
    SELECT id, type, data, created_at
    FROM activities
    WHERE workspace_id = ?
      AND entity_type = 'task'
      AND entity_id = ?
      AND type IN (${Object.values(TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME).map(() => '?').join(', ')})
    ORDER BY id DESC
    LIMIT ?
  `).all(workspaceId, taskId, ...Object.values(TASK_STAGE_CLAIM_ACTIVITY_BY_OUTCOME), Math.min(Math.max(limit, 1), 100)) as { id: number; type: string; data: string | null; created_at: number | null }[]
}

function hasSyncOwnerProject(db: Database.Database, workspaceId: number, repo: string, projectId: number | null): boolean {
  const row = db.prepare(`
    SELECT id
    FROM projects
    WHERE workspace_id = ?
      AND github_repo = ?
      AND COALESCE(github_sync_enabled, 0) = 1
      AND COALESCE(is_repo_sync_owner, 1) = 1
      AND (? IS NULL OR id = ? OR COALESCE(is_triage_project, 0) = 1)
    LIMIT 1
  `).get(workspaceId, repo, projectId, projectId) as { id: number } | undefined
  return !!row
}

function gitHubTruthFreshness(
  db: Database.Database,
  task: TaskRow,
  repo: string,
  now: number,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const control = db.prepare(`
    SELECT enabled, interval_seconds, last_completed_at, last_error
    FROM github_sync_lifecycle_controls
    WHERE workspace_id = ? AND github_repo = ?
    LIMIT 1
  `).get(task.workspace_id, repo) as { enabled: number; interval_seconds: number; last_completed_at: number | null; last_error: string | null } | undefined
  if (control?.enabled !== 1) return { ok: false, reason: 'github_lifecycle_disabled' }
  if (control.last_error) return { ok: false, reason: 'github_lifecycle_unhealthy' }
  const syncedAt = numericTimestamp(task.github_synced_at) ?? control.last_completed_at
  if (!syncedAt) return { ok: false, reason: 'github_truth_missing' }
  const threshold = Math.min(Math.max(2 * Math.max(control.interval_seconds, 300), 600), 3600)
  if (now - syncedAt > threshold) return { ok: false, reason: 'github_truth_stale' }
  return { ok: true }
}

function terminalReleaseReasonForTask(task: TaskRow): Exclude<TaskStageClaimReleaseReason, 'stale_claim_recovered'> | null {
  if (!task.status) return null
  return TERMINAL_TASK_RELEASE_REASONS[task.status] ?? null
}

function terminalReleaseReasonForGitHub(task: TaskRow): Exclude<TaskStageClaimReleaseReason, 'stale_claim_recovered'> | null {
  if (task.github_issue_state && ['closed', 'merged'].includes(task.github_issue_state.toLowerCase())) {
    return 'github_issue_terminal'
  }
  if (task.github_pr_state && ['closed', 'merged'].includes(task.github_pr_state.toLowerCase())) {
    return 'github_pr_terminal'
  }
  return null
}

function readLatestTerminalAttempt(
  db: Database.Database,
  workspaceId: number,
  taskId: number,
  stageKey: string,
): { readonly id: number; readonly status: TaskStageAttemptLifecycleStatus } | null {
  const row = db.prepare(`
    SELECT id, status
    FROM task_stage_attempts
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(workspaceId, taskId, stageKey) as { id: number; status: TaskStageAttemptLifecycleStatus } | undefined
  return row && TERMINAL_ATTEMPT_STATUSES.has(row.status) ? row : null
}

function releaseMatchingActiveClaims(
  db: Database.Database,
  task: TaskRow,
  stageKey: string,
  reason: Exclude<TaskStageClaimReleaseReason, 'stale_claim_recovered'>,
  now: number,
  correlationId: string | null,
): void {
  const claims = db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ? AND claim_state = 'active'
  `).all(task.workspace_id, task.id, stageKey) as ClaimRow[]
  for (const claim of claims) {
    releaseTaskStageClaim(db, {
      claimId: claim.id,
      workspaceId: task.workspace_id,
      taskId: task.id,
      reason,
      now,
      metadata: { correlation_id: correlationId },
    })
  }
}

function nextAttemptNumber(db: Database.Database, workspaceId: number, taskId: number, stageKey: string): number {
  const row = db.prepare(`
    SELECT COALESCE(MAX(attempt_number), 0) + 1 as next
    FROM task_stage_attempts
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ?
  `).get(workspaceId, taskId, stageKey) as { next: number }
  return row.next
}

function writeActivity(
  db: Database.Database,
  input: {
    readonly task: Pick<TaskRow, 'id' | 'workspace_id'>
    readonly type: string
    readonly description: string
    readonly data: Record<string, unknown>
  },
): void {
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    VALUES (?, 'task', ?, 'scheduler', ?, ?, ?)
  `).run(input.type, input.task.id, input.description, JSON.stringify(input.data), input.task.workspace_id)
}

function safeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    'outcome',
    'reason',
    'release_reason',
    'stage_key',
    'claim_id',
    'active_claim_id',
    'stale_claim_id',
    'task_stage_attempt_id',
    'github_repo',
    'github_issue_number',
    'github_pr_number',
    'lease_seconds',
    'lease_expires_at',
    'correlation_id',
    'policy_id',
    'observed_at',
    'recovered_by',
    'boundary_category',
    'redacted',
  ])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue
    out[key] = sanitizeScalar(value)
  }
  return out
}

function sanitizeScalar(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const detection = detectSecrets(value, 'text/plain')
  const redacted = typeof detection.redacted === 'string' ? detection.redacted : ''
  return redacted.length > 256 ? `${redacted.slice(0, 256)}...` : redacted
}

function serializeClaim(row: ClaimRow): SerializedClaim {
  return {
    id: String(row.id),
    stage_key: row.stage_key,
    task_stage_attempt_id: String(row.task_stage_attempt_id),
    claim_state: row.claim_state,
    lease_owner: row.lease_owner,
    lease_run_id: row.lease_run_id,
    lease_started_at: row.lease_started_at,
    lease_expires_at: row.lease_expires_at,
    release_reason: row.release_reason,
    released_at: row.released_at,
    recovered_from_claim_id: row.recovered_from_claim_id === null ? null : String(row.recovered_from_claim_id),
    metadata: safeParseJson(row.metadata_json),
  }
}

function positiveIssueNumber(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
}

function numericTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value !== 'string' || value.trim() === '') return null
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return Math.trunc(numeric)
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
