import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTaskClaimReconciliationReadModel,
  classifyClaimBoundaryError,
  deriveTaskStageKey,
  normalizeClaimLeaseSeconds,
  reconcileAndAcquireTaskStageClaim,
  releaseTaskStageClaim,
  validateGitHubRepositoryFullName,
} from '../task-claim-reconciliation'
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

describe('task claim reconciliation helpers', () => {
  it('derives stage keys and normalizes bounded launch leases', () => {
    expect(deriveTaskStageKey({ workflow_template_slug: ' dev ', workflow_template_id: 9 })).toBe('dev')
    expect(deriveTaskStageKey({ workflow_template_slug: null, workflow_template_id: 9 })).toBe('workflow-template-9')
    expect(deriveTaskStageKey({ workflow_template_slug: null, workflow_template_id: null })).toBe('assigned')
    expect(normalizeClaimLeaseSeconds(undefined)).toBe(300)
    expect(normalizeClaimLeaseSeconds(999)).toBe(600)
  })

  it('validates only canonical owner/repo GitHub names', () => {
    expect(validateGitHubRepositoryFullName('racecraft-lab/mission-control')).toBe('racecraft-lab/mission-control')
    for (const value of [
      'https://github.com/racecraft-lab/mission-control',
      'git@github.com:racecraft-lab/mission-control',
      'racecraft-lab/mission-control.git',
      'racecraft-lab/mission/control',
      'racecraft-lab/',
      '/mission-control',
      'racecraft-lab/../mission-control',
      'racecraft lab/mission-control',
      'racecraft-lab/mission-control\n',
    ]) {
      expect(validateGitHubRepositoryFullName(value)).toBeNull()
    }
  })

  it('acquires one active claim and records duplicate-prevented evidence for competitors', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)

    const first = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler-a',
      now: 1770000000,
    })
    const second = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler-b',
      now: 1770000001,
    })

    expect(first).toMatchObject({ outcome: 'claim_acquired', active_claim_id: 1, stage_key: 'dev_implementation' })
    expect(second).toMatchObject({ outcome: 'duplicate_prevented', active_claim_id: 1 })
    expect(claimDb.prepare("SELECT COUNT(*) as count FROM task_stage_claims WHERE claim_state = 'active'").get()).toEqual({ count: 1 })
    expect(activityTypes(claimDb)).toEqual(['task_stage_claim_acquired', 'task_stage_claim_duplicate_prevented'])
  })

  it('recovers expired active claims and ignores late stale-owner release attempts', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const first = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler-a',
      leaseSeconds: 5,
      now: 1770000000,
    })
    const replacement = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler-b',
      now: 1770000010,
    })

    expect(replacement).toMatchObject({ outcome: 'claim_acquired', active_claim_id: 2, task_stage_attempt_id: 2 })
    expect(releaseTaskStageClaim(claimDb, {
      claimId: first.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      reason: 'launch_handoff_completed',
      now: 1770000011,
    })).toBe(false)
    expect(claimDb.prepare("SELECT claim_state, release_reason FROM task_stage_claims WHERE id = 1").get()).toEqual({
      claim_state: 'stale_recovered',
      release_reason: 'stale_claim_recovered',
    })
    expect(activityTypes(claimDb)).toContain('task_stage_claim_stale_recovered')
  })

  it('defers non-claimable, stale GitHub truth, governance, and terminal states without active claims', () => {
    const claimDb = db()
    seedClaimableTask(claimDb, { id: 101, github_repo: 'local-only' })
    seedClaimableTask(claimDb, { id: 102, github_synced_at: 1769990000 })
    seedClaimableTask(claimDb, { id: 103 })
    seedClaimableTask(claimDb, { id: 104, status: 'done' })

    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 101,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'not_claimable', reason: 'invalid_github_repo' })
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 102,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'stale_truth_deferred', reason: 'github_truth_stale' })
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 103,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
      governanceDecision: { result: 'defer', reason: 'budget_window_closed' },
    })).toMatchObject({ outcome: 'governance_deferred', release_reason: 'governance_deferred' })
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 104,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'terminal_reconciled', release_reason: 'task_terminal_done' })
    expect(claimDb.prepare("SELECT COUNT(*) as count FROM task_stage_claims WHERE claim_state = 'active'").get()).toEqual({ count: 0 })
  })

  it('releases active claims for terminal passive attempt lifecycle without treating attempt status as the lock', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const claim = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })
    claimDb.prepare("UPDATE task_stage_attempts SET status = 'succeeded' WHERE id = ?").run(claim.task_stage_attempt_id)

    const reconciled = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000005,
    })

    expect(reconciled).toMatchObject({ outcome: 'terminal_reconciled', release_reason: 'attempt_terminal_reconciled' })
    expect(claimDb.prepare('SELECT claim_state, release_reason FROM task_stage_claims WHERE id = ?').get(claim.active_claim_id)).toEqual({
      claim_state: 'released',
      release_reason: 'attempt_terminal_reconciled',
    })
  })

  it('releases active claims when GitHub issue or PR truth is terminal', () => {
    const issueDb = db()
    seedClaimableTask(issueDb)
    const issueClaim = reconcileAndAcquireTaskStageClaim(issueDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })
    issueDb.prepare("UPDATE tasks SET github_issue_state = 'closed' WHERE id = 100").run()

    const issueReconciled = reconcileAndAcquireTaskStageClaim(issueDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000005,
    })

    expect(issueReconciled).toMatchObject({ outcome: 'terminal_reconciled', release_reason: 'github_issue_terminal' })
    expect(issueDb.prepare('SELECT claim_state, release_reason FROM task_stage_claims WHERE id = ?').get(issueClaim.active_claim_id)).toEqual({
      claim_state: 'released',
      release_reason: 'github_issue_terminal',
    })

    const prDb = db()
    seedClaimableTask(prDb, { id: 201, github_pr_state: 'merged' })
    expect(reconcileAndAcquireTaskStageClaim(prDb, {
      taskId: 201,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'terminal_reconciled', release_reason: 'github_pr_terminal' })
  })

  it('builds a side-effect-free read model and redacts secret-shaped metadata', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const claim = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
      correlationId: 'AKIAIOSFODNN7EXAMPLE',
    })
    releaseTaskStageClaim(claimDb, {
      claimId: claim.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      reason: 'launch_handoff_completed',
      now: 1770000001,
      metadata: { correlation_id: 'AKIAIOSFODNN7EXAMPLE' },
    })
    const before = claimDb.prepare('SELECT COUNT(*) as count FROM activities').get()
    const envelope = buildTaskClaimReconciliationReadModel(claimDb, { taskId: 100, workspaceId: 1 })
    const after = claimDb.prepare('SELECT COUNT(*) as count FROM activities').get()

    expect(envelope).toMatchObject({
      schema_version: 'task_claim_reconciliation.v1',
      feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: true },
      task: { id: '100', workspace_id: '1', stage_key: 'dev_implementation' },
      active_claim: null,
    })
    expect(envelope.claim_history).toHaveLength(1)
    expect(JSON.stringify(envelope)).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(before).toEqual(after)
  })

  it('classifies boundary errors without leaking raw database messages', () => {
    expect(classifyClaimBoundaryError(new Error('SQLITE_CONSTRAINT_UNIQUE: task_stage_claims'))).toBe('sqlite_constraint_duplicate')
    expect(classifyClaimBoundaryError(new Error('SQLITE_BUSY: database is locked'))).toBe('sqlite_busy')
    expect(classifyClaimBoundaryError(new Error('governance evaluator unavailable'))).toBe('governance_error')
  })
})
