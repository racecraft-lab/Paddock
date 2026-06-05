import { describe, expect, it } from 'vitest'
import {
  CODEX_APP_SERVER_FIXTURE_IDS,
  CODEX_APP_SERVER_UNSUPPORTED_REQUEST_FIXTURES,
  buildCodexAppServerInitializeResponse,
  buildCodexAppServerLaunchInput,
  buildCodexAppServerProtocolSequence,
  buildCodexAppServerThreadStartResponse,
  buildCodexAppServerTurnStartResponse,
  type CodexAppServerAttemptFailureReasonCode,
  type CodexAppServerJsonValue,
  type CodexAppServerProtocolStep,
  type CodexAppServerRunPhase,
  type CodexAppServerTurnStatus,
  type CodexAppServerUnsupportedRequestFixture,
  type CodexAppServerUnsupportedRequestMethod,
  type CodexAppServerWireMessage,
  type CodexAppServerWireRequest,
  type CodexAppServerWireResponse,
} from './codex-app-server-fixtures'

type CodexAppServerMalformedReason = Extract<
  CodexAppServerAttemptFailureReasonCode,
  'malformed_protocol'
>

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
  readonly terminalStatus: Exclude<CodexAppServerTurnStatus, 'inProgress'>
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

type CodexAppServerProtocolSessionResult =
  | CodexAppServerProtocolSuccess
  | CodexAppServerProtocolFailure

type CodexAppServerProtocolParseResult =
  | { readonly ok: true; readonly message: CodexAppServerWireMessage }
  | CodexAppServerProtocolFailure

interface CodexAppServerProtocolModule {
  readonly parseCodexAppServerProtocolLine?: (
    line: string,
  ) => CodexAppServerProtocolParseResult
  readonly evaluateCodexAppServerProtocolSession?: (
    steps: readonly CodexAppServerProtocolStep[],
    options?: { readonly subprocessExitedBeforeHandshake?: boolean },
  ) => CodexAppServerProtocolSessionResult
  readonly classifyCodexAppServerUnsupportedRequest?: (
    message: CodexAppServerWireRequest<CodexAppServerUnsupportedRequestMethod>,
    options: {
      readonly capabilityPacket: ReturnType<
        typeof buildCodexAppServerLaunchInput
      >['capabilityPacket']
    },
  ) => CodexAppServerProtocolFailure
  readonly __loadError?: unknown
}

const PROTOCOL_MODULE_PATH = '../codex-app-server/protocol.ts'
const protocolModuleLoaders = import.meta.glob<CodexAppServerProtocolModule>(
  '../codex-app-server/protocol.ts',
)

async function loadProtocolModule(): Promise<CodexAppServerProtocolModule> {
  const loadModule = protocolModuleLoaders[PROTOCOL_MODULE_PATH]
  if (!loadModule) {
    return {
      __loadError: new Error(
        'src/lib/harness-adapters/codex-app-server/protocol.ts is not implemented yet',
      ),
    }
  }

  try {
    return await loadModule()
  } catch (error) {
    return { __loadError: error }
  }
}

async function protocolFunction<
  TName extends keyof Pick<
    CodexAppServerProtocolModule,
    | 'parseCodexAppServerProtocolLine'
    | 'evaluateCodexAppServerProtocolSession'
    | 'classifyCodexAppServerUnsupportedRequest'
  >,
>(name: TName): Promise<NonNullable<CodexAppServerProtocolModule[TName]>> {
  const protocolModule = await loadProtocolModule()

  expect(protocolModule.__loadError).toBeUndefined()
  const candidate = protocolModule[name]
  expect(candidate).toEqual(expect.any(Function))
  if (typeof candidate !== 'function') {
    throw new Error(`Missing Codex app-server protocol export: ${name}`)
  }

  return candidate as NonNullable<CodexAppServerProtocolModule[TName]>
}

const validProtocolSequence = (): readonly CodexAppServerProtocolStep[] =>
  buildCodexAppServerProtocolSequence()

const replaceStepMessage = (
  steps: readonly CodexAppServerProtocolStep[],
  stepName: CodexAppServerProtocolStep['step'],
  message: CodexAppServerWireMessage,
): readonly CodexAppServerProtocolStep[] =>
  steps.map((step) =>
    step.step === stepName
      ? {
          ...step,
          message,
        }
      : step,
  )

const stepByName = (
  steps: readonly CodexAppServerProtocolStep[],
  stepName: CodexAppServerProtocolStep['step'],
): CodexAppServerProtocolStep => {
  const match = steps.find((step) => step.step === stepName)
  if (!match) throw new Error(`Missing fixture protocol step: ${stepName}`)
  return match
}

const insertAfter = (
  steps: readonly CodexAppServerProtocolStep[],
  afterStepName: CodexAppServerProtocolStep['step'],
  insertedStep: CodexAppServerProtocolStep,
): readonly CodexAppServerProtocolStep[] => {
  const index = steps.findIndex((step) => step.step === afterStepName)
  if (index === -1) {
    throw new Error(`Missing fixture protocol step: ${afterStepName}`)
  }

  return [...steps.slice(0, index + 1), insertedStep, ...steps.slice(index + 1)]
}

const missingThreadIdResponse = (): CodexAppServerWireResponse => {
  const response = buildCodexAppServerThreadStartResponse()
  return {
    ...response,
    result: {
      thread: {
        ...response.result.thread,
        id: '',
      },
    },
  }
}

const missingTurnIdResponse = (): CodexAppServerWireResponse => {
  const response = buildCodexAppServerTurnStartResponse()
  return {
    ...response,
    result: {
      turn: {
        ...response.result.turn,
        id: '',
      },
    },
  }
}

const impossibleOrderingSequence = (): readonly CodexAppServerProtocolStep[] => {
  const steps = validProtocolSequence()
  const terminalStep = stepByName(steps, 'turn_completed_notification')
  const withoutTerminal = steps.filter(
    (step) => step.step !== 'turn_completed_notification',
  )
  const turnStartedIndex = withoutTerminal.findIndex(
    (step) => step.step === 'turn_started_notification',
  )

  return [
    ...withoutTerminal.slice(0, turnStartedIndex),
    terminalStep,
    ...withoutTerminal.slice(turnStartedIndex),
  ]
}

const unknownOptionalNotificationStep: CodexAppServerProtocolStep = {
  step: 'unknown_optional_notification' as CodexAppServerProtocolStep['step'],
  direction: 'server_to_client',
  evidenceOnly: true,
  message: {
    method: 'session/telemetry',
    params: {
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      rawOptionalPayload: 'must be counted but never retained',
    },
  } as CodexAppServerWireMessage,
}

const malformedSessionCases: readonly {
  readonly label: string
  readonly steps: readonly CodexAppServerProtocolStep[]
  readonly options?: { readonly subprocessExitedBeforeHandshake?: boolean }
}[] = [
  {
    label: 'response id mismatch',
    steps: replaceStepMessage(
      validProtocolSequence(),
      'thread_start_response',
      buildCodexAppServerThreadStartResponse({ id: 404 }),
    ),
  },
  {
    label: 'duplicate response',
    steps: insertAfter(
      validProtocolSequence(),
      'initialize_response',
      {
        ...stepByName(validProtocolSequence(), 'initialize_response'),
        message: buildCodexAppServerInitializeResponse(),
      },
    ),
  },
  {
    label: 'missing thread id',
    steps: replaceStepMessage(
      validProtocolSequence(),
      'thread_start_response',
      missingThreadIdResponse(),
    ),
  },
  {
    label: 'missing turn id',
    steps: replaceStepMessage(
      validProtocolSequence(),
      'turn_start_response',
      missingTurnIdResponse(),
    ),
  },
  {
    label: 'duplicate lifecycle event',
    steps: insertAfter(
      validProtocolSequence(),
      'turn_started_notification',
      stepByName(validProtocolSequence(), 'turn_started_notification'),
    ),
  },
  {
    label: 'duplicate terminal event',
    steps: insertAfter(
      validProtocolSequence(),
      'turn_completed_notification',
      stepByName(validProtocolSequence(), 'turn_completed_notification'),
    ),
  },
  {
    label: 'impossible ordering',
    steps: impossibleOrderingSequence(),
  },
  {
    label: 'exit before handshake',
    steps: validProtocolSequence().slice(0, 1),
    options: { subprocessExitedBeforeHandshake: true },
  },
]

const requestFixture = (
  label: string,
  method: CodexAppServerUnsupportedRequestMethod,
  expectedReasonCode: CodexAppServerUnsupportedRequestFixture['expectedReasonCode'],
  params: CodexAppServerJsonValue,
  id: number,
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

const additionalUnsupportedRequestFixtures = [
  requestFixture(
    'non-approval MCP elicitation',
    'item/tool/requestUserInput',
    'user_input_unsupported',
    {
      requestId: 'request_mcp_elicitation_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      mcp: {
        server: 'fixture-mcp',
        elicitationId: 'elicit_001',
      },
      prompt: 'Collect external MCP input',
    },
    107,
  ),
  requestFixture(
    'permission escalation request',
    'item/commandExecution/requestApproval',
    'approval_unsupported',
    {
      itemId: 'item_permission_escalation_001',
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      turnId: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
      approvalKind: 'permission_escalation',
      permission: 'network_access',
      reason: 'network access would leave the admitted sandbox posture',
      availableDecisions: ['accept', 'decline', 'cancel'],
    },
    108,
  ),
] as const satisfies readonly CodexAppServerUnsupportedRequestFixture[]

const unsupportedRequestCases = [
  ...CODEX_APP_SERVER_UNSUPPORTED_REQUEST_FIXTURES,
  ...additionalUnsupportedRequestFixtures,
] as const

describe('SPEC-014C Codex app-server protocol state machine', () => {
  it('rejects invalid JSONL and invalid JSON-RPC message shapes as malformed protocol', async () => {
    const parseLine = await protocolFunction('parseCodexAppServerProtocolLine')

    const invalidLines = [
      '{"method":"turn/completed","params":',
      JSON.stringify({ id: 12 }),
    ] as const

    for (const line of invalidLines) {
      const result = parseLine(line)
      expect(result).toMatchObject({
        ok: false,
        reasonCode: 'malformed_protocol' satisfies CodexAppServerMalformedReason,
        shouldTerminateSubprocess: true,
      })
    }
  })

  it.each(malformedSessionCases)(
    'maps $label to malformed_protocol without retaining raw protocol payloads',
    async ({ steps, options }) => {
      const evaluateSession = await protocolFunction(
        'evaluateCodexAppServerProtocolSession',
      )

      const result = evaluateSession(steps, options)

      expect(result).toMatchObject({
        ok: false,
        reasonCode: 'malformed_protocol' satisfies CodexAppServerMalformedReason,
        shouldTerminateSubprocess: true,
      })
      expect(JSON.stringify(result)).not.toContain(
        'Descriptor-only fixture summary',
      )
      expect(JSON.stringify(result)).not.toContain('rawOptionalPayload')
    },
  )

  it('counts unknown optional notifications without corrupting the required lifecycle flow', async () => {
    const evaluateSession = await protocolFunction(
      'evaluateCodexAppServerProtocolSession',
    )

    const result = evaluateSession(
      insertAfter(
        validProtocolSequence(),
        'turn_started_notification',
        unknownOptionalNotificationStep,
      ),
    )

    expect(result).toMatchObject({
      ok: true,
      handshakeCompleted: true,
      threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
      threadSessionId: CODEX_APP_SERVER_FIXTURE_IDS.threadSessionId,
      turnIds: [CODEX_APP_SERVER_FIXTURE_IDS.turnId],
      terminalStatus: 'completed',
      notificationsSeen: {
        threadStarted: 1,
        turnStarted: 1,
        turnCompleted: 1,
        unknownOptional: 1,
      },
      responsesSeen: {
        initialize: 1,
        threadStart: 1,
        turnStart: 1,
      },
      evidenceOnlyCounts: {
        tokenUsage: 1,
        agentMessage: 1,
      },
    })
    expect(JSON.stringify(result)).not.toContain('rawOptionalPayload')
  })
})

describe('SPEC-014C Codex app-server unsupported request mapping', () => {
  it.each(unsupportedRequestCases)(
    'maps $label to $expectedReasonCode and emits only a cancel response plus bounded diagnostics',
    async (fixture) => {
      const classifyRequest = await protocolFunction(
        'classifyCodexAppServerUnsupportedRequest',
      )
      const result = classifyRequest(fixture.message, {
        capabilityPacket: buildCodexAppServerLaunchInput().capabilityPacket,
      })

      expect(result).toMatchObject({
        ok: false,
        reasonCode: fixture.expectedReasonCode,
        phase: 'running',
        shouldTerminateSubprocess: true,
        denyResponse: fixture.expectedDenyResponse,
      })
      expect(JSON.stringify(result)).not.toContain(
        JSON.stringify(fixture.message.params),
      )
      expect(JSON.stringify(result)).not.toContain(
        CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot,
      )
    },
  )
})
