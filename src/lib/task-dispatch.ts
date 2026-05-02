import { getDatabase, db_helpers } from './db'
import { runOpenClaw } from './command'
import { callOpenClawGateway } from './openclaw-gateway'
import { eventBus } from './event-bus'
import { logger } from './logger'
import { config } from './config'
import { syncTaskOutbound } from './github-sync-engine'
import { getAegis } from './aegis'
import { createTask, type CreateTaskInput, type CreateTaskResult } from './task-create'
import { resolveFlag } from './feature-flags'
import { READY_FOR_OWNER_STATUS, READY_FOR_OWNER_TERMINAL_EVENT, resolveTaskTerminalTransition, type TaskStatus } from './task-status'
import { validateTaskOutput } from './output-schema-validator'
import { evaluateRoutingRules, type RoutingRuleInput } from './routing-rule-evaluator'
import { createHash } from 'crypto'

/** Sync task to GitHub/GNAP and broadcast escalation if task failed */
function syncAndEscalateIfFailed(task: { id: number; title: string; status: string; priority: string; project_id?: number | null; workspace_id: number; description?: string | null }, newStatus: string, errorMsg?: string, dispatchAttempts?: number): void {
  syncTaskOutbound({ ...task, status: newStatus }, task.workspace_id)
  if (newStatus === 'failed') {
    eventBus.broadcast('task.escalated', {
      id: task.id,
      title: task.title,
      reason: errorMsg?.includes('Aegis rejected') ? 'max_aegis_rejections' : errorMsg?.includes('stuck') ? 'stale_task_max_retries' : 'max_dispatch_retries',
      dispatch_attempts: dispatchAttempts ?? 0,
      error_message: (errorMsg ?? '').substring(0, 500),
      workspace_id: task.workspace_id,
    })
  }
}

interface DispatchableTask {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string
  workspace_id: number
  agent_name: string
  agent_id: number
  agent_config: string | null
  ticket_prefix: string | null
  project_ticket_no: number | null
  project_id: number | null
  tags?: string[]
}

export type TaskChainAdvanceTrigger =
  | 'aegis_review'
  | 'quality_review'
  | 'bulk_task_update'
  | 'detail_task_update'
  | 'retry_chain_advancement'

export interface AdvanceTaskChainInput {
  taskId: number
  workspaceId: number
  previousStatus: string | null
  trigger: TaskChainAdvanceTrigger
}

export interface AdvanceTaskChainResult {
  advanced: boolean
  reason:
    | 'not_eligible'
    | 'validation_failed'
    | 'stalled'
    | 'chain_terminated'
    | 'successor_exists'
    | 'successor_created'
  reasonCode?: TaskPipelineReasonCode
  successorTaskId?: number
}

export interface RetryTaskChainAdvancementInput {
  taskId: number
  workspaceId: number
  confirmTemplateDrift?: boolean
}

export type RetryRejectionReason =
  | 'retry_not_eligible'
  | 'retry_template_provenance_missing'
  | 'retry_template_drift_unconfirmed'

export type ChainRetryRecoveryClass = 'failed_parent' | 'advancement_stall'
export type ChainRetryRecoveryOutcome =
  | 'output_still_invalid'
  | 'stall_persisted'
  | 'successor_created'
  | 'successor_already_exists'
  | 'chain_terminated'

export type RetryTaskChainAdvancementResult =
  | { ok: false; retryRejectionReason: RetryRejectionReason }
  | {
      ok: true
      recoveryClass: ChainRetryRecoveryClass
      retryAttempt: number
      recoveryOutcome: ChainRetryRecoveryOutcome
      successorTaskId: number | null
      chainTerminated: boolean
      idempotentSuccessor: boolean
    }

type TaskPipelineReasonCode =
  | 'task_pipeline_output_missing'
  | 'task_pipeline_output_invalid'
  | 'task_pipeline_routing_expression_rejected'
  | 'task_pipeline_routing_budget_exceeded'
  | 'task_pipeline_target_missing'
  | 'task_pipeline_target_duplicate'
  | 'task_pipeline_target_cross_workspace'
  | 'task_pipeline_target_disabled'
  | 'task_pipeline_successor_assignee_missing'
  | 'task_pipeline_retry_chain_advancement'

type RetryEligibleReasonCode = TaskPipelineReasonCode

type TemplateProvenance = {
  output_schema_sha256: string
  routing_rules_sha256: string
  next_template_slug_sha256: string
}

type SelectedRetryActivity = {
  id: number
  reasonCode: RetryEligibleReasonCode
  data: Record<string, unknown>
}

type TaskPipelineTemplate = {
  id: number
  name: string
  task_prompt: string | null
  workspace_id: number
  slug: string | null
  agent_role: string | null
  output_schema: unknown
  routing_rules: unknown
  next_template_slug: string | null
  enabled?: number | null
  status?: string | null
  disabled?: number | null
  archived?: number | null
  is_active?: number | null
}

type TaskPipelineTask = {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  project_id: number | null
  workspace_id: number
  resolution: string | null
  workflow_template_id: number | null
  workflow_template_slug: string | null
  parent_task_id: number | null
  root_task_id: number | null
  chain_id: string | null
  chain_stage: number | null
}

function tableExists(db: any, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function columnsFor(db: any, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set()
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name))
}

function parseJson(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function stableCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableCanonicalJson(item)).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(object[key])}`).join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalFieldHash(value: unknown): string {
  const parsed = parseJson(value)
  return sha256(stableCanonicalJson(parsed === undefined ? value : parsed))
}

function nextTemplateSlugHash(value: string | null): string {
  return sha256(stableCanonicalJson(value === null ? null : String(value)))
}

function templateProvenance(template: TaskPipelineTemplate): TemplateProvenance {
  return {
    output_schema_sha256: canonicalFieldHash(template.output_schema ?? null),
    routing_rules_sha256: canonicalFieldHash(template.routing_rules ?? null),
    next_template_slug_sha256: nextTemplateSlugHash(template.next_template_slug ?? null),
  }
}

function sameTemplateProvenance(a: TemplateProvenance, b: TemplateProvenance): boolean {
  return a.output_schema_sha256 === b.output_schema_sha256
    && a.routing_rules_sha256 === b.routing_rules_sha256
    && a.next_template_slug_sha256 === b.next_template_slug_sha256
}

function parseTemplateProvenance(value: unknown): TemplateProvenance | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.output_schema_sha256 !== 'string'
    || typeof candidate.routing_rules_sha256 !== 'string'
    || typeof candidate.next_template_slug_sha256 !== 'string'
  ) {
    return null
  }
  return {
    output_schema_sha256: candidate.output_schema_sha256,
    routing_rules_sha256: candidate.routing_rules_sha256,
    next_template_slug_sha256: candidate.next_template_slug_sha256,
  }
}

function parseRoutingRules(value: unknown): RoutingRuleInput[] {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((rule): rule is RoutingRuleInput => {
      return typeof rule?.when === 'string' && typeof rule?.next_template_slug === 'string'
    })
}

function hasAdvancementMetadata(template: TaskPipelineTemplate): boolean {
  if (template.output_schema !== null && template.output_schema !== undefined && template.output_schema !== '') return true
  if (parseRoutingRules(template.routing_rules).length > 0) return true
  return Boolean(template.next_template_slug)
}

function isFeatureEnabled(db: any, workspaceId: number): boolean {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as { feature_flags: string | null } | undefined
  return resolveFlag('FEATURE_TASK_PIPELINES', { workspaceFlags: row?.feature_flags ?? null })
}

function fetchPipelineTask(db: any, taskId: number, workspaceId: number): TaskPipelineTask | null {
  return (db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(taskId, workspaceId) as TaskPipelineTask | undefined) ?? null
}

function fetchTemplate(db: any, templateId: number | null, workspaceId: number): TaskPipelineTemplate | null {
  if (!templateId || !tableExists(db, 'workflow_templates')) return null
  const row = db.prepare('SELECT * FROM workflow_templates WHERE id = ? AND workspace_id = ?').get(templateId, workspaceId) as TaskPipelineTemplate | undefined
  return row ?? null
}

function logPipelineActivity(
  db: any,
  taskId: number,
  workspaceId: number,
  reasonCode: TaskPipelineReasonCode,
  trigger: TaskChainAdvanceTrigger,
  extra: Record<string, unknown> = {},
): void {
  if (!tableExists(db, 'activities')) return
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    VALUES (?, 'task', ?, 'task-pipeline', ?, ?, ?)
  `).run(
    'task_pipeline_advancement',
    taskId,
    `Task pipeline advancement recorded ${reasonCode}`,
    JSON.stringify({ reason_code: reasonCode, trigger, ...extra }),
    workspaceId,
  )
}

function failParentForOutput(
  db: any,
  task: TaskPipelineTask,
  reasonCode: 'task_pipeline_output_missing' | 'task_pipeline_output_invalid',
  trigger: TaskChainAdvanceTrigger,
  extra: Record<string, unknown> = {},
): AdvanceTaskChainResult {
  const timestampSet = columnsFor(db, 'tasks').has('updated_at') ? ', updated_at = unixepoch()' : ''
  db.prepare(`UPDATE tasks SET status = ?, error_message = ?${timestampSet} WHERE id = ? AND workspace_id = ?`)
    .run('failed', reasonCode, task.id, task.workspace_id)
  logPipelineActivity(db, task.id, task.workspace_id, reasonCode, trigger, extra)
  return { advanced: false, reason: 'validation_failed', reasonCode }
}

function stall(
  db: any,
  task: TaskPipelineTask,
  reasonCode: TaskPipelineReasonCode,
  trigger: TaskChainAdvanceTrigger,
  extra: Record<string, unknown> = {},
): AdvanceTaskChainResult {
  logPipelineActivity(db, task.id, task.workspace_id, reasonCode, trigger, extra)
  return { advanced: false, reason: 'stalled', reasonCode }
}

function resolveTargetTemplate(db: any, workspaceId: number, slug: string): { ok: true; template: TaskPipelineTemplate } | { ok: false; reasonCode: TaskPipelineReasonCode } {
  const workspaceMatches = db.prepare('SELECT * FROM workflow_templates WHERE slug = ? AND workspace_id = ?').all(slug, workspaceId) as TaskPipelineTemplate[]
  if (workspaceMatches.length > 1) return { ok: false, reasonCode: 'task_pipeline_target_duplicate' }
  if (workspaceMatches.length === 1) {
    const candidate = workspaceMatches[0]
    if (isTemplateDisabled(candidate)) return { ok: false, reasonCode: 'task_pipeline_target_disabled' }
    return { ok: true, template: candidate }
  }
  const anyMatches = db.prepare('SELECT id FROM workflow_templates WHERE slug = ? LIMIT 1').all(slug) as Array<{ id: number }>
  if (anyMatches.length > 0) return { ok: false, reasonCode: 'task_pipeline_target_cross_workspace' }
  return { ok: false, reasonCode: 'task_pipeline_target_missing' }
}

function isTemplateDisabled(template: TaskPipelineTemplate): boolean {
  if ('enabled' in template && template.enabled === 0) return true
  if ('disabled' in template && template.disabled === 1) return true
  if ('archived' in template && template.archived === 1) return true
  if ('is_active' in template && template.is_active === 0) return true
  if (typeof template.status === 'string' && ['disabled', 'archived', 'inactive'].includes(template.status.toLowerCase())) return true
  return false
}

function resolveSuccessorAssignee(db: any, parent: TaskPipelineTask, target: TaskPipelineTemplate): string | null {
  if (!parent.project_id || !target.agent_role) return null
  if (!tableExists(db, 'project_agent_assignments') || !tableExists(db, 'agents')) return null
  const row = db.prepare(`
    SELECT paa.agent_name
    FROM project_agent_assignments paa
    INNER JOIN agents a
      ON a.name = paa.agent_name
     AND a.workspace_id = paa.workspace_id
    WHERE paa.project_id = ?
      AND paa.role = ?
      AND paa.workspace_id = ?
    LIMIT 1
  `).get(parent.project_id, target.agent_role, parent.workspace_id) as { agent_name: string } | undefined
  return row?.agent_name ?? null
}

function existingSuccessorId(db: any, parentTaskId: number, workspaceId: number): number | null {
  const row = db.prepare('SELECT id FROM tasks WHERE parent_task_id = ? AND workspace_id = ? LIMIT 1')
    .get(parentTaskId, workspaceId) as { id: number } | undefined
  return row?.id ?? null
}

function initializeParentLineage(db: any, parent: TaskPipelineTask): { rootTaskId: number; chainId: string; chainStage: number } {
  const rootTaskId = parent.root_task_id ?? parent.id
  const chainId = parent.chain_id ?? `task-chain-${parent.id}`
  const chainStage = parent.chain_stage ?? 0
  if (parent.root_task_id === null || parent.chain_id === null || parent.chain_stage === null) {
    const timestampSet = columnsFor(db, 'tasks').has('updated_at') ? ', updated_at = unixepoch()' : ''
    db.prepare(`
      UPDATE tasks
      SET root_task_id = COALESCE(root_task_id, ?),
          chain_id = COALESCE(chain_id, ?),
          chain_stage = COALESCE(chain_stage, ?)
          ${timestampSet}
      WHERE id = ? AND workspace_id = ?
    `).run(rootTaskId, chainId, chainStage, parent.id, parent.workspace_id)
  }
  return { rootTaskId, chainId, chainStage }
}

function runPostCommitSuccessorSync(db: any, successorTaskId: number, workspaceId: number): void {
  const successor = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(successorTaskId, workspaceId)
  if (successor) syncTaskOutbound(successor as any, workspaceId)
}

export function advanceTaskChain(input: AdvanceTaskChainInput): AdvanceTaskChainResult {
  const db = getDatabase()
  let successorForPostCommit: number | null = null

  const result = db.transaction((): AdvanceTaskChainResult => {
    if (!isFeatureEnabled(db, input.workspaceId)) return { advanced: false, reason: 'not_eligible' }
    if (input.previousStatus === null || input.previousStatus === 'done') return { advanced: false, reason: 'not_eligible' }
    if (input.previousStatus === 'failed' && input.trigger !== 'retry_chain_advancement') return { advanced: false, reason: 'not_eligible' }

    const parent = fetchPipelineTask(db, input.taskId, input.workspaceId)
    if (!parent || parent.status !== 'done' || !parent.workflow_template_id) return { advanced: false, reason: 'not_eligible' }

    const existing = existingSuccessorId(db, parent.id, parent.workspace_id)
    if (existing) return { advanced: false, reason: 'successor_exists', successorTaskId: existing }

    const template = fetchTemplate(db, parent.workflow_template_id, parent.workspace_id)
    if (!template || !hasAdvancementMetadata(template)) return { advanced: false, reason: 'not_eligible' }
    const provenance = { template_provenance: templateProvenance(template) }

    const schema = parseJson(template.output_schema)
    let output: unknown = {}
    if (schema !== null) {
      if (parent.resolution === null || parent.resolution.trim() === '') {
        return failParentForOutput(db, parent, 'task_pipeline_output_missing', input.trigger, provenance)
      }
      output = parseJson(parent.resolution)
      if (output === undefined) {
        return failParentForOutput(db, parent, 'task_pipeline_output_invalid', input.trigger, provenance)
      }
      const validation = validateTaskOutput({ templateId: template.id, schema, output })
      if (!validation.ok) {
        const reasonCode = validation.reason === 'output_missing'
          ? 'task_pipeline_output_missing'
          : 'task_pipeline_output_invalid'
        return failParentForOutput(db, parent, reasonCode, input.trigger, provenance)
      }
      output = validation.value
    } else if (parent.resolution && parent.resolution.trim() !== '') {
      output = parseJson(parent.resolution)
      if (output === undefined) output = {}
    }

    const routing = evaluateRoutingRules({
      rules: parseRoutingRules(template.routing_rules),
      output,
      fallbackNextTemplateSlug: template.next_template_slug,
    })
    if (!routing.ok) {
      const reasonCode = routing.reason === 'routing_budget_exceeded'
        ? 'task_pipeline_routing_budget_exceeded'
        : 'task_pipeline_routing_expression_rejected'
      return stall(db, parent, reasonCode, input.trigger, provenance)
    }
    if (!routing.nextTemplateSlug) return { advanced: false, reason: 'chain_terminated' }

    const target = resolveTargetTemplate(db, parent.workspace_id, routing.nextTemplateSlug)
    if (!target.ok) return stall(db, parent, target.reasonCode, input.trigger, { ...provenance, target_template_slug: routing.nextTemplateSlug })

    const assignee = resolveSuccessorAssignee(db, parent, target.template)
    if (!assignee) {
      return stall(db, parent, 'task_pipeline_successor_assignee_missing', input.trigger, { ...provenance, target_template_slug: routing.nextTemplateSlug })
    }

    const lineage = initializeParentLineage(db, parent)
    const duplicateAfterLineage = existingSuccessorId(db, parent.id, parent.workspace_id)
    if (duplicateAfterLineage) return { advanced: false, reason: 'successor_exists', successorTaskId: duplicateAfterLineage }

    const createResult = createPipelineSuccessorTask({
      db,
      runtime: {
        broadcast: () => undefined,
        gnap: { enabled: false, autoSync: false },
      },
      transaction: 'caller',
      deferOutboundSync: true,
      title: target.template.name,
      description: target.template.task_prompt,
      status: 'assigned',
      priority: parent.priority,
      assigned_to: assignee,
      project_id: parent.project_id,
      workspace_id: parent.workspace_id,
      created_by: 'task-pipeline',
      workflow_template_id: target.template.id,
      workflow_template_slug: target.template.slug,
      parent_task_id: parent.id,
      root_task_id: lineage.rootTaskId,
      chain_id: lineage.chainId,
      chain_stage: lineage.chainStage + 1,
      tags: [],
      metadata: {
        task_pipeline: {
          parent_task_id: parent.id,
          root_task_id: lineage.rootTaskId,
          chain_id: lineage.chainId,
          chain_stage: lineage.chainStage + 1,
          source_template_slug: template.slug,
          target_template_slug: target.template.slug,
          matched_rule_index: routing.matchedRuleIndex,
        },
      },
      activity: {
        type: 'task_pipeline_successor_created',
        actor: 'task-pipeline',
        description: `Created pipeline successor from task ${parent.id}`,
        data: {
          parent_task_id: parent.id,
          target_template_slug: target.template.slug,
          trigger: input.trigger,
        },
      },
    })

    if (createResult.duplicate) {
      return { advanced: false, reason: 'successor_exists', successorTaskId: createResult.taskId }
    }

    successorForPostCommit = createResult.taskId
    return { advanced: true, reason: 'successor_created', successorTaskId: createResult.taskId }
  })()

  if (successorForPostCommit !== null) {
    runPostCommitSuccessorSync(db, successorForPostCommit, input.workspaceId)
  }

  return result
}

const FAILED_PARENT_REASONS = new Set<RetryEligibleReasonCode>([
  'task_pipeline_output_missing',
  'task_pipeline_output_invalid',
])

const ADVANCEMENT_STALL_REASONS = new Set<RetryEligibleReasonCode>([
  'task_pipeline_routing_expression_rejected',
  'task_pipeline_routing_budget_exceeded',
  'task_pipeline_target_missing',
  'task_pipeline_target_disabled',
  'task_pipeline_target_duplicate',
  'task_pipeline_target_cross_workspace',
  'task_pipeline_successor_assignee_missing',
])

function isRetryEligibleReason(value: unknown): value is RetryEligibleReasonCode {
  return typeof value === 'string' && (FAILED_PARENT_REASONS.has(value as RetryEligibleReasonCode) || ADVANCEMENT_STALL_REASONS.has(value as RetryEligibleReasonCode))
}

function recoveryClassFor(reasonCode: RetryEligibleReasonCode): ChainRetryRecoveryClass {
  return FAILED_PARENT_REASONS.has(reasonCode) ? 'failed_parent' : 'advancement_stall'
}

function parseActivityData(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

function selectLatestRetryActivity(db: any, taskId: number, workspaceId: number): SelectedRetryActivity | null {
  if (!tableExists(db, 'activities')) return null
  const rows = db.prepare(`
    SELECT id, data
    FROM activities
    WHERE entity_type = 'task'
      AND entity_id = ?
      AND workspace_id = ?
    ORDER BY id DESC
  `).all(taskId, workspaceId) as Array<{ id: number; data: string | null }>

  for (const row of rows) {
    const data = parseActivityData(row.data)
    if (data.reason_code === 'task_pipeline_retry_chain_advancement' && data.recovery_outcome === 'chain_terminated') {
      return null
    }
    if (isRetryEligibleReason(data.reason_code)) {
      return { id: row.id, reasonCode: data.reason_code, data }
    }
  }
  return null
}

function nextRetryAttempt(db: any, taskId: number, workspaceId: number): number {
  if (!tableExists(db, 'activities')) return 1
  const rows = db.prepare(`
    SELECT data
    FROM activities
    WHERE entity_type = 'task'
      AND entity_id = ?
      AND workspace_id = ?
  `).all(taskId, workspaceId) as Array<{ data: string | null }>
  let maxAttempt = 0
  for (const row of rows) {
    const attempt = parseActivityData(row.data).retry_attempt
    if (typeof attempt === 'number' && Number.isFinite(attempt)) maxAttempt = Math.max(maxAttempt, attempt)
  }
  return maxAttempt + 1
}

function resolutionHash(resolution: string | null): string | null {
  if (resolution === null || resolution.trim() === '') return null
  return sha256(resolution)
}

function logRetryRecoveryActivity(
  db: any,
  task: TaskPipelineTask,
  selected: SelectedRetryActivity,
  retryAttempt: number,
  recoveryClass: ChainRetryRecoveryClass,
  recoveryOutcome: ChainRetryRecoveryOutcome,
  templateDriftConfirmed: boolean,
  successorTaskId: number | null,
): void {
  logPipelineActivity(db, task.id, task.workspace_id, 'task_pipeline_retry_chain_advancement', 'retry_chain_advancement', {
    previous_reason_code: selected.reasonCode,
    selected_activity_id: selected.id,
    recovery_class: recoveryClass,
    recovery_action: 'retry_chain_advancement',
    recovery_outcome: recoveryOutcome,
    retry_attempt: retryAttempt,
    template_drift_confirmed: templateDriftConfirmed,
    corrected_resolution_sha256: recoveryClass === 'failed_parent' ? resolutionHash(task.resolution) : null,
    successor_task_id: successorTaskId,
  })
}

function validateCurrentOutput(task: TaskPipelineTask, template: TaskPipelineTemplate): { ok: true } | { ok: false; reasonCode: 'task_pipeline_output_missing' | 'task_pipeline_output_invalid' } {
  const schema = parseJson(template.output_schema)
  if (schema === null) return { ok: true }
  if (task.resolution === null || task.resolution.trim() === '') return { ok: false, reasonCode: 'task_pipeline_output_missing' }
  const output = parseJson(task.resolution)
  if (output === undefined) return { ok: false, reasonCode: 'task_pipeline_output_invalid' }
  const validation = validateTaskOutput({ templateId: template.id, schema, output })
  if (!validation.ok) {
    return {
      ok: false,
      reasonCode: validation.reason === 'output_missing' ? 'task_pipeline_output_missing' : 'task_pipeline_output_invalid',
    }
  }
  return { ok: true }
}

function resultFromAdvance(result: AdvanceTaskChainResult): Omit<Extract<RetryTaskChainAdvancementResult, { ok: true }>, 'ok' | 'recoveryClass' | 'retryAttempt'> | null {
  if (result.reason === 'successor_created') {
    return {
      recoveryOutcome: 'successor_created',
      successorTaskId: result.successorTaskId ?? null,
      chainTerminated: false,
      idempotentSuccessor: false,
    }
  }
  if (result.reason === 'successor_exists') {
    return {
      recoveryOutcome: 'successor_already_exists',
      successorTaskId: result.successorTaskId ?? null,
      chainTerminated: false,
      idempotentSuccessor: true,
    }
  }
  if (result.reason === 'chain_terminated') {
    return {
      recoveryOutcome: 'chain_terminated',
      successorTaskId: null,
      chainTerminated: true,
      idempotentSuccessor: false,
    }
  }
  if (result.reason === 'stalled') {
    return {
      recoveryOutcome: 'stall_persisted',
      successorTaskId: null,
      chainTerminated: false,
      idempotentSuccessor: false,
    }
  }
  return null
}

export function retryTaskChainAdvancement(input: RetryTaskChainAdvancementInput): RetryTaskChainAdvancementResult {
  const db = getDatabase()
  let postCommitSuccessor: number | null = null

  const result = db.transaction((): RetryTaskChainAdvancementResult => {
    if (!isFeatureEnabled(db, input.workspaceId)) return { ok: false, retryRejectionReason: 'retry_not_eligible' }
    const parent = fetchPipelineTask(db, input.taskId, input.workspaceId)
    if (!parent || !parent.workflow_template_id) return { ok: false, retryRejectionReason: 'retry_not_eligible' }

    const selected = selectLatestRetryActivity(db, parent.id, parent.workspace_id)
    if (!selected) return { ok: false, retryRejectionReason: 'retry_not_eligible' }

    const recoveryClass = recoveryClassFor(selected.reasonCode)
    if (recoveryClass === 'failed_parent' && parent.status !== 'failed') return { ok: false, retryRejectionReason: 'retry_not_eligible' }
    if (recoveryClass === 'advancement_stall' && parent.status !== 'done') return { ok: false, retryRejectionReason: 'retry_not_eligible' }

    const selectedProvenance = parseTemplateProvenance(selected.data.template_provenance)
    if (!selectedProvenance) return { ok: false, retryRejectionReason: 'retry_template_provenance_missing' }

    const template = fetchTemplate(db, parent.workflow_template_id, parent.workspace_id)
    if (!template) return { ok: false, retryRejectionReason: 'retry_not_eligible' }
    const currentProvenance = templateProvenance(template)
    const hasDrift = !sameTemplateProvenance(selectedProvenance, currentProvenance)
    if (hasDrift && !input.confirmTemplateDrift) return { ok: false, retryRejectionReason: 'retry_template_drift_unconfirmed' }

    const retryAttempt = nextRetryAttempt(db, parent.id, parent.workspace_id)
    if (recoveryClass === 'failed_parent') {
      const output = validateCurrentOutput(parent, template)
      if (!output.ok) {
        const timestampSet = columnsFor(db, 'tasks').has('updated_at') ? ', updated_at = unixepoch()' : ''
        db.prepare(`UPDATE tasks SET status = ?, error_message = ?${timestampSet} WHERE id = ? AND workspace_id = ?`)
          .run('failed', output.reasonCode, parent.id, parent.workspace_id)
        logRetryRecoveryActivity(db, parent, selected, retryAttempt, recoveryClass, 'output_still_invalid', hasDrift, null)
        return {
          ok: true,
          recoveryClass,
          retryAttempt,
          recoveryOutcome: 'output_still_invalid',
          successorTaskId: null,
          chainTerminated: false,
          idempotentSuccessor: false,
        }
      }
      const timestampSet = columnsFor(db, 'tasks').has('updated_at') ? ', updated_at = unixepoch()' : ''
      db.prepare(`UPDATE tasks SET status = ?, error_message = NULL${timestampSet} WHERE id = ? AND workspace_id = ?`)
        .run('done', parent.id, parent.workspace_id)
    }

    if (!hasAdvancementMetadata(template)) {
      logRetryRecoveryActivity(db, parent, selected, retryAttempt, recoveryClass, 'chain_terminated', hasDrift, null)
      return {
        ok: true,
        recoveryClass,
        retryAttempt,
        recoveryOutcome: 'chain_terminated',
        successorTaskId: null,
        chainTerminated: true,
        idempotentSuccessor: false,
      }
    }

    const advanced = advanceTaskChain({
      taskId: parent.id,
      workspaceId: parent.workspace_id,
      previousStatus: recoveryClass === 'failed_parent' ? 'failed' : 'review',
      trigger: 'retry_chain_advancement',
    })
    const retryResult = resultFromAdvance(advanced)
    if (!retryResult) return { ok: false, retryRejectionReason: 'retry_not_eligible' }
    if (retryResult.recoveryOutcome === 'successor_created') postCommitSuccessor = retryResult.successorTaskId
    logRetryRecoveryActivity(db, parent, selected, retryAttempt, recoveryClass, retryResult.recoveryOutcome, hasDrift, retryResult.successorTaskId)
    return {
      ok: true,
      recoveryClass,
      retryAttempt,
      ...retryResult,
    }
  })()

  if (postCommitSuccessor !== null) {
    runPostCommitSuccessorSync(db, postCommitSuccessor, input.workspaceId)
  }

  return result
}

export function createPipelineSuccessorTask(
  input: Omit<CreateTaskInput, 'source'> & { source?: 'pipeline_successor' },
): CreateTaskResult {
  return createTask({ ...input, source: 'pipeline_successor' })
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------

/**
 * Return an explicit gateway model override from Mission Control agent config.
 *
 * By default, task dispatch should not inject a model override; the OpenClaw
 * agent should use its own configured default model. A Mission Control agent
 * may still opt into an override via agent.config.dispatchModel.
 */
export function resolveTaskDispatchModelOverride(task: Pick<DispatchableTask, 'agent_config'>): string | null {
  if (task.agent_config) {
    try {
      const cfg = JSON.parse(task.agent_config)
      if (typeof cfg.dispatchModel === 'string' && cfg.dispatchModel) return cfg.dispatchModel
    } catch { /* ignore */ }
  }
  return null
}

/** Extract the gateway agent identifier from the agent's config JSON.
 *  Falls back to agent_name (display name) if openclawId is not set. */
function resolveGatewayAgentId(task: DispatchableTask): string {
  if (task.agent_config) {
    try {
      const cfg = JSON.parse(task.agent_config)
      if (typeof cfg.openclawId === 'string' && cfg.openclawId) return cfg.openclawId
    } catch { /* ignore */ }
  }
  return task.agent_name
}

type ReviewAgentRecord = {
  name?: string | null
  agent_config?: string | null
}

/** Resolve the dedicated Aegis review agent id from its Mission Control record. */
export function resolveGatewayAgentIdForReviewAgent(agent: ReviewAgentRecord | null | undefined): string {
  if (agent?.agent_config) {
    try {
      const cfg = JSON.parse(agent.agent_config)
      if (typeof cfg.openclawId === 'string' && cfg.openclawId) return cfg.openclawId
    } catch { /* ignore */ }
  }
  return agent?.name || 'aegis'
}

function buildTaskPrompt(task: DispatchableTask, rejectionFeedback?: string | null): string {
  const ticket = task.ticket_prefix && task.project_ticket_no
    ? `${task.ticket_prefix}-${String(task.project_ticket_no).padStart(3, '0')}`
    : `TASK-${task.id}`

  const lines = [
    'You have been assigned a task in Mission Control.',
    '',
    `**[${ticket}] ${task.title}**`,
    `Priority: ${task.priority}`,
  ]

  if (task.tags && task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`)
  }

  if (task.description) {
    lines.push('', task.description)
  }

  if (rejectionFeedback) {
    lines.push('', '## Previous Review Feedback', rejectionFeedback, '', 'Please address this feedback in your response.')
  }

  lines.push('', 'Complete this task and provide your response. Be concise and actionable.')
  return lines.join('\n')
}

/** Extract first valid JSON object from raw stdout (handles surrounding text/warnings). */
function parseGatewayJson(raw: string): any | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

interface AgentResponseParsed {
  text: string | null
  sessionId: string | null
}

function parseAgentResponse(stdout: string): AgentResponseParsed {
  try {
    const parsed = JSON.parse(stdout)
    const sessionId: string | null = typeof parsed?.sessionId === 'string' ? parsed.sessionId
      : typeof parsed?.session_id === 'string' ? parsed.session_id
      : null

    // OpenClaw agent --json returns { payloads: [{ text: "..." }] }
    if (parsed?.payloads?.[0]?.text) {
      return { text: parsed.payloads[0].text, sessionId }
    }
    // Fallback: if there's a result or output field
    if (parsed?.result) return { text: String(parsed.result), sessionId }
    if (parsed?.output) return { text: String(parsed.output), sessionId }
    // Last resort: stringify the whole response
    return { text: JSON.stringify(parsed, null, 2), sessionId }
  } catch {
    // Not valid JSON — return raw stdout if non-empty
    return { text: stdout.trim() || null, sessionId: null }
  }
}

// ---------------------------------------------------------------------------
// Direct Claude API dispatch (gateway-free)
// ---------------------------------------------------------------------------

function getAnthropicApiKey(): string | null {
  return (process.env.ANTHROPIC_API_KEY || '').trim() || null
}

function isGatewayAvailable(): boolean {
  // Gateway is available if OpenClaw is installed OR a gateway is registered in the DB
  if (config.openclawHome) return true
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) as c FROM gateways').get() as { c: number } | undefined
    return (row?.c ?? 0) > 0
  } catch {
    return false
  }
}

function classifyDirectModel(task: DispatchableTask): string {
  // Check per-agent config override first
  if (task.agent_config) {
    try {
      const cfg = JSON.parse(task.agent_config)
      if (typeof cfg.dispatchModel === 'string' && cfg.dispatchModel) {
        // Strip gateway prefixes like "9router/cc/" to get bare model ID
        return cfg.dispatchModel.replace(/^.*\//, '')
      }
    } catch { /* ignore */ }
  }

  const text = `${task.title} ${task.description ?? ''}`.toLowerCase()
  const priority = task.priority?.toLowerCase() ?? ''

  // Complex → Opus
  const complexSignals = [
    'debug', 'diagnos', 'architect', 'design system', 'security audit',
    'root cause', 'investigate', 'incident', 'refactor', 'migration',
  ]
  if (priority === 'critical' || complexSignals.some(s => text.includes(s))) {
    return 'claude-opus-4-6'
  }

  // Size heuristics → Opus for large/complex tasks
  const descLength = (task.description ?? '').length
  if (descLength > 2000) return 'claude-opus-4-6'
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT estimated_hours FROM tasks WHERE id = ?').get(task.id) as { estimated_hours: number | null } | undefined
    if (row?.estimated_hours && row.estimated_hours >= 4) return 'claude-opus-4-6'
  } catch { /* ignore */ }

  // Routine → Haiku
  const routineSignals = [
    'status check', 'health check', 'format', 'rename', 'summarize',
    'translate', 'quick ', 'simple ', 'routine ', 'minor ',
  ]
  if (routineSignals.some(s => text.includes(s)) && priority !== 'high' && priority !== 'critical') {
    return 'claude-haiku-4-5-20251001'
  }

  // Default → Sonnet
  return 'claude-sonnet-4-6'
}

function getAgentSoulContent(task: DispatchableTask): string | null {
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT soul_content FROM agents WHERE id = ? AND workspace_id = ?'
    ).get(task.agent_id, task.workspace_id) as { soul_content: string | null } | undefined
    return row?.soul_content || null
  } catch {
    return null
  }
}

async function callClaudeDirectly(
  task: DispatchableTask,
  prompt: string,
): Promise<AgentResponseParsed> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — cannot dispatch without gateway')

  const model = classifyDirectModel(task)
  const soul = getAgentSoulContent(task)

  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: prompt },
  ]

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages,
  }

  if (soul) {
    body.system = soul
  }

  logger.info({ taskId: task.id, model, agent: task.agent_name }, 'Dispatching task via direct Claude API')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}: ${errorBody.substring(0, 500)}`)
  }

  const data = await res.json() as {
    content: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const text = data.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text || '')
    .join('\n') || null

  // Record token usage
  if (data.usage) {
    try {
      const db = getDatabase()
      const now = Math.floor(Date.now() / 1000)
      db.prepare(`
        INSERT INTO token_usage (model, session_id, input_tokens, output_tokens, total_tokens, cost, created_at, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        model,
        `task-${task.id}`,
        data.usage.input_tokens || 0,
        data.usage.output_tokens || 0,
        (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        0, // cost calculated separately
        now,
        task.workspace_id,
      )
    } catch { /* non-fatal */ }
  }

  return { text, sessionId: null }
}

interface ReviewableTask {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  resolution: string | null
  assigned_to: string | null
  workspace_id: number
  project_id: number | null
  ticket_prefix: string | null
  project_ticket_no: number | null
  produces_pr: number | null
  external_terminal_event: string | null
  feature_flags: string | null
  github_repo: string | null
  github_pr_number: number | null
  created_by: string | null
}

function buildReviewPrompt(task: ReviewableTask): string {
  const ticket = task.ticket_prefix && task.project_ticket_no
    ? `${task.ticket_prefix}-${String(task.project_ticket_no).padStart(3, '0')}`
    : `TASK-${task.id}`

  const lines = [
    'You are Aegis, the quality reviewer for Mission Control.',
    'Review the following completed task and its resolution.',
    '',
    `**[${ticket}] ${task.title}**`,
  ]

  if (task.description) {
    lines.push('', '## Task Description', task.description)
  }

  if (task.resolution) {
    lines.push('', '## Agent Resolution', task.resolution.substring(0, 6000))
  }

  lines.push(
    '',
    '## Instructions',
    'Evaluate whether the agent\'s response adequately addresses the task.',
    'Respond with EXACTLY one of these two formats:',
    '',
    'If the work is acceptable:',
    'VERDICT: APPROVED',
    'NOTES: <brief summary of why it passes>',
    '',
    'If the work needs improvement:',
    'VERDICT: REJECTED',
    'NOTES: <specific issues that need to be fixed>',
  )

  return lines.join('\n')
}

function parseReviewVerdict(text: string): { status: 'approved' | 'rejected'; notes: string } {
  const upper = text.toUpperCase()
  const status = upper.includes('VERDICT: APPROVED') ? 'approved' as const : 'rejected' as const
  const notesMatch = text.match(/NOTES:\s*(.+)/i)
  const notes = notesMatch?.[1]?.trim().substring(0, 2000) || (status === 'approved' ? 'Quality check passed' : 'Quality check failed')
  return { status, notes }
}

function readyForOwnerRecipient(task: Pick<ReviewableTask, 'assigned_to' | 'created_by'>): string | null {
  return task.assigned_to?.trim() || task.created_by?.trim() || null
}

function recordReadyForOwnerEntrySideEffects(
  task: Pick<ReviewableTask, 'id' | 'title' | 'workspace_id' | 'assigned_to' | 'created_by' | 'github_repo' | 'github_pr_number'>,
  actor: string,
): void {
  if (task.github_repo && task.github_pr_number) return

  const data = {
    task_id: task.id,
    workspace_id: task.workspace_id,
    reason: 'missing_explicit_pr_linkage',
    github_repo: task.github_repo ?? null,
    github_pr_number: task.github_pr_number ?? null,
  }
  db_helpers.logActivity(
    'task_ready_for_owner',
    'task',
    task.id,
    actor,
    `Task ready for owner merge is missing explicit PR linkage: ${task.title}`,
    data,
    task.workspace_id,
  )

  const recipient = readyForOwnerRecipient(task)
  if (!recipient) return
  db_helpers.createNotification(
    recipient,
    'task_ready_for_owner',
    'Ready for owner merge',
    `Owner action required: ${task.title} is ready for owner merge but needs explicit GitHub PR linkage.`,
    'task',
    task.id,
    task.workspace_id,
  )
}

/**
 * Run Aegis quality reviews on tasks in 'review' status.
 * Uses an agent to evaluate the task resolution, then approves or rejects.
 */
export async function runAegisReviews(): Promise<{ ok: boolean; message: string }> {
  const db = getDatabase()

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.description, t.status, t.priority, t.resolution, t.assigned_to, t.workspace_id,
           t.project_id, p.ticket_prefix, t.project_ticket_no,
           COALESCE(wt.produces_pr, 0) AS produces_pr,
           wt.external_terminal_event,
           t.github_repo, t.github_pr_number, t.created_by,
           w.feature_flags
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
    LEFT JOIN workflow_templates wt ON wt.id = t.workflow_template_id AND wt.workspace_id = t.workspace_id
    LEFT JOIN workspaces w ON w.id = t.workspace_id
    WHERE t.status = 'review'
    ORDER BY t.updated_at ASC
    LIMIT 3
  `).all() as ReviewableTask[]

  if (tasks.length === 0) {
    return { ok: true, message: 'No tasks awaiting review' }
  }

  const results: Array<{ id: number; verdict: string; error?: string }> = []
  const reviewAgentByWorkspace = new Map<number, ReviewAgentRecord>()

  for (const task of tasks) {
    // Move to quality_review to prevent re-processing
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('quality_review', Math.floor(Date.now() / 1000), task.id)

    eventBus.broadcast('task.status_changed', {
      id: task.id,
      status: 'quality_review',
      previous_status: 'review',
    })

    try {
      const prompt = buildReviewPrompt(task)
      let agentResponse: AgentResponseParsed

      if (!isGatewayAvailable() && getAnthropicApiKey()) {
        // Direct Claude API review — no gateway needed
        const reviewTask: DispatchableTask = {
          id: task.id, title: task.title, description: task.description,
          status: 'quality_review', priority: 'high', assigned_to: 'aegis',
          workspace_id: task.workspace_id, agent_name: 'aegis', agent_id: 0,
          agent_config: null, ticket_prefix: task.ticket_prefix,
          project_ticket_no: task.project_ticket_no, project_id: null,
        }
        agentResponse = await callClaudeDirectly(reviewTask, prompt)
      } else {
        let reviewAgentRecord = reviewAgentByWorkspace.get(task.workspace_id)
        if (!reviewAgentRecord) {
          const aegis = getAegis(db, task.workspace_id)
          reviewAgentRecord = {
            name: aegis.name,
            agent_config: aegis.agent_config,
          }
          reviewAgentByWorkspace.set(task.workspace_id, reviewAgentRecord)
        }

        // Resolve the dedicated Aegis gateway agent id, not the original worker.
        const reviewAgent = resolveGatewayAgentIdForReviewAgent(reviewAgentRecord)

        const invokeParams = {
          message: prompt,
          agentId: reviewAgent,
          idempotencyKey: `aegis-review-${task.id}-${Date.now()}`,
          deliver: false,
        }
        const finalResult = await runOpenClaw(
          ['gateway', 'call', 'agent', '--expect-final', '--timeout', '120000', '--params', JSON.stringify(invokeParams), '--json'],
          { timeoutMs: 125_000 }
        )
        const finalPayload = parseGatewayJson(finalResult.stdout)
          ?? parseGatewayJson(String((finalResult as any)?.stderr || ''))
        agentResponse = parseAgentResponse(
          finalPayload?.result ? JSON.stringify(finalPayload.result) : finalResult.stdout
        )
      }

      if (!agentResponse.text) {
        throw new Error('Aegis review returned empty response')
      }

      const verdict = parseReviewVerdict(agentResponse.text)

      // Insert quality review record
      db.prepare(`
        INSERT INTO quality_reviews (task_id, reviewer, status, notes, workspace_id)
        VALUES (?, 'aegis', ?, ?, ?)
      `).run(task.id, verdict.status, verdict.notes, task.workspace_id)

      if (verdict.status === 'approved') {
        const transition = resolveTaskTerminalTransition({
          taskId: task.id,
          currentStatus: 'quality_review',
          requestedStatus: 'done',
          producesPr: task.produces_pr === 1 && task.external_terminal_event === READY_FOR_OWNER_TERMINAL_EVENT,
          twoStepTerminalEnabled: resolveFlag('FEATURE_TWO_STEP_TERMINAL', {
            workspaceFlags: task.feature_flags,
          }),
          transitionIntent: 'approval',
        })
        if (!transition.ok) {
          results.push({ id: task.id, verdict: 'error', error: transition.body.reason })
          continue
        }
        const nextStatus = transition.status as TaskStatus
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run(nextStatus, Math.floor(Date.now() / 1000), task.id)

        eventBus.broadcast('task.status_changed', {
          id: task.id,
          status: nextStatus,
          previous_status: 'quality_review',
        })
        syncAndEscalateIfFailed(task, nextStatus)
        if (nextStatus === READY_FOR_OWNER_STATUS) {
          recordReadyForOwnerEntrySideEffects(task, 'aegis')
        }
        if (nextStatus === 'done') {
          advanceTaskChain({
            taskId: task.id,
            workspaceId: task.workspace_id,
            previousStatus: 'quality_review',
            trigger: 'aegis_review',
          })
        }
      } else {
        // Rejected: check dispatch_attempts to decide next status
        const now = Math.floor(Date.now() / 1000)
        const currentAttempts = (db.prepare('SELECT dispatch_attempts FROM tasks WHERE id = ?').get(task.id) as { dispatch_attempts: number } | undefined)?.dispatch_attempts ?? 0
        const newAttempts = currentAttempts + 1
        const maxAegisRetries = 3

        if (newAttempts >= maxAegisRetries) {
          // Too many rejections — move to failed
          db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
            .run('failed', `Aegis rejected ${newAttempts} times. Last: ${verdict.notes}`, newAttempts, now, task.id)

          eventBus.broadcast('task.status_changed', {
            id: task.id,
            status: 'failed',
            previous_status: 'quality_review',
            error_message: `Aegis rejected ${newAttempts} times`,
            reason: 'max_aegis_retries_exceeded',
          })
          syncAndEscalateIfFailed(task, 'failed', `Aegis rejected ${newAttempts} times`, newAttempts)
        } else {
          // Requeue to assigned for re-dispatch with feedback
          db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
            .run('assigned', `Aegis rejected: ${verdict.notes}`, newAttempts, now, task.id)

          eventBus.broadcast('task.status_changed', {
            id: task.id,
            status: 'assigned',
            previous_status: 'quality_review',
            error_message: `Aegis rejected: ${verdict.notes}`,
            reason: 'aegis_rejection',
          })
          syncAndEscalateIfFailed(task, 'assigned')
        }

        // Add rejection as a comment so the agent sees it on next dispatch
        db.prepare(`
          INSERT INTO comments (task_id, author, content, created_at, workspace_id)
          VALUES (?, 'aegis', ?, ?, ?)
        `).run(task.id, `Quality Review Rejected (attempt ${newAttempts}/${maxAegisRetries}):\n${verdict.notes}`, now, task.workspace_id)
      }

      db_helpers.logActivity(
        'aegis_review',
        'task',
        task.id,
        'aegis',
        `Aegis ${verdict.status} task "${task.title}": ${verdict.notes.substring(0, 200)}`,
        { verdict: verdict.status, notes: verdict.notes },
        task.workspace_id
      )

      results.push({ id: task.id, verdict: verdict.status })
      logger.info({ taskId: task.id, verdict: verdict.status }, 'Aegis review completed')
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      logger.error({ taskId: task.id, err }, 'Aegis review failed')

      // Revert to review so it can be retried
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('review', Math.floor(Date.now() / 1000), task.id)

      eventBus.broadcast('task.status_changed', {
        id: task.id,
        status: 'review',
        previous_status: 'quality_review',
      })

      results.push({ id: task.id, verdict: 'error', error: errorMsg.substring(0, 100) })
    }
  }

  const approved = results.filter(r => r.verdict === 'approved').length
  const rejected = results.filter(r => r.verdict === 'rejected').length
  const errors = results.filter(r => r.verdict === 'error').length

  return {
    ok: errors === 0,
    message: `Reviewed ${tasks.length}: ${approved} approved, ${rejected} rejected${errors ? `, ${errors} error(s)` : ''}`,
  }
}

/**
 * Requeue stale tasks stuck in 'in_progress' whose assigned agent is offline.
 * Prevents tasks from being permanently stuck when agents crash or disconnect.
 */
export async function requeueStaleTasks(): Promise<{ ok: boolean; message: string }> {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const staleThreshold = now - 10 * 60 // 10 minutes
  const maxDispatchRetries = 5

  const staleTasks = db.prepare(`
    SELECT t.id, t.title, t.assigned_to, t.dispatch_attempts, t.workspace_id,
           a.status as agent_status, a.last_seen as agent_last_seen
    FROM tasks t
    LEFT JOIN agents a ON a.name = t.assigned_to AND a.workspace_id = t.workspace_id
    WHERE t.status = 'in_progress'
      AND t.updated_at < ?
  `).all(staleThreshold) as Array<{
    id: number; title: string; assigned_to: string | null; dispatch_attempts: number
    workspace_id: number; agent_status: string | null; agent_last_seen: number | null
  }>

  if (staleTasks.length === 0) {
    return { ok: true, message: 'No stale tasks found' }
  }

  let requeued = 0
  let failed = 0

  for (const task of staleTasks) {
    // Only requeue if the agent is offline or unknown
    const agentOffline = !task.agent_status || task.agent_status === 'offline'
    if (!agentOffline) continue

    const newAttempts = (task.dispatch_attempts ?? 0) + 1

    if (newAttempts >= maxDispatchRetries) {
      db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
        .run('failed', `Task stuck in_progress ${newAttempts} times — agent "${task.assigned_to}" offline. Moved to failed.`, newAttempts, now, task.id)

      eventBus.broadcast('task.status_changed', {
        id: task.id,
        status: 'failed',
        previous_status: 'in_progress',
        error_message: `Stale task — agent offline after ${newAttempts} attempts`,
        reason: 'stale_task_max_retries',
      })

      syncAndEscalateIfFailed(task as any, 'failed', `Task stuck in_progress ${newAttempts} times`, newAttempts)
      failed++
    } else {
      db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
        .run('assigned', `Requeued: agent "${task.assigned_to}" went offline while task was in_progress`, newAttempts, now, task.id)

      // Add a comment explaining the requeue
      db.prepare(`
        INSERT INTO comments (task_id, author, content, created_at, workspace_id)
        VALUES (?, 'scheduler', ?, ?, ?)
      `).run(task.id, `Task requeued (attempt ${newAttempts}/${maxDispatchRetries}): agent "${task.assigned_to}" went offline while task was in_progress.`, now, task.workspace_id)

      eventBus.broadcast('task.status_changed', {
        id: task.id,
        status: 'assigned',
        previous_status: 'in_progress',
        error_message: `Agent "${task.assigned_to}" went offline`,
        reason: 'stale_task_requeue',
      })
      syncAndEscalateIfFailed(task as any, 'assigned')

      requeued++
    }
  }

  const total = requeued + failed
  return {
    ok: true,
    message: total === 0
      ? `Found ${staleTasks.length} stale task(s) but agents still online`
      : `Requeued ${requeued}, failed ${failed} of ${staleTasks.length} stale task(s)`,
  }
}

export async function dispatchAssignedTasks(): Promise<{ ok: boolean; message: string }> {
  const db = getDatabase()

  const tasks = db.prepare(`
    SELECT t.*, a.name as agent_name, a.id as agent_id, a.config as agent_config,
           p.ticket_prefix, t.project_ticket_no
    FROM tasks t
    JOIN agents a ON a.name = t.assigned_to AND a.workspace_id = t.workspace_id
    LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
    WHERE t.status = 'assigned'
      AND t.assigned_to IS NOT NULL
    ORDER BY
      CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      t.created_at ASC
    LIMIT 3
  `).all() as (DispatchableTask & { tags?: string })[]

  if (tasks.length === 0) {
    return { ok: true, message: 'No assigned tasks to dispatch' }
  }

  // Parse JSON tags column
  for (const task of tasks) {
    if (typeof task.tags === 'string') {
      try { task.tags = JSON.parse(task.tags as string) } catch { task.tags = undefined }
    }
  }

  const results: Array<{ id: number; success: boolean; error?: string }> = []
  const now = Math.floor(Date.now() / 1000)

  for (const task of tasks) {
    // Mark as in_progress immediately to prevent re-dispatch
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('in_progress', now, task.id)

    eventBus.broadcast('task.status_changed', {
      id: task.id,
      status: 'in_progress',
      previous_status: 'assigned',
    })

    db_helpers.logActivity(
      'task_dispatched',
      'task',
      task.id,
      'scheduler',
      `Dispatching task "${task.title}" to agent ${task.agent_name}`,
      { agent: task.agent_name, priority: task.priority },
      task.workspace_id
    )

    try {
      // Check for previous Aegis rejection feedback
      const rejectionRow = db.prepare(`
        SELECT content FROM comments
        WHERE task_id = ? AND author = 'aegis' AND content LIKE 'Quality Review Rejected:%'
        ORDER BY created_at DESC LIMIT 1
      `).get(task.id) as { content: string } | undefined
      const rejectionFeedback = rejectionRow?.content?.replace(/^Quality Review Rejected:\n?/, '') || null

      const prompt = buildTaskPrompt(task, rejectionFeedback)

      // Check if task has a target session specified in metadata
      const taskMeta = (() => {
        try {
          const row = db.prepare('SELECT metadata FROM tasks WHERE id = ?').get(task.id) as { metadata: string } | undefined
          return row?.metadata ? JSON.parse(row.metadata) : {}
        } catch { return {} }
      })()
      const targetSession: string | null = typeof taskMeta?.target_session === 'string' && taskMeta.target_session
        ? taskMeta.target_session
        : null

      let agentResponse: AgentResponseParsed
      const useDirectApi = !isGatewayAvailable() && getAnthropicApiKey()

      if (useDirectApi && !targetSession) {
        // Direct Claude API dispatch — no gateway needed
        agentResponse = await callClaudeDirectly(task, prompt)
      } else if (targetSession) {
        // Dispatch to a specific existing session via chat.send
        logger.info({ taskId: task.id, targetSession, agent: task.agent_name }, 'Dispatching task to targeted session')
        const sendResult = await callOpenClawGateway<any>(
          'chat.send',
          {
            sessionKey: targetSession,
            message: prompt,
            idempotencyKey: `task-dispatch-${task.id}-${Date.now()}`,
            deliver: false,
          },
          125_000,
        )
        const status = String(sendResult?.status || '').toLowerCase()
        if (status !== 'started' && status !== 'ok' && status !== 'in_flight') {
          throw new Error(`chat.send to session ${targetSession} returned status: ${status}`)
        }
        // chat.send is fire-and-forget; we record the session but won't get inline response text
        agentResponse = {
          text: `Task dispatched to existing session ${targetSession}. The agent will process it within that session context.`,
          sessionId: sendResult?.runId || targetSession,
        }
      } else {
        // Step 1: Invoke via gateway (new session)
        const gatewayAgentId = resolveGatewayAgentId(task)
        const dispatchModel = resolveTaskDispatchModelOverride(task)
        const invokeParams: Record<string, unknown> = {
          message: prompt,
          agentId: gatewayAgentId,
          idempotencyKey: `task-dispatch-${task.id}-${Date.now()}`,
          deliver: false,
        }
        // Route to appropriate model tier based on task complexity.
        // null = no override, agent uses its own configured default model.
        if (dispatchModel) invokeParams.model = dispatchModel

        // Use --expect-final to block until the agent completes and returns the full
        // response payload (result.payloads[0].text). The two-step agent → agent.wait
        // pattern only returns lifecycle metadata and never includes the agent's text.
        const finalResult = await runOpenClaw(
          ['gateway', 'call', 'agent', '--expect-final', '--timeout', '120000', '--params', JSON.stringify(invokeParams), '--json'],
          { timeoutMs: 125_000 }
        )
        const finalPayload = parseGatewayJson(finalResult.stdout)
          ?? parseGatewayJson(String((finalResult as any)?.stderr || ''))

        agentResponse = parseAgentResponse(
          finalPayload?.result ? JSON.stringify(finalPayload.result) : finalResult.stdout
        )
        if (!agentResponse.sessionId && finalPayload?.result?.meta?.agentMeta?.sessionId) {
          agentResponse.sessionId = finalPayload.result.meta.agentMeta.sessionId
        }
      } // end else (new session dispatch)

      if (!agentResponse.text) {
        throw new Error('Agent returned empty response')
      }

      const truncated = agentResponse.text.length > 10_000
        ? agentResponse.text.substring(0, 10_000) + '\n\n[Response truncated at 10,000 characters]'
        : agentResponse.text

      // Merge dispatch_session_id into existing metadata
      const existingMeta = (() => {
        try {
          const row = db.prepare('SELECT metadata FROM tasks WHERE id = ?').get(task.id) as { metadata: string } | undefined
          return row?.metadata ? JSON.parse(row.metadata) : {}
        } catch { return {} }
      })()
      if (agentResponse.sessionId) {
        existingMeta.dispatch_session_id = agentResponse.sessionId
      }

      // Update task: status → review, set outcome
      db.prepare(`
        UPDATE tasks SET status = ?, outcome = ?, resolution = ?, metadata = ?, updated_at = ? WHERE id = ?
      `).run('review', 'success', truncated, JSON.stringify(existingMeta), Math.floor(Date.now() / 1000), task.id)

      // Add a comment from the agent with the full response
      db.prepare(`
        INSERT INTO comments (task_id, author, content, created_at, workspace_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        task.id,
        task.agent_name,
        truncated,
        Math.floor(Date.now() / 1000),
        task.workspace_id
      )

      eventBus.broadcast('task.status_changed', {
        id: task.id,
        status: 'review',
        previous_status: 'in_progress',
      })

      eventBus.broadcast('task.updated', {
        id: task.id,
        status: 'review',
        outcome: 'success',
        assigned_to: task.assigned_to,
        dispatch_session_id: agentResponse.sessionId,
      })
      syncAndEscalateIfFailed(task, 'review')

      db_helpers.logActivity(
        'task_agent_completed',
        'task',
        task.id,
        task.agent_name,
        `Agent completed task "${task.title}" — awaiting review`,
        { response_length: agentResponse.text.length, dispatch_session_id: agentResponse.sessionId },
        task.workspace_id
      )

      results.push({ id: task.id, success: true })
      logger.info({ taskId: task.id, agent: task.agent_name }, 'Task dispatched and completed')
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      logger.error({ taskId: task.id, agent: task.agent_name, err }, 'Task dispatch failed')

      // Increment dispatch_attempts and decide next status
      const currentAttempts = (db.prepare('SELECT dispatch_attempts FROM tasks WHERE id = ?').get(task.id) as { dispatch_attempts: number } | undefined)?.dispatch_attempts ?? 0
      const newAttempts = currentAttempts + 1
      const maxDispatchRetries = 5

      if (newAttempts >= maxDispatchRetries) {
        // Too many failures — move to failed
        db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
          .run('failed', `Dispatch failed ${newAttempts} times. Last: ${errorMsg.substring(0, 5000)}`, newAttempts, Math.floor(Date.now() / 1000), task.id)

        eventBus.broadcast('task.status_changed', {
          id: task.id,
          status: 'failed',
          previous_status: 'in_progress',
          error_message: `Dispatch failed ${newAttempts} times`,
          reason: 'max_dispatch_retries_exceeded',
        })
        syncAndEscalateIfFailed(task, 'failed', `Dispatch failed ${newAttempts} times`, newAttempts)
      } else {
        // Revert to assigned so it can be retried on the next tick
        db.prepare('UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?')
          .run('assigned', errorMsg.substring(0, 5000), newAttempts, Math.floor(Date.now() / 1000), task.id)

        eventBus.broadcast('task.status_changed', {
          id: task.id,
          status: 'assigned',
          previous_status: 'in_progress',
          error_message: errorMsg.substring(0, 500),
          reason: 'dispatch_failed',
        })
        syncAndEscalateIfFailed(task, 'assigned')
      }

      db_helpers.logActivity(
        'task_dispatch_failed',
        'task',
        task.id,
        'scheduler',
        `Task dispatch failed for "${task.title}": ${errorMsg.substring(0, 200)}`,
        { error: errorMsg.substring(0, 1000) },
        task.workspace_id
      )

      results.push({ id: task.id, success: false, error: errorMsg.substring(0, 100) })
    }
  }

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success)
  const failSummary = failed.length > 0
    ? ` (${failed.length} failed: ${failed.map(f => f.error).join('; ')})`
    : ''

  return {
    ok: failed.length === 0,
    message: `Dispatched ${succeeded}/${tasks.length} tasks${failSummary}`,
  }
}

// ---------------------------------------------------------------------------
// Auto-routing: assign inbox tasks to available agents
// ---------------------------------------------------------------------------

/** Role affinity mapping — which task keywords match which agent roles. */
const ROLE_AFFINITY: Record<string, string[]> = {
  coder: ['code', 'implement', 'build', 'fix', 'bug', 'test', 'unit test', 'refactor', 'feature', 'api', 'endpoint', 'function', 'class', 'module', 'component', 'deploy', 'ci', 'pipeline'],
  researcher: ['research', 'investigate', 'analyze', 'compare', 'find', 'discover', 'audit', 'review', 'survey', 'benchmark', 'evaluate', 'assess', 'competitor', 'market', 'trend'],
  reviewer: ['review', 'audit', 'check', 'verify', 'validate', 'quality', 'security', 'compliance', 'approve'],
  tester: ['test', 'qa', 'e2e', 'integration test', 'regression', 'coverage', 'verify', 'validate'],
  devops: ['deploy', 'infrastructure', 'ci', 'cd', 'docker', 'kubernetes', 'monitoring', 'pipeline', 'server', 'nginx', 'ssl'],
  assistant: ['write', 'draft', 'summarize', 'translate', 'format', 'document', 'docs', 'readme', 'email', 'message', 'report'],
  agent: [], // generic fallback
}

function scoreAgentForTask(
  agent: { name: string; role: string; status: string; config: string | null },
  taskText: string,
): number {
  // Offline agents can't take work
  if (agent.status === 'offline' || agent.status === 'error' || agent.status === 'sleeping') return -1

  const text = taskText.toLowerCase()
  const keywords = ROLE_AFFINITY[agent.role] || []

  let score = 0
  // Role keyword match
  for (const kw of keywords) {
    if (text.includes(kw)) score += 10
  }

  // Idle agents get a bonus (prefer agents not currently busy)
  if (agent.status === 'idle') score += 5

  // Check agent capabilities from config
  if (agent.config) {
    try {
      const cfg = JSON.parse(agent.config)
      const caps = Array.isArray(cfg.capabilities) ? cfg.capabilities : []
      for (const cap of caps) {
        if (typeof cap === 'string' && text.includes(cap.toLowerCase())) score += 15
      }
    } catch { /* ignore */ }
  }

  // Any non-offline agent gets at least 1 (can be a fallback)
  return Math.max(score, 1)
}

/**
 * Auto-route inbox tasks to the best available agent.
 * Runs before dispatch — moves tasks from inbox → assigned.
 */
export async function autoRouteInboxTasks(): Promise<{ ok: boolean; message: string }> {
  const db = getDatabase()

  const inboxTasks = db.prepare(`
    SELECT id, title, description, priority, tags, workspace_id
    FROM tasks
    WHERE status = 'inbox' AND assigned_to IS NULL
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      created_at ASC
    LIMIT 5
  `).all() as Array<{ id: number; title: string; description: string | null; priority: string; tags: string | null; workspace_id: number }>

  if (inboxTasks.length === 0) {
    return { ok: true, message: 'No inbox tasks to route' }
  }

  // Get all non-hidden, non-offline agents
  const agents = db.prepare(`
    SELECT id, name, role, status, config
    FROM agents
    WHERE hidden = 0 AND status NOT IN ('offline', 'error')
    LIMIT 50
  `).all() as Array<{ id: number; name: string; role: string; status: string; config: string | null }>

  if (agents.length === 0) {
    return { ok: true, message: `${inboxTasks.length} inbox task(s) but no available agents` }
  }

  let routed = 0
  const now = Math.floor(Date.now() / 1000)

  for (const task of inboxTasks) {
    const taskText = `${task.title} ${task.description || ''}`
    let parsedTags: string[] = []
    if (task.tags) {
      try { parsedTags = JSON.parse(task.tags) } catch { /* ignore */ }
    }
    const fullText = `${taskText} ${parsedTags.join(' ')}`

    // Score each agent
    const scored = agents
      .map(a => ({ agent: a, score: scoreAgentForTask(a, fullText) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) continue

    const best = scored[0].agent

    // Check capacity — skip agents with 3+ in-progress tasks
    const inProgressCount = (db.prepare(
      'SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = \'in_progress\' AND workspace_id = ?'
    ).get(best.name, task.workspace_id) as { c: number }).c

    if (inProgressCount >= 3) {
      // Try next best agent
      const alt = scored.find(s => {
        const c = (db.prepare(
          'SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = \'in_progress\' AND workspace_id = ?'
        ).get(s.agent.name, task.workspace_id) as { c: number }).c
        return c < 3
      })
      if (!alt) continue // all agents at capacity
      db.prepare('UPDATE tasks SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ?')
        .run('assigned', alt.agent.name, now, task.id)

      db_helpers.logActivity('task_auto_routed', 'task', task.id, 'scheduler',
        `Auto-assigned "${task.title}" to ${alt.agent.name} (${alt.agent.role}, score: ${alt.score})`,
        { agent: alt.agent.name, role: alt.agent.role, score: alt.score },
        task.workspace_id)

      eventBus.broadcast('task.status_changed', { id: task.id, status: 'assigned', previous_status: 'inbox', assigned_to: alt.agent.name })
      syncAndEscalateIfFailed(task as any, 'assigned')
      routed++
      continue
    }

    db.prepare('UPDATE tasks SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ?')
      .run('assigned', best.name, now, task.id)

    db_helpers.logActivity('task_auto_routed', 'task', task.id, 'scheduler',
      `Auto-assigned "${task.title}" to ${best.name} (${best.role}, score: ${scored[0].score})`,
      { agent: best.name, role: best.role, score: scored[0].score },
      task.workspace_id)

    eventBus.broadcast('task.status_changed', { id: task.id, status: 'assigned', previous_status: 'inbox', assigned_to: best.name })
    syncAndEscalateIfFailed(task as any, 'assigned')
    routed++
  }

  return {
    ok: true,
    message: routed > 0
      ? `Auto-routed ${routed}/${inboxTasks.length} inbox task(s)`
      : `${inboxTasks.length} inbox task(s), no suitable agents found`,
  }
}
