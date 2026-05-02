export const READY_FOR_OWNER_STATUS = 'ready_for_owner'
export const READY_FOR_OWNER_TERMINAL_EVENT = 'github_pr_merged'
export const READY_FOR_OWNER_CONFLICT_REASON = 'ready_for_owner_pr_merge_required'

export const TASK_STATUSES = [
  'backlog',
  'inbox',
  'assigned',
  'awaiting_owner',
  'in_progress',
  'review',
  'quality_review',
  READY_FOR_OWNER_STATUS,
  'done',
  'failed',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type ReadyForOwnerTerminalEvent = typeof READY_FOR_OWNER_TERMINAL_EVENT
export type TaskTerminalTransitionIntent = 'approval' | 'status_write'

export interface TransitionConflictBody {
  error: 'transition_conflict'
  reason: typeof READY_FOR_OWNER_CONFLICT_REASON
  task_ids: number[]
}

export interface TaskTerminalTransitionAllowed {
  ok: true
  status: TaskStatus
  terminalEvent?: ReadyForOwnerTerminalEvent
}

export interface TaskTerminalTransitionConflict {
  ok: false
  status: 409
  body: TransitionConflictBody
}

export type TaskTerminalTransitionResult =
  | TaskTerminalTransitionAllowed
  | TaskTerminalTransitionConflict

export interface ResolveTaskTerminalTransitionInput {
  taskId: number
  currentStatus: TaskStatus
  requestedStatus: TaskStatus
  producesPr: boolean
  twoStepTerminalEnabled: boolean
  transitionIntent?: TaskTerminalTransitionIntent
  terminalEvent?: ReadyForOwnerTerminalEvent | null
}

export function transitionConflict(taskIds: readonly number[]): TransitionConflictBody {
  return {
    error: 'transition_conflict',
    reason: READY_FOR_OWNER_CONFLICT_REASON,
    task_ids: [...taskIds],
  }
}

function conflictForTask(taskId: number): TaskTerminalTransitionConflict {
  return {
    ok: false,
    status: 409,
    body: transitionConflict([taskId]),
  }
}

function allowedTransition(
  status: TaskStatus,
  terminalEvent?: ReadyForOwnerTerminalEvent
): TaskTerminalTransitionAllowed {
  return terminalEvent === undefined ? { ok: true, status } : { ok: true, status, terminalEvent }
}

export function resolveTaskTerminalTransition(
  input: ResolveTaskTerminalTransitionInput
): TaskTerminalTransitionResult {
  const {
    taskId,
    requestedStatus,
    producesPr,
    twoStepTerminalEnabled,
    transitionIntent = 'status_write',
    terminalEvent,
    currentStatus,
  } = input

  if (requestedStatus === currentStatus) return allowedTransition(requestedStatus)

  if (requestedStatus === READY_FOR_OWNER_STATUS) {
    if (!twoStepTerminalEnabled || !producesPr) return conflictForTask(taskId)
    return allowedTransition(READY_FOR_OWNER_STATUS)
  }

  if (requestedStatus !== 'done') return allowedTransition(requestedStatus)
  if (!twoStepTerminalEnabled || !producesPr) return allowedTransition('done')
  if (terminalEvent === READY_FOR_OWNER_TERMINAL_EVENT) {
    return allowedTransition('done', READY_FOR_OWNER_TERMINAL_EVENT)
  }
  if (transitionIntent === 'approval' && currentStatus !== READY_FOR_OWNER_STATUS) {
    return allowedTransition(READY_FOR_OWNER_STATUS)
  }
  return conflictForTask(taskId)
}

function hasAssignee(assignedTo: string | null | undefined): boolean {
  return Boolean(assignedTo?.trim())
}

/**
 * Keep task state coherent when a task is created with an assignee.
 * If caller asks for `inbox` but also sets `assigned_to`, normalize to `assigned`.
 */
export function normalizeTaskCreateStatus(
  requestedStatus: TaskStatus | undefined,
  assignedTo: string | undefined
): TaskStatus {
  const status = requestedStatus ?? 'inbox'
  if (status === 'inbox' && hasAssignee(assignedTo)) return 'assigned'
  return status
}

/**
 * Auto-adjust status for assignment-only updates when caller does not
 * explicitly request a status transition.
 */
export function normalizeTaskUpdateStatus(args: {
  currentStatus: TaskStatus
  requestedStatus: TaskStatus | undefined
  assignedTo: string | null | undefined
  assignedToProvided: boolean
}): TaskStatus | undefined {
  const { currentStatus, requestedStatus, assignedTo, assignedToProvided } = args
  if (requestedStatus !== undefined) return requestedStatus
  if (!assignedToProvided) return undefined

  if (hasAssignee(assignedTo) && currentStatus === 'inbox') return 'assigned'
  if (!hasAssignee(assignedTo) && currentStatus === 'assigned') return 'inbox'
  return undefined
}
