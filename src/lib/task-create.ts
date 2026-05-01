import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'

const runtimeRequire = createRequire(import.meta.url)

interface MentionResolutionLite {
  unresolved: string[]
  recipients: string[]
}

interface GitHubSyncTask {
  id: number
  title: string
  description?: string | null
  status: string
  priority: string
  github_issue_number?: number | null
  github_repo?: string | null
  workspace_id?: number
}

interface GitHubSyncProject {
  id: number
  github_repo?: string | null
  github_sync_enabled?: number | null
}

interface GnapTask {
  id: number
  title: string
  description?: string | null
  status: string
  priority: string
  assigned_to?: string | null
  tags?: string[] | string | null
  created_at?: number | null
  updated_at?: number | null
  project_id?: number | null
}

interface RuntimeGnapConfig {
  enabled?: boolean
  autoSync?: boolean
  repoPath?: string
}

export type TaskCreateSource =
  | 'api'
  | 'github_import'
  | 'github_sync'
  | 'recurring'
  | 'pipeline_successor'

export interface CreateTaskActivityInput {
  type?: string
  actor?: string
  description?: string
  data?: Record<string, unknown>
}

export interface CreateTaskRuntimeDependencies {
  getDatabase?: () => Database.Database
  broadcast?: (type: string, data: unknown) => unknown
  resolveMentionRecipients?: (text: string, db: Database.Database, workspaceId: number) => MentionResolutionLite
  pushTaskToGitHub?: (task: GitHubSyncTask, project: GitHubSyncProject) => Promise<void> | void
  pushTaskToGnap?: (task: GnapTask, repoPath: string) => unknown
  gnap?: RuntimeGnapConfig
}

export interface CreateTaskInput {
  source: TaskCreateSource
  db?: Database.Database
  runtime?: CreateTaskRuntimeDependencies
  transaction?: 'internal' | 'caller'
  deferOutboundSync?: boolean
  title: string
  description?: string | null
  status?: string
  priority?: string
  assigned_to?: string | null
  project_id?: number | null
  workspace_id: number
  created_by?: string | null
  due_date?: number | null
  estimated_hours?: number | null
  actual_hours?: number | null
  outcome?: string | null
  error_message?: string | null
  resolution?: string | null
  feedback_rating?: number | null
  feedback_notes?: string | null
  retry_count?: number | null
  completed_at?: number | null
  tags?: string[]
  metadata?: Record<string, unknown> | null
  workflow_template_id?: number | null
  workflow_template_slug?: string | null
  parent_task_id?: number | null
  root_task_id?: number | null
  chain_id?: string | null
  chain_stage?: number | null
  github_issue_number?: number | null
  github_repo?: string | null
  github_synced_at?: number | null
  activity?: CreateTaskActivityInput
}

export interface CreateTaskSideEffects {
  ticketAllocated: boolean
  activityLogged: boolean
  creatorSubscribed: boolean
  notificationsQueued: boolean
  outboundSyncQueued: boolean
  broadcastQueued: boolean
}

export interface CreateTaskOutboundSyncResult {
  githubQueued: boolean
  gatewayQueued: boolean
  deferred?: boolean
}

export interface CreatedTask extends Record<string, unknown> {
  id: number
  title: string
  description?: string | null
  status: string
  priority: string
  tags: string[]
  metadata: Record<string, unknown>
  ticket_ref: string | null
}

export interface CreateTaskResult {
  taskId: number
  ticket: string | null
  task?: CreatedTask | undefined
  activityIds: number[]
  notificationIds: number[]
  subscriptionRecipients: string[]
  outboundSync: CreateTaskOutboundSyncResult
  sideEffects: CreateTaskSideEffects
  duplicate?: boolean
}

function getRuntimeDatabase(): () => Database.Database {
  return (runtimeRequire('./db') as { getDatabase: () => Database.Database }).getDatabase
}

function getRuntimeEventBus(): { broadcast: (type: string, data: unknown) => unknown } {
  return (runtimeRequire('./event-bus') as { eventBus: { broadcast: (type: string, data: unknown) => unknown } }).eventBus
}

function getRuntimeConfig(): { gnap: RuntimeGnapConfig } {
  return (runtimeRequire('./config') as { config: { gnap: RuntimeGnapConfig } }).config
}

function getRuntimeLogger(): { error: (data: unknown, message: string) => void; warn: (data: unknown, message: string) => void } {
  return (runtimeRequire('./logger') as { logger: { error: (data: unknown, message: string) => void; warn: (data: unknown, message: string) => void } }).logger
}

function getRuntimeGitHubSync(): { pushTaskToGitHub: (task: GitHubSyncTask, project: GitHubSyncProject) => Promise<void> } {
  return (runtimeRequire('./github-sync-engine') as { pushTaskToGitHub: (task: GitHubSyncTask, project: GitHubSyncProject) => Promise<void> })
}

function getRuntimeGnapSync(): { pushTaskToGnap: (task: GnapTask, repoPath: string) => void } {
  return (runtimeRequire('./gnap-sync') as { pushTaskToGnap: (task: GnapTask, repoPath: string) => void })
}

function getRuntimeMentions(): { resolveMentionRecipients: (text: string, db: Database.Database, workspaceId: number) => MentionResolutionLite } {
  return (runtimeRequire('./mentions') as { resolveMentionRecipients: (text: string, db: Database.Database, workspaceId: number) => MentionResolutionLite })
}

function broadcast(input: CreateTaskInput, type: string, data: unknown): void {
  if (input.runtime?.broadcast) {
    input.runtime.broadcast(type, data)
    return
  }
  getRuntimeEventBus().broadcast(type, data)
}

function logOutboundFailure(level: 'error' | 'warn', message: string, err: unknown, taskId: unknown): void {
  try {
    getRuntimeLogger()[level]({ err, taskId }, message)
  } catch {
    // Logging must not turn a queued fire-and-forget sync into a create failure.
  }
}

export const TASK_CREATE_SOURCE_PROFILES: Record<TaskCreateSource, CreateTaskSideEffects> = {
  api: {
    ticketAllocated: true,
    activityLogged: true,
    creatorSubscribed: true,
    notificationsQueued: true,
    outboundSyncQueued: true,
    broadcastQueued: true,
  },
  github_import: {
    ticketAllocated: false,
    activityLogged: true,
    creatorSubscribed: false,
    notificationsQueued: false,
    outboundSyncQueued: false,
    broadcastQueued: true,
  },
  github_sync: {
    ticketAllocated: false,
    activityLogged: true,
    creatorSubscribed: false,
    notificationsQueued: false,
    outboundSyncQueued: false,
    broadcastQueued: false,
  },
  recurring: {
    ticketAllocated: true,
    activityLogged: true,
    creatorSubscribed: false,
    notificationsQueued: false,
    outboundSyncQueued: false,
    broadcastQueued: false,
  },
  pipeline_successor: {
    ticketAllocated: true,
    activityLogged: true,
    creatorSubscribed: false,
    notificationsQueued: true,
    outboundSyncQueued: true,
    broadcastQueued: true,
  },
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function columnsFor(db: Database.Database, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set()
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name))
}

function formatTicket(prefix?: string | null, num?: number | null): string | null {
  if (!prefix || typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return null
  return `${prefix}-${String(num).padStart(3, '0')}`
}

function parseJsonField(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function mapTaskRow(row: Record<string, unknown> | undefined): CreatedTask | undefined {
  if (!row) return undefined
  return {
    ...row,
    id: row['id'] as number,
    title: row['title'] as string,
    description: row['description'] as string | null | undefined,
    status: row['status'] as string,
    priority: row['priority'] as string,
    tags: parseJsonField(row['tags'], []),
    metadata: parseJsonField(row['metadata'], {}),
    ticket_ref: formatTicket(row['project_prefix'] as string | null, row['project_ticket_no'] as number | null),
  } as CreatedTask
}

function fetchTask(db: Database.Database, taskId: number, workspaceId: number): CreatedTask | undefined {
  if (tableExists(db, 'projects')) {
    const projectColumns = columnsFor(db, 'projects')
    const projectNameSelect = projectColumns.has('name') ? 'p.name AS project_name' : 'NULL AS project_name'
    const projectPrefixSelect = projectColumns.has('ticket_prefix') ? 'p.ticket_prefix AS project_prefix' : 'NULL AS project_prefix'
    const row = db.prepare(`
      SELECT t.*, ${projectNameSelect}, ${projectPrefixSelect}
      FROM tasks t
      LEFT JOIN projects p
        ON p.id = t.project_id AND p.workspace_id = t.workspace_id
      WHERE t.id = ? AND t.workspace_id = ?
    `).get(taskId, workspaceId) as Record<string, unknown> | undefined
    return mapTaskRow(row)
  }
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(taskId, workspaceId) as Record<string, unknown> | undefined
  return mapTaskRow(row)
}

function findDuplicate(db: Database.Database, input: CreateTaskInput): number | null {
  const taskColumns = columnsFor(db, 'tasks')
  if (input.source === 'github_import') {
    const repo = input.metadata?.['github_repo']
    const issueNumber = input.metadata?.['github_issue_number']
    if (typeof repo === 'string' && typeof issueNumber === 'number' && taskColumns.has('metadata')) {
      const existing = db.prepare(`
        SELECT id FROM tasks
        WHERE json_extract(metadata, '$.github_repo') = ?
          AND json_extract(metadata, '$.github_issue_number') = ?
          AND workspace_id = ?
        LIMIT 1
      `).get(repo, issueNumber, input.workspace_id) as { id: number } | undefined
      return existing?.id ?? null
    }
  }
  if (input.source === 'github_sync' && input.github_repo && input.github_issue_number && taskColumns.has('github_repo') && taskColumns.has('github_issue_number')) {
    const existing = db.prepare(`
      SELECT id FROM tasks
      WHERE github_repo = ? AND github_issue_number = ? AND workspace_id = ?
      LIMIT 1
    `).get(input.github_repo, input.github_issue_number, input.workspace_id) as { id: number } | undefined
    return existing?.id ?? null
  }
  if (input.source === 'pipeline_successor' && input.parent_task_id && taskColumns.has('parent_task_id')) {
    const existing = db.prepare(`
      SELECT id FROM tasks
      WHERE parent_task_id = ? AND workspace_id = ?
      LIMIT 1
    `).get(input.parent_task_id, input.workspace_id) as { id: number } | undefined
    return existing?.id ?? null
  }
  return null
}

function defaultActivity(input: CreateTaskInput): Required<CreateTaskActivityInput> {
  const actor = input.activity?.actor ?? input.created_by ?? (input.source === 'github_sync' ? 'github-sync' : 'system')
  if (input.activity?.description) {
    return {
      type: input.activity.type ?? 'task_created',
      actor,
      description: input.activity.description,
      data: input.activity.data ?? {},
    }
  }
  return {
    type: 'task_created',
    actor,
    description: `Created task: ${input.title}`,
    data: {
      title: input.title,
      status: input.status ?? (input.assigned_to ? 'assigned' : 'inbox'),
      priority: input.priority ?? 'medium',
      assigned_to: input.assigned_to ?? null,
      ...(input.outcome ? { outcome: input.outcome } : {}),
    },
  }
}

function insertActivity(
  input: CreateTaskInput,
  db: Database.Database,
  activity: Required<CreateTaskActivityInput>,
  taskId: number,
  workspaceId: number,
): number {
  const result = db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    VALUES (?, 'task', ?, ?, ?, ?, ?)
  `).run(activity.type, taskId, activity.actor, activity.description, JSON.stringify(activity.data), workspaceId)
  const id = Number(result.lastInsertRowid)
  broadcast(input, 'activity.created', {
    id,
    type: activity.type,
    entity_type: 'task',
    entity_id: taskId,
    actor: activity.actor,
    description: activity.description,
    data: activity.data,
    created_at: Math.floor(Date.now() / 1000),
    workspace_id: workspaceId,
  })
  return id
}

function ensureSubscription(db: Database.Database, taskId: number, recipient: string, workspaceId: number): boolean {
  if (!recipient || !tableExists(db, 'task_subscriptions')) return false
  const result = db.prepare(`
    INSERT OR IGNORE INTO task_subscriptions (task_id, agent_name)
    SELECT t.id, ?
    FROM tasks t
    WHERE t.id = ? AND t.workspace_id = ?
  `).run(recipient, taskId, workspaceId)
  return result.changes > 0
}

function insertNotification(
  input: CreateTaskInput,
  db: Database.Database,
  recipient: string,
  type: string,
  title: string,
  message: string,
  sourceId: number,
  workspaceId: number,
): number {
  const result = db.prepare(`
    INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
    VALUES (?, ?, ?, ?, 'task', ?, ?)
  `).run(recipient, type, title, message, sourceId, workspaceId)
  const id = Number(result.lastInsertRowid)
  broadcast(input, 'notification.created', {
    id,
    recipient,
    type,
    title,
    message,
    source_type: 'task',
    source_id: sourceId,
    created_at: Math.floor(Date.now() / 1000),
    workspace_id: workspaceId,
  })
  return id
}

function allocateTicket(db: Database.Database, input: CreateTaskInput): { ticketNo: number | null; ticket: string | null } {
  if (!input.project_id || !tableExists(db, 'projects')) return { ticketNo: null, ticket: null }
  db.prepare(`
    UPDATE projects
    SET ticket_counter = ticket_counter + 1, updated_at = unixepoch()
    WHERE id = ? AND workspace_id = ?
  `).run(input.project_id, input.workspace_id)
  const row = db.prepare(`
    SELECT ticket_counter, ticket_prefix FROM projects
    WHERE id = ? AND workspace_id = ?
  `).get(input.project_id, input.workspace_id) as { ticket_counter: number; ticket_prefix?: string | null } | undefined
  if (!row?.ticket_counter) throw new Error('Failed to allocate project ticket number')
  return { ticketNo: row.ticket_counter, ticket: formatTicket(row.ticket_prefix, row.ticket_counter) }
}

function insertTask(db: Database.Database, input: CreateTaskInput, ticketNo: number | null): number {
  const now = Math.floor(Date.now() / 1000)
  const taskColumns = columnsFor(db, 'tasks')
  const values: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? (input.assigned_to ? 'assigned' : 'inbox'),
    priority: input.priority ?? 'medium',
    project_id: input.project_id ?? null,
    project_ticket_no: ticketNo,
    assigned_to: input.assigned_to ?? null,
    created_by: input.created_by ?? (input.source === 'github_sync' ? 'github-sync' : 'system'),
    created_at: now,
    updated_at: now,
    due_date: input.due_date ?? null,
    estimated_hours: input.estimated_hours ?? null,
    actual_hours: input.actual_hours ?? null,
    outcome: input.outcome ?? null,
    error_message: input.error_message ?? null,
    resolution: input.resolution ?? null,
    feedback_rating: input.feedback_rating ?? null,
    feedback_notes: input.feedback_notes ?? null,
    retry_count: input.retry_count ?? 0,
    completed_at: input.completed_at ?? null,
    tags: JSON.stringify(input.tags ?? []),
    metadata: JSON.stringify(input.metadata ?? {}),
    workspace_id: input.workspace_id,
    workflow_template_id: input.workflow_template_id ?? null,
    workflow_template_slug: input.workflow_template_slug ?? null,
    parent_task_id: input.parent_task_id ?? null,
    root_task_id: input.root_task_id ?? null,
    chain_id: input.chain_id ?? null,
    chain_stage: input.chain_stage ?? null,
    github_issue_number: input.github_issue_number ?? null,
    github_repo: input.github_repo ?? null,
    github_synced_at: input.github_synced_at ?? null,
  }
  const columns = Object.keys(values).filter((column) => taskColumns.has(column))
  const placeholders = columns.map(() => '?').join(', ')
  const result = db.prepare(`
    INSERT INTO tasks (${columns.join(', ')})
    VALUES (${placeholders})
  `).run(...columns.map((column) => values[column]))
  return Number(result.lastInsertRowid)
}

function maybeRunOutboundSync(
  db: Database.Database,
  input: CreateTaskInput,
  task: CreatedTask | undefined,
): CreateTaskOutboundSyncResult {
  const result: CreateTaskOutboundSyncResult = { githubQueued: false, gatewayQueued: false }
  if (!TASK_CREATE_SOURCE_PROFILES[input.source].outboundSyncQueued || !task) return result

  let project: GitHubSyncProject | undefined
  if (input.project_id && tableExists(db, 'projects')) {
    project = db.prepare(`
      SELECT id, github_repo, github_sync_enabled
      FROM projects
      WHERE id = ? AND workspace_id = ?
    `).get(input.project_id, input.workspace_id) as GitHubSyncProject | undefined
    result.githubQueued = Boolean(project?.github_sync_enabled && project.github_repo)
  }

  const gnap = input.runtime?.gnap ?? getRuntimeConfig().gnap
  result.gatewayQueued = Boolean(gnap.enabled && gnap.autoSync !== false)

  if (input.deferOutboundSync) {
    if (result.githubQueued || result.gatewayQueued) result.deferred = true
    return result
  }

  if (result.githubQueued && project) {
    const pushTaskToGitHub = input.runtime?.pushTaskToGitHub ?? getRuntimeGitHubSync().pushTaskToGitHub
    try {
      const maybePromise = pushTaskToGitHub(task, project)
      if (maybePromise) {
        maybePromise.catch((err: unknown) => {
          logOutboundFailure('error', 'Outbound GitHub sync failed for new task', err, task.id)
        })
      }
    } catch (err) {
      logOutboundFailure('error', 'Outbound GitHub sync failed for new task', err, task.id)
    }
  }
  if (result.gatewayQueued) {
    const pushTaskToGnap = input.runtime?.pushTaskToGnap ?? getRuntimeGnapSync().pushTaskToGnap
    try {
      pushTaskToGnap(task, gnap.repoPath ?? '')
    } catch (err) {
      logOutboundFailure('warn', 'GNAP sync failed for new task', err, task.id)
    }
  }
  return result
}

export function createTask(input: CreateTaskInput): CreateTaskResult {
  const db = input.db ?? (input.runtime?.getDatabase ?? getRuntimeDatabase())()
  const profile = TASK_CREATE_SOURCE_PROFILES[input.source]
  const activityIds: number[] = []
  const notificationIds: number[] = []
  const subscriptionRecipients: string[] = []

  const duplicateId = findDuplicate(db, input)
  if (duplicateId) {
    return {
      taskId: duplicateId,
      ticket: null,
      task: fetchTask(db, duplicateId, input.workspace_id),
      activityIds,
      notificationIds,
      subscriptionRecipients,
      outboundSync: { githubQueued: false, gatewayQueued: false },
      sideEffects: profile,
      duplicate: true,
    }
  }

  const mentionResolution = input.source === 'api'
    ? (input.runtime?.resolveMentionRecipients ?? getRuntimeMentions().resolveMentionRecipients)(input.description ?? '', db, input.workspace_id)
    : { unresolved: [], recipients: [] as string[] }
  if (mentionResolution.unresolved.length > 0) {
    throw new Error(`Unknown mentions: ${mentionResolution.unresolved.map((mention: string) => `@${mention}`).join(', ')}`)
  }

  let ticket: string | null = null
  let taskId = 0
  const runDbWork = () => {
    const allocation = profile.ticketAllocated ? allocateTicket(db, input) : { ticketNo: null, ticket: null }
    ticket = allocation.ticket
    taskId = insertTask(db, input, allocation.ticketNo)

    if (profile.activityLogged && tableExists(db, 'activities')) {
      activityIds.push(insertActivity(input, db, defaultActivity(input), taskId, input.workspace_id))
    }

    const subscribe = (recipient: string) => {
      if (!subscriptionRecipients.includes(recipient) && ensureSubscription(db, taskId, recipient, input.workspace_id)) {
        subscriptionRecipients.push(recipient)
      }
    }

    const actor = input.created_by ?? null
    if (profile.creatorSubscribed && actor) subscribe(actor)

    if (profile.notificationsQueued && tableExists(db, 'notifications')) {
      for (const recipient of mentionResolution.recipients) {
        subscribe(recipient)
        if (recipient === actor) continue
        notificationIds.push(insertNotification(
          input,
          db,
          recipient,
          'mention',
          'You were mentioned in a task description',
          `${actor ?? 'Someone'} mentioned you in task "${input.title}"`,
          taskId,
          input.workspace_id,
        ))
      }

      if (input.assigned_to) {
        subscribe(input.assigned_to)
        notificationIds.push(insertNotification(
          input,
          db,
          input.assigned_to,
          'assignment',
          'Task Assigned',
          `You have been assigned to task: ${input.title}`,
          taskId,
          input.workspace_id,
        ))
      }
    }
  }

  if (input.transaction === 'caller') {
    runDbWork()
  } else {
    db.transaction(runDbWork)()
  }

  const task = fetchTask(db, taskId, input.workspace_id)
  const outboundSync = maybeRunOutboundSync(db, input, task)
  if (profile.broadcastQueued && task) broadcast(input, 'task.created', task)

  return {
    taskId,
    ticket,
    task,
    activityIds,
    notificationIds,
    subscriptionRecipients,
    outboundSync,
    sideEffects: profile,
  }
}
