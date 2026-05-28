import { DetectorScanError, detectSecrets } from './secret-detector'
import {
  deriveTaskStageKey,
  isTaskControlPlaneEnabled,
  validateGitHubRepositoryFullName,
} from './task-claim-reconciliation'
import { appendTaskStageAttemptEvent } from './task-stage-attempts'
import type {
  ClaimControlAction,
  ClaimControlExpectedState,
  ClaimControlOutcome,
  ClaimControlRequestBody,
  ClaimControlSanitizedErrorCategory,
} from './task-claim-control-types'
import type Database from 'better-sqlite3'

type ActorRole = 'operator' | 'admin'

interface TaskRow {
  readonly id: number
  readonly workspace_id: number
  readonly status: string | null
  readonly assigned_to: string | null
  readonly workflow_template_id: number | null
  readonly workflow_template_slug: string | null
  readonly github_repo: string | null
  readonly github_issue_number: number | null
  readonly github_pr_state: string | null
  readonly github_issue_state: string | null
}

interface ClaimRow {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly task_stage_attempt_id: number
  readonly claim_state: 'active' | 'released' | 'stale_recovered'
  readonly claim_run_id: string
  readonly release_reason: string | null
  readonly metadata_json: string | null
}

interface AttemptRow {
  readonly id: number
  readonly status: string
}

export interface ApplyTaskClaimControlInput {
  readonly taskId: number
  readonly workspaceId: number
  readonly action: ClaimControlAction
  readonly stageKey: string
  readonly expected: ClaimControlExpectedState
  readonly overrideBackoff: boolean
  readonly overrideReason: string | null
  readonly reason: string | null
  readonly clientCorrelationId: string | null
  readonly actor: {
    readonly userId: number
    readonly username: string
    readonly role: ActorRole
  }
  readonly now?: number
}

export interface ClaimControlResponseEnvelope {
  readonly schema_version: 'task_claim_control.v1'
  readonly task: {
    readonly id: string
    readonly workspace_id: string
    readonly status: string | null
    readonly stage_key: string
  } | null
  readonly action: ClaimControlAction
  readonly outcome: ClaimControlOutcome
  readonly claim: {
    readonly id: string
    readonly claim_state: 'active' | 'released' | 'stale_recovered'
    readonly release_reason: string | null
  } | null
  readonly attempt: {
    readonly id: string
    readonly status: string
  } | null
  readonly backoff: {
    readonly decision: 'not_active' | 'active' | 'overridden'
    readonly seconds_remaining: number
    readonly next_retry_at: number | null
    readonly override_applied: boolean
    readonly override_reason: string | null
  }
  readonly available_actions: []
  readonly audit: {
    readonly activity_id: string | null
    readonly activity_type: string | null
    readonly redaction_applied: boolean
  }
  readonly idempotency?: unknown
  readonly correlation_id: string | null
  readonly diagnostics: {
    readonly warnings: string[]
    readonly sanitized_error_category: ClaimControlSanitizedErrorCategory | null
  }
}

export interface ApplyTaskClaimControlResult {
  readonly status: 200 | 403 | 404 | 409 | 422 | 500
  readonly body: ClaimControlResponseEnvelope
  readonly activityId: number | null
}

interface AuditWrite {
  readonly id: number
  readonly redactionApplied: boolean
}

const RELEASE_REASON_BY_ACTION = {
  retry: 'operator_retry_requested',
  release: 'operator_released',
  cancel: 'operator_cancelled',
} as const satisfies Record<ClaimControlAction, string>

const ATTEMPT_STATUS_BY_ACTION = {
  retry: 'released',
  release: 'released',
  cancel: 'cancelled',
} as const satisfies Record<ClaimControlAction, 'released' | 'cancelled'>

const ACTIVITY_TYPE_BY_ACTION = {
  retry: 'task_stage_claim_control_retry',
  release: 'task_stage_claim_control_release',
  cancel: 'task_stage_claim_control_cancel',
} as const satisfies Record<ClaimControlAction, string>

const RETRYABLE_ATTEMPT_STATUSES = new Set(['failed', 'cancelled', 'released'])

export function claimControlModuleReady(): { readonly ok: true } {
  return { ok: true }
}

export function inputFromValidatedRequest(
  taskId: number,
  workspaceId: number,
  request: ClaimControlRequestBody,
  actor: ApplyTaskClaimControlInput['actor'],
  now?: number,
): ApplyTaskClaimControlInput {
  const input: ApplyTaskClaimControlInput = {
    taskId,
    workspaceId,
    action: request.action,
    stageKey: request.stage_key,
    expected: request.expected,
    overrideBackoff: request.override_backoff,
    overrideReason: request.override_reason,
    reason: request.reason,
    clientCorrelationId: request.client_correlation_id,
    actor,
  }
  return now === undefined ? input : { ...input, now }
}

export function applyTaskClaimControl(
  db: Database.Database,
  input: ApplyTaskClaimControlInput,
): ApplyTaskClaimControlResult {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const task = readTask(db, input.workspaceId, input.taskId)
  if (!task) {
    return result(input, null, null, null, 'validation_error', 404, null, 'task_not_found')
  }

  const stageKey = deriveTaskStageKey(task)
  if (input.stageKey !== stageKey) {
    return result(input, task, null, null, 'validation_error', 404, null, 'stage_not_found')
  }

  if (!isTaskControlPlaneEnabled(db, task.workspace_id)) {
    return result(input, task, null, null, 'flag_off', 403, null, 'feature_flag_disabled')
  }

  try {
    return db.transaction(() => applyTaskClaimControlInTransaction(db, input, task, stageKey, now))()
  } catch (error) {
    if (error instanceof DetectorScanError) {
      const audit = writeSemanticAudit(db, {
        task,
        input,
        stageKey,
        outcome: 'validation_error',
        category: 'redaction_failed',
        now,
        claim: null,
        attempt: null,
      })
      return result(input, task, null, null, 'validation_error', 422, audit, 'redaction_failed')
    }
    return result(input, task, null, null, 'conflict', 500, null, 'internal_error')
  }
}

function applyTaskClaimControlInTransaction(
  db: Database.Database,
  input: ApplyTaskClaimControlInput,
  task: TaskRow,
  stageKey: string,
  now: number,
): ApplyTaskClaimControlResult {
  const active = readActiveClaim(db, task.workspace_id, task.id, stageKey)
  const latestAttempt = readLatestAttempt(db, task.workspace_id, task.id, stageKey)
  const retryBlock = input.action === 'retry' ? retryTaskIneligibleReason(task) : null
  if (retryBlock !== null) {
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'not_eligible',
      category: 'not_eligible',
      now,
      claim: active,
      attempt: latestAttempt,
      reason: retryBlock,
    })
    return result(input, task, active, latestAttempt, 'not_eligible', 409, audit, 'not_eligible')
  }

  if (active) {
    const staleReason = activeExpectedMismatch(input.expected, active, latestAttempt)
    if (staleReason) {
      const audit = writeSemanticAudit(db, {
        task,
        input,
        stageKey,
        outcome: 'stale_state',
        category: 'stale_state',
        now,
        claim: active,
        attempt: latestAttempt,
        reason: staleReason,
      })
      return result(input, task, active, latestAttempt, 'stale_state', 409, audit, 'stale_state')
    }

    const released = releaseActiveClaimForOperator(db, {
      task,
      claim: active,
      attempt: latestAttempt,
      input,
      now,
      stageKey,
    })
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: input.action === 'cancel' ? 'cancelled' : input.action === 'release' ? 'released' : 'retry_ready',
      category: null,
      now,
      claim: released,
      attempt: readAttemptById(db, active.task_stage_attempt_id),
      releaseReason: RELEASE_REASON_BY_ACTION[input.action],
    })
    return result(
      input,
      task,
      released,
      readAttemptById(db, active.task_stage_attempt_id),
      input.action === 'cancel' ? 'cancelled' : input.action === 'release' ? 'released' : 'retry_ready',
      200,
      audit,
      null,
      backoffDecision(db, task, now, input, 'not_active'),
    )
  }

  const alreadyApplied = alreadyAppliedClaim(db, input, task.workspace_id, task.id, stageKey)
  if (alreadyApplied && input.action !== 'retry') {
    const attempt = readAttemptById(db, alreadyApplied.task_stage_attempt_id)
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'already_applied',
      category: null,
      now,
      claim: alreadyApplied,
      attempt,
      releaseReason: alreadyApplied.release_reason,
    })
    return result(input, task, alreadyApplied, attempt, 'already_applied', 200, audit, null)
  }

  if (input.action === 'release') {
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'not_eligible',
      category: 'not_eligible',
      now,
      claim: null,
      attempt: latestAttempt,
      reason: 'no_active_claim',
    })
    return result(input, task, null, latestAttempt, 'not_eligible', 409, audit, 'not_eligible')
  }

  if (input.action === 'cancel') {
    if (latestAttempt?.status !== 'running') {
      const audit = writeSemanticAudit(db, {
        task,
        input,
        stageKey,
        outcome: 'not_eligible',
        category: 'not_eligible',
        now,
        claim: null,
        attempt: latestAttempt,
        reason: 'no_cancellable_attempt',
      })
      return result(input, task, null, latestAttempt, 'not_eligible', 409, audit, 'not_eligible')
    }
    const staleReason = attemptExpectedMismatch(input.expected, latestAttempt)
    if (staleReason) {
      const audit = writeSemanticAudit(db, {
        task,
        input,
        stageKey,
        outcome: 'stale_state',
        category: 'stale_state',
        now,
        claim: null,
        attempt: latestAttempt,
        reason: staleReason,
      })
      return result(input, task, null, latestAttempt, 'stale_state', 409, audit, 'stale_state')
    }
    appendOperatorAttemptEvent(db, latestAttempt.id, 'cancelled', input, 'Task stage cancelled by operator')
    const attempt = readAttemptById(db, latestAttempt.id)
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'cancelled',
      category: null,
      now,
      claim: null,
      attempt,
      releaseReason: 'operator_cancelled',
    })
    return result(input, task, null, attempt, 'cancelled', 200, audit, null)
  }

  const retryAttempt = latestAttempt
  if (!retryAttempt || !RETRYABLE_ATTEMPT_STATUSES.has(retryAttempt.status)) {
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'not_eligible',
      category: 'not_eligible',
      now,
      claim: null,
      attempt: retryAttempt,
      reason: 'no_retryable_attempt',
    })
    return result(input, task, null, retryAttempt, 'not_eligible', 409, audit, 'not_eligible')
  }

  const staleReason = attemptExpectedMismatch(input.expected, retryAttempt)
  if (staleReason) {
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'stale_state',
      category: 'stale_state',
      now,
      claim: null,
      attempt: retryAttempt,
      reason: staleReason,
    })
    return result(input, task, null, retryAttempt, 'stale_state', 409, audit, 'stale_state')
  }

  const backoff = backoffDecision(db, task, now, input, input.overrideBackoff ? 'overridden' : 'active')
  if (backoff.decision === 'active' && !input.overrideBackoff) {
    const audit = writeSemanticAudit(db, {
      task,
      input,
      stageKey,
      outcome: 'retry_backoff_active',
      category: 'backoff_active',
      now,
      claim: null,
      attempt: retryAttempt,
      reason: 'backoff_active',
    })
    return result(input, task, null, retryAttempt, 'retry_backoff_active', 200, audit, null, backoff)
  }

  if (backoff.decision === 'overridden') {
    clearBackoff(db, task)
  }
  const audit = writeSemanticAudit(db, {
    task,
    input,
    stageKey,
    outcome: 'retry_ready',
    category: null,
    now,
    claim: null,
    attempt: retryAttempt,
    releaseReason: 'operator_retry_requested',
  })
  return result(input, task, null, retryAttempt, 'retry_ready', 200, audit, null, backoff)
}

function readTask(db: Database.Database, workspaceId: number, taskId: number): TaskRow | null {
  return (db.prepare(`
    SELECT id, workspace_id, status, assigned_to, workflow_template_id, workflow_template_slug,
           github_repo, github_issue_number, github_pr_state, github_issue_state
    FROM tasks
    WHERE id = ? AND workspace_id = ?
  `).get(taskId, workspaceId) as TaskRow | undefined) ?? null
}

function retryTaskIneligibleReason(task: TaskRow): string | null {
  if (task.status !== 'assigned') return 'task_terminal_or_not_assigned'
  if (!task.assigned_to || task.assigned_to.trim().length === 0) return 'missing_assignee'
  if (!validateGitHubRepositoryFullName(task.github_repo)) return 'missing_github_repo'
  if (!Number.isSafeInteger(task.github_issue_number) || (task.github_issue_number ?? 0) <= 0) return 'missing_github_issue_number'
  if (task.github_issue_state && ['closed', 'merged'].includes(task.github_issue_state.toLowerCase())) {
    return 'github_issue_terminal'
  }
  if (task.github_pr_state && ['closed', 'merged'].includes(task.github_pr_state.toLowerCase())) {
    return 'github_pr_terminal'
  }
  return null
}

function readActiveClaim(db: Database.Database, workspaceId: number, taskId: number, stageKey: string): ClaimRow | null {
  return (db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ? AND claim_state = 'active'
    LIMIT 1
  `).get(workspaceId, taskId, stageKey) as ClaimRow | undefined) ?? null
}

function readClaimById(db: Database.Database, workspaceId: number, taskId: number, stageKey: string, claimId: number): ClaimRow | null {
  return (db.prepare(`
    SELECT *
    FROM task_stage_claims
    WHERE id = ? AND workspace_id = ? AND task_id = ? AND stage_key = ?
    LIMIT 1
  `).get(claimId, workspaceId, taskId, stageKey) as ClaimRow | undefined) ?? null
}

function readLatestAttempt(db: Database.Database, workspaceId: number, taskId: number, stageKey: string): AttemptRow | null {
  return (db.prepare(`
    SELECT id, status
    FROM task_stage_attempts
    WHERE workspace_id = ? AND task_id = ? AND stage_key = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(workspaceId, taskId, stageKey) as AttemptRow | undefined) ?? null
}

function readAttemptById(db: Database.Database, attemptId: number): AttemptRow | null {
  return (db.prepare(`
    SELECT id, status
    FROM task_stage_attempts
    WHERE id = ?
    LIMIT 1
  `).get(attemptId) as AttemptRow | undefined) ?? null
}

function releaseActiveClaimForOperator(
  db: Database.Database,
  input: {
    readonly task: TaskRow
    readonly claim: ClaimRow
    readonly attempt: AttemptRow | null
    readonly input: ApplyTaskClaimControlInput
    readonly now: number
    readonly stageKey: string
  },
): ClaimRow {
  const releaseReason = RELEASE_REASON_BY_ACTION[input.input.action]
  const actorId = operatorActorId(input.input.actor.userId)
  const metadata = sanitizeAuditPayload({
    action: input.input.action,
    outcome: input.input.action === 'cancel' ? 'cancelled' : input.input.action === 'release' ? 'released' : 'retry_ready',
    reason: input.input.reason,
    override_reason: input.input.overrideReason,
    release_reason: releaseReason,
    stage_key: input.stageKey,
    client_correlation_id: input.input.clientCorrelationId,
  }).payload
  const changed = db.prepare(`
    UPDATE task_stage_claims
    SET claim_state = 'released',
        release_reason = ?,
        released_at = ?,
        released_by_run_id = ?,
        updated_at = ?,
        metadata_json = ?
    WHERE id = ?
      AND workspace_id = ?
      AND task_id = ?
      AND stage_key = ?
      AND claim_state = 'active'
  `).run(
    releaseReason,
    input.now,
    actorId,
    input.now,
    JSON.stringify(metadata),
    input.claim.id,
    input.task.workspace_id,
    input.task.id,
    input.stageKey,
  )
  if (changed.changes !== 1) {
    throw new Error('claim-control compare-and-set conflict')
  }
  appendOperatorAttemptEvent(
    db,
    input.claim.task_stage_attempt_id,
    ATTEMPT_STATUS_BY_ACTION[input.input.action],
    input.input,
    `Task stage claim ${input.input.action} requested by operator`,
  )
  return readClaimById(db, input.task.workspace_id, input.task.id, input.stageKey, input.claim.id) ?? input.claim
}

function appendOperatorAttemptEvent(
  db: Database.Database,
  attemptId: number,
  status: 'released' | 'cancelled',
  input: ApplyTaskClaimControlInput,
  message: string,
): void {
  appendTaskStageAttemptEvent(db, {
    attemptId,
    status,
    actorType: 'operator',
    actorId: operatorActorId(input.actor.userId),
    message,
    metadata: sanitizeAuditPayload({
      action: input.action,
      reason: input.reason,
      override_reason: input.overrideReason,
      client_correlation_id: input.clientCorrelationId,
    }).payload,
  })
}

function alreadyAppliedClaim(
  db: Database.Database,
  input: ApplyTaskClaimControlInput,
  workspaceId: number,
  taskId: number,
  stageKey: string,
): ClaimRow | null {
  const expectedClaimId = parsePositiveInteger(input.expected.claim_id)
  if (expectedClaimId === null) return null
  const claim = readClaimById(db, workspaceId, taskId, stageKey, expectedClaimId)
  if (claim?.claim_state !== 'released') return null
  if (claim.claim_run_id !== input.expected.claim_run_id) return null
  return claim.release_reason === RELEASE_REASON_BY_ACTION[input.action] ? claim : null
}

function activeExpectedMismatch(
  expected: ClaimControlExpectedState,
  active: ClaimRow,
  attempt: AttemptRow | null,
): string | null {
  if (expected.claim_id !== String(active.id)) return 'claim_id_mismatch'
  if (expected.claim_run_id !== active.claim_run_id) return 'claim_run_id_mismatch'
  if (attempt && expected.attempt_id !== String(attempt.id)) return 'attempt_id_mismatch'
  if (attempt && expected.attempt_status !== attempt.status) return 'attempt_status_mismatch'
  return null
}

function attemptExpectedMismatch(expected: ClaimControlExpectedState, attempt: AttemptRow): string | null {
  if (expected.attempt_id !== String(attempt.id)) return 'attempt_id_mismatch'
  if (expected.attempt_status !== attempt.status) return 'attempt_status_mismatch'
  return null
}

function backoffDecision(
  db: Database.Database,
  task: TaskRow,
  now: number,
  input: ApplyTaskClaimControlInput,
  requested: 'not_active' | 'active' | 'overridden',
): ClaimControlResponseEnvelope['backoff'] {
  const repo = validateGitHubRepositoryFullName(task.github_repo)
  const row = repo
    ? db.prepare(`
        SELECT next_retry_at, next_retry_reason, backoff_seconds
        FROM github_sync_lifecycle_controls
        WHERE workspace_id = ? AND github_repo = ?
        LIMIT 1
      `).get(task.workspace_id, repo) as { next_retry_at: number | null; next_retry_reason: string | null; backoff_seconds: number } | undefined
    : undefined
  const nextRetryAt = row?.next_retry_at ?? null
  const secondsRemaining = nextRetryAt !== null && nextRetryAt > now
    ? nextRetryAt - now
    : Math.max(0, row?.backoff_seconds ?? 0)
  const active = secondsRemaining > 0
  return {
    decision: requested === 'overridden' && active ? 'overridden' : active && requested === 'active' ? 'active' : 'not_active',
    seconds_remaining: active ? secondsRemaining : 0,
    next_retry_at: active ? nextRetryAt : null,
    override_applied: requested === 'overridden' && active,
    override_reason: requested === 'overridden' && active ? input.overrideReason : null,
  }
}

function clearBackoff(db: Database.Database, task: TaskRow): void {
  const repo = validateGitHubRepositoryFullName(task.github_repo)
  if (!repo) return
  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET next_retry_at = NULL,
        next_retry_reason = NULL,
        backoff_seconds = 0,
        consecutive_failures = 0,
        updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(Math.floor(Date.now() / 1000), task.workspace_id, repo)
}

function writeSemanticAudit(
  db: Database.Database,
  input: {
    readonly task: TaskRow
    readonly input: ApplyTaskClaimControlInput
    readonly stageKey: string
    readonly outcome: ClaimControlOutcome
    readonly category: ClaimControlSanitizedErrorCategory | null
    readonly now: number
    readonly claim: ClaimRow | null
    readonly attempt: AttemptRow | null
    readonly releaseReason?: string | null
    readonly reason?: string | null
  },
): AuditWrite {
  const activityType = input.outcome === 'already_applied'
    ? 'task_stage_claim_control_already_applied'
    : ACTIVITY_TYPE_BY_ACTION[input.input.action]
  const sanitized = sanitizeAuditPayload({
    action: input.input.action,
    outcome: input.outcome,
    reason: input.reason ?? input.input.reason,
    override_reason: input.input.overrideReason,
    stage_key: input.stageKey,
    claim_id: input.claim ? String(input.claim.id) : null,
    task_stage_attempt_id: input.attempt ? String(input.attempt.id) : null,
    release_reason: input.releaseReason ?? null,
    actor_user_id: String(input.input.actor.userId),
    client_correlation_id: input.input.clientCorrelationId,
    sanitized_error_category: input.category,
    redaction_applied: false,
  })
  const data = {
    ...sanitized.payload,
    redaction_applied: sanitized.redactionApplied,
  }
  const inserted = db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES (?, 'task', ?, ?, ?, ?, ?, ?)
  `).run(
    activityType,
    input.task.id,
    operatorActorId(input.input.actor.userId),
    `Task claim-control ${input.input.action}: ${input.outcome}`,
    JSON.stringify(data),
    input.task.workspace_id,
    input.now,
  )
  return {
    id: Number(inserted.lastInsertRowid),
    redactionApplied: sanitized.redactionApplied,
  }
}

function result(
  input: ApplyTaskClaimControlInput,
  task: TaskRow | null,
  claim: ClaimRow | null,
  attempt: AttemptRow | null,
  outcome: ClaimControlOutcome,
  status: ApplyTaskClaimControlResult['status'],
  audit: AuditWrite | null,
  category: ClaimControlSanitizedErrorCategory | null,
  backoff?: ClaimControlResponseEnvelope['backoff'],
): ApplyTaskClaimControlResult {
  return {
    status,
    body: {
      schema_version: 'task_claim_control.v1',
      task: task
        ? {
            id: String(task.id),
            workspace_id: String(task.workspace_id),
            status: task.status,
            stage_key: deriveTaskStageKey(task),
          }
        : null,
      action: input.action,
      outcome,
      claim: claim
        ? {
            id: String(claim.id),
            claim_state: claim.claim_state,
            release_reason: claim.release_reason,
          }
        : null,
      attempt: attempt ? { id: String(attempt.id), status: attempt.status } : null,
      backoff: backoff ?? {
        decision: 'not_active',
        seconds_remaining: 0,
        next_retry_at: null,
        override_applied: false,
        override_reason: null,
      },
      available_actions: [],
      audit: {
        activity_id: audit ? String(audit.id) : null,
        activity_type: audit ? activityTypeForOutcome(input.action, outcome) : null,
        redaction_applied: audit?.redactionApplied ?? false,
      },
      correlation_id: input.clientCorrelationId,
      diagnostics: {
        warnings: [],
        sanitized_error_category: category,
      },
    },
    activityId: audit?.id ?? null,
  }
}

function activityTypeForOutcome(action: ClaimControlAction, outcome: ClaimControlOutcome): string {
  return outcome === 'already_applied'
    ? 'task_stage_claim_control_already_applied'
    : ACTIVITY_TYPE_BY_ACTION[action]
}

function sanitizeAuditPayload(input: Record<string, unknown>): { payload: Record<string, unknown>; redactionApplied: boolean } {
  const allowed = new Set([
    'action',
    'outcome',
    'reason',
    'override_reason',
    'stage_key',
    'claim_id',
    'task_stage_attempt_id',
    'release_reason',
    'actor_user_id',
    'client_correlation_id',
    'sanitized_error_category',
    'redaction_applied',
  ])
  let redactionApplied = false
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue
    const sanitized = sanitizeScalar(value)
    if (sanitized.redacted) redactionApplied = true
    payload[key] = sanitized.value
  }
  return { payload, redactionApplied }
}

function sanitizeScalar(value: unknown): { value: unknown; redacted: boolean } {
  if (value === null || value === undefined) return { value: null, redacted: false }
  if (typeof value === 'number') return { value: Number.isFinite(value) ? value : null, redacted: false }
  if (typeof value === 'boolean') return { value, redacted: false }
  if (typeof value !== 'string') return { value: null, redacted: false }
  const detection = detectSecrets(value, 'text/plain')
  const redacted = String(detection.redacted)
  return {
    value: redacted.length > 512 ? `${redacted.slice(0, 512)}...` : redacted,
    redacted: detection.findings.length > 0 || redacted !== value,
  }
}

function operatorActorId(userId: number): string {
  return `operator:${String(userId)}`
}

function parsePositiveInteger(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
