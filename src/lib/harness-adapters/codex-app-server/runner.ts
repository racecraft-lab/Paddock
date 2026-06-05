import {
  buildCodexAppServerActivityPayload,
  buildCodexAppServerEvidenceArtifacts,
  buildCodexAppServerRunEvidenceFromProtocol,
  buildCodexAppServerSafeArtifactRef,
  type CodexAppServerActivityPayload,
  type CodexAppServerEvidenceArtifactSafetyResult,
  type CodexAppServerRunEvidence,
  type CodexAppServerTerminalMappingCase,
} from './evidence'
import {
  buildCodexAppServerTurnInput,
  type CodexAppServerTurnInputSource,
  type CodexAppServerTurnInputText,
} from './input'
import {
  classifyCodexAppServerUnsupportedRequest,
  parseCodexAppServerProtocolLine,
} from './protocol'

export interface CodexAppServerSandboxPolicy {
  readonly type: 'workspaceWrite'
  readonly writableRoots: readonly string[]
  readonly networkAccess: false
  readonly excludeTmpdirEnvVar: false
  readonly excludeSlashTmp: false
}

export interface CodexAppServerLaunchInput extends CodexAppServerTurnInputSource {
  readonly lifecycleId: string
  readonly lifecycleRoot: string
  readonly timeoutMs: number
}

export interface CodexAppServerSpawnOptions {
  readonly cwd: string
  readonly shell: false
  readonly stdio: 'pipe' | readonly ['pipe', 'pipe', 'pipe']
}

export interface CodexAppServerRunnerDeps {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: CodexAppServerSpawnOptions,
  ) => unknown
  readonly protocolSequence: readonly CodexAppServerProtocolStep[]
  readonly now: () => string
  readonly subprocessResult?: CodexAppServerSubprocessResult
  readonly cleanupLifecycle?: () => CodexAppServerLifecycleCleanupResult
}

export interface CodexAppServerWireMessage {
  readonly method?: string
  readonly id?: string | number
  readonly params?: unknown
  readonly result?: unknown
  readonly error?: unknown
}

export interface CodexAppServerProtocolStep {
  readonly step: string
  readonly direction: string
  readonly message: CodexAppServerWireMessage
}

export interface CodexAppServerThreadStartParams {
  readonly model: null
  readonly cwd: string
  readonly approvalPolicy: 'never'
  readonly approvalsReviewer: 'user'
  readonly sandbox: 'workspace-write'
  readonly runtimeWorkspaceRoots: readonly string[]
  readonly permissions: null
  readonly serviceName: 'paddock_spec_014c'
}

export interface CodexAppServerTurnStartParams {
  readonly threadId: string
  readonly input: readonly CodexAppServerTurnInputText[]
  readonly cwd: string
  readonly approvalPolicy: 'never'
  readonly sandboxPolicy: CodexAppServerSandboxPolicy
  readonly model: null
  readonly summary: 'concise'
}

export interface CodexAppServerLaunchResult {
  readonly subprocessCount: number
  readonly protocolSteps: readonly CodexAppServerProtocolStep[]
  readonly clientMessages: readonly CodexAppServerWireMessage[]
  readonly threadStartParams: CodexAppServerThreadStartParams
  readonly turnStartParams: CodexAppServerTurnStartParams
  readonly runEvidence: CodexAppServerRunEvidence
  readonly activityPayload: CodexAppServerActivityPayload
  readonly artifactSafety: CodexAppServerEvidenceArtifactSafetyResult
  readonly subprocess?: CodexAppServerSubprocessResult
  readonly cleanupEvidence?: CodexAppServerCleanupEvidence
}

const CODEX_APP_SERVER_COMMAND = ['codex', 'app-server', 'proxy'] as const
const activeLaunches = new Set<string>()

export type CodexAppServerSubprocessStatus =
  | 'spawned'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'binary_unavailable'
  | 'termination_failed'

export interface CodexAppServerSubprocessResult {
  readonly command: readonly string[]
  readonly cwd: string
  readonly shell: false
  readonly pid: number | null
  readonly status: CodexAppServerSubprocessStatus
  readonly exitCode: number | null
  readonly signal: 'SIGTERM' | 'SIGKILL' | null
  readonly durationMs: number
  readonly stdoutLineCount: number
  readonly stderrLineCount: number
  readonly reasonCode?: 'timeout_budget_expired' | 'binary_unavailable' | 'cleanup_failed'
  readonly errorLabel?: string
}

export interface CodexAppServerLifecycleCleanupResult {
  readonly status: 'cleanup_failed'
  readonly phase: 'lifecycle_cleanup'
  readonly errorLabel: string
}

export interface CodexAppServerCleanupEvidence {
  readonly status: 'cleanup_failed'
  readonly outcome: 'failed'
  readonly phase: 'subprocess_termination' | 'lifecycle_cleanup'
  readonly reasonCode: 'cleanup_failed'
  readonly failure: {
    readonly safeDiagnosticCategory: 'cleanup_failed'
    readonly relatedIds: readonly string[]
    readonly runErrorLabel: string
  }
  readonly preservedTerminalOutcome?: {
    readonly status: 'completed' | 'failed' | 'timeout' | 'abandoned'
    readonly outcome: 'success' | 'failed' | 'abandoned'
    readonly phase: string
    readonly reasonCode?: string | null
    readonly attemptStatus: 'succeeded' | 'failed' | 'not_written'
    readonly claimRelease: 'launch_handoff_completed' | 'dispatch_failed' | 'existing_authority_wins'
  }
}

interface KillableSubprocess {
  readonly pid?: number | null
  readonly kill?: (signal?: string) => boolean
}

interface ReadableStdio {
  readonly on: (event: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void) => unknown
}

interface WritableStdio {
  readonly write: (chunk: string) => boolean
  readonly end?: () => void
}

interface StdioSubprocess extends KillableSubprocess {
  readonly stdin?: WritableStdio
  readonly stdout?: ReadableStdio
  readonly stderr?: ReadableStdio
}

interface ProtocolLineReader {
  readonly nextLine: (timeoutMs: number) => Promise<{ readonly line: string } | { readonly timedOut: true }>
  readonly lineCount: () => number
}

interface ProtocolLineCounter {
  readonly lineCount: () => number
}

type LiveProtocolFailureReason =
  | 'user_input_unsupported'
  | 'approval_unsupported'
  | 'tool_file_unsupported'
  | 'capability_unsupported'
  | 'malformed_protocol'

interface LiveProtocolExchangeResult {
  readonly protocolSteps: readonly CodexAppServerProtocolStep[]
  readonly clientMessages: readonly CodexAppServerWireMessage[]
  readonly turnStartParams: CodexAppServerTurnStartParams
  readonly subprocess: CodexAppServerSubprocessResult
  readonly failureReasonCode?: LiveProtocolFailureReason
  readonly failurePhase?: CodexAppServerTerminalMappingCase['phase']
  readonly failureLabel?: string
}

function createProtocolLineReader(stream: ReadableStdio): ProtocolLineReader {
  let buffer = ''
  let count = 0
  const queuedLines: string[] = []
  const pending: ((result: { readonly line: string } | { readonly timedOut: true }) => void)[] = []

  const enqueueLine = (line: string): void => {
    if (line.trim().length === 0) return
    count += 1
    const resolve = pending.shift()
    if (resolve) {
      resolve({ line })
      return
    }
    queuedLines.push(line)
  }

  stream.on('data', (chunk: unknown) => {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      enqueueLine(line)
      newlineIndex = buffer.indexOf('\n')
    }
  })

  return {
    nextLine: (timeoutMs: number) => {
      const queued = queuedLines.shift()
      if (queued !== undefined) return Promise.resolve({ line: queued })
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          const index = pending.indexOf(resolve)
          if (index >= 0) pending.splice(index, 1)
          resolve({ timedOut: true })
        }, timeoutMs)
        pending.push((result) => {
          clearTimeout(timeout)
          resolve(result)
        })
      })
    },
    lineCount: () => count,
  }
}

function createProtocolLineCounter(stream: ReadableStdio | undefined): ProtocolLineCounter {
  let buffer = ''
  let count = 0
  if (stream) {
    stream.on('data', (chunk: unknown) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim().length > 0) count += 1
        newlineIndex = buffer.indexOf('\n')
      }
    })
  }
  return { lineCount: () => count }
}

function buildSandboxPolicy(root: string): CodexAppServerSandboxPolicy {
  return {
    type: 'workspaceWrite',
    writableRoots: [root],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  }
}

function initializeRequest(): CodexAppServerWireMessage {
  return {
    method: 'initialize',
    id: 0,
    params: {
      clientInfo: {
        name: 'paddock_spec_014c',
        title: 'Paddock SPEC-014C Harness Adapter',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    },
  }
}

function initializedNotification(): CodexAppServerWireMessage {
  return {
    method: 'initialized',
    params: {},
  }
}

function clientStep(step: string, message: CodexAppServerWireMessage): CodexAppServerProtocolStep {
  return {
    step,
    direction: 'client_to_server',
    message,
  }
}

function serverStep(message: CodexAppServerWireMessage): CodexAppServerProtocolStep {
  if (message.id === 0 && Object.hasOwn(message, 'result')) {
    return { step: 'initialize_response', direction: 'server_to_client', message }
  }
  if (message.id === 1 && Object.hasOwn(message, 'result')) {
    return { step: 'thread_start_response', direction: 'server_to_client', message }
  }
  if (message.id === 2 && Object.hasOwn(message, 'result')) {
    return { step: 'turn_start_response', direction: 'server_to_client', message }
  }
  if (message.method === 'thread/started') {
    return { step: 'thread_started_notification', direction: 'server_to_client', message }
  }
  if (message.method === 'turn/started') {
    return { step: 'turn_started_notification', direction: 'server_to_client', message }
  }
  if (message.method === 'turn/completed') {
    return { step: 'turn_completed_notification', direction: 'server_to_client', message }
  }
  if (message.method === 'thread/tokenUsage/updated') {
    return { step: 'token_usage_notification', direction: 'server_to_client', message }
  }
  if (message.method === 'item/completed') {
    return { step: 'agent_message_completed', direction: 'server_to_client', message }
  }
  return { step: 'server_notification', direction: 'server_to_client', message }
}

function readThreadSession(sequence: readonly CodexAppServerProtocolStep[]): { readonly threadId: string; readonly sessionId: string } | null {
  for (const step of sequence) {
    if (step.step !== 'thread_start_response') continue
    const result = step.message.result
    if (!result || typeof result !== 'object' || Array.isArray(result)) continue
    const thread = (result as { readonly thread?: unknown }).thread
    if (!thread || typeof thread !== 'object' || Array.isArray(thread)) continue
    const threadId = (thread as { readonly id?: unknown }).id
    const sessionId = (thread as { readonly sessionId?: unknown }).sessionId
    if (typeof threadId === 'string' && threadId.length > 0 && typeof sessionId === 'string' && sessionId.length > 0) {
      return { threadId, sessionId }
    }
  }
  return null
}

function isServerRequest(message: CodexAppServerWireMessage): message is CodexAppServerWireMessage & { readonly method: string; readonly id: string | number } {
  return typeof message.method === 'string' && (typeof message.id === 'string' || typeof message.id === 'number')
}

function writeJsonLine(stdin: WritableStdio, message: CodexAppServerWireMessage): void {
  stdin.write(`${JSON.stringify(message)}\n`)
}

function extractThreadId(sequence: readonly CodexAppServerProtocolStep[]): string | null {
  for (const step of sequence) {
    const result = step.message.result
    if (!result || typeof result !== 'object' || Array.isArray(result)) continue
    const thread = (result as { readonly thread?: unknown }).thread
    if (!thread || typeof thread !== 'object' || Array.isArray(thread)) continue
    const id = (thread as { readonly id?: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

function terminalStatus(sequence: readonly CodexAppServerProtocolStep[]): string | null {
  for (const step of sequence) {
    if (step.message.method !== 'turn/completed') continue
    const params = step.message.params
    if (!params || typeof params !== 'object' || Array.isArray(params)) continue
    const turn = (params as { readonly turn?: unknown }).turn
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) continue
    const status = (turn as { readonly status?: unknown }).status
    if (typeof status === 'string') return status
  }
  return null
}

function mappingCaseForProtocol(sequence: readonly CodexAppServerProtocolStep[]): CodexAppServerTerminalMappingCase {
  const status = terminalStatus(sequence)
  if (status === 'completed') {
    return {
      label: 'successful app-server turn',
      caseKind: 'success',
      runStatus: 'completed',
      outcome: 'success',
      phase: 'terminal',
      reasonCode: null,
      launchedIdsRequired: true,
    }
  }
  if (status === 'failed' || status === 'interrupted') {
    return {
      label: 'failed app-server turn',
      caseKind: 'failed',
      runStatus: 'failed',
      outcome: 'failed',
      phase: 'running',
      reasonCode: 'malformed_protocol',
      launchedIdsRequired: true,
    }
  }
  return {
    label: 'app-server launch handed off',
    caseKind: 'launched',
    runStatus: 'launched',
    outcome: 'pending',
    phase: 'turn_start',
    reasonCode: null,
    launchedIdsRequired: true,
  }
}

function extractSafeAgentSummary(sequence: readonly CodexAppServerProtocolStep[]): string {
  for (const step of sequence) {
    if (step.message.method !== 'item/completed') continue
    const params = step.message.params
    if (!params || typeof params !== 'object' || Array.isArray(params)) continue
    const item = (params as { readonly item?: unknown }).item
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const text = (item as { readonly text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return text.trim().slice(0, 512)
  }
  return 'Codex app-server launch handed off with descriptor-only evidence.'
}

function subprocessFromSpawn(child: unknown, input: CodexAppServerLaunchInput): CodexAppServerSubprocessResult {
  const pid = typeof (child as { readonly pid?: unknown } | null)?.pid === 'number'
    ? (child as { readonly pid: number }).pid
    : null
  return {
    command: CODEX_APP_SERVER_COMMAND,
    cwd: input.lifecycleRoot,
    shell: false,
    pid,
    status: 'spawned',
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutLineCount: 0,
    stderrLineCount: 0,
  }
}

function binaryUnavailableSubprocess(input: CodexAppServerLaunchInput, error: unknown): CodexAppServerSubprocessResult {
  const errorLabel = isEnoent(error) ? 'ENOENT' : 'spawn_failed'
  return {
    command: CODEX_APP_SERVER_COMMAND,
    cwd: input.lifecycleRoot,
    shell: false,
    pid: null,
    status: 'binary_unavailable',
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutLineCount: 0,
    stderrLineCount: 1,
    reasonCode: 'binary_unavailable',
    errorLabel,
  }
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && (error as { readonly code?: unknown }).code === 'ENOENT'
}

function failureMappingCase(
  label: string,
  phase: CodexAppServerTerminalMappingCase['phase'],
  reasonCode: NonNullable<CodexAppServerTerminalMappingCase['reasonCode']>,
  status: CodexAppServerTerminalMappingCase['runStatus'] = 'failed',
): CodexAppServerTerminalMappingCase {
  return {
    label,
    caseKind: status === 'timeout' ? 'timeout' : 'failed',
    runStatus: status,
    outcome: 'failed',
    phase,
    reasonCode,
    launchedIdsRequired: true,
  }
}

function runEvidenceForSubprocess(
  input: CodexAppServerLaunchInput,
  subprocess: CodexAppServerSubprocessResult,
  startedAt: string,
): CodexAppServerRunEvidence | null {
  if (subprocess.status === 'timeout') {
    return buildCodexAppServerRunEvidenceFromProtocol({
      mappingCase: failureMappingCase(
        subprocess.errorLabel ?? 'manifest_timeout_expired',
        'running',
        'timeout_budget_expired',
        'timeout',
      ),
      protocolSteps: [],
      startedAt,
      completedAt: startedAt,
      failure: {
        safeDiagnosticCategory: 'timeout_budget_expired',
        relatedIds: [input.attemptId, input.claimId],
        runErrorLabel: subprocess.errorLabel ?? 'manifest_timeout_expired',
      },
    })
  }
  if (subprocess.status === 'binary_unavailable') {
    return buildCodexAppServerRunEvidenceFromProtocol({
      mappingCase: failureMappingCase(
        subprocess.errorLabel ?? 'ENOENT',
        'spawn',
        'binary_unavailable',
      ),
      protocolSteps: [],
      startedAt,
      completedAt: startedAt,
      failure: {
        safeDiagnosticCategory: 'binary_unavailable',
        relatedIds: [input.attemptId, input.claimId],
        runErrorLabel: subprocess.errorLabel ?? 'ENOENT',
      },
    })
  }
  return null
}

function terminateForSubprocessResult(child: unknown, subprocess: CodexAppServerSubprocessResult): void {
  const kill = (child as KillableSubprocess | null)?.kill
  if (!kill) return
  if (subprocess.status === 'timeout') {
    kill('SIGTERM')
  }
  if (subprocess.status === 'termination_failed') {
    kill('SIGKILL')
  }
}

function cleanupEvidence(
  runEvidence: CodexAppServerRunEvidence,
  phase: CodexAppServerCleanupEvidence['phase'],
  errorLabel: string,
): CodexAppServerCleanupEvidence {
  return {
    status: 'cleanup_failed',
    outcome: 'failed',
    phase,
    reasonCode: 'cleanup_failed',
    failure: {
      safeDiagnosticCategory: 'cleanup_failed',
      relatedIds: [runEvidence.runId],
      runErrorLabel: errorLabel,
    },
    preservedTerminalOutcome: {
      status: runEvidence.status === 'completed' ? 'completed' : runEvidence.status === 'timeout' ? 'timeout' : runEvidence.status === 'abandoned' ? 'abandoned' : 'failed',
      outcome: runEvidence.outcome === 'success' ? 'success' : runEvidence.outcome === 'abandoned' ? 'abandoned' : 'failed',
      phase: runEvidence.phase,
      reasonCode: runEvidence.reasonCode ?? null,
      attemptStatus: runEvidence.status === 'completed' ? 'succeeded' : runEvidence.status === 'abandoned' ? 'not_written' : 'failed',
      claimRelease: runEvidence.status === 'completed' ? 'launch_handoff_completed' : runEvidence.status === 'abandoned' ? 'existing_authority_wins' : 'dispatch_failed',
    },
  }
}

async function exchangeLiveProtocol(
  child: StdioSubprocess,
  input: CodexAppServerLaunchInput,
  sandboxPolicy: CodexAppServerSandboxPolicy,
  threadStartRequest: CodexAppServerWireMessage,
): Promise<LiveProtocolExchangeResult> {
  const stdin = child.stdin
  const stdout = child.stdout
  if (!stdin || !stdout) {
    const turnStartParams = buildFallbackTurnStartParams(input, sandboxPolicy)
    return {
      protocolSteps: [],
      clientMessages: [],
      turnStartParams,
      subprocess: {
        command: CODEX_APP_SERVER_COMMAND,
        cwd: input.lifecycleRoot,
        shell: false,
        pid: typeof child.pid === 'number' ? child.pid : null,
        status: 'failed',
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdoutLineCount: 0,
        stderrLineCount: 0,
        reasonCode: 'binary_unavailable',
        errorLabel: 'stdio_unavailable',
      },
      failureReasonCode: 'malformed_protocol',
      failurePhase: 'initialize',
      failureLabel: 'stdio_unavailable',
    }
  }

  const reader = createProtocolLineReader(stdout)
  const stderrCounter = createProtocolLineCounter(child.stderr)
  const startedAt = Date.now()
  const deadline = startedAt + input.timeoutMs
  const protocolSteps: CodexAppServerProtocolStep[] = []
  const clientMessages: CodexAppServerWireMessage[] = []

  const remainingMs = (): number => Math.max(1, deadline - Date.now())
  const subprocessResult = (
    status: CodexAppServerSubprocessStatus,
    reasonCode?: CodexAppServerSubprocessResult['reasonCode'],
    errorLabel?: string,
  ): CodexAppServerSubprocessResult => ({
    command: CODEX_APP_SERVER_COMMAND,
    cwd: input.lifecycleRoot,
    shell: false,
    pid: typeof child.pid === 'number' ? child.pid : null,
    status,
    exitCode: status === 'completed' ? 0 : null,
    signal: status === 'timeout' ? 'SIGTERM' : null,
    durationMs: Date.now() - startedAt,
    stdoutLineCount: reader.lineCount(),
    stderrLineCount: stderrCounter.lineCount(),
    ...(reasonCode ? { reasonCode } : {}),
    ...(errorLabel ? { errorLabel } : {}),
  })

  const send = (step: string, message: CodexAppServerWireMessage): void => {
    protocolSteps.push(clientStep(step, message))
    clientMessages.push(message)
    writeJsonLine(stdin, message)
  }

  const readServerMessage = async (): Promise<
    | { readonly ok: true; readonly step: CodexAppServerProtocolStep }
    | {
        readonly ok: false
        readonly reasonCode: LiveProtocolFailureReason | 'timeout_budget_expired'
        readonly phase: CodexAppServerTerminalMappingCase['phase']
        readonly label: string
      }
  > => {
    const next = await reader.nextLine(remainingMs())
    if ('timedOut' in next) {
      child.kill?.('SIGTERM')
      return {
        ok: false,
        reasonCode: 'timeout_budget_expired',
        phase: 'running',
        label: 'manifest_timeout_expired',
      }
    }

    const parsed = parseCodexAppServerProtocolLine(next.line)
    if (!parsed.ok) {
      return {
        ok: false,
        reasonCode: parsed.reasonCode,
        phase: parsed.phase,
        label: 'malformed_protocol_line',
      }
    }

    if (isServerRequest(parsed.message)) {
      const unsupported = classifyCodexAppServerUnsupportedRequest(parsed.message, {
        capabilityPacket: input.capabilityPacket,
      })
      if (unsupported.denyResponse) {
        writeJsonLine(stdin, unsupported.denyResponse)
      }
      const step = serverStep(parsed.message)
      protocolSteps.push(step)
      return {
        ok: false,
        reasonCode: unsupported.reasonCode,
        phase: unsupported.phase,
        label: unsupported.reasonCode,
      }
    }

    const step = serverStep(parsed.message)
    protocolSteps.push(step)
    return { ok: true, step }
  }

  const waitFor = async (
    predicate: () => boolean,
    fallbackPhase: CodexAppServerTerminalMappingCase['phase'],
  ): Promise<
    | { readonly ok: true }
    | {
        readonly ok: false
        readonly reasonCode: LiveProtocolFailureReason | 'timeout_budget_expired'
        readonly phase: CodexAppServerTerminalMappingCase['phase']
        readonly label: string
      }
  > => {
    while (!predicate()) {
      const result = await readServerMessage()
      if (!result.ok) return result
      if (Date.now() >= deadline) {
        child.kill?.('SIGTERM')
        return {
          ok: false,
          reasonCode: 'timeout_budget_expired',
          phase: fallbackPhase,
          label: 'manifest_timeout_expired',
        }
      }
    }
    return { ok: true }
  }

  send('initialize_request', initializeRequest())
  const initializeResult = await waitFor(
    () => protocolSteps.some((step) => step.step === 'initialize_response'),
    'initialize',
  )
  if (!initializeResult.ok) {
    const turnStartParams = buildFallbackTurnStartParams(input, sandboxPolicy)
    return {
      protocolSteps,
      clientMessages,
      turnStartParams,
      subprocess: subprocessResult(
        initializeResult.reasonCode === 'timeout_budget_expired' ? 'timeout' : 'failed',
        initializeResult.reasonCode === 'timeout_budget_expired' ? 'timeout_budget_expired' : undefined,
        initializeResult.label,
      ),
      ...(initializeResult.reasonCode !== 'timeout_budget_expired'
        ? { failureReasonCode: initializeResult.reasonCode, failurePhase: initializeResult.phase, failureLabel: initializeResult.label }
        : {}),
    }
  }

  send('initialized_notification', initializedNotification())
  send('thread_start_request', threadStartRequest)
  const threadResult = await waitFor(
    () => {
      const threadSession = readThreadSession(protocolSteps)
      const threadStarted = protocolSteps.some((step) => step.step === 'thread_started_notification')
      return threadSession !== null && threadStarted
    },
    'thread_start',
  )
  if (!threadResult.ok) {
    const turnStartParams = buildFallbackTurnStartParams(input, sandboxPolicy)
    return {
      protocolSteps,
      clientMessages,
      turnStartParams,
      subprocess: subprocessResult(
        threadResult.reasonCode === 'timeout_budget_expired' ? 'timeout' : 'failed',
        threadResult.reasonCode === 'timeout_budget_expired' ? 'timeout_budget_expired' : undefined,
        threadResult.label,
      ),
      ...(threadResult.reasonCode !== 'timeout_budget_expired'
        ? { failureReasonCode: threadResult.reasonCode, failurePhase: threadResult.phase, failureLabel: threadResult.label }
        : {}),
    }
  }

  const threadSession = readThreadSession(protocolSteps)
  const turnStartParams: CodexAppServerTurnStartParams = {
    threadId: threadSession?.threadId ?? input.claimRunId,
    input: buildCodexAppServerTurnInput({
      ...input,
      capabilityPacket: input.capabilityPacket,
    }),
    cwd: input.lifecycleRoot,
    approvalPolicy: 'never',
    sandboxPolicy,
    model: null,
    summary: 'concise',
  }
  send('turn_start_request', {
    method: 'turn/start',
    id: 2,
    params: turnStartParams,
  })
  const turnResult = await waitFor(
    () => {
      const hasTurnResponse = protocolSteps.some((step) => step.step === 'turn_start_response')
      const hasTurnStarted = protocolSteps.some((step) => step.step === 'turn_started_notification')
      const hasTurnCompleted = protocolSteps.some((step) => step.step === 'turn_completed_notification')
      return hasTurnResponse && hasTurnStarted && hasTurnCompleted
    },
    'turn_start',
  )
  if (!turnResult.ok) {
    return {
      protocolSteps,
      clientMessages,
      turnStartParams,
      subprocess: subprocessResult(
        turnResult.reasonCode === 'timeout_budget_expired' ? 'timeout' : 'failed',
        turnResult.reasonCode === 'timeout_budget_expired' ? 'timeout_budget_expired' : undefined,
        turnResult.label,
      ),
      ...(turnResult.reasonCode !== 'timeout_budget_expired'
        ? { failureReasonCode: turnResult.reasonCode, failurePhase: turnResult.phase, failureLabel: turnResult.label }
        : {}),
    }
  }

  stdin.end?.()
  return {
    protocolSteps,
    clientMessages,
    turnStartParams,
    subprocess: subprocessResult('completed'),
  }
}

function buildFallbackTurnStartParams(
  input: CodexAppServerLaunchInput,
  sandboxPolicy: CodexAppServerSandboxPolicy,
): CodexAppServerTurnStartParams {
  return {
    threadId: input.claimRunId,
    input: buildCodexAppServerTurnInput({
      ...input,
      capabilityPacket: input.capabilityPacket,
    }),
    cwd: input.lifecycleRoot,
    approvalPolicy: 'never',
    sandboxPolicy,
    model: null,
    summary: 'concise',
  }
}

export async function launchCodexAppServerAttempt(
  input: CodexAppServerLaunchInput,
  deps: CodexAppServerRunnerDeps,
): Promise<CodexAppServerLaunchResult> {
  const launchKey = `${input.claimRunId}:${input.attemptId}`
  if (activeLaunches.has(launchKey)) {
    throw new Error('codex_app_server_duplicate_launch')
  }

  activeLaunches.add(launchKey)
  try {
    let child: unknown
    let spawnError: unknown = null
    try {
      child = await Promise.resolve(deps.spawn(CODEX_APP_SERVER_COMMAND[0], CODEX_APP_SERVER_COMMAND.slice(1), {
        cwd: input.lifecycleRoot,
        shell: false,
        stdio: 'pipe',
      }))
    } catch (error) {
      if (!isEnoent(error)) throw error
      spawnError = error
      child = null
    }
    const subprocess = child === null
      ? binaryUnavailableSubprocess(input, spawnError)
      : deps.subprocessResult ?? subprocessFromSpawn(child, input)
    terminateForSubprocessResult(child, subprocess)

    const sandboxPolicy = buildSandboxPolicy(input.lifecycleRoot)
    const threadStartParams: CodexAppServerThreadStartParams = {
      model: null,
      cwd: input.lifecycleRoot,
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandbox: 'workspace-write',
      runtimeWorkspaceRoots: [input.lifecycleRoot],
      permissions: null,
      serviceName: 'paddock_spec_014c',
    }
    const threadStartRequest: CodexAppServerWireMessage = {
      method: 'thread/start',
      id: 1,
      params: threadStartParams,
    }
    const liveProtocol = child !== null && deps.protocolSequence.length === 0
      ? await exchangeLiveProtocol(child as StdioSubprocess, input, sandboxPolicy, threadStartRequest)
      : null
    const protocolSequence = liveProtocol?.protocolSteps ?? deps.protocolSequence
    const clientMessages = liveProtocol?.clientMessages
    const observedSubprocess = liveProtocol?.subprocess ?? subprocess
    const turnStartParams: CodexAppServerTurnStartParams = liveProtocol?.turnStartParams ?? {
      threadId: extractThreadId(protocolSequence) ?? input.claimRunId,
      input: buildCodexAppServerTurnInput({
        ...input,
        capabilityPacket: input.capabilityPacket,
      }),
      cwd: input.lifecycleRoot,
      approvalPolicy: 'never',
      sandboxPolicy,
      model: null,
      summary: 'concise',
    }
    const turnStartRequest: CodexAppServerWireMessage = {
      method: 'turn/start',
      id: 2,
      params: turnStartParams,
    }

    const evidenceStartedAt = deps.now()
    const liveFailureMapping = liveProtocol?.failureReasonCode
      ? failureMappingCase(
          liveProtocol.failureLabel ?? liveProtocol.failureReasonCode,
          liveProtocol.failurePhase ?? 'running',
          liveProtocol.failureReasonCode,
        )
      : null
    const initialEvidence = buildCodexAppServerRunEvidenceFromProtocol({
      mappingCase: liveFailureMapping ?? mappingCaseForProtocol(protocolSequence),
      protocolSteps: protocolSequence,
      startedAt: evidenceStartedAt,
      completedAt: evidenceStartedAt,
    })
    const artifactSafety = buildCodexAppServerEvidenceArtifacts({
      runEvidence: initialEvidence,
      output: {
        safeSummary: extractSafeAgentSummary(protocolSequence),
      },
      artifactPolicy: {
        allowArtifactPublication: true,
        allowSecretRedaction: true,
        maxSafeSummaryChars: 512,
        maxArtifacts: 4,
      },
      now: deps.now,
    })
    const artifactRefs = artifactSafety.accepted && artifactSafety.safeSummary
      ? [
          buildCodexAppServerSafeArtifactRef({
            safeSummary: artifactSafety.safeSummary,
            producedAt: evidenceStartedAt,
            redactionApplied: artifactSafety.safety.redactionApplied,
          }),
        ]
      : []
    const subprocessEvidence = runEvidenceForSubprocess(input, observedSubprocess, evidenceStartedAt)
    const runEvidence = subprocessEvidence ?? {
      ...initialEvidence,
      artifactRefs,
      safety: artifactSafety.safety,
      ...(artifactSafety.accepted
        ? {}
        : {
            status: 'failed' as const,
            outcome: 'failed' as const,
            phase: 'artifact_safety' as const,
            reasonCode: 'unsafe_evidence_rejected' as const,
            failure: {
              safeDiagnosticCategory: artifactSafety.safeDiagnosticCategory ?? 'unsafe_evidence_rejected',
              relatedIds: [initialEvidence.runId],
              rejectedFieldPaths: artifactSafety.rejectedFieldPaths,
            },
          }),
    }

    const subprocessCleanupEvidence = observedSubprocess.status === 'termination_failed'
      ? cleanupEvidence(runEvidence, 'subprocess_termination', observedSubprocess.errorLabel ?? 'subprocess_termination_failed')
      : undefined
    const lifecycleCleanup = deps.cleanupLifecycle?.()
    const lifecycleCleanupEvidence = lifecycleCleanup?.status === 'cleanup_failed'
      ? cleanupEvidence(runEvidence, lifecycleCleanup.phase, lifecycleCleanup.errorLabel)
      : undefined

    const baseResult = {
      subprocessCount: 1,
      protocolSteps: (liveProtocol ? protocolSequence.slice(0, 12) : protocolSequence.slice(0, 9)),
      clientMessages: clientMessages ?? [
        initializeRequest(),
        initializedNotification(),
        threadStartRequest,
        turnStartRequest,
      ],
      threadStartParams,
      turnStartParams,
      runEvidence,
      activityPayload: buildCodexAppServerActivityPayload(runEvidence),
      artifactSafety,
      subprocess: observedSubprocess,
    }
    const finalCleanupEvidence = subprocessCleanupEvidence ?? lifecycleCleanupEvidence
    return finalCleanupEvidence
      ? { ...baseResult, cleanupEvidence: finalCleanupEvidence }
      : baseResult
  } finally {
    activeLaunches.delete(launchKey)
  }
}
