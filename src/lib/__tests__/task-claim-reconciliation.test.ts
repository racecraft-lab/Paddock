import { afterEach, describe, expect, it } from 'vitest'
import { invalidatePolicyCache } from '../resource-policy-cache'
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
  invalidatePolicyCache()
})

function db() {
  const claimDb = openTaskClaimDb()
  openDbs.push(claimDb)
  return claimDb
}

function tableCounts(claimDb: ReturnType<typeof openTaskClaimDb>) {
  const tables = [
    'tasks',
    'task_stage_claims',
    'task_stage_attempts',
    'task_stage_attempt_events',
    'activities',
    'task_claim_control_idempotency_keys',
  ] as const
  return Object.fromEntries(tables.map((table) => [
    table,
    (claimDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count,
  ])) as Record<(typeof tables)[number], number>
}

describe('task claim reconciliation helpers', () => {
  it('derives stage keys and normalizes bounded launch leases', () => {
    expect(deriveTaskStageKey({ workflow_template_slug: ' dev ', workflow_template_id: 9 })).toBe('dev')
    expect(deriveTaskStageKey({ workflow_template_slug: null, workflow_template_id: 9 })).toBe('workflow-template-9')
    expect(deriveTaskStageKey({ workflow_template_slug: null, workflow_template_id: null })).toBe('assigned_dispatch')
    expect(normalizeClaimLeaseSeconds(undefined)).toBe(300)
    expect(normalizeClaimLeaseSeconds(999)).toBe(600)
  })

  it('validates only canonical owner/repo GitHub names', () => {
    expect(validateGitHubRepositoryFullName('racecraft-lab/Paddock')).toBe('racecraft-lab/Paddock')
    for (const value of [
      'https://github.com/racecraft-lab/Paddock',
      'git@github.com:racecraft-lab/Paddock',
      'racecraft-lab/Paddock.git',
      'racecraft-lab/mission/control',
      'racecraft-lab/',
      '/mission-control',
      'racecraft-lab/../mission-control',
      'racecraft lab/mission-control',
      'racecraft-lab/Paddock\n',
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
      claimRunId: 'dispatch-run-a',
      leaseSeconds: 5,
      now: 1770000000,
    })
    const replacement = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler-b',
      claimRunId: 'dispatch-run-b',
      now: 1770000010,
    })

    expect(replacement).toMatchObject({ outcome: 'claim_acquired', active_claim_id: 2, task_stage_attempt_id: 2 })
    expect(releaseTaskStageClaim(claimDb, {
      claimId: first.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      claimRunId: 'dispatch-run-a',
      releasedByRunId: 'dispatch-run-a',
      reason: 'launch_handoff_completed',
      now: 1770000011,
    })).toBe(false)
    expect(claimDb.prepare("SELECT claim_state, release_reason FROM task_stage_claims WHERE id = 1").get()).toEqual({
      claim_state: 'stale_recovered',
      release_reason: 'stale_claim_recovered',
    })
    expect(activityTypes(claimDb)).toContain('task_stage_claim_stale_recovered')
  })

  it('requires stage and owning claim run compare-and-set before release', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const claim = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-run-owner',
      now: 1770000000,
    })

    expect(releaseTaskStageClaim(claimDb, {
      claimId: claim.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      claimRunId: 'dispatch-run-other',
      releasedByRunId: 'dispatch-run-other',
      reason: 'launch_handoff_completed',
      now: 1770000001,
    })).toBe(false)
    expect(claimDb.prepare("SELECT claim_state FROM task_stage_claims WHERE id = ?").get(claim.active_claim_id)).toEqual({ claim_state: 'active' })

    expect(releaseTaskStageClaim(claimDb, {
      claimId: claim.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      claimRunId: 'dispatch-run-owner',
      releasedByRunId: 'dispatch-run-owner',
      reason: 'launch_handoff_completed',
      now: 1770000002,
    })).toBe(true)
    expect(claimDb.prepare(`
      SELECT claim_state, release_reason, released_by_run_id
      FROM task_stage_claims
      WHERE id = ?
    `).get(claim.active_claim_id)).toEqual({
      claim_state: 'released',
      release_reason: 'launch_handoff_completed',
      released_by_run_id: 'dispatch-run-owner',
    })
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

  it('evaluates and records production governance allow, block, and defer decisions before active claim acquisition', () => {
    const allowDb = db()
    seedClaimableTask(allowDb)
    const allowed = reconcileAndAcquireTaskStageClaim(allowDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-governance-allow',
      now: 1770000000,
    })
    expect(allowed).toMatchObject({ outcome: 'claim_acquired' })
    expect(allowDb.prepare('SELECT decision, reason FROM resource_policy_events WHERE task_id = 100').get()).toMatchObject({
      decision: 'allow',
    })

    const blockDb = db()
    blockDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run('{"FEATURE_TASK_CONTROL_PLANE":true,"FEATURE_RESOURCE_GOVERNANCE":true}')
    blockDb.prepare(`
      INSERT INTO resource_policies (
        id, workspace_id, policy_type, limit_kind, limit_value, enforcement, enforce_mode, enabled
      ) VALUES (501, 1, 'blackout', 'requests', 1, 'block_dispatch', 'hard', 1)
    `).run()
    invalidatePolicyCache()
    seedClaimableTask(blockDb)
    expect(reconcileAndAcquireTaskStageClaim(blockDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-governance-block',
      now: 1770000000,
    })).toMatchObject({
      outcome: 'governance_deferred',
      reason: 'block:reservation_unavailable',
      release_reason: 'governance_blocked',
    })
    expect(blockDb.prepare('SELECT decision, reason FROM resource_policy_events WHERE task_id = 100').get()).toEqual({
      decision: 'block',
      reason: 'block:reservation_unavailable',
    })

    const deferDb = db()
    deferDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run('{"FEATURE_TASK_CONTROL_PLANE":true,"FEATURE_RESOURCE_GOVERNANCE":true}')
    deferDb.prepare(`
      INSERT INTO resource_policies (
        id, workspace_id, policy_type, limit_kind, limit_value, enforcement, enforce_mode, enabled
      ) VALUES (502, 1, 'wip_limit', 'tasks', 1, 'warn', 'soft', 1)
    `).run()
    invalidatePolicyCache()
    seedClaimableTask(deferDb)
    expect(reconcileAndAcquireTaskStageClaim(deferDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-governance-defer',
      now: 1770000000,
    })).toMatchObject({
      outcome: 'governance_deferred',
      reason: 'defer:wip_limit',
      release_reason: 'governance_deferred',
    })
    expect(deferDb.prepare('SELECT decision, reason FROM resource_policy_events WHERE task_id = 100').get()).toEqual({
      decision: 'defer',
      reason: 'defer:wip_limit',
    })
  })

  it('defers claim intake for unhealthy lifecycle readiness states', () => {
    const claimDb = db()
    seedClaimableTask(claimDb, { id: 301 })
    seedClaimableTask(claimDb, { id: 302 })
    seedClaimableTask(claimDb, { id: 303 })
    seedClaimableTask(claimDb, { id: 304 })
    claimDb.prepare(`
      UPDATE github_sync_lifecycle_controls
      SET owner_project_id = NULL
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/Paddock'
    `).run()
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 301,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'stale_truth_deferred', reason: 'github_lifecycle_ownership_unresolved' })

    claimDb.prepare(`
      UPDATE github_sync_lifecycle_controls
      SET owner_project_id = 10, lease_run_id = 'ghsync_stale', lease_expires_at = 1769999999
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/Paddock'
    `).run()
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 302,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'stale_truth_deferred', reason: 'github_lifecycle_stale_lease' })

    claimDb.prepare(`
      UPDATE github_sync_lifecycle_controls
      SET lease_run_id = NULL, lease_expires_at = NULL, consecutive_failures = 3
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/Paddock'
    `).run()
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 303,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'stale_truth_deferred', reason: 'github_lifecycle_unhealthy' })

    claimDb.prepare(`
      UPDATE github_sync_lifecycle_controls
      SET consecutive_failures = 0, backoff_seconds = 60, next_retry_at = 1770000060
      WHERE workspace_id = 1 AND github_repo = 'racecraft-lab/Paddock'
    `).run()
    expect(reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 304,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      now: 1770000000,
    })).toMatchObject({ outcome: 'stale_truth_deferred', reason: 'github_lifecycle_backoff' })
  })

  it('releases active claims for terminal passive attempt lifecycle without treating attempt status as the lock', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const claim = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-run-attempt-terminal',
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

  it('does not let a released failed attempt suppress the next retry admission', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const first = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-run-first',
      now: 1770000000,
    })
    expect(releaseTaskStageClaim(claimDb, {
      claimId: first.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      claimRunId: 'dispatch-run-first',
      releasedByRunId: 'dispatch-run-first',
      reason: 'dispatch_failed',
      now: 1770000001,
    })).toBe(true)

    const retry = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-run-retry',
      now: 1770000002,
    })

    expect(retry).toMatchObject({ outcome: 'claim_acquired', task_stage_attempt_id: 2 })
    expect(claimDb.prepare("SELECT COUNT(*) as count FROM task_stage_claims WHERE claim_state = 'active'").get()).toEqual({ count: 1 })
  })

  it('releases active claims when GitHub issue or PR truth is terminal', () => {
    const issueDb = db()
    seedClaimableTask(issueDb)
    const issueClaim = reconcileAndAcquireTaskStageClaim(issueDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'dispatch-run-issue-terminal',
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
      claimRunId: 'dispatch-run-redacted',
      now: 1770000000,
      correlationId: 'AKIAIOSFODNN7EXAMPLE',
    })
    releaseTaskStageClaim(claimDb, {
      claimId: claim.active_claim_id ?? 0,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev_implementation',
      claimRunId: 'dispatch-run-redacted',
      releasedByRunId: 'dispatch-run-redacted',
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

  it('extends the read model with claim-control eligibility and exact expected state without writes', () => {
    const claimDb = db()
    seedClaimableTask(claimDb)
    const acquired = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'claim-run-1',
      now: 1770000000,
    })
    const before = tableCounts(claimDb)

    const envelope = buildTaskClaimReconciliationReadModel(claimDb, {
      taskId: 100,
      workspaceId: 1,
      currentRole: 'operator',
    })
    const after = tableCounts(claimDb)

    expect(after).toEqual(before)
    expect(envelope.claim_control).toMatchObject({
      stage_key: 'dev_implementation',
      authorization: {
        required_role: 'operator',
        current_role: 'operator',
        can_mutate: true,
      },
      expected_state: {
        claim_id: String(acquired.active_claim_id),
        claim_run_id: 'claim-run-1',
        attempt_id: String(acquired.task_stage_attempt_id),
        attempt_status: 'running',
      },
      retry_eligibility: {
        state: 'active_claim',
        reason: 'active_claim',
        evidence_type: 'claim',
        evidence_id: String(acquired.active_claim_id),
      },
    })
    expect(envelope.claim_control?.available_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'release', enabled: true, requires_idempotency_key: true }),
      expect.objectContaining({ action: 'cancel', enabled: true, requires_confirmation: true }),
      expect.objectContaining({ action: 'retry', enabled: true, backoff_policy: 'respect_backoff' }),
    ]))
    expect(envelope.claim_control?.backoff).toMatchObject({
      state: 'none',
      seconds_remaining: 0,
      override_allowed: true,
      override_requires_reason: true,
    })
  })

  it('classifies boundary errors without leaking raw database messages', () => {
    expect(classifyClaimBoundaryError(new Error('SQLITE_CONSTRAINT_UNIQUE: task_stage_claims'))).toBe('sqlite_constraint_race')
    expect(classifyClaimBoundaryError(new Error('SQLITE_BUSY: database is locked'))).toBe('sqlite_database_error')
    expect(classifyClaimBoundaryError(new Error('database is locked'))).toBe('sqlite_database_error')
    expect(classifyClaimBoundaryError(new Error('governance evaluator unavailable'))).toBe('governance_evaluator_error')
    expect(classifyClaimBoundaryError(new Error('release compare-and-set failed'))).toBe('release_compare_failed')
    expect(classifyClaimBoundaryError(new Error('malformed claim input'))).toBe('malformed_claim_input')
    expect(classifyClaimBoundaryError(new Error('totally unexpected'))).toBe('unknown_boundary_error')
  })
})
