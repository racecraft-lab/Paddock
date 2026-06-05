import { spawn as spawnSubprocess, type SpawnOptions } from 'node:child_process'
import { resolveSandboxRoot } from './agent-sandbox-lifecycle'
import { resolveFlag } from './feature-flags'
import {
  buildCodexAppServerActivityPayload,
  type CodexAppServerActivityPayload,
  type CodexAppServerRunEvidence,
} from './harness-adapters/codex-app-server/evidence'
import {
  CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET,
  CODEX_APP_SERVER_MANIFEST,
} from './harness-adapters/codex-app-server/manifest'
import {
  launchCodexAppServerAttempt,
  type CodexAppServerLaunchResult,
  type CodexAppServerProtocolStep,
  type CodexAppServerRunnerDeps,
} from './harness-adapters/codex-app-server/runner'
import {
  buildCodexAppServerRuntimeInventory,
  type RuntimeInventoryAssignmentInput,
  type RuntimeInventoryLifecycleInput,
  type RuntimeInventoryTaskInput,
} from './harness-adapters/runtime-inventory'
import { appendTaskStageAttemptEvent } from './task-stage-attempts'
import type { ReconcileAndAcquireTaskStageClaimResult } from './task-claim-reconciliation'
import type Database from 'better-sqlite3'

type CodexAppServerRunStatus = 'blocked' | 'launched'
type CodexAppServerRunOutcome = 'pending' | 'blocked'
type CodexAppServerBlockedAdmissionReasonCode =
  | 'feature_disabled'
  | 'adapter_unassigned'
  | 'not_github_linked'
  | 'manifest_invalid'
  | 'manifest_mismatch'
  | 'missing_claim'
  | 'stale_claim'
  | 'missing_attempt'
  | 'governance_denied'
  | 'capability_unsupported'
  | 'sandbox_lifecycle_missing'
  | 'sandbox_lifecycle_not_paddock_owned'
  | 'sandbox_lifecycle_not_ready'
  | 'workspace_mismatch'
  | 'repository_mismatch'
  | 'authorization_denied'

interface CodexAppServerDispatchAdmissionInput {
  readonly now: string
  readonly expectedScope: {
    readonly workspaceId: string
    readonly repository: string
  }
  readonly featureFlags: {
    readonly taskControlPlaneEnabled: boolean
    readonly runnerSandboxesEnabled: boolean
  }
  readonly task: {
    readonly taskId: string
    readonly workspaceId: string
    readonly stageKey: string
    readonly repository: string | null
    readonly githubIssueTitle: string | null
    readonly githubIssueBody: string | null
    readonly githubIssueUrl: string | null
  }
  readonly assignment: null | {
    readonly assignmentId: string
    readonly workspaceId: string
    readonly projectId: string
    readonly workflowTemplateId: string
    readonly role: string
    readonly manifestId: string
  }
  readonly governance: {
    readonly allowed: boolean
    readonly reasonCodes: readonly CodexAppServerBlockedAdmissionReasonCode[]
  }
  readonly runtimeInventory: {
    readonly manifestId: string
    readonly manifestValid: boolean
    readonly capabilityPacket: typeof CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET
  }
  readonly lifecycleClaim: null | {
    readonly workspaceId: string
    readonly taskId: string
    readonly stageKey: string
    readonly repository: string
    readonly assignmentId: string
    readonly workflowTemplateId: string
    readonly lifecycle: {
      readonly lifecycleId: string
      readonly lifecycleRoot: string
      readonly owner: string
      readonly status: 'created' | 'prepared' | 'running' | 'terminal' | 'cleanup_pending' | 'cleanup_failed'
      readonly createdAt: string
    }
    readonly claim: {
      readonly claimId: string
      readonly claimRunId: string
      readonly status: string
      readonly releaseReason: string | null
    }
    readonly attempt: {
      readonly attemptId: string
      readonly status: string
      readonly runId: string
    }
  }
}

type CodexAppServerDispatchRunEvidence = CodexAppServerRunEvidence

type CodexAppServerDispatchAdmissionDecision =
  | {
      readonly decision: 'launch'
      readonly adapterId: 'codex-app-server'
      readonly manifestId: 'codex-app-server'
      readonly reasonCodes: readonly []
      readonly launchInput: {
        readonly workspaceId: string
        readonly taskId: string
        readonly stageKey: string
        readonly repository: string
        readonly githubIssueTitle: string
        readonly githubIssueBody: string
        readonly githubIssueUrl: string
        readonly workflowTemplateId: string
      readonly stageInstructions: string
      readonly assignmentRole: string
        readonly claimId: string
        readonly claimRunId: string
        readonly attemptId: string
        readonly manifestId: string
        readonly capabilityPacket: typeof CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET
        readonly lifecycleId: string
        readonly lifecycleRoot: string
        readonly timeoutMs: 120000
      }
      readonly runEvidence: CodexAppServerDispatchRunEvidence
      readonly activityPayload: CodexAppServerActivityPayload
    }
  | {
      readonly decision: 'blocked'
      readonly adapterId: 'codex-app-server'
      readonly manifestId?: string
      readonly reasonCodes: readonly CodexAppServerBlockedAdmissionReasonCode[]
      readonly launchInput: null
      readonly runEvidence: CodexAppServerDispatchRunEvidence
      readonly activityPayload: CodexAppServerActivityPayload
    }

type CodexAppServerOwnershipReproofPoint =
  | 'before_launch'
  | 'before_continuation'
  | 'before_terminal_evidence_write'
  | 'before_claim_release'
  | 'before_lifecycle_terminal_marking'

type CodexAppServerOwnershipAllowedWrite =
  | 'launch'
  | 'turn_start'
  | 'run_terminal_evidence'
  | 'attempt_status'
  | 'claim_release'
  | 'lifecycle_terminal_marking'
  | 'abandoned_run_evidence'
  | 'activity'

type CodexAppServerForbiddenLateMutation =
  | 'claim_release'
  | 'attempt_status'
  | 'task_terminal'
  | 'successor_selection'
  | 'task_creation'
  | 'direct_github_mutation'
  | 'outbound_sync'
  | 'auto_merge'
  | 'aegis_owner_gate_bypass'
  | 'governance_mutation'
  | 'lifecycle_terminal_marking'

interface CodexAppServerOwnershipExpectedState {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly repository: string
  readonly assignmentId: string
  readonly manifestId: 'codex-app-server'
  readonly claimId: string
  readonly claimRunId: string
  readonly attemptId: string
  readonly runId: string
  readonly lifecycleId: string
  readonly threadId: string
  readonly threadSessionId: string
}

interface CodexAppServerOwnershipCurrentState {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly repository: string
  readonly assignmentId: string
  readonly manifestId: string
  readonly governanceAllowed: boolean
  readonly featureFlags: {
    readonly taskControlPlaneEnabled: boolean
    readonly runnerSandboxesEnabled: boolean
  }
  readonly runtimeInventory: {
    readonly manifestId: string
    readonly manifestValid: boolean
    readonly capabilityPacket: typeof CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET
  }
  readonly claim: {
    readonly claimId: string
    readonly claimRunId: string
    readonly status: string
    readonly releaseReason: string | null
  }
  readonly attempt: {
    readonly attemptId: string
    readonly runId: string
    readonly status: string
    readonly current: boolean
  }
  readonly lifecycle: {
    readonly lifecycleId: string
    readonly owner: string
    readonly status: string
  }
  readonly liveThread: {
    readonly threadId: string
    readonly threadSessionId: string
    readonly subprocessActive: boolean
  }
}

interface CodexAppServerOwnershipTerminalOutcome {
  readonly runStatus: 'completed' | 'failed' | 'timeout'
  readonly outcome: 'success' | 'failed'
  readonly phase: 'terminal' | 'running' | 'artifact_safety'
  readonly reasonCode: string | null
  readonly attemptStatus: 'succeeded' | 'failed'
  readonly claimRelease: 'launch_handoff_completed' | 'dispatch_failed'
}

interface CodexAppServerOwnershipContinuation {
  readonly requestedThreadId: string
  readonly requestedThreadSessionId: string
}

interface CodexAppServerOwnershipReproofInput {
  readonly point: CodexAppServerOwnershipReproofPoint
  readonly expected: CodexAppServerOwnershipExpectedState
  readonly current: CodexAppServerOwnershipCurrentState
  readonly terminalOutcome: CodexAppServerOwnershipTerminalOutcome | null
  readonly continuation: CodexAppServerOwnershipContinuation | null
}

const descriptorOnlySafety = {
  rawTranscriptRetained: false,
  rawProtocolRetained: false,
  providerPayloadRetained: false,
  toolPayloadRetained: false,
  promptBodyRetained: false,
  hostPathRetained: false,
  secretRetained: false,
  redactionApplied: false,
} as const

const CODEX_APP_SERVER_ADAPTER_ID = CODEX_APP_SERVER_MANIFEST.adapterId
const CODEX_APP_SERVER_MANIFEST_ID = CODEX_APP_SERVER_MANIFEST.manifestId
const CODEX_APP_SERVER_SCHEMA_VERSION = CODEX_APP_SERVER_MANIFEST.evidenceSchemaVersion
const forbiddenLateMutations = [
  'claim_release',
  'attempt_status',
  'task_terminal',
  'successor_selection',
  'task_creation',
  'direct_github_mutation',
  'outbound_sync',
  'auto_merge',
  'aegis_owner_gate_bypass',
  'governance_mutation',
  'lifecycle_terminal_marking',
] as const satisfies readonly CodexAppServerForbiddenLateMutation[]

export interface CodexAppServerDispatchTaskInput {
  readonly id: number
  readonly title: string
  readonly description: string | null
  readonly workspace_id: number
  readonly project_id: number | null
  readonly assigned_to?: string | null
  readonly agent_name?: string | null
  readonly github_repo?: string | null
  readonly github_issue_number?: number | null
  readonly workflow_template_id?: number | null
  readonly workflow_template_slug?: string | null
}

export interface TryCodexAppServerDispatchInput {
  readonly db: Database.Database
  readonly task: CodexAppServerDispatchTaskInput
  readonly claimAdmission: ReconcileAndAcquireTaskStageClaimResult
  readonly activeClaimId: number | null
  readonly activeClaimStageKey: string
  readonly claimRunId: string
  readonly correlationId: string
  readonly now: number
  readonly dataDir?: string
  readonly sandboxRoot?: string
  readonly protocolSequence?: readonly CodexAppServerProtocolStep[]
  readonly nowIso?: () => string
  readonly spawn?: CodexAppServerRunnerDeps['spawn']
  readonly releaseClaim: (reason: 'launch_handoff_completed' | 'dispatch_failed') => void
}

export type TryCodexAppServerDispatchResult =
  | { readonly handled: false }
  | {
      readonly handled: true
      readonly success: true
      readonly decision: Extract<CodexAppServerDispatchAdmissionDecision, { readonly decision: 'launch' }>
      readonly launchResult: CodexAppServerLaunchResult
    }
  | {
      readonly handled: true
      readonly success: false
      readonly decision: CodexAppServerDispatchAdmissionDecision
      readonly error: string
    }

export interface PersistCodexAppServerDispatchEvidenceInput {
  readonly db: Database.Database
  readonly runEvidence: CodexAppServerDispatchRunEvidence
  readonly activityPayload: CodexAppServerActivityPayload
}

export interface PersistCodexAppServerDispatchEvidenceResult {
  readonly runRecorded: boolean
  readonly attemptEventRecorded: boolean
  readonly activityRecorded: boolean
}

interface AssignmentRow {
  readonly project_id: number
  readonly role: string
  readonly agent_name: string
}

interface AttemptRow {
  readonly id: number
  readonly status: string
  readonly run_id: string | null
}

interface ClaimRow {
  readonly id: number
  readonly claim_state: string
  readonly claim_run_id: string
  readonly release_reason: string | null
  readonly task_stage_attempt_id: number
}

interface LifecycleRow {
  readonly id: number
  readonly workspace_id: number
  readonly task_id: number
  readonly stage_key: string
  readonly owner: RuntimeInventoryLifecycleInput['owner']
  readonly status: 'created' | 'prepared' | 'running' | 'terminal' | 'cleanup_pending' | 'cleaned_up' | 'rolled_back' | 'cleanup_failed'
  readonly root_id: string
  readonly sanitized_relative_path: string
  readonly updated_at: string
}

function tableExists(db: Database.Database, table: string): boolean {
  try {
    const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { ok?: number } | undefined
    return row?.ok === 1
  } catch {
    return false
  }
}

function workspaceFlags(db: Database.Database, workspaceId: number): string | null {
  if (!tableExists(db, 'workspaces')) return null
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as { feature_flags?: string | null } | undefined
  return row?.feature_flags ?? null
}

function latestAssignment(db: Database.Database, task: CodexAppServerDispatchTaskInput): AssignmentRow | null {
  if (task.project_id === null || !tableExists(db, 'project_agent_assignments')) return null
  const row = db.prepare(`
    SELECT project_id, role, agent_name
    FROM project_agent_assignments
    WHERE project_id = ? AND agent_name = ?
    ORDER BY CASE WHEN role = ? THEN 0 ELSE 1 END, role ASC
    LIMIT 1
  `).get(task.project_id, CODEX_APP_SERVER_MANIFEST_ID, task.workflow_template_slug ?? 'implementation') as AssignmentRow | undefined
  return row ?? null
}

function activeClaimRow(
  db: Database.Database,
  input: Pick<TryCodexAppServerDispatchInput, 'activeClaimId' | 'task' | 'activeClaimStageKey'>,
): ClaimRow | null {
  if (input.activeClaimId === null || !tableExists(db, 'task_stage_claims')) return null
  const row = db.prepare(`
    SELECT id, claim_state, claim_run_id, release_reason, task_stage_attempt_id
    FROM task_stage_claims
    WHERE id = ? AND workspace_id = ? AND task_id = ? AND stage_key = ?
    LIMIT 1
  `).get(input.activeClaimId, input.task.workspace_id, input.task.id, input.activeClaimStageKey) as ClaimRow | undefined
  return row ?? null
}

function attemptRow(db: Database.Database, workspaceId: number, attemptId: number | null): AttemptRow | null {
  if (attemptId === null || !tableExists(db, 'task_stage_attempts')) return null
  const row = db.prepare(`
    SELECT id, status, run_id
    FROM task_stage_attempts
    WHERE id = ? AND workspace_id = ?
    LIMIT 1
  `).get(attemptId, workspaceId) as AttemptRow | undefined
  return row ?? null
}

function lifecycleRow(
  db: Database.Database,
  input: Pick<TryCodexAppServerDispatchInput, 'task' | 'activeClaimId' | 'activeClaimStageKey'> & { readonly attemptId: number | null },
): LifecycleRow | null {
  if (!tableExists(db, 'agent_sandbox_lifecycles')) return null
  const row = db.prepare(`
    SELECT id, workspace_id, task_id, stage_key, owner, status, root_id, sanitized_relative_path, updated_at
    FROM agent_sandbox_lifecycles
    WHERE workspace_id = ?
      AND task_id = ?
      AND stage_key = ?
      AND owner = 'paddock'
      AND (? IS NULL OR task_stage_attempt_id = ?)
      AND (? IS NULL OR task_stage_claim_id = ?)
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(
    input.task.workspace_id,
    input.task.id,
    input.activeClaimStageKey,
    input.attemptId,
    input.attemptId,
    input.activeClaimId,
    input.activeClaimId,
  ) as LifecycleRow | undefined
  return row ?? null
}

function githubIssueUrl(task: CodexAppServerDispatchTaskInput): string | null {
  if (!task.github_repo || task.github_issue_number === null || task.github_issue_number === undefined) return null
  if (!Number.isSafeInteger(task.github_issue_number) || task.github_issue_number <= 0) return null
  return `https://github.com/${task.github_repo}/issues/${task.github_issue_number.toString()}`
}

function lifecycleRootFrom(row: LifecycleRow, input: Pick<TryCodexAppServerDispatchInput, 'dataDir' | 'sandboxRoot'>): string {
  return resolveSandboxRoot({
    ...(input.dataDir !== undefined ? { dataDir: input.dataDir } : {}),
    ...(input.sandboxRoot !== undefined ? { sandboxRoot: input.sandboxRoot } : {}),
    sanitizedRelativePath: row.sanitized_relative_path,
  }).absolutePath
}

function numericId(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function boundedJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized.length <= 4096 ? serialized : JSON.stringify({
    truncated: true,
    byte_length: Buffer.byteLength(serialized, 'utf8'),
  })
}

function runStatusForEvidence(status: CodexAppServerDispatchRunEvidence['status']): string {
  if (status === 'launched') return 'running'
  if (status === 'abandoned') return 'cancelled'
  if (status === 'blocked' || status === 'cleanup_failed') return 'failed'
  return status
}

function runOutcomeForEvidence(outcome: CodexAppServerDispatchRunEvidence['outcome']): string | null {
  if (outcome === 'pending') return null
  if (outcome === 'blocked') return 'failed'
  return outcome
}

function attemptStatusForEvidence(
  evidence: CodexAppServerDispatchRunEvidence,
): 'succeeded' | 'failed' | 'cancelled' | null {
  if (evidence.status === 'completed' && evidence.outcome === 'success') return 'succeeded'
  if (evidence.status === 'failed' || evidence.status === 'timeout' || evidence.status === 'cleanup_failed') return 'failed'
  if (evidence.status === 'abandoned') return 'cancelled'
  return null
}

function evidenceActivityExists(
  db: Database.Database,
  payload: CodexAppServerActivityPayload,
  taskId: number,
  workspaceId: number,
): boolean {
  if (!tableExists(db, 'activities')) return false
  const rows = db.prepare(`
    SELECT data
    FROM activities
    WHERE type = ?
      AND entity_type = 'task'
      AND entity_id = ?
      AND workspace_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(payload.activityType, taskId, workspaceId) as { data: string | null }[]
  return rows.some((row) => {
    if (!row.data) return false
    try {
      const parsed = JSON.parse(row.data) as Record<string, unknown>
      return parsed['run_id'] === payload.runId
    } catch {
      return false
    }
  })
}

export function persistCodexAppServerDispatchEvidence(
  input: PersistCodexAppServerDispatchEvidenceInput,
): PersistCodexAppServerDispatchEvidenceResult {
  const evidence = input.runEvidence
  const taskId = numericId(evidence.taskId)
  const workspaceId = numericId(evidence.workspaceId)
  const attemptId = numericId(evidence.attemptId)
  const completedAt = evidence.timestamps.completedAt ?? input.activityPayload.createdAt
  const startedAt = evidence.timestamps.startedAt
  const durationMs = completedAt
    ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
    : null
  let runRecorded = false
  let attemptEventRecorded = false
  let activityRecorded = false

  input.db.transaction(() => {
    if (tableExists(input.db, 'runs') && taskId !== null && workspaceId !== null) {
      input.db.prepare(`
        INSERT INTO runs (
          id, agent_id, agent_name, model, provider, runtime, runtime_version,
          trigger_type, parent_run_id, task_id, status, outcome,
          started_at, ended_at, duration_ms, steps, tools_available,
          cost_input_tokens, cost_output_tokens, cost_cache_read_tokens, cost_cache_write_tokens,
          cost_usd, cost_model,
          run_hash, parent_run_hash, lineage, model_version, config_hash,
          provenance_runtime, signed_by, signature, provenance_created_at,
          eval_task_type, eval_layer, eval_pass, eval_score, eval_detail, eval_metrics, eval_benchmark_id,
          error, git_branch, git_commit, workspace_id, tags, metadata
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          outcome = excluded.outcome,
          ended_at = excluded.ended_at,
          duration_ms = excluded.duration_ms,
          steps = excluded.steps,
          cost_input_tokens = excluded.cost_input_tokens,
          cost_output_tokens = excluded.cost_output_tokens,
          cost_cache_read_tokens = excluded.cost_cache_read_tokens,
          cost_cache_write_tokens = excluded.cost_cache_write_tokens,
          error = excluded.error,
          metadata = excluded.metadata
      `).run(
        evidence.runId,
        CODEX_APP_SERVER_ADAPTER_ID,
        CODEX_APP_SERVER_MANIFEST_ID,
        null,
        'openai',
        'codex-app-server',
        null,
        'queue',
        evidence.claimRunId ?? null,
        evidence.taskId,
        runStatusForEvidence(evidence.status),
        runOutcomeForEvidence(evidence.outcome),
        startedAt,
        evidence.status === 'launched' ? null : completedAt,
        durationMs,
        JSON.stringify([]),
        JSON.stringify(['codex app-server proxy']),
        evidence.usage.inputTokens ?? 0,
        evidence.usage.outputTokens ?? 0,
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify([]),
        null,
        null,
        'codex-app-server',
        null,
        null,
        startedAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        evidence.failure?.runErrorLabel ?? evidence.reasonCode ?? null,
        null,
        null,
        workspaceId,
        JSON.stringify(['SPEC-014C', 'codex-app-server']),
        boundedJson({
          schema_version: evidence.schemaVersion,
          adapter_id: evidence.adapterId,
          run_id: evidence.runId,
          status: evidence.status,
          outcome: evidence.outcome,
          phase: evidence.phase,
          reason_code: evidence.reasonCode ?? null,
          attempt_id: evidence.attemptId ?? null,
          claim_id: evidence.claimId ?? null,
          claim_run_id: evidence.claimRunId ?? null,
          manifest_id: evidence.manifestId ?? null,
          lifecycle_id: evidence.lifecycleId ?? null,
          protocol: evidence.protocol ?? null,
          usage: evidence.usage,
          artifact_refs: evidence.artifactRefs ?? [],
          failure: evidence.failure ?? null,
          safety: evidence.safety,
        }),
      )
      runRecorded = true
    }

    const attemptStatus = attemptStatusForEvidence(evidence)
    if (attemptId !== null && attemptStatus !== null && tableExists(input.db, 'task_stage_attempts')) {
      appendTaskStageAttemptEvent(input.db, {
        attemptId,
        status: attemptStatus,
        observedAt: completedAt,
        actorType: 'adapter',
        actorId: CODEX_APP_SERVER_ADAPTER_ID,
        message: `Codex app-server ${evidence.status}`,
        metadata: {
          schema_version: evidence.schemaVersion,
          run_id: evidence.runId,
          status: evidence.status,
          outcome: evidence.outcome,
          phase: evidence.phase,
          reason_code: evidence.reasonCode ?? null,
          usage: evidence.usage,
          artifact_ref_count: evidence.artifactRefs?.length ?? 0,
          safety: evidence.safety,
        },
      })
      attemptEventRecorded = true
    }

    if (tableExists(input.db, 'activities') && taskId !== null && workspaceId !== null) {
      if (!evidenceActivityExists(input.db, input.activityPayload, taskId, workspaceId)) {
        input.db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, 'task', ?, 'codex-app-server', ?, ?, ?)
        `).run(
          input.activityPayload.activityType,
          taskId,
          `Codex app-server ${input.activityPayload.status}`,
          boundedJson({
            run_id: input.activityPayload.runId,
            attempt_id: input.activityPayload.attemptId ?? null,
            claim_id: input.activityPayload.claimId ?? null,
            claim_run_id: input.activityPayload.claimRunId ?? null,
            manifest_id: input.activityPayload.manifestId ?? null,
            lifecycle_id: input.activityPayload.lifecycleId ?? null,
            artifact_ids: input.activityPayload.artifactIds,
            phase: input.activityPayload.phase,
            reason_code: input.activityPayload.reasonCode ?? null,
            status: input.activityPayload.status,
            outcome: input.activityPayload.outcome,
            safe_diagnostic_category: input.activityPayload.safeDiagnosticCategory ?? null,
            counts: input.activityPayload.counts,
            safe_hash: input.activityPayload.safeHash ?? null,
            safe_size: input.activityPayload.safeSize ?? null,
            created_at: input.activityPayload.createdAt,
          }),
          workspaceId,
        )
      }
      activityRecorded = true
    }
  })()

  return {
    runRecorded,
    attemptEventRecorded,
    activityRecorded,
  }
}

export function isCodexAppServerDispatchCandidate(task: CodexAppServerDispatchTaskInput): boolean {
  return task.agent_name === CODEX_APP_SERVER_MANIFEST_ID || task.assigned_to === CODEX_APP_SERVER_MANIFEST_ID
}

function allowedWritesFor(point: CodexAppServerOwnershipReproofPoint): readonly CodexAppServerOwnershipAllowedWrite[] {
  if (point === 'before_launch') return ['launch']
  if (point === 'before_continuation') return ['turn_start']
  if (point === 'before_terminal_evidence_write') return ['run_terminal_evidence', 'attempt_status']
  if (point === 'before_claim_release') return ['claim_release']
  return ['lifecycle_terminal_marking']
}

function ownershipWinner(current: CodexAppServerOwnershipCurrentState): 'claim_control' | 'stale_recovery' {
  return current.claim.status === 'stale_recovered' || current.claim.releaseReason === 'stale_claim_recovered'
    ? 'stale_recovery'
    : 'claim_control'
}

function isOwnershipCurrent(input: CodexAppServerOwnershipReproofInput): boolean {
  const expected = input.expected
  const current = input.current
  const baseCurrent =
    current.workspaceId === expected.workspaceId &&
    current.taskId === expected.taskId &&
    current.stageKey === expected.stageKey &&
    current.repository === expected.repository &&
    current.assignmentId === expected.assignmentId &&
    current.manifestId === expected.manifestId &&
    current.governanceAllowed &&
    current.featureFlags.taskControlPlaneEnabled &&
    current.featureFlags.runnerSandboxesEnabled &&
    current.runtimeInventory.manifestValid &&
    current.runtimeInventory.manifestId === expected.manifestId &&
    current.claim.claimId === expected.claimId &&
    current.claim.claimRunId === expected.claimRunId &&
    current.claim.status === 'active' &&
    current.claim.releaseReason === null &&
    current.attempt.attemptId === expected.attemptId &&
    current.attempt.runId === expected.runId &&
    current.attempt.current &&
    ['prepared', 'running'].includes(current.attempt.status) &&
    current.lifecycle.lifecycleId === expected.lifecycleId &&
    current.lifecycle.owner === 'paddock' &&
    ['prepared', 'running'].includes(current.lifecycle.status)

  if (!baseCurrent) return false
  if (input.point !== 'before_continuation') return true
  if (!input.continuation) return false
  return (
    current.liveThread.subprocessActive &&
    current.liveThread.threadId === expected.threadId &&
    current.liveThread.threadSessionId === expected.threadSessionId &&
    input.continuation.requestedThreadId === expected.threadId &&
    input.continuation.requestedThreadSessionId === expected.threadSessionId
  )
}

export function evaluateCodexAppServerOwnershipReproof(input: CodexAppServerOwnershipReproofInput) {
  if (isOwnershipCurrent(input)) {
    return {
      decision: 'current' as const,
      point: input.point,
      allowedWrites: allowedWritesFor(input.point),
      forbiddenLateMutations,
      terminateSubprocess: false as const,
      terminalOutcome: input.terminalOutcome,
      lifecycleTerminalStatus: input.point === 'before_lifecycle_terminal_marking' ? 'terminal' as const : null,
    }
  }

  return {
    decision: 'abandoned' as const,
    point: input.point,
    ownershipWinner: ownershipWinner(input.current),
    allowedWrites: ['abandoned_run_evidence', 'activity'] as const,
    forbiddenLateMutations,
    terminateSubprocess: true as const,
    abandonedEvidence: {
      schemaVersion: CODEX_APP_SERVER_SCHEMA_VERSION,
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      status: 'abandoned' as const,
      outcome: 'abandoned' as const,
      phase: 'terminal' as const,
      reasonCode: 'abandoned_by_claim_control' as const,
      attemptStatus: 'not_written' as const,
      claimRelease: 'existing_authority_wins' as const,
      safety: descriptorOnlySafety,
    },
  }
}

export function buildCodexAppServerDispatchAdmissionInputFromDatabase(
  input: Omit<TryCodexAppServerDispatchInput, 'releaseClaim' | 'protocolSequence' | 'nowIso' | 'spawn'>,
): CodexAppServerDispatchAdmissionInput {
  const flags = workspaceFlags(input.db, input.task.workspace_id)
  const assignment = latestAssignment(input.db, input.task)
  const claim = activeClaimRow(input.db, input)
  const attempt = attemptRow(input.db, input.task.workspace_id, claim?.task_stage_attempt_id ?? input.claimAdmission.task_stage_attempt_id)
  const lifecycle = lifecycleRow(input.db, {
    task: input.task,
    activeClaimId: input.activeClaimId,
    activeClaimStageKey: input.activeClaimStageKey,
    attemptId: attempt?.id ?? null,
  })
  const inventoryTask: RuntimeInventoryTaskInput = {
    id: input.task.id,
    workspace_id: input.task.workspace_id,
    project_id: input.task.project_id,
    status: 'assigned',
    stage_key: input.activeClaimStageKey,
  }
  const inventoryAssignments: RuntimeInventoryAssignmentInput[] = assignment
    ? [{ project_id: assignment.project_id, role: assignment.role, agent_name: assignment.agent_name }]
    : []
  const inventoryLifecycles: RuntimeInventoryLifecycleInput[] = lifecycle
    ? [{
        id: lifecycle.id,
        workspace_id: lifecycle.workspace_id,
        task_id: lifecycle.task_id,
        stage_key: lifecycle.stage_key,
        owner: lifecycle.owner,
        status: lifecycle.status,
        updated_at: lifecycle.updated_at,
      }]
    : []
  const inventory = buildCodexAppServerRuntimeInventory({
    generatedAt: new Date(input.now * 1000).toISOString(),
    scope: {
      kind: 'productLine',
      workspace_id: String(input.task.workspace_id),
      workspace_ids: [String(input.task.workspace_id)],
    },
    featureFlagEnabled: resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', { workspaceFlags: flags }),
    filters: {
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      requestedCapability: 'launch',
      taskId: input.task.id,
      ...(input.task.project_id !== null ? { projectId: input.task.project_id } : {}),
      ...(assignment ? { role: assignment.role } : {}),
    },
    assignments: inventoryAssignments,
    task: inventoryTask,
    lifecycles: inventoryLifecycles,
    governanceAllowed: true,
  })
  const inventoryEntry = inventory.entries[0]

  return {
    now: new Date(input.now * 1000).toISOString(),
    expectedScope: {
      workspaceId: String(input.task.workspace_id),
      repository: input.task.github_repo ?? '',
    },
    featureFlags: {
      taskControlPlaneEnabled: resolveFlag('FEATURE_TASK_CONTROL_PLANE', { workspaceFlags: flags }),
      runnerSandboxesEnabled: inventory.feature_flag.enabled,
    },
    task: {
      taskId: String(input.task.id),
      workspaceId: String(input.task.workspace_id),
      stageKey: input.activeClaimStageKey,
      repository: input.task.github_repo ?? null,
      githubIssueTitle: input.task.title,
      githubIssueBody: input.task.description,
      githubIssueUrl: githubIssueUrl(input.task),
    },
    assignment: assignment
      ? {
          assignmentId: `${assignment.project_id.toString()}:${assignment.role}:${assignment.agent_name}`,
          workspaceId: String(input.task.workspace_id),
          projectId: String(assignment.project_id),
          workflowTemplateId: input.task.workflow_template_slug ?? String(input.task.workflow_template_id ?? input.activeClaimStageKey),
          role: assignment.role,
          manifestId: assignment.agent_name,
        }
      : null,
    governance: {
      allowed: true,
      reasonCodes: [],
    },
    runtimeInventory: {
      manifestId: inventoryEntry?.selected_manifest.manifest_id ?? CODEX_APP_SERVER_MANIFEST_ID,
      manifestValid: inventoryEntry?.selected_manifest.validation.ok ?? false,
      capabilityPacket: CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET,
    },
    lifecycleClaim: claim && attempt && lifecycle
      ? {
          workspaceId: String(input.task.workspace_id),
          taskId: String(input.task.id),
          stageKey: input.activeClaimStageKey,
          repository: input.task.github_repo ?? '',
          assignmentId: `${assignment?.project_id.toString() ?? 'unassigned'}:${assignment?.role ?? 'unassigned'}:${assignment?.agent_name ?? 'unassigned'}`,
          workflowTemplateId: input.task.workflow_template_slug ?? String(input.task.workflow_template_id ?? input.activeClaimStageKey),
          lifecycle: {
            lifecycleId: String(lifecycle.id),
            lifecycleRoot: lifecycleRootFrom(lifecycle, input),
            owner: lifecycle.owner,
            status: lifecycle.status === 'cleaned_up' || lifecycle.status === 'rolled_back'
              ? 'terminal'
              : lifecycle.status,
            createdAt: lifecycle.updated_at,
          },
          claim: {
            claimId: String(claim.id),
            claimRunId: claim.claim_run_id,
            status: claim.claim_state,
            releaseReason: claim.release_reason,
          },
          attempt: {
            attemptId: String(attempt.id),
            status: attempt.status,
            runId: attempt.run_id ?? input.claimRunId,
          },
        }
      : null,
  }
}

function firstBlockedReason(
  input: CodexAppServerDispatchAdmissionInput,
): CodexAppServerBlockedAdmissionReasonCode | null {
  if (!input.featureFlags.taskControlPlaneEnabled || !input.featureFlags.runnerSandboxesEnabled) {
    return 'feature_disabled'
  }
  if (input.task.workspaceId !== input.expectedScope.workspaceId) return 'workspace_mismatch'
  if (input.task.repository !== null && input.task.repository !== input.expectedScope.repository) {
    return 'repository_mismatch'
  }
  if (!input.assignment) return 'adapter_unassigned'
  if (input.assignment.manifestId !== CODEX_APP_SERVER_MANIFEST_ID) return 'manifest_mismatch'
  if (!input.runtimeInventory.manifestValid) return 'manifest_invalid'
  if (input.runtimeInventory.manifestId !== CODEX_APP_SERVER_MANIFEST_ID) return 'manifest_mismatch'
  if (!input.task.repository || !input.task.githubIssueTitle || !input.task.githubIssueBody || !input.task.githubIssueUrl) {
    return 'not_github_linked'
  }
  if (!input.governance.allowed) return input.governance.reasonCodes[0] ?? 'governance_denied'
  if (!input.lifecycleClaim) return 'sandbox_lifecycle_missing'
  if (input.lifecycleClaim.lifecycle.owner !== 'paddock') return 'sandbox_lifecycle_not_paddock_owned'
  if (!['created', 'prepared', 'running'].includes(input.lifecycleClaim.lifecycle.status)) {
    return 'sandbox_lifecycle_not_ready'
  }
  if (input.lifecycleClaim.claim.status !== 'active') return 'stale_claim'
  if (!input.lifecycleClaim.attempt.attemptId) return 'missing_attempt'
  if (input.lifecycleClaim.workspaceId !== input.expectedScope.workspaceId) return 'workspace_mismatch'
  if (input.lifecycleClaim.repository !== input.expectedScope.repository) return 'repository_mismatch'
  return null
}

function runEvidence(
  input: CodexAppServerDispatchAdmissionInput,
  status: CodexAppServerRunStatus,
  outcome: CodexAppServerRunOutcome,
  reasonCode?: CodexAppServerBlockedAdmissionReasonCode,
): CodexAppServerDispatchRunEvidence {
  const lifecycleClaim = input.lifecycleClaim
  const evidence = {
    schemaVersion: CODEX_APP_SERVER_SCHEMA_VERSION,
    adapterId: CODEX_APP_SERVER_ADAPTER_ID,
    runId: lifecycleClaim?.attempt.runId ?? `run:${input.task.taskId}:${input.task.stageKey}`,
    workspaceId: input.task.workspaceId,
    taskId: input.task.taskId,
    stageKey: input.task.stageKey,
    ...(lifecycleClaim ? { attemptId: lifecycleClaim.attempt.attemptId } : {}),
    ...(lifecycleClaim ? { claimId: lifecycleClaim.claim.claimId } : {}),
    ...(lifecycleClaim ? { claimRunId: lifecycleClaim.claim.claimRunId } : {}),
    manifestId: input.assignment?.manifestId ?? input.runtimeInventory.manifestId,
    ...(lifecycleClaim ? { lifecycleId: lifecycleClaim.lifecycle.lifecycleId } : {}),
    status,
    outcome,
    phase: 'eligibility',
    ...(reasonCode ? { reasonCode } : {}),
    usage: {
      availability: 'unavailable',
      source: 'none',
    },
    artifactRefs: [],
    safety: descriptorOnlySafety,
    timestamps: {
      startedAt: input.now,
    },
  } as const
  return evidence
}

export function evaluateCodexAppServerDispatchAdmission(
  input: CodexAppServerDispatchAdmissionInput,
): CodexAppServerDispatchAdmissionDecision {
  const reasonCode = firstBlockedReason(input)
  if (reasonCode) {
    const evidence = runEvidence(input, 'blocked', 'blocked', reasonCode)
    return {
      decision: 'blocked',
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      manifestId: input.assignment?.manifestId ?? input.runtimeInventory.manifestId,
      reasonCodes: [reasonCode],
      launchInput: null,
      runEvidence: evidence,
      activityPayload: buildCodexAppServerActivityPayload(evidence, {
        activityType: 'codex_app_server_admission_blocked',
        createdAt: input.now,
      }),
    }
  }

  const lifecycleClaim = input.lifecycleClaim
  if (!input.assignment || !lifecycleClaim || !input.task.repository || !input.task.githubIssueTitle || !input.task.githubIssueBody || !input.task.githubIssueUrl) {
    throw new Error('codex_app_server_admission_invariant_failed')
  }

  const evidence = runEvidence(input, 'launched', 'pending')
  return {
    decision: 'launch',
    adapterId: CODEX_APP_SERVER_ADAPTER_ID,
    manifestId: CODEX_APP_SERVER_MANIFEST_ID,
    reasonCodes: [],
    launchInput: {
      workspaceId: input.task.workspaceId,
      taskId: input.task.taskId,
      stageKey: input.task.stageKey,
      repository: input.task.repository,
      githubIssueTitle: input.task.githubIssueTitle,
      githubIssueBody: input.task.githubIssueBody,
      githubIssueUrl: input.task.githubIssueUrl,
      workflowTemplateId: input.assignment.workflowTemplateId,
      stageInstructions: 'Implement the claimed stage and emit descriptor-only evidence.',
      assignmentRole: input.assignment.role,
      claimId: lifecycleClaim.claim.claimId,
      claimRunId: lifecycleClaim.claim.claimRunId,
      attemptId: lifecycleClaim.attempt.attemptId,
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      capabilityPacket: input.runtimeInventory.capabilityPacket,
      lifecycleId: lifecycleClaim.lifecycle.lifecycleId,
      lifecycleRoot: lifecycleClaim.lifecycle.lifecycleRoot,
      timeoutMs: 120000,
    },
    runEvidence: evidence,
    activityPayload: buildCodexAppServerActivityPayload(evidence, {
      activityType: 'codex_app_server_admission_launched',
      createdAt: input.now,
    }),
  }
}

export async function tryDispatchCodexAppServerTask(
  input: TryCodexAppServerDispatchInput,
): Promise<TryCodexAppServerDispatchResult> {
  if (!isCodexAppServerDispatchCandidate(input.task)) return { handled: false }

  const admissionInput = buildCodexAppServerDispatchAdmissionInputFromDatabase(input)
  const decision = evaluateCodexAppServerDispatchAdmission(admissionInput)
  if (decision.decision === 'blocked') {
    persistCodexAppServerDispatchEvidence({
      db: input.db,
      runEvidence: decision.runEvidence,
      activityPayload: decision.activityPayload,
    })
    return {
      handled: true,
      success: false,
      decision,
      error: decision.reasonCodes[0] ?? 'codex_app_server_admission_blocked',
    }
  }

  try {
    const launchResult = await launchCodexAppServerAttempt(decision.launchInput, {
      spawn: input.spawn ?? ((command, args, options) => {
        const spawnOptions: SpawnOptions = {
          cwd: options.cwd,
          shell: options.shell,
          stdio: options.stdio === 'pipe' ? 'pipe' : [...options.stdio],
        }
        return spawnSubprocess(command, [...args], spawnOptions)
      }),
      protocolSequence: input.protocolSequence ?? [],
      now: input.nowIso ?? (() => new Date().toISOString()),
    })
    persistCodexAppServerDispatchEvidence({
      db: input.db,
      runEvidence: launchResult.runEvidence,
      activityPayload: launchResult.activityPayload,
    })
    input.releaseClaim('launch_handoff_completed')
    return {
      handled: true,
      success: true,
      decision,
      launchResult,
    }
  } catch (error) {
    input.releaseClaim('dispatch_failed')
    return {
      handled: true,
      success: false,
      decision,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
