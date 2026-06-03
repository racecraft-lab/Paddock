import { resolveFlag } from '@/lib/feature-flags'
import { sanitizeFakeEvidenceList } from './evidence'
import { FAKE_HARNESS_ADAPTER_REGISTRY } from './fixtures'
import {
  CAPABILITY_RESOLUTION_SCHEMA_VERSION,
  HARNESS_ADAPTER_REASON_PRECEDENCE,
  RUNTIME_INVENTORY_SCHEMA_VERSION,
  type CapabilitySupport,
  type HarnessAdapterCapabilityKey,
  type HarnessAdapterManifest,
  type HarnessAdapterManifestId,
  type HarnessAdapterReasonCode,
  type HarnessAdapterState,
  type RuntimeInventoryAssignment,
  type RuntimeInventoryEnvelope,
  type RuntimeInventoryEntry,
  type RuntimeInventoryGate,
  type SandboxLifecycleReference,
  type SanitizedFakeEvidence,
} from './types'
import {
  isHarnessAdapterCapability,
  isHarnessAdapterManifestId,
  manifestDigest,
  sortedValidFakeRegistry,
  validateHarnessAdapterManifest,
  validateHarnessAdapterRegistry,
} from './validation'
import type Database from 'better-sqlite3'

const ELIGIBLE_TASK_STATUSES = new Set(['assigned', 'in_progress', 'quality_review'])
const ELIGIBLE_LIFECYCLE_STATUSES = new Set(['created', 'prepared', 'running'])

export interface RuntimeInventoryTaskInput {
  readonly id: number
  readonly workspace_id: number
  readonly project_id: number | null
  readonly status: string
  readonly stage_key: string | null
}

export interface RuntimeInventoryAssignmentInput {
  readonly project_id: number
  readonly role: string
  readonly agent_name: string
}

export interface RuntimeInventoryLifecycleInput {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly owner: 'paddock' | 'openclaw' | 'external_harness'
  readonly status: string
  readonly updated_at: string
}

export interface RuntimeInventoryFilters {
  readonly manifestId?: HarnessAdapterManifestId
  readonly state?: HarnessAdapterState
  readonly requestedCapability?: HarnessAdapterCapabilityKey
  readonly role?: string
  readonly projectId?: number
  readonly taskId?: number
}

export interface RuntimeInventoryBuildInput {
  readonly manifests?: readonly HarnessAdapterManifest[]
  readonly generatedAt?: string
  readonly scope: RuntimeInventoryEnvelope['scope']
  readonly featureFlagEnabled: boolean
  readonly assignments?: readonly RuntimeInventoryAssignmentInput[]
  readonly task?: RuntimeInventoryTaskInput | null
  readonly lifecycles?: readonly RuntimeInventoryLifecycleInput[]
  readonly filters?: RuntimeInventoryFilters
  readonly governanceAllowed?: boolean
  readonly policyRequirements?: {
    readonly approvalRequired?: boolean
    readonly userInputRequired?: boolean
    readonly timeoutExpiresAt?: string | null
  }
  readonly evidenceByManifest?: Partial<Record<HarnessAdapterManifestId, readonly unknown[]>>
}

export interface RuntimeInventoryDbInput {
  readonly scope: {
    readonly kind: 'legacy' | 'productLine' | 'facility'
    readonly workspaceId: number | null
    readonly workspaceIds: readonly number[]
  }
  readonly filters: RuntimeInventoryFilters
  readonly generatedAt?: string
}

function reasonRank(reason: HarnessAdapterReasonCode): number {
  const index = HARNESS_ADAPTER_REASON_PRECEDENCE.indexOf(reason)
  return index === -1 ? HARNESS_ADAPTER_REASON_PRECEDENCE.length : index
}

function uniqueReasons(reasons: readonly HarnessAdapterReasonCode[]): readonly HarnessAdapterReasonCode[] {
  return [...new Set(reasons)].sort((left, right) => reasonRank(left) - reasonRank(right))
}

function gate(
  gateName: RuntimeInventoryGate['gate'],
  status: RuntimeInventoryGate['status'],
  reasonCode?: HarnessAdapterReasonCode,
  detail?: string,
): RuntimeInventoryGate {
  return {
    gate: gateName,
    status,
    ...(reasonCode ? { reason_code: reasonCode } : {}),
    ...(detail ? { detail } : {}),
  }
}

function selectedAssignment(
  assignments: readonly RuntimeInventoryAssignmentInput[] | undefined,
  filters: RuntimeInventoryFilters | undefined,
): RuntimeInventoryAssignment {
  if (assignments === undefined) {
    return { status: 'not_evaluated', project_id: null, role: null, agent_name: null }
  }
  const matching = assignments.find((assignment) => {
    if (filters?.projectId !== undefined && assignment.project_id !== filters.projectId) return false
    if (filters?.role !== undefined && assignment.role !== filters.role) return false
    return true
  })
  if (!matching) return { status: 'unassigned', project_id: null, role: filters?.role ?? null, agent_name: null }
  return {
    status: 'assigned',
    project_id: String(matching.project_id),
    role: matching.role,
    agent_name: matching.agent_name,
  }
}

function lifecycleRefsFor(
  manifest: HarnessAdapterManifest,
  task: RuntimeInventoryTaskInput | null | undefined,
  lifecycles: readonly RuntimeInventoryLifecycleInput[] | undefined,
): readonly SandboxLifecycleReference[] {
  if (!task || !lifecycles) return []
  return lifecycles
    .filter((lifecycle) => lifecycle.workspace_id === task.workspace_id)
    .filter((lifecycle) => lifecycle.task_id === task.id)
    .filter((lifecycle) => task.stage_key === null || lifecycle.stage_key === task.stage_key)
    .filter((lifecycle) => lifecycle.owner === manifest.sandbox.owner)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id - left.id)
    .slice(0, 5)
    .map((lifecycle) => ({
      id: String(lifecycle.id),
      owner: lifecycle.owner,
      status: lifecycle.status,
      stage_key: lifecycle.stage_key,
      updated_at: lifecycle.updated_at,
    }))
}

function evidenceFor(
  manifest: HarnessAdapterManifest,
  evidenceByManifest: RuntimeInventoryBuildInput['evidenceByManifest'],
): {
  readonly accepted: readonly SanitizedFakeEvidence[]
  readonly rejectedReason: HarnessAdapterReasonCode | null
  readonly rejectionMetadata?: RuntimeInventoryEntry['rejection_metadata']
} {
  const result = sanitizeFakeEvidenceList(evidenceByManifest?.[manifest.manifest_id])
  const firstRejected = result.rejected[0]
  return {
    accepted: result.accepted,
    rejectedReason: firstRejected ? 'sanitized_evidence_rejected' : null,
    ...(firstRejected
      ? {
          rejectionMetadata: {
            field_path: firstRejected.field_path,
            evidence_kind: firstRejected.evidence_kind,
            reason_code: 'sanitized_evidence_rejected',
          },
        }
      : {}),
  }
}

function capabilitySupport(
  manifest: HarnessAdapterManifest,
  requestedCapability: HarnessAdapterCapabilityKey,
): CapabilitySupport {
  if (requestedCapability === 'mcp_exposure') return manifest.exposure.mcp_exposure
  if (requestedCapability === 'tool_exposure') return manifest.exposure.tool_exposure
  if (requestedCapability === 'skills') return manifest.exposure.skills
  if (requestedCapability === 'plugins') return manifest.exposure.plugins
  if (requestedCapability === 'memory') return manifest.exposure.memory
  if (requestedCapability === 'provider_account_constraints') return manifest.provider_account_constraints.support
  if (requestedCapability === 'approval_policy') return manifest.policies.approval_policy
  if (requestedCapability === 'timeout_policy') return manifest.policies.timeout_policy
  if (requestedCapability === 'user_input_policy') return manifest.policies.user_input_policy
  return manifest.capabilities[requestedCapability]
}

function supportReason(
  manifest: HarnessAdapterManifest,
  requestedCapability: HarnessAdapterCapabilityKey,
): HarnessAdapterReasonCode | null {
  const support = capabilitySupport(manifest, requestedCapability)
  if (support.state === 'supported') return null
  return support.unsupported_reason_code ?? 'capability_unsupported'
}

function policyReasons(
  manifest: HarnessAdapterManifest,
  generatedAt: string,
  requirements: RuntimeInventoryBuildInput['policyRequirements'],
): readonly HarnessAdapterReasonCode[] {
  const reasons: HarnessAdapterReasonCode[] = []
  if (requirements?.approvalRequired && manifest.policies.approval_policy.state === 'unsupported') {
    reasons.push('approval_unsupported')
  }
  if (requirements?.userInputRequired && manifest.policies.user_input_policy.state === 'unsupported') {
    reasons.push('user_input_unsupported')
  }
  if (requirements?.timeoutExpiresAt) {
    const expiresAt = Date.parse(requirements.timeoutExpiresAt)
    const now = Date.parse(generatedAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) reasons.push('timeout_budget_expired')
  }
  if (manifest.policies.timeout_policy.state === 'unsupported') reasons.push('timeout_budget_expired')
  return reasons
}

function stateFor(
  assignment: RuntimeInventoryAssignment,
  task: RuntimeInventoryTaskInput | null | undefined,
  reasons: readonly HarnessAdapterReasonCode[],
): HarnessAdapterState {
  const blockingReasons = task
    ? reasons
    : reasons.filter((reason) => reason !== 'adapter_unassigned')
  if (blockingReasons.length > 0) return 'blocked'
  if (task) return 'eligible'
  if (assignment.status === 'assigned') return 'assigned'
  if (assignment.status === 'unassigned') return 'unassigned'
  return 'visible'
}

function buildEntry(
  manifest: HarnessAdapterManifest,
  input: RuntimeInventoryBuildInput,
): RuntimeInventoryEntry {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const filters = input.filters
  const requestedCapability = filters?.requestedCapability ?? 'launch'
  const evaluateCapability = filters?.requestedCapability !== undefined || input.task !== null && input.task !== undefined
  const validation = validateHarnessAdapterManifest(manifest)
  const manifestAssignments = input.assignments?.filter((assignment) => assignment.agent_name === manifest.manifest_id)
  const assignment = selectedAssignment(manifestAssignments, filters)
  const lifecycleRefs = lifecycleRefsFor(manifest, input.task, input.lifecycles)
  const evidence = evidenceFor(manifest, input.evidenceByManifest)
  const reasons: HarnessAdapterReasonCode[] = []
  const gates: RuntimeInventoryGate[] = []

  gates.push(input.featureFlagEnabled
    ? gate('feature_flag', 'passed')
    : gate('feature_flag', 'failed', 'feature_disabled'))
  if (!input.featureFlagEnabled) reasons.push('feature_disabled')

  gates.push(validation.ok
    ? gate('manifest_validation', 'passed')
    : gate('manifest_validation', 'failed', 'manifest_invalid'))
  if (!validation.ok) reasons.push('manifest_invalid')

  if (assignment.status === 'not_evaluated') {
    gates.push(gate('assignment', 'not_evaluated'))
  } else if (assignment.status === 'assigned') {
    gates.push(gate('assignment', 'passed'))
  } else {
    gates.push(gate('assignment', 'failed', 'adapter_unassigned'))
    reasons.push('adapter_unassigned')
  }

  const capabilityReason = evaluateCapability ? supportReason(manifest, requestedCapability) : null
  gates.push(!evaluateCapability
    ? gate('capability', 'not_evaluated')
    : capabilityReason
    ? gate('capability', 'failed', capabilityReason)
    : gate('capability', 'passed'))
  if (capabilityReason) reasons.push(capabilityReason)

  const policyReasonList = policyReasons(manifest, generatedAt, input.policyRequirements)
  const hasApprovalReason = policyReasonList.includes('approval_unsupported')
  const hasTimeoutReason = policyReasonList.includes('timeout_budget_expired')
  const hasUserInputReason = policyReasonList.includes('user_input_unsupported')
  gates.push(input.policyRequirements?.approvalRequired
    ? gate('approval_policy', hasApprovalReason ? 'failed' : 'passed', hasApprovalReason ? 'approval_unsupported' : undefined)
    : gate('approval_policy', 'not_evaluated'))
  gates.push(input.policyRequirements?.timeoutExpiresAt
    ? gate('timeout_policy', hasTimeoutReason ? 'failed' : 'passed', hasTimeoutReason ? 'timeout_budget_expired' : undefined)
    : gate('timeout_policy', 'not_evaluated'))
  gates.push(input.policyRequirements?.userInputRequired
    ? gate('user_input_policy', hasUserInputReason ? 'failed' : 'passed', hasUserInputReason ? 'user_input_unsupported' : undefined)
    : gate('user_input_policy', 'not_evaluated'))
  reasons.push(...policyReasonList)

  const governanceAllowed = input.governanceAllowed ?? true
  gates.push(governanceAllowed ? gate('governance', 'passed') : gate('governance', 'failed', 'governance_denied'))
  if (!governanceAllowed) reasons.push('governance_denied')

  if (input.task) {
    const taskEligible = ELIGIBLE_TASK_STATUSES.has(input.task.status)
    gates.push(taskEligible ? gate('task', 'passed') : gate('task', 'failed', 'task_ineligible'))
    if (!taskEligible) reasons.push('task_ineligible')
  } else {
    gates.push(gate('task', 'not_evaluated'))
  }

  if (input.task) {
    const eligibleLifecycle = lifecycleRefs.some((ref) => ELIGIBLE_LIFECYCLE_STATUSES.has(ref.status))
    gates.push(eligibleLifecycle
      ? gate('sandbox_lifecycle', 'passed')
      : gate('sandbox_lifecycle', 'failed', 'sandbox_lifecycle_missing'))
    if (!eligibleLifecycle) reasons.push('sandbox_lifecycle_missing')
  } else {
    gates.push(gate('sandbox_lifecycle', 'not_evaluated'))
  }

  gates.push(gate('authorization', 'passed'))
  gates.push(evidence.rejectedReason
    ? gate('evidence_safety', 'failed', evidence.rejectedReason)
    : gate('evidence_safety', 'passed'))
  if (evidence.rejectedReason) reasons.push(evidence.rejectedReason)

  const reasonCodes = uniqueReasons(reasons)
  const state = stateFor(assignment, input.task, reasonCodes)

  return {
    id: `runtime_inventory:${manifest.manifest_id}`,
    state,
    selected_manifest: {
      manifest_id: manifest.manifest_id,
      display_name: manifest.display_name,
      validation: {
        ok: validation.ok,
        issues: validation.issues,
        diagnostics: {
          ...validation.diagnostics,
          manifest_sha256: manifestDigest(manifest).slice(0, 16),
        },
      },
    },
    assignment,
    capability_resolution: {
      schema_version: CAPABILITY_RESOLUTION_SCHEMA_VERSION,
      manifest_id: manifest.manifest_id,
      requested_capability: requestedCapability,
      supported: capabilityReason === null,
      policy: {
        approval: input.policyRequirements?.approvalRequired
          ? (hasApprovalReason ? 'unsupported' : 'supported')
          : 'not_evaluated',
        timeout: input.policyRequirements?.timeoutExpiresAt
          ? (hasTimeoutReason ? 'expired' : 'supported')
          : 'not_evaluated',
        user_input: input.policyRequirements?.userInputRequired
          ? (hasUserInputReason ? 'unsupported' : 'supported')
          : 'not_evaluated',
      },
      reason_codes: reasonCodes,
    },
    eligibility_gates: gates,
    sandbox_lifecycle_refs: lifecycleRefs,
    sanitized_fake_evidence: evidence.accepted,
    ...(evidence.rejectionMetadata ? { rejection_metadata: evidence.rejectionMetadata } : {}),
    reason_codes: reasonCodes,
  }
}

function summarize(entries: readonly RuntimeInventoryEntry[]): RuntimeInventoryEnvelope['summary'] {
  return {
    total: entries.length,
    visible: entries.filter((entry) => entry.state === 'visible').length,
    unassigned: entries.filter((entry) => entry.state === 'unassigned').length,
    assigned: entries.filter((entry) => entry.state === 'assigned').length,
    eligible: entries.filter((entry) => entry.state === 'eligible').length,
    blocked: entries.filter((entry) => entry.state === 'blocked').length,
  }
}

export function buildRuntimeInventory(input: RuntimeInventoryBuildInput): RuntimeInventoryEnvelope {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const registryValidation = validateHarnessAdapterRegistry(input.manifests ?? FAKE_HARNESS_ADAPTER_REGISTRY)
  const manifests = sortedValidFakeRegistry(input.manifests ?? FAKE_HARNESS_ADAPTER_REGISTRY)
    .filter((manifest) => input.filters?.manifestId === undefined || manifest.manifest_id === input.filters.manifestId)
  const entries = manifests
    .map((manifest) => buildEntry(manifest, { ...input, generatedAt }))
    .filter((entry) => input.filters?.state === undefined || entry.state === input.filters.state)
    .sort((left, right) => left.selected_manifest.manifest_id.localeCompare(right.selected_manifest.manifest_id))
  return {
    schema_version: RUNTIME_INVENTORY_SCHEMA_VERSION,
    generated_at: generatedAt,
    scope: input.scope,
    feature_flag: {
      name: 'FEATURE_AGENT_RUNNER_SANDBOXES',
      enabled: input.featureFlagEnabled,
      source: 'workspace',
    },
    entries,
    summary: summarize(entries),
    diagnostics: {
      truncated: false,
      warnings: registryValidation.ok ? [] : ['fake registry validation failed; invalid manifests are blocked'],
    },
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  try {
    const row = db.prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { ok?: number } | undefined
    return row?.ok === 1
  } catch {
    return false
  }
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((row) => row.name === column)
}

function placeholders(values: readonly unknown[]): string {
  return values.length > 0 ? values.map(() => '?').join(', ') : 'NULL'
}

function featureFlagEnabledForScope(db: Database.Database, workspaceIds: readonly number[]): boolean {
  if (workspaceIds.length === 0) return false
  if (!tableExists(db, 'workspaces') || !columnExists(db, 'workspaces', 'feature_flags')) return false
  const rows = db.prepare(`
    SELECT feature_flags
    FROM workspaces
    WHERE id IN (${placeholders(workspaceIds)})
    ORDER BY id ASC
  `).all(...workspaceIds) as { feature_flags: string | null }[]
  if (rows.length === 0) return false
  return rows.every((row) => resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', { workspaceFlags: row.feature_flags }))
}

function loadAssignments(
  db: Database.Database,
  workspaceIds: readonly number[],
  filters: RuntimeInventoryFilters,
): readonly RuntimeInventoryAssignmentInput[] {
  if (!tableExists(db, 'project_agent_assignments') || !tableExists(db, 'projects')) return []
  const params: unknown[] = [...workspaceIds]
  let where = `p.workspace_id IN (${placeholders(workspaceIds)})`
  if (filters.projectId !== undefined) {
    where += ' AND p.id = ?'
    params.push(filters.projectId)
  }
  if (filters.role !== undefined) {
    where += ' AND paa.role = ?'
    params.push(filters.role)
  }
  return db.prepare(`
    SELECT p.id AS project_id, paa.role, paa.agent_name
    FROM project_agent_assignments paa
    JOIN projects p ON p.id = paa.project_id
    WHERE ${where}
    ORDER BY p.id ASC, paa.role ASC, paa.agent_name ASC
  `).all(...params) as RuntimeInventoryAssignmentInput[]
}

function loadTask(
  db: Database.Database,
  workspaceIds: readonly number[],
  taskId: number | undefined,
): RuntimeInventoryTaskInput | null {
  if (taskId === undefined || !tableExists(db, 'tasks')) return null
  const hasTemplateId = columnExists(db, 'tasks', 'workflow_template_id')
  const hasTemplateSlug = columnExists(db, 'tasks', 'workflow_template_slug')
  const templateJoin = hasTemplateId && tableExists(db, 'workflow_templates')
    ? 'LEFT JOIN workflow_templates wt ON wt.id = t.workflow_template_id AND wt.workspace_id = t.workspace_id'
    : ''
  const stageExpr = hasTemplateId
    ? `COALESCE(${hasTemplateSlug ? 't.workflow_template_slug, ' : ''}wt.slug, wt.agent_role, 'default')`
    : (hasTemplateSlug ? `COALESCE(t.workflow_template_slug, 'default')` : `'default'`)
  const hasProjectId = columnExists(db, 'tasks', 'project_id')
  const row = db.prepare(`
    SELECT t.id, t.workspace_id, ${hasProjectId ? 't.project_id' : 'NULL'} AS project_id, t.status, ${stageExpr} AS stage_key
    FROM tasks t
    ${templateJoin}
    WHERE t.id = ? AND t.workspace_id IN (${placeholders(workspaceIds)})
    LIMIT 1
  `).get(taskId, ...workspaceIds) as RuntimeInventoryTaskInput | undefined
  return row ?? null
}

function loadLifecycles(
  db: Database.Database,
  task: RuntimeInventoryTaskInput | null,
): readonly RuntimeInventoryLifecycleInput[] {
  if (!task || !tableExists(db, 'agent_sandbox_lifecycles')) return []
  return db.prepare(`
    SELECT id, workspace_id, task_id, stage_key, owner, status, updated_at
    FROM agent_sandbox_lifecycles
    WHERE workspace_id = ? AND task_id = ?
    ORDER BY updated_at DESC, id DESC
  `).all(task.workspace_id, task.id) as RuntimeInventoryLifecycleInput[]
}

export function buildRuntimeInventoryFromDatabase(
  db: Database.Database,
  input: RuntimeInventoryDbInput,
): RuntimeInventoryEnvelope {
  const workspaceIds = input.scope.workspaceIds
  const task = loadTask(db, workspaceIds, input.filters.taskId)
  return buildRuntimeInventory({
    scope: {
      kind: input.scope.kind,
      workspace_id: input.scope.workspaceId === null ? null : String(input.scope.workspaceId),
      workspace_ids: workspaceIds.map(String),
    },
    ...(input.generatedAt !== undefined ? { generatedAt: input.generatedAt } : {}),
    featureFlagEnabled: featureFlagEnabledForScope(db, workspaceIds),
    filters: input.filters,
    assignments: loadAssignments(db, workspaceIds, input.filters),
    task,
    lifecycles: loadLifecycles(db, task),
    governanceAllowed: true,
  })
}

export function validateRuntimeInventoryFilter(input: {
  readonly manifestId?: string | null
  readonly requestedCapability?: string | null
}):
  | {
      readonly ok: true
      readonly manifestId?: HarnessAdapterManifestId
      readonly requestedCapability?: HarnessAdapterCapabilityKey
    }
  | { readonly ok: false; readonly field: string; readonly code: string; readonly reason: HarnessAdapterReasonCode } {
  if (input.manifestId !== undefined && input.manifestId !== null && !isHarnessAdapterManifestId(input.manifestId)) {
    return { ok: false, field: 'manifest_id', code: 'unknown_manifest_id', reason: 'manifest_invalid' }
  }
  if (input.requestedCapability !== undefined && input.requestedCapability !== null && !isHarnessAdapterCapability(input.requestedCapability)) {
    return { ok: false, field: 'requested_capability', code: 'unknown_capability', reason: 'capability_unsupported' }
  }
  return {
    ok: true,
    ...(input.manifestId !== undefined && input.manifestId !== null ? { manifestId: input.manifestId } : {}),
    ...(input.requestedCapability !== undefined && input.requestedCapability !== null ? { requestedCapability: input.requestedCapability } : {}),
  }
}
