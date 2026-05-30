import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTaskClaimControl } from '../task-claim-control'
import {
  CLAIM_CONTROL_ACTIONS,
  CLAIM_CONTROL_OUTCOMES,
  CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES,
  validateClaimControlRequestBody,
} from '../task-claim-control-types'
import { reconcileAndAcquireTaskStageClaim } from '../task-claim-reconciliation'
import { appendTaskStageAttemptEvent, createTaskStageAttempt } from '../task-stage-attempts'
import { activityTypes, openTaskClaimDb, seedClaimableTask } from './task-claim-reconciliation-fixtures'

const openDbs: ReturnType<typeof openTaskClaimDb>[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function db() {
  const claimDb = openTaskClaimDb()
  openDbs.push(claimDb)
  return claimDb
}

function operatorInput(overrides: Partial<Parameters<typeof applyTaskClaimControl>[1]> = {}): Parameters<typeof applyTaskClaimControl>[1] {
  return {
    taskId: 100,
    workspaceId: 1,
    action: 'retry',
    stageKey: 'dev_implementation',
    expected: {},
    overrideBackoff: false,
    overrideReason: null,
    reason: 'operator confirmed retry',
    clientCorrelationId: 'spec013c-test',
    actor: { userId: 2, username: 'operator-a', role: 'operator' },
    now: 1770000100,
    ...overrides,
  }
}

describe('task claim-control closed contracts', () => {
  it('defines closed action, outcome, and sanitized error vocabularies', () => {
    expect(CLAIM_CONTROL_ACTIONS).toEqual(['retry', 'release', 'cancel'])
    expect(CLAIM_CONTROL_OUTCOMES).toEqual([
      'retry_ready',
      'retry_backoff_active',
      'released',
      'cancelled',
      'already_applied',
      'stale_state',
      'conflict',
      'not_eligible',
      'flag_off',
      'unauthorized',
      'validation_error',
    ])
    expect(CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES).toContain('idempotency_key_body_mismatch')
    expect(CLAIM_CONTROL_SANITIZED_ERROR_CATEGORIES).toContain('redaction_failed')
  })

  it('validates request bodies and backoff override reason requirements', () => {
    expect(validateClaimControlRequestBody({
      action: 'retry',
      stage_key: 'dev',
      expected: { attempt_id: '12', attempt_status: 'failed' },
      override_backoff: true,
      override_reason: 'operator verified issue is clear',
      client_correlation_id: 'uat-1',
    })).toMatchObject({
      ok: true,
      value: {
        action: 'retry',
        stage_key: 'dev',
        override_backoff: true,
        override_reason: 'operator verified issue is clear',
      },
    })

    expect(validateClaimControlRequestBody({ action: 'restart', stage_key: 'dev', expected: {} })).toMatchObject({
      ok: false,
      code: 'invalid_action',
    })
    expect(validateClaimControlRequestBody({ action: 'retry', stage_key: ' ', expected: {} })).toMatchObject({
      ok: false,
      code: 'invalid_stage_key',
    })
    expect(validateClaimControlRequestBody({
      action: 'retry',
      stage_key: 'dev',
      expected: {},
      override_backoff: true,
    })).toMatchObject({
      ok: false,
      code: 'missing_override_reason',
    })
  })
})

describe('task claim-control static boundary', () => {
  it('keeps claim-control source out of forbidden authorities', () => {
    const sourcePaths = [
      'src/lib/task-claim-control.ts',
      'src/app/api/tasks/[id]/claim-control/route.ts',
    ]
    const forbidden = [
      'advanceTaskChain',
      'createTask',
      '@/lib/github',
      '@/lib/adapters',
      '@/lib/sandbox',
      'src/components',
      'mcp',
    ]

    for (const sourcePath of sourcePaths) {
      const absolute = join(process.cwd(), sourcePath)
      const source = readFileSync(absolute, 'utf8')
      for (const token of forbidden) {
        expect(source, `${sourcePath} must not contain ${token}`).not.toContain(token)
      }
    }
  })
})

describe('task claim-control domain actions', () => {
  it('retries an active claim by retiring ownership with operator_retry_requested and no task terminal mutation', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const acquired = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'claim-run-1',
      now: 1770000000,
    })

    const result = applyTaskClaimControl(claimDb, operatorInput({
      expected: {
        claim_id: String(acquired.active_claim_id),
        claim_run_id: 'claim-run-1',
        attempt_id: String(acquired.task_stage_attempt_id),
        attempt_status: 'running',
      },
    }))

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      schema_version: 'task_claim_control.v1',
      action: 'retry',
      outcome: 'retry_ready',
      claim: { id: String(acquired.active_claim_id), claim_state: 'released', release_reason: 'operator_retry_requested' },
      attempt: { id: String(acquired.task_stage_attempt_id), status: 'released' },
      audit: { activity_type: 'task_stage_claim_control_retry' },
    })
    expect(claimDb.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'assigned' })
    expect(claimDb.prepare('SELECT release_reason FROM task_stage_claims WHERE id = ?').get(acquired.active_claim_id)).toEqual({
      release_reason: 'operator_retry_requested',
    })
    expect(activityTypes(claimDb)).toEqual(['task_stage_claim_acquired', 'task_stage_claim_control_retry'])
  })

  it('releases and cancels active claims with compare-and-set state and lifecycle evidence', () => {
    const releaseDb = db()
    seedClaimableTask(releaseDb)
    const releaseClaim = reconcileAndAcquireTaskStageClaim(releaseDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'release-run',
      now: 1770000000,
    })
    const released = applyTaskClaimControl(releaseDb, operatorInput({
      action: 'release',
      expected: {
        claim_id: String(releaseClaim.active_claim_id),
        claim_run_id: 'release-run',
        attempt_id: String(releaseClaim.task_stage_attempt_id),
        attempt_status: 'running',
      },
    }))
    expect(released.body).toMatchObject({
      outcome: 'released',
      claim: { release_reason: 'operator_released' },
      attempt: { status: 'released' },
      audit: { activity_type: 'task_stage_claim_control_release' },
    })

    const cancelDb = db()
    seedClaimableTask(cancelDb)
    const cancelClaim = reconcileAndAcquireTaskStageClaim(cancelDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'cancel-run',
      now: 1770000000,
    })
    const cancelled = applyTaskClaimControl(cancelDb, operatorInput({
      action: 'cancel',
      expected: {
        claim_id: String(cancelClaim.active_claim_id),
        claim_run_id: 'cancel-run',
        attempt_id: String(cancelClaim.task_stage_attempt_id),
        attempt_status: 'running',
      },
    }))
    expect(cancelled.body).toMatchObject({
      outcome: 'cancelled',
      claim: { release_reason: 'operator_cancelled' },
      attempt: { status: 'cancelled' },
      audit: { activity_type: 'task_stage_claim_control_cancel' },
    })
  })

  it('blocks automatic pickup after cancel until an explicit retry action unblocks the stage', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const acquired = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'cancel-run',
      now: 1770000000,
    })
    applyTaskClaimControl(claimDb, operatorInput({
      action: 'cancel',
      expected: {
        claim_id: String(acquired.active_claim_id),
        claim_run_id: 'cancel-run',
        attempt_id: String(acquired.task_stage_attempt_id),
        attempt_status: 'running',
      },
      now: 1770000100,
    }))

    const blocked = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'automatic-after-cancel',
      now: 1770000200,
    })
    expect(blocked).toMatchObject({ outcome: 'not_claimable', reason: 'operator_cancelled' })

    const retry = applyTaskClaimControl(claimDb, operatorInput({
      expected: {
        attempt_id: String(acquired.task_stage_attempt_id),
        attempt_status: 'cancelled',
      },
      now: 1770000300,
    }))
    expect(retry.body).toMatchObject({ outcome: 'retry_ready', claim: null })
    const unblocked = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'automatic-after-retry',
      now: 1770000400,
    })
    expect(unblocked).toMatchObject({ outcome: 'claim_acquired' })
  })

  it('returns stale_state without mutation when expected active state no longer matches', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'fresh-run',
      now: 1770000000,
    })

    const result = applyTaskClaimControl(claimDb, operatorInput({
      action: 'release',
      expected: {
        claim_id: '999',
        claim_run_id: 'stale-run',
        attempt_id: '999',
        attempt_status: 'running',
      },
    }))

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({
      outcome: 'stale_state',
      diagnostics: { sanitized_error_category: 'stale_state' },
    })
    expect(claimDb.prepare("SELECT COUNT(*) as count FROM task_stage_claims WHERE claim_state = 'active'").get()).toEqual({ count: 1 })
  })

  it('rejects retry for terminal, non-assigned, local-only, repo-only, and terminal GitHub states', () => {
    const cases = [
      { title: 'done task', values: { status: 'done' }, reason: 'task_terminal_or_not_assigned', expectedStatus: 'done' },
      { title: 'unassigned task', values: { assigned_to: null }, reason: 'missing_assignee', expectedStatus: 'assigned' },
      { title: 'local-only task', values: { github_repo: null }, reason: 'missing_github_repo', expectedStatus: 'assigned' },
      { title: 'repo-only task', values: { github_issue_number: null }, reason: 'missing_github_issue_number', expectedStatus: 'assigned' },
      { title: 'closed issue task', values: { github_issue_state: 'closed' }, reason: 'github_issue_terminal', expectedStatus: 'assigned' },
      { title: 'merged pull request task', values: { github_pr_state: 'merged' }, reason: 'github_pr_terminal', expectedStatus: 'assigned' },
    ] as const

    for (const testCase of cases) {
      const claimDb = db()
      seedClaimableTask(claimDb, testCase.values)

      const result = applyTaskClaimControl(claimDb, operatorInput())

      expect(result.status, testCase.title).toBe(409)
      expect(result.body, testCase.title).toMatchObject({
        outcome: 'not_eligible',
        diagnostics: { sanitized_error_category: 'not_eligible' },
      })
      expect(JSON.stringify(claimDb.prepare(`
        SELECT data FROM activities WHERE type = 'task_stage_claim_control_retry' ORDER BY id DESC LIMIT 1
      `).get()), testCase.title).toContain(testCase.reason)
      expect(claimDb.prepare('SELECT status FROM tasks WHERE id = 100').get(), testCase.title).toEqual({
        status: testCase.expectedStatus,
      })
    }
  })

  it('respects retry backoff unless an override reason is supplied and redacts persisted operator text', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const attempt = createTaskStageAttempt(claimDb, {
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      attemptNumber: 1,
      status: 'running',
      actorType: 'system',
      actorId: 'scheduler',
    })
    appendTaskStageAttemptEvent(claimDb, {
      attemptId: Number(attempt.id),
      status: 'failed',
      actorType: 'system',
      actorId: 'scheduler',
    })
    claimDb.prepare(`
      UPDATE github_sync_lifecycle_controls
      SET next_retry_at = 1770000500,
          next_retry_reason = 'github_rate_limited',
          backoff_seconds = 400
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/mission-control'
    `).run()

    const blocked = applyTaskClaimControl(claimDb, operatorInput({
      expected: {
        attempt_id: attempt.id,
        attempt_status: 'failed',
      },
      reason: 'AKIAIOSFODNN7EXAMPLE',
      now: 1770000100,
    }))
    expect(blocked.body).toMatchObject({
      outcome: 'retry_backoff_active',
      backoff: { decision: 'active', seconds_remaining: 400, override_applied: false },
    })

    const override = applyTaskClaimControl(claimDb, operatorInput({
      expected: {
        attempt_id: attempt.id,
        attempt_status: 'failed',
      },
      overrideBackoff: true,
      overrideReason: 'operator verified recovery',
      reason: 'AKIAIOSFODNN7EXAMPLE',
      now: 1770000200,
    }))
    expect(override.body).toMatchObject({
      outcome: 'retry_ready',
      backoff: { decision: 'overridden', override_applied: true },
      audit: { redaction_applied: true },
    })
    const activityJson = JSON.stringify(claimDb.prepare(`
      SELECT data FROM activities WHERE type = 'task_stage_claim_control_retry' ORDER BY id DESC LIMIT 1
    `).get())
    expect(activityJson).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(activityJson).toContain('<REDACTED:')
    expect(claimDb.prepare(`
      SELECT next_retry_at, next_retry_reason, backoff_seconds
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/mission-control'
    `).get()).toEqual({ next_retry_at: null, next_retry_reason: null, backoff_seconds: 0 })
  })
})
