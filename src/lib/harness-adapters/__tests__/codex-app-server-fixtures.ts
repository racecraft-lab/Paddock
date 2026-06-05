export const CODEX_APP_SERVER_ADAPTER_ID = 'codex-app-server' as const
export const CODEX_APP_SERVER_RUN_SCHEMA_VERSION = 'codex_app_server_run.v1' as const
export const CODEX_APP_SERVER_MANIFEST_ID = 'codex-app-server' as const
export const CODEX_APP_SERVER_MODEL = null
export const CODEX_APP_SERVER_FIXED_NOW = '2026-06-05T12:00:00.000Z' as const
export const CODEX_APP_SERVER_FIXED_COMPLETED_AT = '2026-06-05T12:01:15.000Z' as const
export const CODEX_APP_SERVER_COMMAND = ['codex', 'app-server', '--listen', 'stdio://'] as const
export const CODEX_APP_SERVER_SAFE_SHA256 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as const

export type CodexAppServerJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CodexAppServerJsonValue[]
  | { readonly [key: string]: CodexAppServerJsonValue }

export type CodexAppServerRequestId = string | number

export interface CodexAppServerWireRequest<
  TMethod extends string = string,
  TParams = unknown,
> {
  readonly method: TMethod
  readonly id: CodexAppServerRequestId
  readonly params: TParams
}

export interface CodexAppServerWireNotification<
  TMethod extends string = string,
  TParams = unknown,
> {
  readonly method: TMethod
  readonly params: TParams
}

export interface CodexAppServerWireResponse<
  TResult = unknown,
> {
  readonly id: CodexAppServerRequestId
  readonly result: TResult
}

export interface CodexAppServerWireError {
  readonly id: CodexAppServerRequestId
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: CodexAppServerJsonValue
  }
}

export type CodexAppServerWireMessage =
  | CodexAppServerWireRequest
  | CodexAppServerWireNotification
  | CodexAppServerWireResponse
  | CodexAppServerWireError

export const CODEX_APP_SERVER_CLIENT_REQUEST_METHODS = [
  'initialize',
  'thread/start',
  'turn/start',
] as const
export type CodexAppServerClientRequestMethod =
  (typeof CODEX_APP_SERVER_CLIENT_REQUEST_METHODS)[number]

export const CODEX_APP_SERVER_CLIENT_NOTIFICATION_METHODS = ['initialized'] as const
export type CodexAppServerClientNotificationMethod =
  (typeof CODEX_APP_SERVER_CLIENT_NOTIFICATION_METHODS)[number]

export const CODEX_APP_SERVER_SERVER_NOTIFICATION_METHODS = [
  'thread/started',
  'turn/started',
  'turn/completed',
  'thread/tokenUsage/updated',
  'item/completed',
  'error',
] as const
export type CodexAppServerServerNotificationMethod =
  (typeof CODEX_APP_SERVER_SERVER_NOTIFICATION_METHODS)[number]

export const CODEX_APP_SERVER_UNSUPPORTED_REQUEST_METHODS = [
  'item/tool/requestUserInput',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/tool/call',
  'item/mcpTool/call',
  'capability/request',
] as const
export type CodexAppServerUnsupportedRequestMethod =
  (typeof CODEX_APP_SERVER_UNSUPPORTED_REQUEST_METHODS)[number]

export const CODEX_APP_SERVER_BLOCKED_ADMISSION_REASON_CODES = [
  'feature_disabled',
  'adapter_unassigned',
  'not_github_linked',
  'manifest_invalid',
  'manifest_mismatch',
  'missing_claim',
  'stale_claim',
  'missing_attempt',
  'governance_denied',
  'capability_unsupported',
  'sandbox_lifecycle_missing',
  'sandbox_lifecycle_not_paddock_owned',
  'sandbox_lifecycle_not_ready',
  'workspace_mismatch',
  'repository_mismatch',
  'authorization_denied',
] as const
export type CodexAppServerBlockedAdmissionReasonCode =
  (typeof CODEX_APP_SERVER_BLOCKED_ADMISSION_REASON_CODES)[number]

export const CODEX_APP_SERVER_ATTEMPT_FAILURE_REASON_CODES = [
  'user_input_unsupported',
  'approval_unsupported',
  'tool_file_unsupported',
  'capability_unsupported',
  'timeout_budget_expired',
  'binary_unavailable',
  'malformed_protocol',
  'unsafe_evidence_rejected',
  'abandoned_by_claim_control',
  'cleanup_failed',
] as const
export type CodexAppServerAttemptFailureReasonCode =
  (typeof CODEX_APP_SERVER_ATTEMPT_FAILURE_REASON_CODES)[number]

export type CodexAppServerReasonCode =
  | CodexAppServerBlockedAdmissionReasonCode
  | CodexAppServerAttemptFailureReasonCode

export type CodexAppServerRunStatus =
  | 'blocked'
  | 'launched'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'abandoned'
  | 'cleanup_failed'

export type CodexAppServerRunOutcome =
  | 'pending'
  | 'success'
  | 'failed'
  | 'blocked'
  | 'abandoned'

export type CodexAppServerRunPhase =
  | 'eligibility'
  | 'lifecycle_prepare'
  | 'spawn'
  | 'initialize'
  | 'thread_start'
  | 'turn_start'
  | 'running'
  | 'terminal'
  | 'artifact_safety'
  | 'cleanup'
  | 'subprocess_termination'
  | 'lifecycle_cleanup'

export type CodexAppServerAttemptStatus =
  | 'succeeded'
  | 'failed'
  | 'not_written'
  | 'preserve_terminal'
  | null

export type CodexAppServerClaimRelease =
  | 'launch_handoff_completed'
  | 'dispatch_failed'
  | 'existing_authority_wins'
  | 'preserve_terminal'
  | null

export interface CodexAppServerFixtureIds {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly runId: string
  readonly attemptId: string
  readonly claimId: string
  readonly claimRunId: string
  readonly manifestId: string
  readonly lifecycleId: string
  readonly lifecycleRoot: string
  readonly threadId: string
  readonly threadSessionId: string
  readonly turnId: string
  readonly artifactId: string
  readonly assignmentId: string
  readonly workflowTemplateId: string
  readonly projectId: string
  readonly repository: string
  readonly githubIssueTitle: string
  readonly githubIssueBody: string
  readonly githubIssueUrl: string
}

export const CODEX_APP_SERVER_FIXTURE_IDS = {
  workspaceId: 'ws_spec_014c_codex',
  taskId: 'task_spec_014c_001',
  stageKey: 'implementation',
  runId: 'run_spec_014c_001',
  attemptId: 'attempt_spec_014c_001',
  claimId: 'claim_spec_014c_001',
  claimRunId: 'claim_run_spec_014c_001',
  manifestId: CODEX_APP_SERVER_MANIFEST_ID,
  lifecycleId: 'lifecycle_spec_014c_001',
  lifecycleRoot: '/paddock/sandboxes/spec-014c/run-001',
  threadId: 'thr_spec_014c_001',
  threadSessionId: 'thr_spec_014c_001',
  turnId: 'turn_spec_014c_001',
  artifactId: 'artifact_spec_014c_001',
  assignmentId: 'assignment_spec_014c_001',
  workflowTemplateId: 'workflow_template_spec_014c_001',
  projectId: 'project_spec_014c_001',
  repository: 'racecraft-lab/Paddock',
  githubIssueTitle: 'SPEC-014C deterministic fixture issue',
  githubIssueBody: 'Use the Codex app-server adapter fixture for a claimed implementation stage.',
  githubIssueUrl: 'https://github.com/racecraft-lab/Paddock/issues/1400',
} as const satisfies CodexAppServerFixtureIds

export const buildCodexAppServerFixtureIds = (
  overrides: Partial<CodexAppServerFixtureIds> = {},
): CodexAppServerFixtureIds => ({
  ...CODEX_APP_SERVER_FIXTURE_IDS,
  ...overrides,
})

export interface CodexAppServerSandboxPolicy {
  readonly type: 'workspaceWrite'
  readonly writableRoots: readonly string[]
  readonly networkAccess: false
  readonly excludeTmpdirEnvVar: false
  readonly excludeSlashTmp: false
}

export const buildCodexAppServerSandboxPolicy = (
  lifecycleRoot: string = CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot,
): CodexAppServerSandboxPolicy => ({
  type: 'workspaceWrite',
  writableRoots: [lifecycleRoot],
  networkAccess: false,
  excludeTmpdirEnvVar: false,
  excludeSlashTmp: false,
})

export interface CodexAppServerInitializeParams {
  readonly clientInfo: {
    readonly name: 'paddock_spec_014c'
    readonly title: 'Paddock SPEC-014C Harness Adapter'
    readonly version: '0.1.0'
  }
  readonly capabilities: {
    readonly experimentalApi: true
    readonly requestAttestation: false
    readonly optOutNotificationMethods: readonly string[]
  }
}

export interface CodexAppServerInitializeResult {
  readonly userAgent: string
  readonly platformFamily: 'unix'
  readonly platformOs: 'linux'
}

export interface CodexAppServerThreadStartParams {
  readonly model: typeof CODEX_APP_SERVER_MODEL
  readonly cwd: string
  readonly approvalPolicy: 'never'
  readonly approvalsReviewer: 'user'
  readonly sandbox: 'workspace-write'
  readonly runtimeWorkspaceRoots: readonly string[]
  readonly permissions: null
  readonly serviceName: 'paddock_spec_014c'
}

export interface CodexAppServerThreadResult {
  readonly thread: {
    readonly id: string
    readonly sessionId: string
    readonly preview: ''
    readonly ephemeral: false
    readonly modelProvider: 'openai'
    readonly createdAt: number
  }
}

export interface CodexAppServerTurnInputText {
  readonly type: 'text'
  readonly text: string
  readonly text_elements: readonly []
}

export interface CodexAppServerTurnStartParams {
  readonly threadId: string
  readonly input: readonly CodexAppServerTurnInputText[]
  readonly cwd: string
  readonly approvalPolicy: 'never'
  readonly sandboxPolicy: CodexAppServerSandboxPolicy
  readonly model: typeof CODEX_APP_SERVER_MODEL
  readonly summary: 'concise'
}

export type CodexAppServerTurnStatus = 'inProgress' | 'completed' | 'failed' | 'interrupted'

export interface CodexAppServerTurnResult {
  readonly turn: {
    readonly id: string
    readonly status: CodexAppServerTurnStatus
    readonly items: readonly []
    readonly error: null | {
      readonly message: string
      readonly codexErrorInfo?: {
        readonly type: string
        readonly httpStatusCode?: number
      }
    }
  }
}

export const buildCodexAppServerInitializeRequest = (
  overrides: Partial<CodexAppServerWireRequest<'initialize', CodexAppServerInitializeParams>> = {},
): CodexAppServerWireRequest<'initialize', CodexAppServerInitializeParams> => ({
  method: 'initialize',
  id: 0,
  params: {
    clientInfo: {
      name: 'paddock_spec_014c',
      title: 'Paddock SPEC-014C Harness Adapter',
      version: '0.1.0',
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: [
        'command/exec/outputDelta',
        'item/agentMessage/delta',
        'item/plan/delta',
        'item/fileChange/outputDelta',
        'item/reasoning/summaryTextDelta',
        'item/reasoning/textDelta',
      ],
    },
  },
  ...overrides,
})

export const buildCodexAppServerInitializeResponse = (
  overrides: Partial<CodexAppServerWireResponse<CodexAppServerInitializeResult>> = {},
): CodexAppServerWireResponse<CodexAppServerInitializeResult> => ({
  id: 0,
  result: {
    userAgent: 'codex-cli/0.133.0 app-server',
    platformFamily: 'unix',
    platformOs: 'linux',
  },
  ...overrides,
})

export const buildCodexAppServerInitializedNotification = (
  overrides: Partial<CodexAppServerWireNotification<'initialized', Record<string, never>>> = {},
): CodexAppServerWireNotification<'initialized', Record<string, never>> => ({
  method: 'initialized',
  params: {},
  ...overrides,
})

export const buildCodexAppServerThreadStartRequest = (
  overrides: Partial<CodexAppServerWireRequest<'thread/start', CodexAppServerThreadStartParams>> = {},
): CodexAppServerWireRequest<'thread/start', CodexAppServerThreadStartParams> => {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  return {
    method: 'thread/start',
    id: 1,
    params: {
      model: CODEX_APP_SERVER_MODEL,
      cwd: ids.lifecycleRoot,
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandbox: 'workspace-write',
      runtimeWorkspaceRoots: [ids.lifecycleRoot],
      permissions: null,
      serviceName: 'paddock_spec_014c',
    },
    ...overrides,
  }
}

export const buildCodexAppServerThreadStartResponse = (
  overrides: Partial<CodexAppServerWireResponse<CodexAppServerThreadResult>> = {},
): CodexAppServerWireResponse<CodexAppServerThreadResult> => ({
  id: 1,
  result: {
    thread: {
      id: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      sessionId: CODEX_APP_SERVER_FIXTURE_IDS.threadSessionId,
      preview: '',
      ephemeral: false,
      modelProvider: 'openai',
      createdAt: 1780660800,
    },
  },
  ...overrides,
})

export const buildCodexAppServerThreadStarted = (
  overrides: Partial<
    CodexAppServerWireNotification<'thread/started', { readonly thread: { readonly id: string } }>
  > = {},
): CodexAppServerWireNotification<'thread/started', { readonly thread: { readonly id: string } }> => ({
  method: 'thread/started',
  params: {
    thread: {
      id: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
    },
  },
  ...overrides,
})

export const buildCodexAppServerTurnStartRequest = (
  overrides: Partial<CodexAppServerWireRequest<'turn/start', CodexAppServerTurnStartParams>> = {},
): CodexAppServerWireRequest<'turn/start', CodexAppServerTurnStartParams> => {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  return {
    method: 'turn/start',
    id: 2,
    params: {
      threadId: ids.threadId,
      input: [
        {
          type: 'text',
          text: [
            `Task: ${ids.githubIssueTitle}`,
            `Repository: ${ids.repository}`,
            `Issue: ${ids.githubIssueUrl}`,
            `Stage: ${ids.stageKey}`,
            'Return descriptor-only completion evidence. Do not retain raw transcript or tool payloads. Do not call tools.',
          ].join('\n'),
          text_elements: [],
        },
      ],
      cwd: ids.lifecycleRoot,
      approvalPolicy: 'never',
      sandboxPolicy: buildCodexAppServerSandboxPolicy(ids.lifecycleRoot),
      model: CODEX_APP_SERVER_MODEL,
      summary: 'concise',
    },
    ...overrides,
  }
}

export const buildCodexAppServerTurnStartResponse = (
  overrides: Partial<CodexAppServerWireResponse<CodexAppServerTurnResult>> = {},
): CodexAppServerWireResponse<CodexAppServerTurnResult> => ({
  id: 2,
  result: {
    turn: {
      id: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      status: 'inProgress',
      items: [],
      error: null,
    },
  },
  ...overrides,
})

export const buildCodexAppServerTurnStarted = (
  overrides: Partial<
    CodexAppServerWireNotification<'turn/started', { readonly turn: { readonly id: string; readonly status: 'inProgress' } }>
  > = {},
): CodexAppServerWireNotification<
  'turn/started',
  { readonly turn: { readonly id: string; readonly status: 'inProgress' } }
> => ({
  method: 'turn/started',
  params: {
    turn: {
      id: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      status: 'inProgress',
    },
  },
  ...overrides,
})

export interface CodexAppServerTokenUsage {
  readonly availability: 'available'
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly source: 'thread_token_usage_updated'
}

export const CODEX_APP_SERVER_TOKEN_USAGE = {
  availability: 'available',
  inputTokens: 321,
  outputTokens: 123,
  totalTokens: 444,
  source: 'thread_token_usage_updated',
} as const satisfies CodexAppServerTokenUsage

export const buildCodexAppServerTokenUsageUpdated = (
  overrides: Partial<
    CodexAppServerWireNotification<
      'thread/tokenUsage/updated',
      { readonly threadId: string; readonly usage: CodexAppServerTokenUsage }
    >
  > = {},
): CodexAppServerWireNotification<
  'thread/tokenUsage/updated',
  { readonly threadId: string; readonly usage: CodexAppServerTokenUsage }
> => ({
  method: 'thread/tokenUsage/updated',
  params: {
    threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
    usage: CODEX_APP_SERVER_TOKEN_USAGE,
  },
  ...overrides,
})

export const buildCodexAppServerAgentMessageCompleted = (
  overrides: Partial<
    CodexAppServerWireNotification<
      'item/completed',
      {
        readonly threadId: string
        readonly turnId: string
        readonly item: {
          readonly id: string
          readonly type: 'agentMessage'
          readonly text: string
          readonly phase: 'final_answer'
          readonly status: 'completed'
        }
      }
    >
  > = {},
): CodexAppServerWireNotification<
  'item/completed',
  {
    readonly threadId: string
    readonly turnId: string
    readonly item: {
      readonly id: string
      readonly type: 'agentMessage'
      readonly text: string
      readonly phase: 'final_answer'
      readonly status: 'completed'
    }
  }
> => ({
  method: 'item/completed',
  params: {
    threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
    turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
    item: {
      id: 'item_spec_014c_agent_message_001',
      type: 'agentMessage',
      text: 'Descriptor-only fixture summary: claimed stage completed with safe evidence.',
      phase: 'final_answer',
      status: 'completed',
    },
  },
  ...overrides,
})

export const buildCodexAppServerTurnCompleted = (
  status: Exclude<CodexAppServerTurnStatus, 'inProgress'> = 'completed',
  overrides: Partial<
    CodexAppServerWireNotification<
      'turn/completed',
      { readonly turn: CodexAppServerTurnResult['turn'] }
    >
  > = {},
): CodexAppServerWireNotification<'turn/completed', { readonly turn: CodexAppServerTurnResult['turn'] }> => ({
  method: 'turn/completed',
  params: {
    turn: {
      id: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      status,
      items: [],
      error: status === 'failed'
        ? {
            message: 'Fixture turn failed',
            codexErrorInfo: {
              type: 'Other',
            },
          }
        : null,
    },
  },
  ...overrides,
})

export type CodexAppServerProtocolDirection = 'client_to_server' | 'server_to_client'

export type CodexAppServerProtocolStepName =
  | 'initialize_request'
  | 'initialize_response'
  | 'initialized_notification'
  | 'thread_start_request'
  | 'thread_start_response'
  | 'thread_started_notification'
  | 'turn_start_request'
  | 'turn_start_response'
  | 'turn_started_notification'
  | 'token_usage_notification'
  | 'agent_message_completed'
  | 'turn_completed_notification'

export interface CodexAppServerProtocolStep {
  readonly step: CodexAppServerProtocolStepName
  readonly direction: CodexAppServerProtocolDirection
  readonly message: CodexAppServerWireMessage
  readonly terminalAuthority?: true
  readonly evidenceOnly?: true
}

export interface CodexAppServerProtocolSequenceOptions {
  readonly terminalStatus: Exclude<CodexAppServerTurnStatus, 'inProgress'>
  readonly includeTokenUsage: boolean
  readonly includeAgentMessage: boolean
}

export const buildCodexAppServerProtocolSequence = (
  options: Partial<CodexAppServerProtocolSequenceOptions> = {},
): readonly CodexAppServerProtocolStep[] => {
  const resolved: CodexAppServerProtocolSequenceOptions = {
    terminalStatus: 'completed',
    includeTokenUsage: true,
    includeAgentMessage: true,
    ...options,
  }

  const steps: CodexAppServerProtocolStep[] = [
    {
      step: 'initialize_request',
      direction: 'client_to_server',
      message: buildCodexAppServerInitializeRequest(),
    },
    {
      step: 'initialize_response',
      direction: 'server_to_client',
      message: buildCodexAppServerInitializeResponse(),
    },
    {
      step: 'initialized_notification',
      direction: 'client_to_server',
      message: buildCodexAppServerInitializedNotification(),
    },
    {
      step: 'thread_start_request',
      direction: 'client_to_server',
      message: buildCodexAppServerThreadStartRequest(),
    },
    {
      step: 'thread_start_response',
      direction: 'server_to_client',
      message: buildCodexAppServerThreadStartResponse(),
    },
    {
      step: 'thread_started_notification',
      direction: 'server_to_client',
      message: buildCodexAppServerThreadStarted(),
    },
    {
      step: 'turn_start_request',
      direction: 'client_to_server',
      message: buildCodexAppServerTurnStartRequest(),
    },
    {
      step: 'turn_start_response',
      direction: 'server_to_client',
      message: buildCodexAppServerTurnStartResponse(),
    },
    {
      step: 'turn_started_notification',
      direction: 'server_to_client',
      message: buildCodexAppServerTurnStarted(),
    },
  ]

  if (resolved.includeTokenUsage) {
    steps.push({
      step: 'token_usage_notification',
      direction: 'server_to_client',
      message: buildCodexAppServerTokenUsageUpdated(),
      evidenceOnly: true,
    })
  }

  if (resolved.includeAgentMessage) {
    steps.push({
      step: 'agent_message_completed',
      direction: 'server_to_client',
      message: buildCodexAppServerAgentMessageCompleted(),
      evidenceOnly: true,
    })
  }

  steps.push({
    step: 'turn_completed_notification',
    direction: 'server_to_client',
    message: buildCodexAppServerTurnCompleted(resolved.terminalStatus),
    terminalAuthority: true,
  })

  return steps
}

export interface CodexAppServerLifecycleClaimFixture {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly repository: string
  readonly assignmentId: string
  readonly workflowTemplateId: string
  readonly lifecycle: {
    readonly lifecycleId: string
    readonly lifecycleRoot: string
    readonly owner: 'paddock'
    readonly status: 'prepared'
    readonly createdAt: typeof CODEX_APP_SERVER_FIXED_NOW
  }
  readonly claim: {
    readonly claimId: string
    readonly claimRunId: string
    readonly status: 'active'
    readonly releaseReason: null
  }
  readonly attempt: {
    readonly attemptId: string
    readonly status: 'current'
    readonly runId: string
  }
}

export const buildCodexAppServerLifecycleClaimFixture = (
  overrides: Partial<CodexAppServerLifecycleClaimFixture> = {},
): CodexAppServerLifecycleClaimFixture => {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  return {
    workspaceId: ids.workspaceId,
    taskId: ids.taskId,
    stageKey: ids.stageKey,
    repository: ids.repository,
    assignmentId: ids.assignmentId,
    workflowTemplateId: ids.workflowTemplateId,
    lifecycle: {
      lifecycleId: ids.lifecycleId,
      lifecycleRoot: ids.lifecycleRoot,
      owner: 'paddock',
      status: 'prepared',
      createdAt: CODEX_APP_SERVER_FIXED_NOW,
    },
    claim: {
      claimId: ids.claimId,
      claimRunId: ids.claimRunId,
      status: 'active',
      releaseReason: null,
    },
    attempt: {
      attemptId: ids.attemptId,
      status: 'current',
      runId: ids.runId,
    },
    ...overrides,
  }
}

export interface CodexAppServerLaunchInputFixture {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly repository: string
  readonly githubIssueTitle: string
  readonly githubIssueBody: string
  readonly githubIssueUrl: string
  readonly workflowTemplateId: string
  readonly stageInstructions: string
  readonly assignmentRole: 'implementation'
  readonly claimId: string
  readonly claimRunId: string
  readonly attemptId: string
  readonly manifestId: string
  readonly capabilityPacket: {
    readonly adapterId: typeof CODEX_APP_SERVER_ADAPTER_ID
    readonly launch: true
    readonly artifactPublication: true
    readonly tokenRuntimeAccounting: true
    readonly approvalPolicy: 'never'
    readonly userInputPolicy: 'unsupported'
  }
  readonly lifecycleId: string
  readonly lifecycleRoot: string
  readonly timeoutMs: number
}

export const buildCodexAppServerLaunchInput = (
  overrides: Partial<CodexAppServerLaunchInputFixture> = {},
): CodexAppServerLaunchInputFixture => {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  return {
    workspaceId: ids.workspaceId,
    taskId: ids.taskId,
    stageKey: ids.stageKey,
    repository: ids.repository,
    githubIssueTitle: ids.githubIssueTitle,
    githubIssueBody: ids.githubIssueBody,
    githubIssueUrl: ids.githubIssueUrl,
    workflowTemplateId: ids.workflowTemplateId,
    stageInstructions: 'Implement the claimed stage and emit descriptor-only evidence.',
    assignmentRole: 'implementation',
    claimId: ids.claimId,
    claimRunId: ids.claimRunId,
    attemptId: ids.attemptId,
    manifestId: ids.manifestId,
    capabilityPacket: {
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      launch: true,
      artifactPublication: true,
      tokenRuntimeAccounting: true,
      approvalPolicy: 'never',
      userInputPolicy: 'unsupported',
    },
    lifecycleId: ids.lifecycleId,
    lifecycleRoot: ids.lifecycleRoot,
    timeoutMs: 120000,
    ...overrides,
  }
}

export type CodexAppServerSubprocessStatus =
  | 'spawned'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'binary_unavailable'
  | 'termination_failed'

export interface CodexAppServerSubprocessResult {
  readonly command: typeof CODEX_APP_SERVER_COMMAND
  readonly cwd: string
  readonly shell: false
  readonly pid: number | null
  readonly status: CodexAppServerSubprocessStatus
  readonly exitCode: number | null
  readonly signal: 'SIGTERM' | 'SIGKILL' | null
  readonly durationMs: number
  readonly stdoutLineCount: number
  readonly stderrLineCount: number
  readonly reasonCode?: CodexAppServerAttemptFailureReasonCode
  readonly errorLabel?: string
}

export const buildCodexAppServerSubprocessResult = (
  overrides: Partial<CodexAppServerSubprocessResult> = {},
): CodexAppServerSubprocessResult => ({
  command: CODEX_APP_SERVER_COMMAND,
  cwd: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot,
  shell: false,
  pid: 14014,
  status: 'completed',
  exitCode: 0,
  signal: null,
  durationMs: 75000,
  stdoutLineCount: 12,
  stderrLineCount: 0,
  ...overrides,
})

export const CODEX_APP_SERVER_SUBPROCESS_RESULTS = {
  completed: buildCodexAppServerSubprocessResult(),
  binaryUnavailable: buildCodexAppServerSubprocessResult({
    pid: null,
    status: 'binary_unavailable',
    exitCode: null,
    durationMs: 0,
    stdoutLineCount: 0,
    stderrLineCount: 1,
    reasonCode: 'binary_unavailable',
    errorLabel: 'ENOENT',
  }),
  timeout: buildCodexAppServerSubprocessResult({
    status: 'timeout',
    exitCode: null,
    signal: 'SIGTERM',
    durationMs: 120000,
    reasonCode: 'timeout_budget_expired',
    errorLabel: 'manifest_timeout_expired',
  }),
  terminationFailed: buildCodexAppServerSubprocessResult({
    status: 'termination_failed',
    exitCode: null,
    signal: 'SIGKILL',
    durationMs: 120250,
    reasonCode: 'cleanup_failed',
    errorLabel: 'subprocess_termination_failed',
  }),
} as const

export interface CodexAppServerUnsupportedRequestFixture {
  readonly label: string
  readonly message: CodexAppServerWireRequest<CodexAppServerUnsupportedRequestMethod>
  readonly expectedReasonCode: Exclude<
    CodexAppServerAttemptFailureReasonCode,
    | 'timeout_budget_expired'
    | 'binary_unavailable'
    | 'malformed_protocol'
    | 'unsafe_evidence_rejected'
    | 'abandoned_by_claim_control'
    | 'cleanup_failed'
  >
  readonly expectedDenyResponse: CodexAppServerWireResponse
}

const unsupportedRequest = (
  label: string,
  method: CodexAppServerUnsupportedRequestMethod,
  expectedReasonCode: CodexAppServerUnsupportedRequestFixture['expectedReasonCode'],
  params: CodexAppServerJsonValue,
  id: CodexAppServerRequestId,
): CodexAppServerUnsupportedRequestFixture => ({
  label,
  message: {
    method,
    id,
    params,
  },
  expectedReasonCode,
  expectedDenyResponse: {
    id,
    result: {
      decision: 'cancel',
      reason: expectedReasonCode,
    },
  },
})

export const CODEX_APP_SERVER_UNSUPPORTED_REQUEST_FIXTURES = [
  unsupportedRequest(
    'live user input request',
    'item/tool/requestUserInput',
    'user_input_unsupported',
    {
      requestId: 'request_user_input_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      itemId: 'item_user_input_001',
      prompt: 'Need operator input to continue',
      options: ['Continue', 'Cancel'],
    },
    100,
  ),
  unsupportedRequest(
    'approval-like connector elicitation',
    'item/tool/requestUserInput',
    'approval_unsupported',
    {
      requestId: 'request_connector_approval_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      itemId: 'item_connector_approval_001',
      approvalLike: true,
      options: ['Accept', 'Decline', 'Cancel'],
    },
    101,
  ),
  unsupportedRequest(
    'command approval request',
    'item/commandExecution/requestApproval',
    'approval_unsupported',
    {
      itemId: 'item_command_approval_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      reason: 'command requires approval',
      command: ['git', 'status'],
      cwd: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot,
      availableDecisions: ['accept', 'decline', 'cancel'],
    },
    102,
  ),
  unsupportedRequest(
    'file change approval request',
    'item/fileChange/requestApproval',
    'tool_file_unsupported',
    {
      itemId: 'item_file_change_approval_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      reason: 'file change approval required',
      grantRoot: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot,
    },
    103,
  ),
  unsupportedRequest(
    'dynamic tool call',
    'item/tool/call',
    'tool_file_unsupported',
    {
      requestId: 'request_dynamic_tool_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      tool: {
        namespace: 'fixture_dynamic_tools',
        name: 'write_file',
      },
      arguments: {
        path: 'relative-output.txt',
      },
    },
    104,
  ),
  unsupportedRequest(
    'mcp tool call',
    'item/mcpTool/call',
    'tool_file_unsupported',
    {
      requestId: 'request_mcp_tool_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      server: 'fixture-mcp',
      tool: 'unsafe_write',
    },
    105,
  ),
  unsupportedRequest(
    'capability outside manifest',
    'capability/request',
    'capability_unsupported',
    {
      requestId: 'request_capability_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      capability: 'live_operator_intervention',
    },
    106,
  ),
] as const satisfies readonly CodexAppServerUnsupportedRequestFixture[]

export interface CodexAppServerUnsafeOutputSample {
  readonly label: string
  readonly output: CodexAppServerJsonValue
  readonly expectedReasonCode: 'unsafe_evidence_rejected'
  readonly expectedRejectedFieldPaths: readonly string[]
  readonly safeDiagnosticCategory: string
}

export const CODEX_APP_SERVER_UNSAFE_OUTPUT_SAMPLES = [
  {
    label: 'raw transcript retained',
    output: {
      transcript: [
        {
          role: 'assistant',
          content: 'raw transcript content must not be persisted',
        },
      ],
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.transcript'],
    safeDiagnosticCategory: 'raw_transcript',
  },
  {
    label: 'raw protocol payload retained',
    output: {
      protocolPayload: {
        method: 'item/completed',
        params: {
          item: {
            type: 'agentMessage',
            text: 'raw protocol payload must not be retained',
          },
        },
      },
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.protocolPayload'],
    safeDiagnosticCategory: 'raw_protocol',
  },
  {
    label: 'host path in summary',
    output: {
      safeSummary: 'Created an artifact from /Users/operator/private/project/output.json',
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.safeSummary'],
    safeDiagnosticCategory: 'host_path',
  },
  {
    label: 'storage URI in artifact reference',
    output: {
      artifactRefs: [
        {
          artifactId: CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
          storageUri: 'file:///paddock/sandboxes/spec-014c/run-001/raw-output.json',
        },
      ],
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.artifactRefs[0].storageUri'],
    safeDiagnosticCategory: 'storage_uri',
  },
  {
    label: 'external URL in artifact reference',
    output: {
      artifactRefs: [
        {
          artifactId: CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
          url: 'https://example.invalid/raw-codex-output',
        },
      ],
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.artifactRefs[0].url'],
    safeDiagnosticCategory: 'external_url',
  },
  {
    label: 'original filename retained',
    output: {
      artifactRefs: [
        {
          artifactId: CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
          originalFilename: 'operator-private-notes.md',
        },
      ],
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.artifactRefs[0].originalFilename'],
    safeDiagnosticCategory: 'original_filename',
  },
  {
    label: 'secret-shaped value retained',
    output: {
      safeSummary: 'Authorization: Bearer fixture-secret-value-000000000000',
    },
    expectedReasonCode: 'unsafe_evidence_rejected',
    expectedRejectedFieldPaths: ['$.safeSummary'],
    safeDiagnosticCategory: 'secret',
  },
] as const satisfies readonly CodexAppServerUnsafeOutputSample[]

export interface CodexAppServerSafeArtifactRef extends Readonly<Record<string, CodexAppServerJsonValue>> {
  readonly artifactId: string
  readonly artifactType: 'codex_app_server_summary'
  readonly schemaVersion: typeof CODEX_APP_SERVER_RUN_SCHEMA_VERSION
  readonly mimeType: 'application/json'
  readonly byteSize: number
  readonly itemCount: number
  readonly sha256: string
  readonly redactionStatus: 'not_needed' | 'redacted'
  readonly securityScanStatus: 'passed'
  readonly producedAt: typeof CODEX_APP_SERVER_FIXED_COMPLETED_AT
  readonly safeSummary: string
  readonly safeLabel: string
}

export const buildCodexAppServerSafeArtifactRef = (
  overrides: Partial<CodexAppServerSafeArtifactRef> = {},
): CodexAppServerSafeArtifactRef => ({
  artifactId: CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
  artifactType: 'codex_app_server_summary',
  schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
  mimeType: 'application/json',
  byteSize: 512,
  itemCount: 1,
  sha256: CODEX_APP_SERVER_SAFE_SHA256,
  redactionStatus: 'not_needed',
  securityScanStatus: 'passed',
  producedAt: CODEX_APP_SERVER_FIXED_COMPLETED_AT,
  safeSummary: 'Descriptor-only Codex app-server fixture artifact.',
  safeLabel: 'codex-app-server-summary',
  ...overrides,
})

export interface CodexAppServerTerminalMappingCase {
  readonly label: string
  readonly caseKind: 'success' | 'blocked' | 'failed' | 'timeout' | 'abandoned' | 'cleanup_failed'
  readonly runStatus: CodexAppServerRunStatus
  readonly outcome: CodexAppServerRunOutcome
  readonly phase: CodexAppServerRunPhase
  readonly reasonCode: CodexAppServerReasonCode | null
  readonly attemptStatus: CodexAppServerAttemptStatus
  readonly claimRelease: CodexAppServerClaimRelease
  readonly cleanupPhase?: 'subprocess_termination' | 'lifecycle_cleanup'
  readonly preservesOriginalTerminal?: true
  readonly launchedIdsRequired: boolean
}

export const CODEX_APP_SERVER_SUCCESS_TERMINAL_MAPPING_CASE = {
  label: 'successful app-server turn',
  caseKind: 'success',
  runStatus: 'completed',
  outcome: 'success',
  phase: 'terminal',
  reasonCode: null,
  attemptStatus: 'succeeded',
  claimRelease: 'launch_handoff_completed',
  launchedIdsRequired: true,
} as const satisfies CodexAppServerTerminalMappingCase

const blockedMappingCases = CODEX_APP_SERVER_BLOCKED_ADMISSION_REASON_CODES.map((reasonCode) => ({
  label: `blocked admission: ${reasonCode}`,
  caseKind: 'blocked' as const,
  runStatus: 'blocked' as const,
  outcome: 'blocked' as const,
  phase: 'eligibility' as const,
  reasonCode,
  attemptStatus: null,
  claimRelease: null,
  launchedIdsRequired: false,
}))

const failedMappingCases: readonly CodexAppServerTerminalMappingCase[] = [
  {
    label: 'unsupported user input',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'running',
    reasonCode: 'user_input_unsupported',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'unsupported approval request',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'running',
    reasonCode: 'approval_unsupported',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'unsupported tool or file request',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'running',
    reasonCode: 'tool_file_unsupported',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'unsupported manifest capability',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'running',
    reasonCode: 'capability_unsupported',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'binary unavailable',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'spawn',
    reasonCode: 'binary_unavailable',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'malformed protocol',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'initialize',
    reasonCode: 'malformed_protocol',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'unsafe evidence rejected',
    caseKind: 'failed',
    runStatus: 'failed',
    outcome: 'failed',
    phase: 'artifact_safety',
    reasonCode: 'unsafe_evidence_rejected',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
]

export const CODEX_APP_SERVER_TERMINAL_MAPPING_CASES = [
  CODEX_APP_SERVER_SUCCESS_TERMINAL_MAPPING_CASE,
  ...blockedMappingCases,
  ...failedMappingCases,
  {
    label: 'timeout',
    caseKind: 'timeout',
    runStatus: 'timeout',
    outcome: 'failed',
    phase: 'running',
    reasonCode: 'timeout_budget_expired',
    attemptStatus: 'failed',
    claimRelease: 'dispatch_failed',
    launchedIdsRequired: true,
  },
  {
    label: 'abandoned by claim control',
    caseKind: 'abandoned',
    runStatus: 'abandoned',
    outcome: 'abandoned',
    phase: 'terminal',
    reasonCode: 'abandoned_by_claim_control',
    attemptStatus: 'not_written',
    claimRelease: 'existing_authority_wins',
    launchedIdsRequired: true,
  },
  {
    label: 'subprocess termination cleanup failed',
    caseKind: 'cleanup_failed',
    runStatus: 'cleanup_failed',
    outcome: 'failed',
    phase: 'subprocess_termination',
    reasonCode: 'cleanup_failed',
    attemptStatus: 'preserve_terminal',
    claimRelease: 'preserve_terminal',
    cleanupPhase: 'subprocess_termination',
    preservesOriginalTerminal: true,
    launchedIdsRequired: true,
  },
  {
    label: 'lifecycle cleanup failed',
    caseKind: 'cleanup_failed',
    runStatus: 'cleanup_failed',
    outcome: 'failed',
    phase: 'lifecycle_cleanup',
    reasonCode: 'cleanup_failed',
    attemptStatus: 'preserve_terminal',
    claimRelease: 'preserve_terminal',
    cleanupPhase: 'lifecycle_cleanup',
    preservesOriginalTerminal: true,
    launchedIdsRequired: true,
  },
] as const satisfies readonly CodexAppServerTerminalMappingCase[]

export const CODEX_APP_SERVER_TERMINAL_MAPPING_BY_REASON = Object.fromEntries(
  CODEX_APP_SERVER_TERMINAL_MAPPING_CASES
    .filter((mappingCase) => mappingCase.reasonCode !== null)
    .map((mappingCase) => [mappingCase.reasonCode, mappingCase]),
) as Partial<Record<CodexAppServerReasonCode, CodexAppServerTerminalMappingCase>>

export interface CodexAppServerRunEvidenceFixture {
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
  readonly outcome: CodexAppServerRunOutcome
  readonly phase: CodexAppServerRunPhase
  readonly reasonCode?: CodexAppServerReasonCode
  readonly protocol?: {
    readonly threadId: string
    readonly threadSessionId: string
    readonly turnIds: readonly string[]
    readonly notificationsSeen: Record<string, number>
  }
  readonly usage: {
    readonly availability: 'available' | 'partial' | 'unavailable'
    readonly inputTokens?: number
    readonly outputTokens?: number
    readonly totalTokens?: number
    readonly source?: 'thread_token_usage_updated' | 'final_turn' | 'none'
  }
  readonly artifactRefs?: readonly CodexAppServerSafeArtifactRef[]
  readonly failure?: {
    readonly safeDiagnosticCategory: string
    readonly relatedIds: readonly string[]
    readonly rejectedFieldPaths?: readonly string[]
    readonly safeHash?: string
    readonly safeSize?: number
    readonly runErrorLabel?: string
  }
  readonly safety: {
    readonly rawTranscriptRetained: false
    readonly rawProtocolRetained: false
    readonly providerPayloadRetained: false
    readonly toolPayloadRetained: false
    readonly promptBodyRetained: false
    readonly hostPathRetained: false
    readonly secretRetained: false
    readonly redactionApplied: boolean
  }
  readonly timestamps: {
    readonly startedAt: typeof CODEX_APP_SERVER_FIXED_NOW
    readonly completedAt?: typeof CODEX_APP_SERVER_FIXED_COMPLETED_AT
  }
}

export const buildCodexAppServerRunEvidence = (
  mappingCase: CodexAppServerTerminalMappingCase = CODEX_APP_SERVER_SUCCESS_TERMINAL_MAPPING_CASE,
  overrides: Partial<CodexAppServerRunEvidenceFixture> = {},
): CodexAppServerRunEvidenceFixture => {
  const ids = CODEX_APP_SERVER_FIXTURE_IDS
  const launchedIds = mappingCase.launchedIdsRequired
    ? {
        attemptId: ids.attemptId,
        claimId: ids.claimId,
        claimRunId: ids.claimRunId,
        manifestId: ids.manifestId,
        lifecycleId: ids.lifecycleId,
      }
    : {}
  const protocol = mappingCase.launchedIdsRequired
    ? {
        protocol: {
          threadId: ids.threadId,
          threadSessionId: ids.threadSessionId,
          turnIds: [ids.turnId],
          notificationsSeen: {
            'thread/started': 1,
            'turn/started': 1,
            'turn/completed': mappingCase.caseKind === 'cleanup_failed' ? 0 : 1,
          },
        },
      }
    : {}
  const failure = mappingCase.reasonCode
    ? {
        failure: {
          safeDiagnosticCategory: mappingCase.reasonCode,
          relatedIds: [ids.runId],
          safeHash: CODEX_APP_SERVER_SAFE_SHA256,
          safeSize: 128,
          runErrorLabel: mappingCase.label,
        },
      }
    : {}

  return {
    schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
    adapterId: CODEX_APP_SERVER_ADAPTER_ID,
    runId: ids.runId,
    workspaceId: ids.workspaceId,
    taskId: ids.taskId,
    stageKey: ids.stageKey,
    ...launchedIds,
    status: mappingCase.runStatus,
    outcome: mappingCase.outcome,
    phase: mappingCase.phase,
    ...(mappingCase.reasonCode ? { reasonCode: mappingCase.reasonCode } : {}),
    ...protocol,
    usage: mappingCase.caseKind === 'success'
      ? CODEX_APP_SERVER_TOKEN_USAGE
      : {
          availability: 'unavailable',
          source: 'none',
        },
    artifactRefs: mappingCase.caseKind === 'success' ? [buildCodexAppServerSafeArtifactRef()] : [],
    ...failure,
    safety: {
      rawTranscriptRetained: false,
      rawProtocolRetained: false,
      providerPayloadRetained: false,
      toolPayloadRetained: false,
      promptBodyRetained: false,
      hostPathRetained: false,
      secretRetained: false,
      redactionApplied: false,
    },
    timestamps: {
      startedAt: CODEX_APP_SERVER_FIXED_NOW,
      completedAt: CODEX_APP_SERVER_FIXED_COMPLETED_AT,
    },
    ...overrides,
  }
}
