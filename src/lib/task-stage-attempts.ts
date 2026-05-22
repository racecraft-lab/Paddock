import type Database from 'better-sqlite3'

export const TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES = Object.freeze([
  'created',
  'running',
  'succeeded',
  'failed',
  'released',
  'cancelled',
  'archived',
] as const)

export type TaskStageAttemptLifecycleStatus =
  (typeof TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES)[number]

const VALID_STATUSES = new Set<string>(TASK_STAGE_ATTEMPT_LIFECYCLE_STATUSES)
const TERMINAL_COMPLETED_STATUSES = new Set<string>([
  'succeeded',
  'failed',
  'released',
  'cancelled',
])
const MAX_METADATA_BYTES = 4096
const MAX_TEXT_LENGTH = 1024
const DEFAULT_LIFECYCLE_LIMIT = 10

export interface CreateTaskStageAttemptInput {
  readonly workspaceId: number
  readonly taskId: number
  readonly stageKey: string
  readonly attemptNumber: number
  readonly status?: string | undefined
  readonly observedAt?: string | undefined
  readonly runId?: string | null | undefined
  readonly actorType?: string | null | undefined
  readonly actorId?: string | null | undefined
  readonly message?: string | null | undefined
  readonly metadata?: unknown
}

export interface AppendTaskStageAttemptEventInput {
  readonly attemptId: number
  readonly status: string
  readonly observedAt?: string | undefined
  readonly actorType?: string | null | undefined
  readonly actorId?: string | null | undefined
  readonly message?: string | null | undefined
  readonly metadata?: unknown
}

export interface ArchiveTaskStageAttemptInput {
  readonly attemptId: number
  readonly observedAt?: string | undefined
  readonly actorType?: string | null | undefined
  readonly actorId?: string | null | undefined
  readonly message?: string | null | undefined
  readonly metadata?: unknown
}

export interface ListTaskStageAttemptsInput {
  readonly workspaceId: number
  readonly taskId: number
  readonly lifecycleLimit?: number
}

export interface TaskStageAttemptEnvelope {
  readonly schema_version: 'task_stage_attempts.v1'
  readonly task: {
    readonly id: string
    readonly workspace_id: string
    readonly title: string | null
    readonly status: string | null
  } | null
  readonly attempts: SerializedTaskStageAttempt[]
  readonly warnings: TaskStageAttemptWarning[]
}

export interface SerializedTaskStageAttempt {
  readonly id: string
  readonly workspace_id: string
  readonly task_id: string
  readonly stage_key: string
  readonly attempt_number: number
  readonly status: string
  readonly created_at: string
  readonly updated_at: string
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly archived_at: string | null
  readonly workflow_template_id: number | null
  readonly workflow_template_slug: string | null
  readonly run_id: string | null
  readonly run_link: RunLink
  readonly run_summary: RunSummary | null
  readonly metadata: unknown
  readonly lifecycle: SerializedLifecycleEvent[]
}

export type RunLink =
  | { readonly state: 'none' }
  | { readonly state: 'linked'; readonly run_id: string }
  | { readonly state: 'missing_unavailable'; readonly run_id: string }

export interface RunSummary {
  readonly id: string
  readonly status: string
  readonly started_at: string | null
  readonly ended_at: string | null
  readonly agent_name: string | null
  readonly runtime: string | null
  readonly git_branch: string | null
  readonly git_commit: string | null
  readonly error: string | null
}

export interface SerializedLifecycleEvent {
  readonly id: string
  readonly status: TaskStageAttemptLifecycleStatus
  readonly observed_at: string
  readonly actor_type: string | null
  readonly actor_id: string | null
  readonly message: string | null
  readonly metadata: unknown
}

export type TaskStageAttemptWarning =
  | {
      readonly code: 'invalid_attempt_state'
      readonly attempt_id: string
      readonly field: 'status'
    }
  | {
      readonly code: 'invalid_lifecycle_state'
      readonly attempt_id: string
      readonly field: 'lifecycle.status'
      readonly event_id?: string
      readonly value?: string
    }
  | {
      readonly code: 'projection_drift'
      readonly attempt_id: string
      readonly field: keyof AttemptProjection
      readonly projection_value: string | null
      readonly expected_value: string | null
      readonly latest_valid_lifecycle: {
        readonly status: TaskStageAttemptLifecycleStatus
        readonly observed_at: string
      } | null
    }

interface AttemptRow {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly attempt_number: number
  readonly status: string
  readonly created_at: string
  readonly updated_at: string
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly archived_at: string | null
  readonly run_id: string | null
  readonly workflow_template_id: number | null
  readonly workflow_template_slug: string | null
  readonly metadata_json: string | null
}

interface EventRow {
  readonly id: number
  readonly attempt_id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly attempt_number: number
  readonly status: string
  readonly observed_at: string
  readonly actor_type: string | null
  readonly actor_id: string | null
  readonly message: string | null
  readonly metadata_json: string | null
}

interface TaskRow {
  readonly id: number
  readonly workspace_id: number
  readonly title: string | null
  readonly status: string | null
  readonly workflow_template_id: number | null
  readonly workflow_template_slug: string | null
}

interface AttemptProjection {
  readonly status: string | null
  readonly updated_at: string | null
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly archived_at: string | null
}

interface ProjectionWithLifecycle {
  readonly projection: AttemptProjection
  readonly latestValidLifecycle: EventRow | null
}

export function createTaskStageAttempt(
  db: Database.Database,
  input: CreateTaskStageAttemptInput,
): SerializedTaskStageAttempt {
  const status = validateLifecycleStatus(input.status ?? 'created')
  const workspaceId = positiveInteger(input.workspaceId, 'workspace_id')
  const taskId = positiveInteger(input.taskId, 'task_id')
  const attemptNumber = positiveInteger(input.attemptNumber, 'attempt_number')
  const stageKey = normalizeStageKey(input.stageKey)
  const observedAt = input.observedAt ?? new Date().toISOString()

  const row = db.transaction(() => {
    const task = db.prepare(`
      SELECT id, workspace_id, title, status, workflow_template_id, workflow_template_slug
      FROM tasks
      WHERE id = ? AND workspace_id = ?
    `).get(taskId, workspaceId) as TaskRow | undefined

    const projection = projectionForSingleEvent(status, observedAt)
    const result = db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at,
        run_id, workflow_template_id, workflow_template_slug, metadata_json
      ) VALUES (
        @workspace_id, @task_id, @stage_key, @attempt_number, @status,
        @created_at, @updated_at, @started_at, @completed_at, @archived_at,
        @run_id, @workflow_template_id, @workflow_template_slug, @metadata_json
      )
    `).run({
      workspace_id: workspaceId,
      task_id: taskId,
      stage_key: stageKey,
      attempt_number: attemptNumber,
      status,
      created_at: observedAt,
      updated_at: observedAt,
      started_at: projection.started_at,
      completed_at: projection.completed_at,
      archived_at: projection.archived_at,
      run_id: normalizeOptionalText(input.runId ?? null),
      workflow_template_id: task?.workflow_template_id ?? null,
      workflow_template_slug: task?.workflow_template_slug ?? null,
      metadata_json: boundedMetadataJson(input.metadata),
    })

    const attemptId = Number(result.lastInsertRowid)
    insertLifecycleEvent(db, {
      attemptId,
      workspaceId,
      taskId,
      stageKey,
      attemptNumber,
      status,
      observedAt,
      actorType: input.actorType,
      actorId: input.actorId,
      message: input.message,
      metadata: input.metadata,
    })

    return getAttemptRow(db, attemptId)
  })()

  return serializeAttemptRow(db, row, [], DEFAULT_LIFECYCLE_LIMIT).attempt
}

export function appendTaskStageAttemptEvent(
  db: Database.Database,
  input: AppendTaskStageAttemptEventInput,
): SerializedTaskStageAttempt {
  const status = validateLifecycleStatus(input.status)
  const attemptId = positiveInteger(input.attemptId, 'attempt_id')
  const observedAt = input.observedAt ?? new Date().toISOString()

  const row = db.transaction(() => {
    const attempt = getAttemptRow(db, attemptId)
    insertLifecycleEvent(db, {
      attemptId,
      workspaceId: attempt.workspace_id,
      taskId: attempt.task_id,
      stageKey: attempt.stage_key,
      attemptNumber: attempt.attempt_number,
      status,
      observedAt,
      actorType: input.actorType,
      actorId: input.actorId,
      message: input.message,
      metadata: input.metadata,
    })

    const events = getLifecycleRows(db, attemptId)
    const { projection } = deriveExpectedAttemptProjection(events)
    updateAttemptProjection(db, attemptId, projection)
    return getAttemptRow(db, attemptId)
  })()

  return serializeAttemptRow(db, row, [], DEFAULT_LIFECYCLE_LIMIT).attempt
}

export function archiveTaskStageAttempt(
  db: Database.Database,
  input: ArchiveTaskStageAttemptInput,
): SerializedTaskStageAttempt {
  return appendTaskStageAttemptEvent(db, {
    attemptId: input.attemptId,
    status: 'archived',
    observedAt: input.observedAt,
    actorType: input.actorType,
    actorId: input.actorId,
    message: input.message,
    metadata: input.metadata,
  })
}

export function listTaskStageAttemptsForTask(
  db: Database.Database,
  input: ListTaskStageAttemptsInput,
): TaskStageAttemptEnvelope {
  const workspaceId = positiveInteger(input.workspaceId, 'workspace_id')
  const taskId = positiveInteger(input.taskId, 'task_id')
  const lifecycleLimit = Math.max(1, Math.min(input.lifecycleLimit ?? DEFAULT_LIFECYCLE_LIMIT, DEFAULT_LIFECYCLE_LIMIT))
  const warnings: TaskStageAttemptWarning[] = []
  const task = db.prepare(`
    SELECT id, workspace_id, title, status, workflow_template_id, workflow_template_slug
    FROM tasks
    WHERE id = ? AND workspace_id = ?
  `).get(taskId, workspaceId) as TaskRow | undefined

  const attempts = db.prepare(`
    SELECT *
    FROM task_stage_attempts
    WHERE workspace_id = ? AND task_id = ?
    ORDER BY stage_key ASC, attempt_number DESC
  `).all(workspaceId, taskId) as AttemptRow[]

  return {
    schema_version: 'task_stage_attempts.v1',
    task: task === undefined
      ? null
      : {
          id: String(task.id),
          workspace_id: String(task.workspace_id),
          title: task.title,
          status: task.status,
        },
    attempts: attempts.map((attempt) => serializeAttemptRow(db, attempt, warnings, lifecycleLimit).attempt),
    warnings,
  }
}

export function deriveExpectedAttemptProjection(events: readonly EventRow[]): ProjectionWithLifecycle {
  const validEvents = events.filter((event) => isLifecycleStatus(event.status))
  const latestValidLifecycle = validEvents.at(-1) ?? null
  let startedAt: string | null = null
  let completedAt: string | null = null
  let archivedAt: string | null = null

  for (const event of validEvents) {
    if (event.status === 'running' && startedAt === null) {
      startedAt = event.observed_at
    }
    if (TERMINAL_COMPLETED_STATUSES.has(event.status)) {
      completedAt = event.observed_at
    }
    if (event.status === 'archived') {
      archivedAt = event.observed_at
    }
  }

  return {
    projection: {
      status: latestValidLifecycle?.status ?? null,
      updated_at: latestValidLifecycle?.observed_at ?? null,
      started_at: startedAt,
      completed_at: completedAt,
      archived_at: archivedAt,
    },
    latestValidLifecycle,
  }
}

export function buildTaskStageAttemptWarnings(
  attempt: AttemptRow,
  events: readonly EventRow[],
): TaskStageAttemptWarning[] {
  const warnings: TaskStageAttemptWarning[] = []

  if (!isLifecycleStatus(attempt.status)) {
    warnings.push({
      code: 'invalid_attempt_state',
      attempt_id: String(attempt.id),
      field: 'status',
    })
  }

  for (const event of events) {
    if (!isLifecycleStatus(event.status)) {
      warnings.push({
        code: 'invalid_lifecycle_state',
        attempt_id: String(attempt.id),
        field: 'lifecycle.status',
        event_id: String(event.id),
        value: event.status,
      })
    }
  }

  if (isLifecycleStatus(attempt.status)) {
    const { projection, latestValidLifecycle } = deriveExpectedAttemptProjection(events)
    for (const field of ['status', 'updated_at', 'started_at', 'completed_at', 'archived_at'] as const) {
      const projectionValue = attempt[field]
      const expectedValue = projection[field]
      if (projectionValue !== expectedValue) {
        warnings.push({
          code: 'projection_drift',
          attempt_id: String(attempt.id),
          field,
          projection_value: projectionValue,
          expected_value: expectedValue,
          latest_valid_lifecycle: latestValidLifecycle === null
            ? null
            : {
                status: latestValidLifecycle.status as TaskStageAttemptLifecycleStatus,
                observed_at: latestValidLifecycle.observed_at,
              },
        })
      }
    }
  }

  return warnings
}

function serializeAttemptRow(
  db: Database.Database,
  attempt: AttemptRow,
  warnings: TaskStageAttemptWarning[],
  lifecycleLimit: number,
): { attempt: SerializedTaskStageAttempt; warnings: TaskStageAttemptWarning[] } {
  const events = getLifecycleRows(db, attempt.id)
  warnings.push(...buildTaskStageAttemptWarnings(attempt, events))
  const validEvents = events.filter((event) => isLifecycleStatus(event.status))
  const lifecycle = validEvents
    .slice(-lifecycleLimit)
    .map((event) => ({
      id: String(event.id),
      status: event.status as TaskStageAttemptLifecycleStatus,
      observed_at: event.observed_at,
      actor_type: event.actor_type,
      actor_id: event.actor_id,
      message: event.message,
      metadata: parseMetadataJson(event.metadata_json),
    }))
  const { runLink, runSummary } = resolveRunLink(db, attempt)

  return {
    attempt: {
      id: String(attempt.id),
      workspace_id: String(attempt.workspace_id),
      task_id: String(attempt.task_id),
      stage_key: attempt.stage_key,
      attempt_number: attempt.attempt_number,
      status: isLifecycleStatus(attempt.status) ? attempt.status : 'invalid_state',
      created_at: attempt.created_at,
      updated_at: attempt.updated_at,
      started_at: attempt.started_at,
      completed_at: attempt.completed_at,
      archived_at: attempt.archived_at,
      workflow_template_id: attempt.workflow_template_id,
      workflow_template_slug: attempt.workflow_template_slug,
      run_id: attempt.run_id,
      run_link: runLink,
      run_summary: runSummary,
      metadata: parseMetadataJson(attempt.metadata_json),
      lifecycle,
    },
    warnings,
  }
}

function resolveRunLink(
  db: Database.Database,
  attempt: AttemptRow,
): { runLink: RunLink; runSummary: RunSummary | null } {
  if (attempt.run_id === null || attempt.run_id.trim() === '') {
    return { runLink: { state: 'none' }, runSummary: null }
  }

  if (!tableExists(db, 'runs')) {
    return {
      runLink: { state: 'missing_unavailable', run_id: attempt.run_id },
      runSummary: null,
    }
  }

  const row = db.prepare(`
    SELECT id, status, started_at, ended_at, agent_name, runtime, git_branch, git_commit, error
    FROM runs
    WHERE id = ? AND workspace_id = ?
  `).get(attempt.run_id, attempt.workspace_id) as RunSummary | undefined

  if (row === undefined) {
    return {
      runLink: { state: 'missing_unavailable', run_id: attempt.run_id },
      runSummary: null,
    }
  }

  return {
    runLink: { state: 'linked', run_id: attempt.run_id },
    runSummary: {
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      agent_name: row.agent_name,
      runtime: row.runtime,
      git_branch: row.git_branch,
      git_commit: row.git_commit,
      error: row.error,
    },
  }
}

function insertLifecycleEvent(
  db: Database.Database,
  input: {
    readonly attemptId: number
    readonly workspaceId: number
    readonly taskId: number
    readonly stageKey: string
    readonly attemptNumber: number
    readonly status: TaskStageAttemptLifecycleStatus
    readonly observedAt: string
    readonly actorType?: string | null | undefined
    readonly actorId?: string | null | undefined
    readonly message?: string | null | undefined
    readonly metadata?: unknown
  },
): void {
  db.prepare(`
    INSERT INTO task_stage_attempt_events (
      attempt_id, workspace_id, task_id, stage_key, attempt_number,
      status, observed_at, actor_type, actor_id, message, metadata_json
    ) VALUES (
      @attempt_id, @workspace_id, @task_id, @stage_key, @attempt_number,
      @status, @observed_at, @actor_type, @actor_id, @message, @metadata_json
    )
  `).run({
    attempt_id: input.attemptId,
    workspace_id: input.workspaceId,
    task_id: input.taskId,
    stage_key: input.stageKey,
    attempt_number: input.attemptNumber,
    status: input.status,
    observed_at: input.observedAt,
    actor_type: normalizeOptionalText(input.actorType ?? null),
    actor_id: normalizeOptionalText(input.actorId ?? null),
    message: normalizeOptionalText(input.message ?? null),
    metadata_json: boundedMetadataJson(input.metadata),
  })
}

function updateAttemptProjection(
  db: Database.Database,
  attemptId: number,
  projection: AttemptProjection,
): void {
  if (projection.status === null || projection.updated_at === null) {
    throw new Error('missing_lifecycle_projection')
  }
  db.prepare(`
    UPDATE task_stage_attempts
    SET status = ?,
        updated_at = ?,
        started_at = ?,
        completed_at = ?,
        archived_at = ?
    WHERE id = ?
  `).run(
    projection.status,
    projection.updated_at,
    projection.started_at,
    projection.completed_at,
    projection.archived_at,
    attemptId,
  )
}

function getAttemptRow(db: Database.Database, attemptId: number): AttemptRow {
  const row = db.prepare('SELECT * FROM task_stage_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined
  if (row === undefined) {
    throw new Error('task_stage_attempt_not_found')
  }
  return row
}

function getLifecycleRows(db: Database.Database, attemptId: number): EventRow[] {
  return db.prepare(`
    SELECT *
    FROM task_stage_attempt_events
    WHERE attempt_id = ?
    ORDER BY observed_at ASC, id ASC
  `).all(attemptId) as EventRow[]
}

function projectionForSingleEvent(status: TaskStageAttemptLifecycleStatus, observedAt: string): AttemptProjection {
  return {
    status,
    updated_at: observedAt,
    started_at: status === 'running' ? observedAt : null,
    completed_at: TERMINAL_COMPLETED_STATUSES.has(status) ? observedAt : null,
    archived_at: status === 'archived' ? observedAt : null,
  }
}

function validateLifecycleStatus(status: string): TaskStageAttemptLifecycleStatus {
  if (!isLifecycleStatus(status)) {
    throw new Error(`invalid_lifecycle_status:${status}`)
  }
  return status
}

function isLifecycleStatus(status: string | null | undefined): status is TaskStageAttemptLifecycleStatus {
  return typeof status === 'string' && VALID_STATUSES.has(status)
}

function normalizeStageKey(value: string): string {
  const stageKey = value.trim()
  if (stageKey.length === 0) {
    throw new Error('invalid_stage_key')
  }
  return stageKey.slice(0, MAX_TEXT_LENGTH)
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null
  const normalized = value.trim()
  if (normalized.length === 0) return null
  return normalized.slice(0, MAX_TEXT_LENGTH)
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid_${field}`)
  }
  return value
}

function boundedMetadataJson(value: unknown): string | null {
  if (value === undefined || value === null) return null
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    serialized = JSON.stringify({ unserializable: true })
  }
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_METADATA_BYTES) {
    return serialized
  }
  return JSON.stringify({
    truncated: true,
    original_byte_length: Buffer.byteLength(serialized, 'utf8'),
  })
}

function parseMetadataJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return row !== undefined
}
