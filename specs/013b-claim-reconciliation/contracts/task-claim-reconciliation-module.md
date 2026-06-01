# Contract: Task Claim Reconciliation Module

Module: `src/lib/task-claim-reconciliation.ts`

## Types

```ts
type ClaimAdmissionOutcome =
  | 'flag_off'
  | 'admit'
  | 'duplicate_prevented'
  | 'not_claimable'
  | 'governance_deferred'
  | 'terminal_reconciled'
  | 'stale_truth_deferred'
  | 'boundary_deferred'

type TaskStageClaimReleaseReason =
  | 'launch_handoff_completed'
  | 'dispatch_failed'
  | 'task_terminal_done'
  | 'task_terminal_failed'
  | 'github_issue_terminal'
  | 'github_pr_terminal'
  | 'governance_blocked'
  | 'governance_deferred'
  | 'attempt_terminal_reconciled'
  | 'stale_claim_recovered'
  | 'boundary_error_deferred'

type TaskStageClaimTerminalState = 'released' | 'stale_recovered'

interface ClaimAdmissionInput {
  taskId: number
  workspaceId: number
  schedulerRunId: string
  leaseOwner: string
  now: number
}

interface ClaimAdmissionResult {
  outcome: ClaimAdmissionOutcome
  taskId: number
  workspaceId: number
  stageKey: string | null
  claimId: number | null
  taskStageAttemptId: number | null
  releaseOnLaunchCompletion: boolean
  reason: string
  activityIds: number[]
}

interface ClaimReleaseInput {
  claimId: number
  workspaceId: number
  taskId: number
  stageKey: string
  claimRunId: string
  releasedByRunId: string
  now: number
  reason: TaskStageClaimReleaseReason
}
```

## `reconcileAndAcquireTaskStageClaim(db, input)`

Responsibilities:

- Resolve `FEATURE_TASK_CONTROL_PLANE` through `resolveFlag`.
- Bypass with `flag_off` and no side effects when disabled.
- Re-read task state inside the bounded decision path.
- Verify assigned task state, assignee, canonical `owner/repo` GitHub repository identity, issue linkage, sync-owner ownership, GitHub truth freshness, SPEC-013A1 lifecycle health, and resource governance.
- Recover stale active claims before replacement acquisition.
- Create or link one task-stage attempt evidence row.
- Insert one active claim if eligible.
- Return `duplicate_prevented` when the active partial unique index rejects a competing insert or an active claim already exists.
- Return `boundary_deferred` for SQLite busy/database errors, malformed claim inputs, governance evaluator failures, and unknown claim/release boundary exceptions so the caller skips launch for that task while the scheduler tick continues.
- Record structured activities and attempt events for every non-flag-off outcome, including `task_stage_claim_not_claimable` for `not_claimable` outcomes.

Non-responsibilities:

- No live GitHub fetch.
- No scheduler tick registration.
- No OpenClaw, gateway, runner, harness, sandbox, or Linear calls.
- No `advanceTaskChain`.
- No `createTask`.

## `releaseTaskStageClaim(db, input)`

Responsibilities:

- Compare `claim_id`, `workspace_id`, `task_id`, `stage_key`, and owner `claim_run_id` before release.
- Accept only `TaskStageClaimReleaseReason`.
- Transition `active -> released` for `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, and `boundary_error_deferred`.
- Transition `active -> stale_recovered` only for `stale_claim_recovered`.
- Use `task_terminal_done` and `task_terminal_failed` only when local Paddock task status is `done` or `failed`; `awaiting_owner` and `ready_for_owner` are not terminal for release decisions.
- Use `attempt_terminal_reconciled` only when linked passive task-stage attempt lifecycle reaches `succeeded`, `failed`, `released`, or `cancelled`; attempt status remains evidence and does not enforce active-claim uniqueness.
- Record release or stale recovery activity.
- Append task-stage attempt lifecycle evidence when the claim has an attempt id.
- Ignore late stale-owner releases that target a claim already recovered or replaced.

## `buildTaskClaimReconciliationReadModel(db, input)`

Responsibilities:

- Enforce task/workspace visibility through caller-provided scoped task identity.
- Return a `task_claim_reconciliation.v1` envelope.
- Include active claim, bounded claim history, bounded decision activities, stage attempt links, flag state, eligibility state, and diagnostics.
- Apply the same positive allowlist and secret-shaped value rejection used by writes.

## Required Tests

- Flag-off has no claim side effects and preserves dispatch compatibility.
- Concurrent same-stage admission produces one `admit` and at least one `duplicate_prevented`.
- Stale recovery transitions the old active claim before acquiring replacement.
- Late stale-owner release does not release the replacement claim.
- Governance defer/block does not acquire a claim.
- Stale tracker truth does not acquire a claim.
- Terminal GitHub/task state releases or prevents active claim.
- Terminal passive attempt lifecycle state releases the separate active claim with `attempt_terminal_reconciled` without using attempt status as the active lock.
- `release_reason` is restricted to the closed vocabulary and Paddock terminal release only uses `done` or `failed`; `awaiting_owner` and `ready_for_owner` do not release claims by themselves.
- Not-claimable intake exclusions record `task_stage_claim_not_claimable` activity evidence with outcome `not_claimable`, closed linkage/input reason metadata, no active claim row, and no new task-stage attempt lifecycle status.
- GitHub repository validation rejects URL, scp-like, path traversal, whitespace/control-character, multi-segment, missing-owner, missing-repo, and `.git`-suffix values.
- Boundary failures produce `boundary_deferred`, do not acquire claims, do not bypass governance, do not crash scheduler dispatch, and redact raw diagnostics.
- Payload allowlist rejects unsafe fields and secret-shaped strings.
- Static test or direct import assertion proves the module does not import `advanceTaskChain` or `createTask`.
