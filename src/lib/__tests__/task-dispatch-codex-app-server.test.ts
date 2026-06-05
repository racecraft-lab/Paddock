import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  CODEX_APP_SERVER_ADAPTER_ID,
  CODEX_APP_SERVER_FIXTURE_IDS,
  CODEX_APP_SERVER_MANIFEST_ID,
  CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
  buildCodexAppServerLaunchInput,
  buildCodexAppServerLifecycleClaimFixture,
  buildCodexAppServerRunEvidence,
  type CodexAppServerAttemptFailureReasonCode,
  type CodexAppServerAttemptStatus,
  type CodexAppServerBlockedAdmissionReasonCode,
  type CodexAppServerClaimRelease,
  type CodexAppServerLaunchInputFixture,
  type CodexAppServerRunPhase,
  type CodexAppServerRunStatus,
} from '../harness-adapters/__tests__/codex-app-server-fixtures'

type BaseLifecycleClaimFixture = ReturnType<typeof buildCodexAppServerLifecycleClaimFixture>

type CodexAppServerDispatchLifecycleClaimFixture = Omit<BaseLifecycleClaimFixture, 'lifecycle'> & {
  readonly lifecycle: Omit<BaseLifecycleClaimFixture['lifecycle'], 'owner' | 'status'> & {
    readonly owner: 'paddock' | 'external_harness' | 'openclaw'
    readonly status: 'created' | 'prepared' | 'running' | 'terminal' | 'cleanup_pending' | 'cleanup_failed'
  }
}

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
    readonly role: 'implementation'
    readonly manifestId: string
  }
  readonly governance: {
    readonly allowed: boolean
    readonly reasonCodes: readonly CodexAppServerBlockedAdmissionReasonCode[]
  }
  readonly runtimeInventory: {
    readonly manifestId: string
    readonly manifestValid: boolean
    readonly capabilityPacket: CodexAppServerLaunchInputFixture['capabilityPacket']
  }
  readonly lifecycleClaim: CodexAppServerDispatchLifecycleClaimFixture | null
}

interface CodexAppServerDispatchRunEvidence {
  readonly schemaVersion: typeof CODEX_APP_SERVER_RUN_SCHEMA_VERSION
  readonly adapterId: typeof CODEX_APP_SERVER_ADAPTER_ID
  readonly runId: string
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly attemptId?: string
  readonly claimId?: string
  readonly claimRunId?: string
  readonly manifestId?: string
  readonly lifecycleId?: string
  readonly status: CodexAppServerRunStatus
  readonly outcome: 'pending' | 'blocked'
  readonly phase: CodexAppServerRunPhase
  readonly reasonCode?: CodexAppServerBlockedAdmissionReasonCode
  readonly safety: {
    readonly rawTranscriptRetained: false
    readonly rawProtocolRetained: false
    readonly providerPayloadRetained: false
    readonly toolPayloadRetained: false
    readonly promptBodyRetained: false
    readonly hostPathRetained: false
    readonly secretRetained: false
    readonly redactionApplied: false
  }
}

type CodexAppServerDispatchAdmissionDecision =
  | {
      readonly decision: 'launch'
      readonly adapterId: typeof CODEX_APP_SERVER_ADAPTER_ID
      readonly manifestId: typeof CODEX_APP_SERVER_MANIFEST_ID
      readonly reasonCodes: readonly []
      readonly launchInput: CodexAppServerLaunchInputFixture
      readonly runEvidence: CodexAppServerDispatchRunEvidence
    }
  | {
      readonly decision: 'blocked'
      readonly adapterId: typeof CODEX_APP_SERVER_ADAPTER_ID
      readonly manifestId?: string
      readonly reasonCodes: readonly CodexAppServerBlockedAdmissionReasonCode[]
      readonly launchInput: null
      readonly runEvidence: CodexAppServerDispatchRunEvidence
    }

interface CodexAppServerDispatchAdmissionModule {
  readonly evaluateCodexAppServerDispatchAdmission?: (
    input: CodexAppServerDispatchAdmissionInput,
  ) => CodexAppServerDispatchAdmissionDecision
  readonly evaluateCodexAppServerOwnershipReproof?: (
    input: CodexAppServerOwnershipReproofInput,
  ) => CodexAppServerOwnershipReproofDecision
  readonly persistCodexAppServerDispatchEvidence?: (
    input: CodexAppServerPersistDispatchEvidenceInput,
  ) => CodexAppServerPersistDispatchEvidenceResult
  readonly isCodexAppServerDispatchCandidate?: (
    task: { readonly assigned_to?: string | null; readonly agent_name?: string | null },
  ) => boolean
  readonly __loadError?: unknown
}

interface BlockedAdmissionCase {
  readonly label: string
  readonly reasonCode: CodexAppServerBlockedAdmissionReasonCode
  readonly overrides: AdmissionInputOverrides
}

type AdmissionInputOverrides = Partial<
  Omit<CodexAppServerDispatchAdmissionInput, 'task' | 'assignment' | 'governance' | 'runtimeInventory' | 'lifecycleClaim'>
> & {
  readonly task?: Partial<CodexAppServerDispatchAdmissionInput['task']>
  readonly assignment?: CodexAppServerDispatchAdmissionInput['assignment']
  readonly governance?: Partial<CodexAppServerDispatchAdmissionInput['governance']>
  readonly runtimeInventory?: Partial<CodexAppServerDispatchAdmissionInput['runtimeInventory']>
  readonly lifecycleClaim?: Partial<Omit<CodexAppServerDispatchLifecycleClaimFixture, 'lifecycle'>> & {
    readonly lifecycle?: Partial<CodexAppServerDispatchLifecycleClaimFixture['lifecycle']>
  } | null
}

type CodexAppServerRunOutcome = 'pending' | 'success' | 'failed' | 'blocked' | 'abandoned'
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
  readonly manifestId: typeof CODEX_APP_SERVER_MANIFEST_ID
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
    readonly capabilityPacket: CodexAppServerLaunchInputFixture['capabilityPacket']
  }
  readonly claim: {
    readonly claimId: string
    readonly claimRunId: string
    readonly status: 'active' | 'released' | 'stale_recovered'
    readonly releaseReason: string | null
  }
  readonly attempt: {
    readonly attemptId: string
    readonly runId: string
    readonly status: 'running' | 'succeeded' | 'failed' | 'released' | 'cancelled'
    readonly current: boolean
  }
  readonly lifecycle: {
    readonly lifecycleId: string
    readonly owner: 'paddock' | 'external_harness' | 'openclaw'
    readonly status: 'prepared' | 'running' | 'terminal' | 'cleanup_pending' | 'cleanup_failed'
  }
  readonly liveThread: {
    readonly threadId: string
    readonly threadSessionId: string
    readonly subprocessActive: boolean
  }
}

interface CodexAppServerOwnershipTerminalOutcome {
  readonly runStatus: Exclude<CodexAppServerRunStatus, 'blocked' | 'launched' | 'abandoned' | 'cleanup_failed'>
  readonly outcome: Extract<CodexAppServerRunOutcome, 'success' | 'failed'>
  readonly phase: Extract<CodexAppServerRunPhase, 'terminal' | 'running' | 'artifact_safety'>
  readonly reasonCode: CodexAppServerAttemptFailureReasonCode | null
  readonly attemptStatus: Exclude<CodexAppServerAttemptStatus, null | 'not_written' | 'preserve_terminal'>
  readonly claimRelease: Exclude<CodexAppServerClaimRelease, null | 'existing_authority_wins' | 'preserve_terminal'>
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

type CodexAppServerOwnershipReproofDecision =
  | {
      readonly decision: 'current'
      readonly point: CodexAppServerOwnershipReproofPoint
      readonly allowedWrites: readonly CodexAppServerOwnershipAllowedWrite[]
      readonly forbiddenLateMutations: readonly CodexAppServerForbiddenLateMutation[]
      readonly terminateSubprocess: false
      readonly terminalOutcome: CodexAppServerOwnershipTerminalOutcome | null
      readonly lifecycleTerminalStatus: 'terminal' | null
    }
  | {
      readonly decision: 'abandoned'
      readonly point: CodexAppServerOwnershipReproofPoint
      readonly ownershipWinner: 'claim_control' | 'stale_recovery'
      readonly allowedWrites: readonly Extract<CodexAppServerOwnershipAllowedWrite, 'abandoned_run_evidence' | 'activity'>[]
      readonly forbiddenLateMutations: readonly CodexAppServerForbiddenLateMutation[]
      readonly terminateSubprocess: true
      readonly abandonedEvidence: {
        readonly schemaVersion: typeof CODEX_APP_SERVER_RUN_SCHEMA_VERSION
        readonly adapterId: typeof CODEX_APP_SERVER_ADAPTER_ID
        readonly status: Extract<CodexAppServerRunStatus, 'abandoned'>
        readonly outcome: Extract<CodexAppServerRunOutcome, 'abandoned'>
        readonly phase: Extract<CodexAppServerRunPhase, 'terminal'>
        readonly reasonCode: Extract<CodexAppServerAttemptFailureReasonCode, 'abandoned_by_claim_control'>
        readonly attemptStatus: Extract<CodexAppServerAttemptStatus, 'not_written'>
        readonly claimRelease: Extract<CodexAppServerClaimRelease, 'existing_authority_wins'>
        readonly safety: typeof descriptorOnlySafety
      }
    }

interface CodexAppServerPersistDispatchEvidenceInput {
  readonly db: Database.Database
  readonly runEvidence: ReturnType<typeof buildCodexAppServerRunEvidence>
  readonly activityPayload: {
    readonly activityType: string
    readonly entityType: 'task'
    readonly entityId: string
    readonly workspaceId: string
    readonly runId: string
    readonly attemptId?: string
    readonly claimId?: string
    readonly claimRunId?: string
    readonly manifestId?: string
    readonly lifecycleId?: string
    readonly artifactIds: readonly string[]
    readonly phase: string
    readonly reasonCode?: string
    readonly status: string
    readonly outcome: string
    readonly safeDiagnosticCategory?: string
    readonly counts: Record<string, number>
    readonly safeHash?: string
    readonly safeSize?: number
    readonly createdAt: string
  }
}

interface CodexAppServerPersistDispatchEvidenceResult {
  readonly runRecorded: boolean
  readonly attemptEventRecorded: boolean
  readonly activityRecorded: boolean
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

const DISPATCH_ADMISSION_MODULE_PATH = '../task-dispatch-codex-app-server.ts'
const dispatchAdmissionModuleLoaders =
  import.meta.glob<CodexAppServerDispatchAdmissionModule>('../task-dispatch-codex-app-server.ts')

async function loadAdmissionModule(): Promise<CodexAppServerDispatchAdmissionModule> {
  const loadModule = dispatchAdmissionModuleLoaders[DISPATCH_ADMISSION_MODULE_PATH]
  if (!loadModule) {
    return {
      __loadError: new Error('src/lib/task-dispatch-codex-app-server.ts is not implemented yet'),
    }
  }

  try {
    return await loadModule()
  } catch (error) {
    return { __loadError: error }
  }
}

async function evaluateAdmission(
  input: CodexAppServerDispatchAdmissionInput,
): Promise<CodexAppServerDispatchAdmissionDecision> {
  const admissionModule = await loadAdmissionModule()

  expect(admissionModule.__loadError).toBeUndefined()
  const evaluate = admissionModule.evaluateCodexAppServerDispatchAdmission
  expect(evaluate).toEqual(expect.any(Function))
  if (!evaluate) throw new Error('evaluateCodexAppServerDispatchAdmission missing')

  return evaluate(input)
}

async function evaluateOwnershipReproof(
  input: CodexAppServerOwnershipReproofInput,
): Promise<CodexAppServerOwnershipReproofDecision> {
  const admissionModule = await loadAdmissionModule()

  expect(admissionModule.__loadError).toBeUndefined()
  const evaluate = admissionModule.evaluateCodexAppServerOwnershipReproof
  expect(evaluate).toEqual(expect.any(Function))
  if (!evaluate) throw new Error('evaluateCodexAppServerOwnershipReproof missing')

  return evaluate(input)
}

async function persistDispatchEvidence(
  input: CodexAppServerPersistDispatchEvidenceInput,
): Promise<CodexAppServerPersistDispatchEvidenceResult> {
  const admissionModule = await loadAdmissionModule()

  expect(admissionModule.__loadError).toBeUndefined()
  const persist = admissionModule.persistCodexAppServerDispatchEvidence
  expect(persist).toEqual(expect.any(Function))
  if (!persist) throw new Error('persistCodexAppServerDispatchEvidence missing')

  return persist(input)
}

function buildLifecycleClaim(
  overrides: AdmissionInputOverrides['lifecycleClaim'] = {},
): CodexAppServerDispatchLifecycleClaimFixture | null {
  if (overrides === null) return null

  const base = buildCodexAppServerLifecycleClaimFixture()

  return {
    ...base,
    ...overrides,
    lifecycle: {
      ...base.lifecycle,
      ...overrides.lifecycle,
    },
  }
}

function buildAdmissionInput(overrides: AdmissionInputOverrides = {}): CodexAppServerDispatchAdmissionInput {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  const launchInput = buildCodexAppServerLaunchInput()

  return {
    now: overrides.now ?? '2026-06-05T12:00:00.000Z',
    expectedScope: {
      workspaceId: ids.workspaceId,
      repository: ids.repository,
      ...overrides.expectedScope,
    },
    featureFlags: {
      taskControlPlaneEnabled: true,
      runnerSandboxesEnabled: true,
      ...overrides.featureFlags,
    },
    task: {
      taskId: ids.taskId,
      workspaceId: ids.workspaceId,
      stageKey: ids.stageKey,
      repository: ids.repository,
      githubIssueTitle: ids.githubIssueTitle,
      githubIssueBody: ids.githubIssueBody,
      githubIssueUrl: ids.githubIssueUrl,
      ...overrides.task,
    },
    assignment: overrides.assignment === undefined
      ? {
          assignmentId: ids.assignmentId,
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          workflowTemplateId: ids.workflowTemplateId,
          role: 'implementation',
          manifestId: CODEX_APP_SERVER_MANIFEST_ID,
        }
      : overrides.assignment,
    governance: {
      allowed: true,
      reasonCodes: [],
      ...overrides.governance,
    },
    runtimeInventory: {
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      manifestValid: true,
      capabilityPacket: launchInput.capabilityPacket,
      ...overrides.runtimeInventory,
    },
    lifecycleClaim: buildLifecycleClaim(overrides.lifecycleClaim),
  }
}

type OwnershipCurrentOverrides = Partial<
  Omit<
    CodexAppServerOwnershipCurrentState,
    'featureFlags' | 'runtimeInventory' | 'claim' | 'attempt' | 'lifecycle' | 'liveThread'
  >
> & {
  readonly featureFlags?: Partial<CodexAppServerOwnershipCurrentState['featureFlags']>
  readonly runtimeInventory?: Partial<CodexAppServerOwnershipCurrentState['runtimeInventory']>
  readonly claim?: Partial<CodexAppServerOwnershipCurrentState['claim']>
  readonly attempt?: Partial<CodexAppServerOwnershipCurrentState['attempt']>
  readonly lifecycle?: Partial<CodexAppServerOwnershipCurrentState['lifecycle']>
  readonly liveThread?: Partial<CodexAppServerOwnershipCurrentState['liveThread']>
}

interface OwnershipReproofInputOverrides {
  readonly point?: CodexAppServerOwnershipReproofPoint
  readonly expected?: Partial<CodexAppServerOwnershipExpectedState>
  readonly current?: OwnershipCurrentOverrides
  readonly terminalOutcome?: CodexAppServerOwnershipTerminalOutcome | null
  readonly continuation?: CodexAppServerOwnershipContinuation | null
}

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

const successTerminalOutcome = {
  runStatus: 'completed',
  outcome: 'success',
  phase: 'terminal',
  reasonCode: null,
  attemptStatus: 'succeeded',
  claimRelease: 'launch_handoff_completed',
} as const satisfies CodexAppServerOwnershipTerminalOutcome

const failedTerminalOutcome = {
  runStatus: 'failed',
  outcome: 'failed',
  phase: 'running',
  reasonCode: 'malformed_protocol',
  attemptStatus: 'failed',
  claimRelease: 'dispatch_failed',
} as const satisfies CodexAppServerOwnershipTerminalOutcome

function buildOwnershipReproofInput(
  overrides: OwnershipReproofInputOverrides = {},
): CodexAppServerOwnershipReproofInput {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  const launchInput = buildCodexAppServerLaunchInput()
  const expected: CodexAppServerOwnershipExpectedState = {
    workspaceId: ids.workspaceId,
    taskId: ids.taskId,
    stageKey: ids.stageKey,
    repository: ids.repository,
    assignmentId: ids.assignmentId,
    manifestId: CODEX_APP_SERVER_MANIFEST_ID,
    claimId: ids.claimId,
    claimRunId: ids.claimRunId,
    attemptId: ids.attemptId,
    runId: ids.runId,
    lifecycleId: ids.lifecycleId,
    threadId: ids.threadId,
    threadSessionId: ids.threadSessionId,
    ...overrides.expected,
  }
  const currentBase: CodexAppServerOwnershipCurrentState = {
    workspaceId: ids.workspaceId,
    taskId: ids.taskId,
    stageKey: ids.stageKey,
    repository: ids.repository,
    assignmentId: ids.assignmentId,
    manifestId: CODEX_APP_SERVER_MANIFEST_ID,
    governanceAllowed: true,
    featureFlags: {
      taskControlPlaneEnabled: true,
      runnerSandboxesEnabled: true,
    },
    runtimeInventory: {
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      manifestValid: true,
      capabilityPacket: launchInput.capabilityPacket,
    },
    claim: {
      claimId: ids.claimId,
      claimRunId: ids.claimRunId,
      status: 'active',
      releaseReason: null,
    },
    attempt: {
      attemptId: ids.attemptId,
      runId: ids.runId,
      status: 'running',
      current: true,
    },
    lifecycle: {
      lifecycleId: ids.lifecycleId,
      owner: 'paddock',
      status: 'running',
    },
    liveThread: {
      threadId: ids.threadId,
      threadSessionId: ids.threadSessionId,
      subprocessActive: true,
    },
  }
  const currentOverrides = overrides.current ?? {}
  const current: CodexAppServerOwnershipCurrentState = {
    ...currentBase,
    ...currentOverrides,
    featureFlags: {
      ...currentBase.featureFlags,
      ...currentOverrides.featureFlags,
    },
    runtimeInventory: {
      ...currentBase.runtimeInventory,
      ...currentOverrides.runtimeInventory,
    },
    claim: {
      ...currentBase.claim,
      ...currentOverrides.claim,
    },
    attempt: {
      ...currentBase.attempt,
      ...currentOverrides.attempt,
    },
    lifecycle: {
      ...currentBase.lifecycle,
      ...currentOverrides.lifecycle,
    },
    liveThread: {
      ...currentBase.liveThread,
      ...currentOverrides.liveThread,
    },
  }

  return {
    point: overrides.point ?? 'before_launch',
    expected,
    current,
    terminalOutcome: overrides.terminalOutcome ?? null,
    continuation: overrides.continuation ?? null,
  }
}

const blockedAdmissionCases: readonly BlockedAdmissionCase[] = [
  {
    label: 'flag-off admission',
    reasonCode: 'feature_disabled',
    overrides: {
      featureFlags: {
        taskControlPlaneEnabled: true,
        runnerSandboxesEnabled: false,
      },
    },
  },
  {
    label: 'unassigned stage',
    reasonCode: 'adapter_unassigned',
    overrides: {
      assignment: null,
    },
  },
  {
    label: 'non-GitHub-linked task',
    reasonCode: 'not_github_linked',
    overrides: {
      task: {
        repository: null,
        githubIssueTitle: null,
        githubIssueBody: null,
        githubIssueUrl: null,
      },
    },
  },
  {
    label: 'governance-denied stage',
    reasonCode: 'governance_denied',
    overrides: {
      governance: {
        allowed: false,
        reasonCodes: ['governance_denied'],
      },
    },
  },
  {
    label: 'manifest mismatch',
    reasonCode: 'manifest_mismatch',
    overrides: {
      assignment: {
        assignmentId: CODEX_APP_SERVER_FIXTURE_IDS.assignmentId,
        workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
        projectId: CODEX_APP_SERVER_FIXTURE_IDS.projectId,
        workflowTemplateId: CODEX_APP_SERVER_FIXTURE_IDS.workflowTemplateId,
        role: 'implementation',
        manifestId: 'paddock_owned_sandbox_fake',
      },
    },
  },
  {
    label: 'lifecycle preparation failure',
    reasonCode: 'sandbox_lifecycle_not_ready',
    overrides: {
      lifecycleClaim: {
        lifecycle: {
          status: 'cleanup_failed',
        },
      },
    },
  },
  {
    label: 'workspace mismatch',
    reasonCode: 'workspace_mismatch',
    overrides: {
      expectedScope: {
        workspaceId: 'ws_spec_014c_other',
        repository: CODEX_APP_SERVER_FIXTURE_IDS.repository,
      },
    },
  },
  {
    label: 'repository mismatch',
    reasonCode: 'repository_mismatch',
    overrides: {
      expectedScope: {
        workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
        repository: 'racecraft-lab/other-repo',
      },
    },
  },
]

function createPersistenceDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      model TEXT,
      provider TEXT,
      runtime TEXT DEFAULT 'paddock',
      runtime_version TEXT,
      trigger_type TEXT,
      parent_run_id TEXT,
      task_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      outcome TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      steps TEXT DEFAULT '[]',
      tools_available TEXT DEFAULT '[]',
      cost_input_tokens INTEGER DEFAULT 0,
      cost_output_tokens INTEGER DEFAULT 0,
      cost_cache_read_tokens INTEGER,
      cost_cache_write_tokens INTEGER,
      cost_usd REAL,
      cost_model TEXT,
      run_hash TEXT,
      parent_run_hash TEXT,
      lineage TEXT DEFAULT '[]',
      model_version TEXT,
      config_hash TEXT,
      provenance_runtime TEXT,
      signed_by TEXT,
      signature TEXT,
      provenance_created_at TEXT,
      eval_task_type TEXT,
      eval_layer TEXT,
      eval_pass INTEGER,
      eval_score REAL,
      eval_detail TEXT,
      eval_metrics TEXT,
      eval_benchmark_id TEXT,
      error TEXT,
      git_branch TEXT,
      git_commit TEXT,
      workspace_id INTEGER DEFAULT 1,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE task_stage_attempts (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      archived_at TEXT,
      run_id TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      metadata_json TEXT
    );
    CREATE TABLE task_stage_attempt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      message TEXT,
      metadata_json TEXT
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `)
  db.prepare(`
    INSERT INTO task_stage_attempts (
      id, workspace_id, task_id, stage_key, attempt_number, status,
      created_at, updated_at, started_at, completed_at, archived_at,
      run_id, workflow_template_id, workflow_template_slug, metadata_json
    ) VALUES (
      101, 1, 9901, 'implementation', 1, 'running',
      '2026-06-05T12:00:00.000Z', '2026-06-05T12:00:00.000Z',
      '2026-06-05T12:00:00.000Z', NULL, NULL,
      'run_spec_014c_001', 77, 'implementation', '{}'
    )
  `).run()
  db.prepare(`
    INSERT INTO task_stage_attempt_events (
      attempt_id, workspace_id, task_id, stage_key, attempt_number,
      status, observed_at, actor_type, actor_id, message, metadata_json
    ) VALUES (
      101, 1, 9901, 'implementation', 1,
      'running', '2026-06-05T12:00:00.000Z',
      'scheduler', 'codex-app-server', 'Codex app-server launch started', '{}'
    )
  `).run()
  return db
}

describe('Codex app-server dispatch admission', () => {
  it('admits an eligible claimed GitHub-linked assigned governed lifecycle-ready stage for launch', async () => {
    const input = buildAdmissionInput()

    const decision = await evaluateAdmission(input)

    expect(decision.decision).toBe('launch')
    if (decision.decision !== 'launch') throw new Error('expected launch decision')
    expect(decision).toMatchObject({
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      reasonCodes: [],
      launchInput: buildCodexAppServerLaunchInput(),
    })
    expect(decision.runEvidence).toMatchObject({
      schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
      taskId: CODEX_APP_SERVER_FIXTURE_IDS.taskId,
      stageKey: CODEX_APP_SERVER_FIXTURE_IDS.stageKey,
      attemptId: CODEX_APP_SERVER_FIXTURE_IDS.attemptId,
      claimId: CODEX_APP_SERVER_FIXTURE_IDS.claimId,
      claimRunId: CODEX_APP_SERVER_FIXTURE_IDS.claimRunId,
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      lifecycleId: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleId,
      status: 'launched',
      outcome: 'pending',
      phase: 'eligibility',
      safety: descriptorOnlySafety,
    })
    expect(decision.runEvidence).not.toHaveProperty('reasonCode')
  })

  it.each(blockedAdmissionCases)('blocks $label with $reasonCode evidence before launch', async (blockedCase) => {
    const input = buildAdmissionInput(blockedCase.overrides)

    const decision = await evaluateAdmission(input)

    expect(decision.decision).toBe('blocked')
    if (decision.decision !== 'blocked') throw new Error('expected blocked decision')
    expect(decision).toMatchObject({
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      reasonCodes: [blockedCase.reasonCode],
      launchInput: null,
    })
    expect(decision.runEvidence).toMatchObject({
      schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
      taskId: CODEX_APP_SERVER_FIXTURE_IDS.taskId,
      stageKey: CODEX_APP_SERVER_FIXTURE_IDS.stageKey,
      status: 'blocked',
      outcome: 'blocked',
      phase: 'eligibility',
      reasonCode: blockedCase.reasonCode,
      safety: descriptorOnlySafety,
    })
  })

  it('selects only codex-app-server dispatch candidates and leaves other agents on legacy dispatch', async () => {
    const admissionModule = await loadAdmissionModule()

    expect(admissionModule.__loadError).toBeUndefined()
    const isCandidate = admissionModule.isCodexAppServerDispatchCandidate
    expect(isCandidate).toEqual(expect.any(Function))
    if (!isCandidate) throw new Error('isCodexAppServerDispatchCandidate missing')
    expect(isCandidate({ agent_name: CODEX_APP_SERVER_MANIFEST_ID })).toBe(true)
    expect(isCandidate({ assigned_to: CODEX_APP_SERVER_MANIFEST_ID })).toBe(true)
    expect(isCandidate({ agent_name: 'paddock_owned_sandbox_fake' })).toBe(false)
    expect(isCandidate({ assigned_to: 'Aegis' })).toBe(false)
  })

  it('wires the existing dispatch trigger to the codex app-server seam without terminal-status writes in the seam callout', () => {
    const dispatchSource = readFileSync('src/lib/task-dispatch.ts', 'utf8')
    const calloutIndex = dispatchSource.indexOf('tryDispatchCodexAppServerTask({')
    const gatewayIndex = dispatchSource.indexOf('runOpenClaw(', calloutIndex)

    expect(dispatchSource).toContain("import { tryDispatchCodexAppServerTask } from './task-dispatch-codex-app-server'")
    expect(calloutIndex).toBeGreaterThan(0)
    expect(gatewayIndex).toBeGreaterThan(calloutIndex)
    expect(dispatchSource.slice(calloutIndex, gatewayIndex)).not.toMatch(/UPDATE\s+tasks\s+SET\s+status/i)
    expect(dispatchSource.slice(calloutIndex, gatewayIndex)).not.toContain('syncTaskOutbound(')
  })
})

describe('Codex app-server dispatch evidence persistence', () => {
  it('records descriptor-only run, attempt, and activity evidence after a successful handoff', async () => {
    const db = createPersistenceDb()
    const runEvidence = buildCodexAppServerRunEvidence(undefined, {
      workspaceId: '1',
      taskId: '9901',
      attemptId: '101',
      stageKey: 'implementation',
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
    })
    const activityPayload = {
      activityType: 'codex_app_server_completed',
      entityType: 'task',
      entityId: '9901',
      workspaceId: '1',
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      attemptId: '101',
      claimId: CODEX_APP_SERVER_FIXTURE_IDS.claimId,
      claimRunId: CODEX_APP_SERVER_FIXTURE_IDS.claimRunId,
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      lifecycleId: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleId,
      artifactIds: [CODEX_APP_SERVER_FIXTURE_IDS.artifactId],
      phase: 'terminal',
      status: 'completed',
      outcome: 'success',
      counts: { artifactRefs: 1, rejectedFieldPaths: 0 },
      createdAt: '2026-06-05T12:01:15.000Z',
    } as const

    const result = await persistDispatchEvidence({ db, runEvidence, activityPayload })

    expect(result).toEqual({
      runRecorded: true,
      attemptEventRecorded: true,
      activityRecorded: true,
    })
    expect(db.prepare('SELECT status, outcome, runtime, task_id, workspace_id FROM runs WHERE id = ?')
      .get(CODEX_APP_SERVER_FIXTURE_IDS.runId)).toMatchObject({
      status: 'completed',
      outcome: 'success',
      runtime: 'codex-app-server',
      task_id: '9901',
      workspace_id: 1,
    })
    expect(JSON.stringify(db.prepare('SELECT metadata FROM runs WHERE id = ?').get(CODEX_APP_SERVER_FIXTURE_IDS.runId)))
      .not.toMatch(/protocolPayload|provider_payload|tool_payload|prompt_body|host_path|Bearer |\/Users\//)
    expect(db.prepare('SELECT status, completed_at FROM task_stage_attempts WHERE id = 101').get()).toMatchObject({
      status: 'succeeded',
      completed_at: '2026-06-05T12:01:15.000Z',
    })
    expect(db.prepare('SELECT status, actor_type, actor_id, metadata_json FROM task_stage_attempt_events WHERE attempt_id = 101 ORDER BY id DESC LIMIT 1')
      .get()).toMatchObject({
      status: 'succeeded',
      actor_type: 'adapter',
      actor_id: 'codex-app-server',
    })
    expect(db.prepare('SELECT type, actor, data FROM activities WHERE type = ?')
      .get('codex_app_server_completed')).toMatchObject({
      actor: 'codex-app-server',
    })
    expect(JSON.stringify(db.prepare('SELECT data FROM activities WHERE type = ?').get('codex_app_server_completed')))
      .not.toMatch(/protocolPayload|provider_payload|tool_payload|prompt_body|host_path|Bearer |\/Users\//)
  })
})

describe('Codex app-server ownership re-proof', () => {
  it('re-proves current ownership before launch', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_launch',
    }))

    expect(decision).toMatchObject({
      decision: 'current',
      point: 'before_launch',
      allowedWrites: ['launch'],
      forbiddenLateMutations,
      terminateSubprocess: false,
      terminalOutcome: null,
      lifecycleTerminalStatus: null,
    })
  })

  it('re-proves same live thread ownership before continuation', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_continuation',
      continuation: {
        requestedThreadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
        requestedThreadSessionId: CODEX_APP_SERVER_FIXTURE_IDS.threadSessionId,
      },
    }))

    expect(decision).toMatchObject({
      decision: 'current',
      point: 'before_continuation',
      allowedWrites: ['turn_start'],
      forbiddenLateMutations,
      terminateSubprocess: false,
    })
  })

  it('re-proves current ownership before terminal evidence writes', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_terminal_evidence_write',
      terminalOutcome: successTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'current',
      point: 'before_terminal_evidence_write',
      allowedWrites: ['run_terminal_evidence', 'attempt_status'],
      forbiddenLateMutations,
      terminateSubprocess: false,
      terminalOutcome: successTerminalOutcome,
    })
  })

  it('re-proves current ownership before claim release', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_claim_release',
      terminalOutcome: failedTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'current',
      point: 'before_claim_release',
      allowedWrites: ['claim_release'],
      forbiddenLateMutations,
      terminateSubprocess: false,
      terminalOutcome: {
        reasonCode: 'malformed_protocol',
        attemptStatus: 'failed',
        claimRelease: 'dispatch_failed',
      },
    })
    if (decision.decision !== 'current' || decision.terminalOutcome === null) {
      throw new Error('expected current ownership with terminal outcome')
    }
    const claimRelease: string = decision.terminalOutcome.claimRelease
    expect(claimRelease).not.toBe('timeout_budget_expired')
  })

  it('re-proves Paddock lifecycle ownership before terminal marking', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_lifecycle_terminal_marking',
      terminalOutcome: successTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'current',
      point: 'before_lifecycle_terminal_marking',
      allowedWrites: ['lifecycle_terminal_marking'],
      forbiddenLateMutations,
      terminateSubprocess: false,
      lifecycleTerminalStatus: 'terminal',
    })
  })

  it('lets stale claim-control authority win', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_terminal_evidence_write',
      current: {
        claim: {
          status: 'released',
          releaseReason: 'operator_cancelled',
        },
        attempt: {
          status: 'cancelled',
          current: false,
        },
      },
      terminalOutcome: successTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'abandoned',
      point: 'before_terminal_evidence_write',
      ownershipWinner: 'claim_control',
      allowedWrites: ['abandoned_run_evidence', 'activity'],
      forbiddenLateMutations,
      terminateSubprocess: true,
    })
  })

  it('records bounded abandoned evidence after ownership loss', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_terminal_evidence_write',
      current: {
        claim: {
          claimRunId: 'claim_run_spec_014c_operator_winner',
          status: 'active',
        },
      },
      terminalOutcome: successTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'abandoned',
      abandonedEvidence: {
        schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
        adapterId: CODEX_APP_SERVER_ADAPTER_ID,
        status: 'abandoned',
        outcome: 'abandoned',
        phase: 'terminal',
        reasonCode: 'abandoned_by_claim_control',
        attemptStatus: 'not_written',
        claimRelease: 'existing_authority_wins',
        safety: descriptorOnlySafety,
      },
    })
  })

  it('forbids late mutation after ownership loss', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_claim_release',
      current: {
        claim: {
          status: 'stale_recovered',
          releaseReason: 'stale_claim_recovered',
        },
        lifecycle: {
          status: 'terminal',
        },
      },
      terminalOutcome: failedTerminalOutcome,
    }))

    expect(decision).toMatchObject({
      decision: 'abandoned',
      forbiddenLateMutations,
      terminateSubprocess: true,
    })
    expect(decision.allowedWrites).toEqual(['abandoned_run_evidence', 'activity'])
    expect(decision.forbiddenLateMutations).toEqual(expect.arrayContaining([
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
    ]))
  })

  it('enumerates every US4 no-mutation category after ownership loss', async () => {
    const decision = await evaluateOwnershipReproof(buildOwnershipReproofInput({
      point: 'before_terminal_evidence_write',
      current: {
        governanceAllowed: false,
        claim: {
          status: 'released',
          releaseReason: 'operator_cancelled',
        },
      },
      terminalOutcome: failedTerminalOutcome,
    }))

    expect(decision.decision).toBe('abandoned')
    expect(decision.forbiddenLateMutations).toEqual([
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
    ])
    expect(decision.allowedWrites).toEqual(['abandoned_run_evidence', 'activity'])
  })
})
