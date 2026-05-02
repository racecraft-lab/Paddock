import { describe, expect, it } from 'vitest'
import * as taskStatus from '../task-status'
import { normalizeTaskCreateStatus, normalizeTaskUpdateStatus } from '../task-status'

type TransitionArgs = {
  taskId: number
  currentStatus: string
  requestedStatus: string
  producesPr: boolean
  twoStepTerminalEnabled: boolean
  transitionIntent?: string
  terminalEvent?: string | null
}

function resolveTransition(args: TransitionArgs): unknown {
  const fn = (taskStatus as { resolveTaskTerminalTransition?: (input: TransitionArgs) => unknown })
    .resolveTaskTerminalTransition
  expect(fn).toBeTypeOf('function')
  if (typeof fn !== 'function') return undefined
  return fn(args)
}

describe('task status normalization', () => {
  it('sets assigned status on create when assignee is present', () => {
    expect(normalizeTaskCreateStatus(undefined, 'main')).toBe('assigned')
    expect(normalizeTaskCreateStatus('inbox', 'main')).toBe('assigned')
  })

  it('keeps explicit non-inbox status on create', () => {
    expect(normalizeTaskCreateStatus('in_progress', 'main')).toBe('in_progress')
  })

  it('auto-promotes inbox to assigned when assignment is added via update', () => {
    expect(
      normalizeTaskUpdateStatus({
        currentStatus: 'inbox',
        requestedStatus: undefined,
        assignedTo: 'main',
        assignedToProvided: true,
      })
    ).toBe('assigned')
  })

  it('auto-demotes assigned to inbox when assignment is removed via update', () => {
    expect(
      normalizeTaskUpdateStatus({
        currentStatus: 'assigned',
        requestedStatus: undefined,
        assignedTo: '',
        assignedToProvided: true,
      })
    ).toBe('inbox')
  })

  it('does not override explicit status changes on update', () => {
    expect(
      normalizeTaskUpdateStatus({
        currentStatus: 'inbox',
        requestedStatus: 'in_progress',
        assignedTo: 'main',
        assignedToProvided: true,
      })
    ).toBe('in_progress')
  })
})

describe('task status vocabulary and transition conflicts', () => {
  it('exports ready-for-owner status vocabulary and terminal event constants', () => {
    expect((taskStatus as { READY_FOR_OWNER_STATUS?: unknown }).READY_FOR_OWNER_STATUS)
      .toBe('ready_for_owner')
    expect((taskStatus as { READY_FOR_OWNER_TERMINAL_EVENT?: unknown }).READY_FOR_OWNER_TERMINAL_EVENT)
      .toBe('github_pr_merged')
    expect((taskStatus as { TASK_STATUSES?: unknown }).TASK_STATUSES)
      .toEqual([
        'backlog',
        'inbox',
        'assigned',
        'awaiting_owner',
        'in_progress',
        'review',
        'quality_review',
        'ready_for_owner',
        'done',
        'failed',
      ])
  })

  it('returns the uniform ready-for-owner transition conflict body', () => {
    const transitionConflict = (taskStatus as {
      transitionConflict?: (taskIds: readonly number[]) => unknown
    }).transitionConflict

    expect(transitionConflict).toBeTypeOf('function')
    expect(transitionConflict?.([42, 43])).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [42, 43],
    })
  })

  it('uses the same uniform conflict body for approval attempts once a PR-producing task is already waiting on owner merge', () => {
    expect(resolveTransition({
      taskId: 44,
      currentStatus: 'ready_for_owner',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    })).toEqual({
      ok: false,
      status: 409,
      body: {
        error: 'transition_conflict',
        reason: 'ready_for_owner_pr_merge_required',
        task_ids: [44],
      },
    })
  })
})

describe('resolveTaskTerminalTransition', () => {
  it('preserves direct done completion when the two-step flag is off', () => {
    expect(resolveTransition({
      taskId: 1,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: false,
      transitionIntent: 'approval',
    })).toEqual({ ok: true, status: 'done' })
  })

  it('preserves direct done completion for non-PR work when the flag is on', () => {
    expect(resolveTransition({
      taskId: 2,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: false,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    })).toEqual({ ok: true, status: 'done' })
  })

  it('routes PR-producing approval to ready_for_owner when the flag is on', () => {
    expect(resolveTransition({
      taskId: 3,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    })).toEqual({ ok: true, status: 'ready_for_owner' })
  })

  it('blocks non-merge done writes for PR-producing tasks when the flag is on', () => {
    expect(resolveTransition({
      taskId: 4,
      currentStatus: 'ready_for_owner',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'status_write',
    })).toEqual({
      ok: false,
      status: 409,
      body: {
        error: 'transition_conflict',
        reason: 'ready_for_owner_pr_merge_required',
        task_ids: [4],
      },
    })
  })

  it('allows done writes caused by the GitHub PR merge terminal event', () => {
    expect(resolveTransition({
      taskId: 5,
      currentStatus: 'ready_for_owner',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'status_write',
      terminalEvent: 'github_pr_merged',
    })).toEqual({ ok: true, status: 'done', terminalEvent: 'github_pr_merged' })
  })

  it('blocks new ready_for_owner writes while the flag is off', () => {
    expect(resolveTransition({
      taskId: 6,
      currentStatus: 'quality_review',
      requestedStatus: 'ready_for_owner',
      producesPr: true,
      twoStepTerminalEnabled: false,
      transitionIntent: 'status_write',
    })).toEqual({
      ok: false,
      status: 409,
      body: {
        error: 'transition_conflict',
        reason: 'ready_for_owner_pr_merge_required',
        task_ids: [6],
      },
    })
  })

  it('keeps existing ready_for_owner rows stable while the flag is off', () => {
    expect(resolveTransition({
      taskId: 7,
      currentStatus: 'ready_for_owner',
      requestedStatus: 'ready_for_owner',
      producesPr: true,
      twoStepTerminalEnabled: false,
      transitionIntent: 'status_write',
    })).toEqual({ ok: true, status: 'ready_for_owner' })
  })
})
