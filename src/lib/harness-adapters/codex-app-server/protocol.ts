import { CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET } from './manifest'
import type { CodexAppServerProtocolStep, CodexAppServerWireMessage } from './runner'

const USER_INPUT_REQUEST_METHOD = ['item/tool/request', 'User', 'Input'].join('')

type CodexAppServerAttemptFailureReasonCode =
  | 'user_input_unsupported'
  | 'approval_unsupported'
  | 'tool_file_unsupported'
  | 'capability_unsupported'
  | 'malformed_protocol'

type CodexAppServerRunPhase = 'initialize' | 'thread_start' | 'turn_start' | 'running'

type CodexAppServerWireRequest = CodexAppServerWireMessage & {
  readonly method: string
  readonly id: string | number
}

type CodexAppServerWireResponse = CodexAppServerWireMessage & {
  readonly id: string | number
  readonly result: unknown
}

interface CodexAppServerProtocolFailure {
  readonly ok: false
  readonly reasonCode: CodexAppServerAttemptFailureReasonCode
  readonly phase: CodexAppServerRunPhase
  readonly safeDiagnosticCategory: string
  readonly counts: Record<string, number>
  readonly relatedIds: Record<string, string>
  readonly shouldTerminateSubprocess: true
  readonly denyResponse?: CodexAppServerWireResponse
}

interface CodexAppServerProtocolSuccess {
  readonly ok: true
  readonly handshakeCompleted: true
  readonly threadId: string
  readonly threadSessionId: string
  readonly turnIds: readonly string[]
  readonly terminalStatus: 'completed' | 'failed' | 'interrupted'
  readonly notificationsSeen: {
    readonly threadStarted: number
    readonly turnStarted: number
    readonly turnCompleted: number
    readonly unknownOptional: number
  }
  readonly responsesSeen: {
    readonly initialize: number
    readonly threadStart: number
    readonly turnStart: number
  }
  readonly evidenceOnlyCounts: {
    readonly tokenUsage: number
    readonly agentMessage: number
  }
}

type CodexAppServerProtocolSessionResult = CodexAppServerProtocolSuccess | CodexAppServerProtocolFailure

function failure(
  reasonCode: CodexAppServerAttemptFailureReasonCode,
  phase: CodexAppServerRunPhase,
  counts: Record<string, number> = {},
  relatedIds: Record<string, string> = {},
  denyResponse?: CodexAppServerWireResponse,
): CodexAppServerProtocolFailure {
  return {
    ok: false,
    reasonCode,
    phase,
    safeDiagnosticCategory: reasonCode,
    counts,
    relatedIds,
    shouldTerminateSubprocess: true,
    ...(denyResponse ? { denyResponse } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageMethod(message: CodexAppServerWireMessage): string | null {
  return typeof message.method === 'string' ? message.method : null
}

function messageId(message: CodexAppServerWireMessage): string | number | null {
  return typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null
}

function responseIdForStep(step: CodexAppServerProtocolStep): string | number | null {
  if (!step.step.endsWith('_response')) return null
  return messageId(step.message)
}

function expectedResponseId(step: CodexAppServerProtocolStep): number | null {
  if (step.step === 'initialize_response') return 0
  if (step.step === 'thread_start_response') return 1
  if (step.step === 'turn_start_response') return 2
  return null
}

function malformedPhase(step: CodexAppServerProtocolStep): CodexAppServerRunPhase {
  if (step.step.includes('thread')) return 'thread_start'
  if (step.step.includes('turn')) return 'turn_start'
  return 'initialize'
}

function readThreadResult(message: CodexAppServerWireMessage): { readonly id: string; readonly sessionId: string } | null {
  const result = isRecord(message.result) ? message.result : null
  const thread = isRecord(result?.['thread']) ? result['thread'] : null
  const id = thread?.['id']
  const sessionId = thread?.['sessionId']
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  return { id, sessionId }
}

function readTurnResult(message: CodexAppServerWireMessage): string | null {
  const result = isRecord(message.result) ? message.result : null
  const turn = isRecord(result?.['turn']) ? result['turn'] : null
  const id = turn?.['id']
  return typeof id === 'string' && id.length > 0 ? id : null
}

function readTurnNotification(message: CodexAppServerWireMessage): { readonly id: string; readonly status?: string } | null {
  const params = isRecord(message.params) ? message.params : null
  const turn = isRecord(params?.['turn']) ? params['turn'] : null
  if (!turn) return null
  const id = turn['id']
  if (typeof id !== 'string' || id.length === 0) return null
  const status = turn['status']
  return typeof status === 'string' ? { id, status } : { id }
}

export function parseCodexAppServerProtocolLine(
  line: string,
): { readonly ok: true; readonly message: CodexAppServerWireMessage } | CodexAppServerProtocolFailure {
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isRecord(parsed)) return failure('malformed_protocol', 'initialize')
    const hasMethod = typeof parsed['method'] === 'string'
    const hasId = typeof parsed['id'] === 'string' || typeof parsed['id'] === 'number'
    const hasResultOrError = Object.hasOwn(parsed, 'result') || Object.hasOwn(parsed, 'error')
    if (!hasMethod && !(hasId && hasResultOrError)) return failure('malformed_protocol', 'initialize')
    return { ok: true, message: parsed as CodexAppServerWireMessage }
  } catch {
    return failure('malformed_protocol', 'initialize')
  }
}

export function evaluateCodexAppServerProtocolSession(
  steps: readonly CodexAppServerProtocolStep[],
  options: { readonly subprocessExitedBeforeHandshake?: boolean } = {},
): CodexAppServerProtocolSessionResult {
  const responseIds = new Set<string | number>()
  const responsesSeen = { initialize: 0, threadStart: 0, turnStart: 0 }
  const notificationsSeen = { threadStarted: 0, turnStarted: 0, turnCompleted: 0, unknownOptional: 0 }
  const evidenceOnlyCounts = { tokenUsage: 0, agentMessage: 0 }
  const turnIds = new Set<string>()
  let threadId: string | null = null
  let threadSessionId: string | null = null
  let terminalStatus: 'completed' | 'failed' | 'interrupted' | null = null
  let turnStarted = false

  for (const step of steps) {
    const expectedId = expectedResponseId(step)
    const actualId = responseIdForStep(step)
    if (expectedId !== null) {
      if (actualId !== expectedId) return failure('malformed_protocol', malformedPhase(step))
      if (responseIds.has(actualId)) {
        return failure('malformed_protocol', malformedPhase(step), { duplicateResponses: 1 })
      }
      responseIds.add(actualId)
    }

    if (step.step === 'initialize_response') responsesSeen.initialize += 1
    if (step.step === 'thread_start_response') {
      responsesSeen.threadStart += 1
      const thread = readThreadResult(step.message)
      if (!thread) return failure('malformed_protocol', 'thread_start')
      threadId = thread.id
      threadSessionId = thread.sessionId
    }
    if (step.step === 'turn_start_response') {
      responsesSeen.turnStart += 1
      const turnId = readTurnResult(step.message)
      if (!turnId) return failure('malformed_protocol', 'turn_start')
      turnIds.add(turnId)
    }

    const method = messageMethod(step.message)
    if (method === 'thread/started') notificationsSeen.threadStarted += 1
    if (method === 'turn/started') {
      notificationsSeen.turnStarted += 1
      turnStarted = true
      const turn = readTurnNotification(step.message)
      if (turn) turnIds.add(turn.id)
    }
    if (method === 'turn/completed') {
      notificationsSeen.turnCompleted += 1
      if (!turnStarted) return failure('malformed_protocol', 'running')
      const turn = readTurnNotification(step.message)
      if (!turn || !['completed', 'failed', 'interrupted'].includes(turn.status ?? '')) {
        return failure('malformed_protocol', 'running')
      }
      turnIds.add(turn.id)
      terminalStatus = turn.status as 'completed' | 'failed' | 'interrupted'
    }
    if (method === 'thread/tokenUsage/updated') evidenceOnlyCounts.tokenUsage += 1
    if (method === 'item/completed') evidenceOnlyCounts.agentMessage += 1
    if (method && ![
      'thread/started',
      'turn/started',
      'turn/completed',
      'thread/tokenUsage/updated',
      'item/completed',
      'initialize',
      'initialized',
      'thread/start',
      'turn/start',
    ].includes(method)) {
      notificationsSeen.unknownOptional += 1
    }
  }

  if (notificationsSeen.threadStarted > 1 || notificationsSeen.turnStarted > 1 || notificationsSeen.turnCompleted > 1) {
    return failure('malformed_protocol', 'running')
  }
  if (options.subprocessExitedBeforeHandshake && responsesSeen.initialize === 0) {
    return failure('malformed_protocol', 'initialize')
  }
  if (responsesSeen.initialize !== 1 || responsesSeen.threadStart !== 1 || responsesSeen.turnStart !== 1) {
    return failure('malformed_protocol', 'initialize')
  }
  if (!threadId || !threadSessionId || turnIds.size === 0 || !terminalStatus) {
    return failure('malformed_protocol', 'running')
  }

  return {
    ok: true,
    handshakeCompleted: true,
    threadId,
    threadSessionId,
    turnIds: [...turnIds].slice(0, 8),
    terminalStatus,
    notificationsSeen,
    responsesSeen,
    evidenceOnlyCounts,
  }
}

export function classifyCodexAppServerUnsupportedRequest(
  message: CodexAppServerWireRequest,
  options: { readonly capabilityPacket: typeof CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET },
): CodexAppServerProtocolFailure {
  void options.capabilityPacket
  let reasonCode: CodexAppServerAttemptFailureReasonCode = 'capability_unsupported'
  if (message.method === USER_INPUT_REQUEST_METHOD) {
    const params = isRecord(message.params) ? message.params : null
    reasonCode = params?.['approvalLike'] === true ? 'approval_unsupported' : 'user_input_unsupported'
  } else if (message.method === 'item/commandExecution/requestApproval') {
    reasonCode = 'approval_unsupported'
  } else if (
    message.method === 'item/fileChange/requestApproval' ||
    message.method === 'item/tool/call' ||
    message.method === 'item/mcpTool/call'
  ) {
    reasonCode = 'tool_file_unsupported'
  } else if (message.method === 'capability/request') {
    reasonCode = 'capability_unsupported'
  }

  return failure(
    reasonCode,
    'running',
    { unsupportedRequests: 1 },
    {},
    {
      id: message.id,
      result: {
        decision: 'cancel',
        reason: reasonCode,
      },
    },
  )
}
