import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, sep } from 'path'
import { resolveFlag } from './feature-flags'
import type Database from 'better-sqlite3'

export const AGENT_SANDBOX_OWNERS = [
  'mission_control',
  'openclaw',
  'external_harness',
] as const

export type AgentSandboxOwner = (typeof AGENT_SANDBOX_OWNERS)[number]

export const AGENT_SANDBOX_LIFECYCLE_STATUSES = [
  'created',
  'prepared',
  'running',
  'terminal',
  'cleanup_pending',
  'cleaned_up',
  'rolled_back',
  'cleanup_failed',
] as const

export type AgentSandboxLifecycleStatus = (typeof AGENT_SANDBOX_LIFECYCLE_STATUSES)[number]

const NONTERMINAL_STATUSES = new Set<AgentSandboxLifecycleStatus>([
  'created',
  'prepared',
  'running',
  'terminal',
  'cleanup_pending',
])

const RESERVED_SEGMENTS = new Set([
  '.',
  '..',
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY|bearer\s+[A-Za-z0-9._-]{20,}|token\s*[:=]|secret\s*[:=]|password\s*[:=]|api[_-]?key\s*[:=])/i
const SAFE_METADATA_KEYS = new Set([
  'reason',
  'reason_code',
  'detail',
  'error_code',
  'diagnostic',
  'result',
  'status',
])

interface WorkspaceFlagRow {
  readonly feature_flags: string | null
}

interface LifecycleRow {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly sandbox_attempt_key: string
  readonly task_stage_attempt_id: number | null
  readonly task_stage_claim_id: number | null
  readonly owner: AgentSandboxOwner
  readonly sandbox_key: string
  readonly root_id: string
  readonly sanitized_relative_path: string
  readonly handle_id: string | null
  readonly status: AgentSandboxLifecycleStatus
  readonly created_at: string
  readonly updated_at: string
  readonly prepared_at: string | null
  readonly running_at: string | null
  readonly terminal_at: string | null
  readonly cleanup_requested_at: string | null
  readonly cleaned_up_at: string | null
  readonly metadata_json: string | null
}

interface EventRow {
  readonly id: number
  readonly event_type: string
  readonly status: AgentSandboxLifecycleStatus | null
  readonly reason_code: string | null
  readonly observed_at: string
  readonly actor_type: string | null
  readonly actor_id: string | null
  readonly metadata_json: string | null
}

export interface BuildSandboxKeyInput {
  readonly workspaceId: number
  readonly productLineSlug: string
  readonly taskId: number
  readonly stageKey: string
  readonly attemptId: string | number
  readonly owner: AgentSandboxOwner
}

export interface AgentSandboxLifecycleInput extends BuildSandboxKeyInput {
  readonly taskStageAttemptId?: number | null
  readonly taskStageClaimId?: number | null
  readonly rootId?: string | undefined
  readonly dataDir?: string | undefined
  readonly sandboxRoot?: string | undefined
  readonly handleId?: string | null | undefined
  readonly now?: string | undefined
  readonly metadata?: Record<string, unknown> | null | undefined
}

export interface LifecycleMutationResult {
  readonly ok: boolean
  readonly blocked?: boolean
  readonly reused?: boolean
  readonly reason: string
  readonly lifecycle?: SerializedSandboxLifecycle
}

export interface SerializedSandboxLifecycle {
  readonly id: string
  readonly owner: AgentSandboxOwner
  readonly sandbox_key: string
  readonly status: AgentSandboxLifecycleStatus
  readonly root_id: string
  readonly sanitized_relative_path: string
  readonly handle_id: string | null
  readonly task_stage_attempt_id: string | null
  readonly task_stage_claim_id: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly events?: SerializedSandboxLifecycleEvent[]
}

export interface SerializedSandboxLifecycleEvent {
  readonly id: string
  readonly event_type: string
  readonly status: AgentSandboxLifecycleStatus | null
  readonly reason_code: string | null
  readonly observed_at: string
}

export interface SandboxLifecycleReadModel {
  readonly schema_version: 'sandbox_lifecycle.v1'
  readonly feature_flag: {
    readonly key: 'FEATURE_AGENT_RUNNER_SANDBOXES'
    readonly enabled: boolean
    readonly mutation_state: 'enabled' | 'disabled'
  }
  readonly task: {
    readonly id: string
    readonly workspace_id: string
    readonly stage_key: string | null
  }
  readonly lifecycles: SerializedSandboxLifecycle[]
  readonly diagnostics: {
    readonly warnings: string[]
  }
}

export function isAgentSandboxOwner(value: unknown): value is AgentSandboxOwner {
  return typeof value === 'string' && (AGENT_SANDBOX_OWNERS as readonly string[]).includes(value)
}

export function normalizeSandboxSegment(value: string | number, field: string): string {
  const raw = String(value)
  if (raw !== raw.trim()) {
    throw new Error(`invalid_${field}_segment_whitespace`)
  }
  const normalized = raw.normalize('NFC')
  if (normalized.length === 0) {
    throw new Error(`invalid_${field}_segment_empty`)
  }
  if (normalized !== raw) {
    throw new Error(`invalid_${field}_segment_normalization`)
  }
  if (normalized.includes('/') || normalized.includes('\\') || normalized.includes(':')) {
    throw new Error(`invalid_${field}_segment_separator`)
  }
  if (!SAFE_SEGMENT.test(normalized)) {
    throw new Error(`invalid_${field}_segment_charset`)
  }
  if (RESERVED_SEGMENTS.has(normalized.toLowerCase())) {
    throw new Error(`invalid_${field}_segment_reserved`)
  }
  return normalized
}

export function buildSandboxKey(input: BuildSandboxKeyInput): string {
  if (!Number.isSafeInteger(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error('invalid_workspace_id')
  }
  if (!Number.isSafeInteger(input.taskId) || input.taskId <= 0) {
    throw new Error('invalid_task_id')
  }
  if (!isAgentSandboxOwner(input.owner)) {
    throw new Error('invalid_owner')
  }
  const workspaceId = normalizeSandboxSegment(input.workspaceId, 'workspace')
  const productLineSlug = normalizeSandboxSegment(input.productLineSlug, 'product_line')
  const taskId = normalizeSandboxSegment(input.taskId, 'task')
  const stageKey = normalizeSandboxSegment(input.stageKey, 'stage')
  const attemptId = normalizeSandboxSegment(input.attemptId, 'attempt')
  const owner = normalizeSandboxSegment(input.owner, 'owner')
  return [
    'workspace',
    workspaceId,
    'product-line',
    productLineSlug,
    'task',
    taskId,
    'stage',
    stageKey,
    'attempt',
    attemptId,
    'owner',
    owner,
  ].join('/')
}

export function resolveSandboxRoot(input: {
  readonly dataDir?: string | undefined
  readonly sandboxRoot?: string | undefined
  readonly sanitizedRelativePath: string
}): { readonly rootId: string; readonly rootPath: string; readonly absolutePath: string } {
  const rootPath = resolve(input.sandboxRoot ?? resolve(input.dataDir ?? '.data', 'sandboxes'))
  if (input.sanitizedRelativePath.startsWith('/') || input.sanitizedRelativePath.startsWith('\\')) {
    throw new Error('invalid_relative_path_absolute')
  }
  const relativeSegments = input.sanitizedRelativePath.split('/')
  if (relativeSegments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
    throw new Error('invalid_relative_path_segment')
  }
  for (const segment of relativeSegments) {
    normalizeSandboxSegment(segment, 'relative_path')
  }
  const absolutePath = resolve(rootPath, input.sanitizedRelativePath)
  if (absolutePath !== rootPath && !absolutePath.startsWith(`${rootPath}${sep}`)) {
    throw new Error('invalid_relative_path_escape')
  }
  return {
    rootId: input.sandboxRoot ? 'workspace_configured_sandboxes' : 'mission_control_data_sandboxes',
    rootPath,
    absolutePath,
  }
}

export function isAgentRunnerSandboxesEnabled(db: Database.Database, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as WorkspaceFlagRow | undefined
  return resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', { workspaceFlags: row?.feature_flags ?? null })
}

export function createSandboxLifecycle(
  db: Database.Database,
  input: AgentSandboxLifecycleInput,
): LifecycleMutationResult {
  if (!isAgentRunnerSandboxesEnabled(db, input.workspaceId)) {
    return { ok: false, blocked: true, reason: 'feature_flag_off' }
  }
  const now = input.now ?? new Date().toISOString()
  const metadata = serializeSafeMetadata(input.metadata)
  const sandboxKey = buildSandboxKey(input)
  const sanitizedRelativePath = sandboxKey
  const root = resolveSandboxRoot({
    dataDir: input.dataDir,
    sandboxRoot: input.sandboxRoot,
    sanitizedRelativePath,
  })
  const rootId = normalizeSandboxSegment(input.rootId ?? root.rootId, 'root_id')
  const handleId = normalizeNullableSandboxSegment(input.handleId ?? null, 'handle')
  const existing = selectLifecycleByKey(db, input.workspaceId, sandboxKey)

  if (existing !== undefined) {
    if (
      NONTERMINAL_STATUSES.has(existing.status)
      && existing.owner === input.owner
      && existing.root_id === rootId
      && existing.sanitized_relative_path === sanitizedRelativePath
    ) {
      appendLifecycleEvent(db, existing, {
        eventType: 'create_reused',
        status: existing.status,
        reasonCode: 'idempotent_reuse',
        observedAt: now,
        metadata,
      })
      return { ok: true, reused: true, reason: 'create_reused', lifecycle: serializeLifecycle(existing) }
    }
    return { ok: false, reason: 'sandbox_key_conflict' }
  }

  const insert = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO agent_sandbox_lifecycles (
        workspace_id, task_id, stage_key, sandbox_attempt_key, task_stage_attempt_id,
        task_stage_claim_id, owner, sandbox_key, root_id, sanitized_relative_path,
        handle_id, status, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
    `).run(
      input.workspaceId,
      input.taskId,
      normalizeSandboxSegment(input.stageKey, 'stage'),
      normalizeSandboxSegment(input.attemptId, 'attempt'),
      input.taskStageAttemptId ?? null,
      input.taskStageClaimId ?? null,
      input.owner,
      sandboxKey,
      rootId,
      sanitizedRelativePath,
      handleId,
      now,
      now,
      metadata,
    )
    const lifecycle = selectLifecycleById(db, Number(result.lastInsertRowid))
    if (lifecycle === undefined) throw new Error('lifecycle_insert_failed')
    appendLifecycleEvent(db, lifecycle, {
      eventType: 'created',
      status: 'created',
      reasonCode: 'created',
      observedAt: now,
      metadata,
    })
    return lifecycle
  })()

  return { ok: true, reason: 'created', lifecycle: serializeLifecycle(insert) }
}

export function prepareSandboxLifecycle(
  db: Database.Database,
  lifecycleId: number,
  options: { readonly now?: string | undefined; readonly metadata?: Record<string, unknown> | null | undefined } = {},
): LifecycleMutationResult {
  return transitionLifecycle(db, lifecycleId, 'prepared', ['created'], 'prepared', options)
}

export function markSandboxLifecycleRunning(
  db: Database.Database,
  lifecycleId: number,
  options: { readonly now?: string | undefined; readonly metadata?: Record<string, unknown> | null | undefined } = {},
): LifecycleMutationResult {
  return transitionLifecycle(db, lifecycleId, 'running', ['prepared'], 'running_marked', options)
}

export function markSandboxLifecycleTerminal(
  db: Database.Database,
  lifecycleId: number,
  options: { readonly now?: string | undefined; readonly metadata?: Record<string, unknown> | null | undefined } = {},
): LifecycleMutationResult {
  return transitionLifecycle(db, lifecycleId, 'terminal', ['prepared', 'running'], 'terminal_marked', options)
}

export function rollbackSandboxLifecycle(
  db: Database.Database,
  lifecycleId: number,
  options: {
    readonly now?: string | undefined
    readonly metadata?: Record<string, unknown> | null | undefined
    readonly dataDir?: string | undefined
    readonly sandboxRoot?: string | undefined
  } = {},
): LifecycleMutationResult {
  const lifecycle = selectLifecycleById(db, lifecycleId)
  if (lifecycle === undefined) return { ok: false, reason: 'lifecycle_not_found' }
  if (!isAgentRunnerSandboxesEnabled(db, lifecycle.workspace_id)) {
    return { ok: false, blocked: true, reason: 'feature_flag_off' }
  }
  if (!['created', 'prepared', 'running', 'cleanup_pending'].includes(lifecycle.status)) {
    return { ok: false, reason: 'invalid_lifecycle_transition' }
  }

  const now = options.now ?? new Date().toISOString()
  const root = resolveSandboxRoot({
    dataDir: options.dataDir,
    sandboxRoot: options.sandboxRoot,
    sanitizedRelativePath: lifecycle.sanitized_relative_path,
  })
  rmSync(root.absolutePath, { recursive: true, force: true })
  transitionProjection(db, lifecycle, 'rolled_back', 'rolled_back', 'rolled_back', now, options.metadata)
  return {
    ok: true,
    reason: 'rolled_back',
    lifecycle: serializeLifecycle(selectLifecycleById(db, lifecycleId) ?? lifecycle),
  }
}

export function cleanupSandboxLifecycle(
  db: Database.Database,
  lifecycleId: number,
  options: {
    readonly now?: string | undefined
    readonly metadata?: Record<string, unknown> | null | undefined
    readonly dataDir?: string | undefined
    readonly sandboxRoot?: string | undefined
    readonly failCleanup?: boolean
  } = {},
): LifecycleMutationResult {
  const lifecycle = selectLifecycleById(db, lifecycleId)
  if (lifecycle === undefined) return { ok: false, reason: 'lifecycle_not_found' }
  if (!isAgentRunnerSandboxesEnabled(db, lifecycle.workspace_id)) {
    return { ok: false, blocked: true, reason: 'feature_flag_off' }
  }
  if (!['terminal', 'cleanup_failed'].includes(lifecycle.status)) {
    return { ok: false, reason: 'invalid_lifecycle_transition' }
  }

  const now = options.now ?? new Date().toISOString()
  const root = resolveSandboxRoot({
    dataDir: options.dataDir,
    sandboxRoot: options.sandboxRoot,
    sanitizedRelativePath: lifecycle.sanitized_relative_path,
  })

  transitionProjection(db, lifecycle, 'cleanup_pending', 'cleanup_requested', 'cleanup_requested', now, options.metadata)

  if (options.failCleanup) {
    const failed = selectLifecycleById(db, lifecycleId)
    if (failed === undefined) return { ok: false, reason: 'lifecycle_not_found' }
    transitionProjection(db, failed, 'cleanup_failed', 'cleanup_failed', 'fake_cleanup_failed', now, options.metadata)
    return { ok: false, reason: 'cleanup_failed', lifecycle: serializeLifecycle(selectLifecycleById(db, lifecycleId) ?? failed) }
  }

  try {
    rmSync(root.absolutePath, { recursive: true, force: true })
  } catch {
    const failed = selectLifecycleById(db, lifecycleId)
    if (failed === undefined) return { ok: false, reason: 'lifecycle_not_found' }
    transitionProjection(db, failed, 'cleanup_failed', 'cleanup_failed', 'filesystem_cleanup_failed', now, {
      reason_code: 'filesystem_cleanup_failed',
    })
    return { ok: false, reason: 'cleanup_failed', lifecycle: serializeLifecycle(selectLifecycleById(db, lifecycleId) ?? failed) }
  }
  const pending = selectLifecycleById(db, lifecycleId)
  if (pending === undefined) return { ok: false, reason: 'lifecycle_not_found' }
  transitionProjection(db, pending, 'cleaned_up', 'cleaned_up', 'fake_cleanup_complete', now, options.metadata)
  return { ok: true, reason: 'cleaned_up', lifecycle: serializeLifecycle(selectLifecycleById(db, lifecycleId) ?? pending) }
}

export function runFakeSandboxLifecycle(
  db: Database.Database,
  input: AgentSandboxLifecycleInput,
): LifecycleMutationResult {
  const created = createSandboxLifecycle(db, input)
  if (!created.ok || created.lifecycle === undefined) return created
  const lifecycleId = Number(created.lifecycle.id)
  const root = resolveSandboxRoot({
    dataDir: input.dataDir,
    sandboxRoot: input.sandboxRoot,
    sanitizedRelativePath: created.lifecycle.sanitized_relative_path,
  })
  mkdirSync(root.absolutePath, { recursive: true })
  writeFileSync(resolve(root.absolutePath, 'fake-owner.json'), JSON.stringify({ owner: input.owner }), 'utf8')
  const prepared = prepareSandboxLifecycle(db, lifecycleId, { now: input.now, metadata: input.metadata })
  if (!prepared.ok) return rollbackAfterFakeHookFailure(db, lifecycleId, prepared, input)
  const running = markSandboxLifecycleRunning(db, lifecycleId, { now: input.now, metadata: input.metadata })
  if (!running.ok) return rollbackAfterFakeHookFailure(db, lifecycleId, running, input)
  const terminal = markSandboxLifecycleTerminal(db, lifecycleId, { now: input.now, metadata: input.metadata })
  if (!terminal.ok) return rollbackAfterFakeHookFailure(db, lifecycleId, terminal, input)
  return cleanupSandboxLifecycle(db, lifecycleId, {
    now: input.now,
    metadata: input.metadata,
    dataDir: input.dataDir,
    sandboxRoot: input.sandboxRoot,
  })
}

function rollbackAfterFakeHookFailure(
  db: Database.Database,
  lifecycleId: number,
  failure: LifecycleMutationResult,
  input: AgentSandboxLifecycleInput,
): LifecycleMutationResult {
  const rolledBack = rollbackSandboxLifecycle(db, lifecycleId, {
    now: input.now,
    metadata: { reason_code: failure.reason },
    dataDir: input.dataDir,
    sandboxRoot: input.sandboxRoot,
  })
  const lifecycle = rolledBack.lifecycle ?? failure.lifecycle
  return {
    ok: false,
    reason: rolledBack.ok ? 'rolled_back_after_hook_failure' : failure.reason,
    ...(lifecycle ? { lifecycle } : {}),
  }
}

export function buildSandboxLifecycleReadModel(
  db: Database.Database,
  input: { readonly taskId: number; readonly workspaceId: number; readonly lifecycleId?: number | null },
): SandboxLifecycleReadModel {
  const enabled = isAgentRunnerSandboxesEnabled(db, input.workspaceId)
  const lifecycles = listLifecycleRows(db, input)
  const stageKey = lifecycles[0]?.stage_key ?? null
  return {
    schema_version: 'sandbox_lifecycle.v1',
    feature_flag: {
      key: 'FEATURE_AGENT_RUNNER_SANDBOXES',
      enabled,
      mutation_state: enabled ? 'enabled' : 'disabled',
    },
    task: {
      id: String(input.taskId),
      workspace_id: String(input.workspaceId),
      stage_key: stageKey,
    },
    lifecycles: lifecycles.map((lifecycle) => serializeLifecycle(lifecycle, listLifecycleEvents(db, lifecycle.id))),
    diagnostics: {
      warnings: [],
    },
  }
}

function transitionLifecycle(
  db: Database.Database,
  lifecycleId: number,
  nextStatus: AgentSandboxLifecycleStatus,
  allowed: readonly AgentSandboxLifecycleStatus[],
  eventType: string,
  options: { readonly now?: string | undefined; readonly metadata?: Record<string, unknown> | null | undefined },
): LifecycleMutationResult {
  const lifecycle = selectLifecycleById(db, lifecycleId)
  if (lifecycle === undefined) return { ok: false, reason: 'lifecycle_not_found' }
  if (!isAgentRunnerSandboxesEnabled(db, lifecycle.workspace_id)) {
    return { ok: false, blocked: true, reason: 'feature_flag_off' }
  }
  if (!allowed.includes(lifecycle.status)) {
    return { ok: false, reason: 'invalid_lifecycle_transition' }
  }
  const now = options.now ?? new Date().toISOString()
  transitionProjection(db, lifecycle, nextStatus, eventType, eventType, now, options.metadata)
  return {
    ok: true,
    reason: eventType,
    lifecycle: serializeLifecycle(selectLifecycleById(db, lifecycleId) ?? lifecycle),
  }
}

function transitionProjection(
  db: Database.Database,
  lifecycle: LifecycleRow,
  nextStatus: AgentSandboxLifecycleStatus,
  eventType: string,
  reasonCode: string,
  observedAt: string,
  metadata: Record<string, unknown> | null | undefined,
): void {
  const metadataJson = serializeSafeMetadata(metadata)
  db.transaction(() => {
    const timestampColumn = statusTimestampColumn(nextStatus)
    const timestampAssignment = timestampColumn ? `, ${timestampColumn} = ?` : ''
    const values: unknown[] = [nextStatus, observedAt]
    if (timestampColumn) values.push(observedAt)
    values.push(lifecycle.id)
    db.prepare(`
      UPDATE agent_sandbox_lifecycles
      SET status = ?, updated_at = ?${timestampAssignment}
      WHERE id = ?
    `).run(...values)
    appendLifecycleEvent(db, lifecycle, {
      eventType,
      status: nextStatus,
      reasonCode,
      observedAt,
      metadata: metadataJson,
    })
  })()
}

function statusTimestampColumn(status: AgentSandboxLifecycleStatus): string | null {
  switch (status) {
    case 'prepared':
      return 'prepared_at'
    case 'running':
      return 'running_at'
    case 'terminal':
      return 'terminal_at'
    case 'cleanup_pending':
      return 'cleanup_requested_at'
    case 'cleaned_up':
    case 'rolled_back':
      return 'cleaned_up_at'
    default:
      return null
  }
}

function normalizeNullableSandboxSegment(value: string | null, field: string): string | null {
  if (value === null) return null
  return normalizeSandboxSegment(value, field)
}

function appendLifecycleEvent(
  db: Database.Database,
  lifecycle: LifecycleRow,
  input: {
    readonly eventType: string
    readonly status: AgentSandboxLifecycleStatus | null
    readonly reasonCode: string | null
    readonly observedAt: string
    readonly metadata?: string | null
  },
): void {
  db.prepare(`
    INSERT INTO agent_sandbox_lifecycle_events (
      lifecycle_id, workspace_id, task_id, stage_key, sandbox_key, event_type,
      status, reason_code, observed_at, actor_type, actor_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', NULL, ?)
  `).run(
    lifecycle.id,
    lifecycle.workspace_id,
    lifecycle.task_id,
    lifecycle.stage_key,
    lifecycle.sandbox_key,
    input.eventType,
    input.status,
    input.reasonCode,
    input.observedAt,
    input.metadata ?? null,
  )
}

function selectLifecycleByKey(db: Database.Database, workspaceId: number, sandboxKey: string): LifecycleRow | undefined {
  return db.prepare(`
    SELECT * FROM agent_sandbox_lifecycles
    WHERE workspace_id = ? AND sandbox_key = ?
    LIMIT 1
  `).get(workspaceId, sandboxKey) as LifecycleRow | undefined
}

function selectLifecycleById(db: Database.Database, lifecycleId: number): LifecycleRow | undefined {
  return db.prepare('SELECT * FROM agent_sandbox_lifecycles WHERE id = ? LIMIT 1').get(lifecycleId) as LifecycleRow | undefined
}

function listLifecycleRows(
  db: Database.Database,
  input: { readonly taskId: number; readonly workspaceId: number; readonly lifecycleId?: number | null },
): LifecycleRow[] {
  if (input.lifecycleId !== undefined && input.lifecycleId !== null) {
    return db.prepare(`
      SELECT * FROM agent_sandbox_lifecycles
      WHERE workspace_id = ? AND task_id = ? AND id = ?
      ORDER BY updated_at DESC, id DESC
    `).all(input.workspaceId, input.taskId, input.lifecycleId) as LifecycleRow[]
  }
  return db.prepare(`
    SELECT * FROM agent_sandbox_lifecycles
    WHERE workspace_id = ? AND task_id = ?
    ORDER BY updated_at DESC, id DESC
  `).all(input.workspaceId, input.taskId) as LifecycleRow[]
}

function listLifecycleEvents(db: Database.Database, lifecycleId: number): EventRow[] {
  return db.prepare(`
    SELECT id, event_type, status, reason_code, observed_at, actor_type, actor_id, metadata_json
    FROM agent_sandbox_lifecycle_events
    WHERE lifecycle_id = ?
    ORDER BY observed_at DESC, id DESC
    LIMIT 20
  `).all(lifecycleId) as EventRow[]
}

function serializeLifecycle(
  row: LifecycleRow,
  events?: readonly EventRow[],
): SerializedSandboxLifecycle {
  return {
    id: String(row.id),
    owner: row.owner,
    sandbox_key: row.sandbox_key,
    status: row.status,
    root_id: row.root_id,
    sanitized_relative_path: row.sanitized_relative_path,
    handle_id: row.handle_id,
    task_stage_attempt_id: row.task_stage_attempt_id === null ? null : String(row.task_stage_attempt_id),
    task_stage_claim_id: row.task_stage_claim_id === null ? null : String(row.task_stage_claim_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(events ? { events: events.map(serializeEvent) } : {}),
  }
}

function serializeEvent(row: EventRow): SerializedSandboxLifecycleEvent {
  return {
    id: String(row.id),
    event_type: row.event_type,
    status: row.status,
    reason_code: row.reason_code,
    observed_at: row.observed_at,
  }
}

function serializeSafeMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (metadata === null || metadata === undefined) return null
  const rawJson = JSON.stringify(metadata)
  if (rawJson.length > 4096) {
    throw new Error('metadata_too_large')
  }
  if (SECRET_PATTERN.test(rawJson)) {
    throw new Error('metadata_secret_shaped')
  }
  if (/((?:^|["\s])\/(?:Users|private|tmp|var|etc|home)\/)|([A-Za-z]:\\)/.test(rawJson)) {
    throw new Error('metadata_absolute_path')
  }
  const safeMetadata: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))) {
    const metadataKey = normalizeSandboxSegment(key, 'metadata_key')
    if (!SAFE_METADATA_KEYS.has(metadataKey)) {
      throw new Error('metadata_key_not_allowed')
    }
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error('metadata_value_not_allowed')
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('metadata_value_not_allowed')
    }
    if (typeof value === 'string' && value.length > 256) {
      throw new Error('metadata_value_too_large')
    }
    safeMetadata[metadataKey] = value
  }
  const json = JSON.stringify(safeMetadata)
  if (json.length > 4096) {
    throw new Error('metadata_too_large')
  }
  return json
}
