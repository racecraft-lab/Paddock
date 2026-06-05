import { describe, expect, it } from 'vitest'
import {
  CODEX_APP_SERVER_ADAPTER_ID,
  CODEX_APP_SERVER_FIXTURE_IDS,
  CODEX_APP_SERVER_FIXED_COMPLETED_AT,
  CODEX_APP_SERVER_FIXED_NOW,
  CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
  CODEX_APP_SERVER_SAFE_SHA256,
  CODEX_APP_SERVER_SUCCESS_TERMINAL_MAPPING_CASE,
  CODEX_APP_SERVER_TERMINAL_MAPPING_BY_REASON,
  CODEX_APP_SERVER_TOKEN_USAGE,
  CODEX_APP_SERVER_UNSAFE_OUTPUT_SAMPLES,
  buildCodexAppServerProtocolSequence,
  buildCodexAppServerRunEvidence,
  buildCodexAppServerSafeArtifactRef,
  type CodexAppServerProtocolStep,
  type CodexAppServerReasonCode,
  type CodexAppServerRunEvidenceFixture,
  type CodexAppServerTerminalMappingCase,
  type CodexAppServerWireMessage,
} from './codex-app-server-fixtures'

type CodexAppServerUsageSummary = CodexAppServerRunEvidenceFixture['usage']

interface CodexAppServerActivityPayload {
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

interface CodexAppServerEvidenceModule {
  readonly buildCodexAppServerRunEvidence?: (
    mappingCase?: CodexAppServerTerminalMappingCase,
    overrides?: Partial<CodexAppServerRunEvidenceFixture>,
  ) => CodexAppServerRunEvidenceFixture
  readonly summarizeCodexAppServerUsage?: (
    protocolSteps: readonly CodexAppServerProtocolStep[],
  ) => CodexAppServerUsageSummary
  readonly buildCodexAppServerActivityPayload?: (
    evidence: CodexAppServerRunEvidenceFixture,
    options?: { readonly activityType?: string; readonly createdAt?: string },
  ) => CodexAppServerActivityPayload
  readonly __loadError?: unknown
}

const EVIDENCE_MODULE_PATH = '../codex-app-server/evidence.ts'
const evidenceModuleLoaders = import.meta.glob<CodexAppServerEvidenceModule>(
  '../codex-app-server/evidence.ts',
)

const descriptorOnlySafety = {
  rawTranscriptRetained: false,
  rawProtocolRetained: false,
  providerPayloadRetained: false,
  toolPayloadRetained: false,
  promptBodyRetained: false,
  hostPathRetained: false,
  secretRetained: false,
} as const

const ACTIVITY_PAYLOAD_KEYS = [
  'activityType',
  'entityType',
  'entityId',
  'workspaceId',
  'runId',
  'attemptId',
  'claimId',
  'claimRunId',
  'manifestId',
  'lifecycleId',
  'artifactIds',
  'phase',
  'reasonCode',
  'status',
  'outcome',
  'safeDiagnosticCategory',
  'counts',
  'safeHash',
  'safeSize',
  'createdAt',
] as const

const FORBIDDEN_ACTIVITY_MARKERS = [
  'rawTranscript',
  'rawProtocol',
  'protocolPayload',
  'promptBody',
  'providerPayload',
  'toolPayload',
  'mcpPayload',
  'command',
  'fileChange',
  'reasoning',
  'storageUri',
  'originalFilename',
  '/Users/',
  '/var/',
  'https://',
  'Bearer ',
] as const

async function loadEvidenceModule(): Promise<CodexAppServerEvidenceModule> {
  const loadModule = evidenceModuleLoaders[EVIDENCE_MODULE_PATH]
  if (!loadModule) {
    return {
      __loadError: new Error(
        'src/lib/harness-adapters/codex-app-server/evidence.ts is not implemented yet',
      ),
    }
  }

  try {
    return await loadModule()
  } catch (error) {
    return { __loadError: error }
  }
}

async function evidenceFunction<
  TName extends keyof Pick<
    CodexAppServerEvidenceModule,
    | 'buildCodexAppServerRunEvidence'
    | 'summarizeCodexAppServerUsage'
    | 'buildCodexAppServerActivityPayload'
  >,
>(name: TName): Promise<NonNullable<CodexAppServerEvidenceModule[TName]>> {
  const evidenceModule = await loadEvidenceModule()

  expect(evidenceModule.__loadError).toBeUndefined()
  const candidate = evidenceModule[name]
  expect(candidate).toEqual(expect.any(Function))
  if (typeof candidate !== 'function') {
    throw new Error(`Missing Codex app-server evidence export: ${name}`)
  }

  return candidate as NonNullable<CodexAppServerEvidenceModule[TName]>
}

function terminalMappingFor(reasonCode: CodexAppServerReasonCode): CodexAppServerTerminalMappingCase {
  const mapping = CODEX_APP_SERVER_TERMINAL_MAPPING_BY_REASON[reasonCode]
  expect(mapping).toBeDefined()
  if (!mapping) throw new Error(`Missing terminal mapping fixture for ${reasonCode}`)
  return mapping
}

function withFinalTurnUsage(
  protocolSteps: readonly CodexAppServerProtocolStep[],
  usage: { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number },
): readonly CodexAppServerProtocolStep[] {
  return protocolSteps.map((step) => {
    if (step.step !== 'turn_completed_notification') return step

    const message: CodexAppServerWireMessage = {
      method: 'turn/completed',
      params: {
        turn: {
          id: CODEX_APP_SERVER_FIXTURE_IDS.turnId,
          status: 'completed',
          items: [],
          error: null,
          usage,
        },
      },
    }

    return {
      ...step,
      message,
    }
  })
}

function withPartialTokenUsage(
  protocolSteps: readonly CodexAppServerProtocolStep[],
): readonly CodexAppServerProtocolStep[] {
  return protocolSteps.map((step) => {
    if (step.step !== 'token_usage_notification') return step

    const message: CodexAppServerWireMessage = {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
        usage: {
          inputTokens: 77,
        },
      },
    }

    return {
      ...step,
      message,
    }
  })
}

function expectDescriptorSafety(evidence: CodexAppServerRunEvidenceFixture): void {
  expect(evidence.safety).toMatchObject(descriptorOnlySafety)
  expect(evidence.safety.redactionApplied).toEqual(expect.any(Boolean))
}

describe('SPEC-014C Codex app-server run evidence schema', () => {
  it('builds completed codex_app_server_run.v1 evidence with status, usage, safety, protocol ids, and artifact refs', async () => {
    const buildRunEvidence = await evidenceFunction('buildCodexAppServerRunEvidence')
    const artifactRef = buildCodexAppServerSafeArtifactRef({
      byteSize: 768,
      itemCount: 2,
      safeSummary: 'Descriptor-only successful adapter output.',
      safeLabel: 'codex-app-server-success',
    })

    const evidence = buildRunEvidence(CODEX_APP_SERVER_SUCCESS_TERMINAL_MAPPING_CASE, {
      artifactRefs: [artifactRef],
    })

    expect(Object.keys(evidence).sort()).toEqual([
      'adapterId',
      'artifactRefs',
      'attemptId',
      'claimId',
      'claimRunId',
      'lifecycleId',
      'manifestId',
      'outcome',
      'phase',
      'protocol',
      'runId',
      'safety',
      'schemaVersion',
      'stageKey',
      'status',
      'taskId',
      'timestamps',
      'usage',
      'workspaceId',
    ].sort())
    expect(evidence).toMatchObject({
      schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
      taskId: CODEX_APP_SERVER_FIXTURE_IDS.taskId,
      stageKey: CODEX_APP_SERVER_FIXTURE_IDS.stageKey,
      attemptId: CODEX_APP_SERVER_FIXTURE_IDS.attemptId,
      claimId: CODEX_APP_SERVER_FIXTURE_IDS.claimId,
      claimRunId: CODEX_APP_SERVER_FIXTURE_IDS.claimRunId,
      manifestId: CODEX_APP_SERVER_FIXTURE_IDS.manifestId,
      lifecycleId: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleId,
      status: 'completed',
      outcome: 'success',
      phase: 'terminal',
      usage: CODEX_APP_SERVER_TOKEN_USAGE,
      protocol: {
        threadId: CODEX_APP_SERVER_FIXTURE_IDS.threadId,
        threadSessionId: CODEX_APP_SERVER_FIXTURE_IDS.threadSessionId,
        turnIds: [CODEX_APP_SERVER_FIXTURE_IDS.turnId],
      },
      artifactRefs: [artifactRef],
      timestamps: {
        startedAt: CODEX_APP_SERVER_FIXED_NOW,
        completedAt: CODEX_APP_SERVER_FIXED_COMPLETED_AT,
      },
    })
    expect(evidence.protocol?.notificationsSeen).toMatchObject({
      'thread/started': 1,
      'turn/started': 1,
      'turn/completed': 1,
    })
    expectDescriptorSafety(evidence)
  })

  it('builds failed run evidence with a bounded reason code and failure summary', async () => {
    const buildRunEvidence = await evidenceFunction('buildCodexAppServerRunEvidence')
    const unsafeSample = CODEX_APP_SERVER_UNSAFE_OUTPUT_SAMPLES[0]

    const evidence = buildRunEvidence(terminalMappingFor('unsafe_evidence_rejected'), {
      failure: {
        safeDiagnosticCategory: unsafeSample.safeDiagnosticCategory,
        relatedIds: [
          CODEX_APP_SERVER_FIXTURE_IDS.runId,
          CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
        ],
        rejectedFieldPaths: unsafeSample.expectedRejectedFieldPaths,
        safeHash: CODEX_APP_SERVER_SAFE_SHA256,
        safeSize: 256,
        runErrorLabel: unsafeSample.label,
      },
    })

    expect(evidence).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      phase: 'artifact_safety',
      reasonCode: 'unsafe_evidence_rejected',
      failure: {
        safeDiagnosticCategory: 'raw_transcript',
        relatedIds: [
          CODEX_APP_SERVER_FIXTURE_IDS.runId,
          CODEX_APP_SERVER_FIXTURE_IDS.artifactId,
        ],
        rejectedFieldPaths: ['$.transcript'],
        safeHash: CODEX_APP_SERVER_SAFE_SHA256,
        safeSize: 256,
        runErrorLabel: 'raw transcript retained',
      },
    })
    expect(JSON.stringify(evidence.failure)).not.toContain('raw transcript content')
    expectDescriptorSafety(evidence)
  })

  it('omits unavailable ownership ids for blocked-before-launch evidence', async () => {
    const buildRunEvidence = await evidenceFunction('buildCodexAppServerRunEvidence')
    const evidence = buildRunEvidence(terminalMappingFor('missing_attempt'))

    expect(evidence).toMatchObject({
      schemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
      taskId: CODEX_APP_SERVER_FIXTURE_IDS.taskId,
      stageKey: CODEX_APP_SERVER_FIXTURE_IDS.stageKey,
      status: 'blocked',
      outcome: 'blocked',
      phase: 'eligibility',
      reasonCode: 'missing_attempt',
      usage: {
        availability: 'unavailable',
        source: 'none',
      },
      artifactRefs: [],
    })
    expect(evidence).not.toHaveProperty('attemptId')
    expect(evidence).not.toHaveProperty('claimId')
    expect(evidence).not.toHaveProperty('claimRunId')
    expect(evidence).not.toHaveProperty('manifestId')
    expect(evidence).not.toHaveProperty('lifecycleId')
    expect(evidence).not.toHaveProperty('protocol')
    expectDescriptorSafety(evidence)
  })
})

describe('SPEC-014C Codex app-server usage and activity evidence', () => {
  it('prefers thread/tokenUsage/updated over reliable final-turn fallback usage', async () => {
    const summarizeUsage = await evidenceFunction('summarizeCodexAppServerUsage')
    const protocolSteps = withFinalTurnUsage(
      buildCodexAppServerProtocolSequence({ includeTokenUsage: true }),
      {
        inputTokens: 999,
        outputTokens: 888,
        totalTokens: 1777,
      },
    )

    expect(summarizeUsage(protocolSteps)).toEqual(CODEX_APP_SERVER_TOKEN_USAGE)
  })

  it('uses final-turn usage only when reliable totals are present', async () => {
    const summarizeUsage = await evidenceFunction('summarizeCodexAppServerUsage')
    const protocolSteps = withFinalTurnUsage(
      buildCodexAppServerProtocolSequence({ includeTokenUsage: false }),
      {
        inputTokens: 44,
        outputTokens: 11,
        totalTokens: 55,
      },
    )

    expect(summarizeUsage(protocolSteps)).toEqual({
      availability: 'available',
      inputTokens: 44,
      outputTokens: 11,
      totalTokens: 55,
      source: 'final_turn',
    })
  })

  it('records partial or unavailable usage instead of inferring token metrics', async () => {
    const summarizeUsage = await evidenceFunction('summarizeCodexAppServerUsage')

    const partialUsage = summarizeUsage(withPartialTokenUsage(
      buildCodexAppServerProtocolSequence({ includeTokenUsage: true }),
    ))
    expect(partialUsage).toEqual({
      availability: 'partial',
      inputTokens: 77,
      source: 'thread_token_usage_updated',
    })
    expect(partialUsage).not.toHaveProperty('outputTokens')
    expect(partialUsage).not.toHaveProperty('totalTokens')

    const unavailableUsage = summarizeUsage(buildCodexAppServerProtocolSequence({
      includeAgentMessage: true,
      includeTokenUsage: false,
    }))
    expect(unavailableUsage).toEqual({
      availability: 'unavailable',
      source: 'none',
    })
    expect(unavailableUsage).not.toHaveProperty('inputTokens')
    expect(unavailableUsage).not.toHaveProperty('outputTokens')
    expect(unavailableUsage).not.toHaveProperty('totalTokens')
  })

  it('builds bounded descriptor-only activity payload fields without inferred token metrics', async () => {
    const buildActivityPayload = await evidenceFunction('buildCodexAppServerActivityPayload')
    const artifactRef = buildCodexAppServerSafeArtifactRef()
    const evidence = buildCodexAppServerRunEvidence(
      terminalMappingFor('unsafe_evidence_rejected'),
      {
        usage: {
          availability: 'unavailable',
          source: 'none',
        },
        artifactRefs: [artifactRef],
        failure: {
          safeDiagnosticCategory: 'raw_transcript',
          relatedIds: [CODEX_APP_SERVER_FIXTURE_IDS.runId],
          rejectedFieldPaths: ['$.transcript'],
          safeHash: CODEX_APP_SERVER_SAFE_SHA256,
          safeSize: 128,
          runErrorLabel: 'raw transcript retained',
        },
      },
    )

    const payload = buildActivityPayload(evidence, {
      activityType: 'codex_app_server_unsafe_evidence',
      createdAt: CODEX_APP_SERVER_FIXED_COMPLETED_AT,
    })

    expect(Object.keys(payload).sort()).toEqual([...ACTIVITY_PAYLOAD_KEYS].sort())
    expect(payload).toMatchObject({
      activityType: 'codex_app_server_unsafe_evidence',
      entityType: 'task',
      entityId: CODEX_APP_SERVER_FIXTURE_IDS.taskId,
      workspaceId: CODEX_APP_SERVER_FIXTURE_IDS.workspaceId,
      runId: CODEX_APP_SERVER_FIXTURE_IDS.runId,
      attemptId: CODEX_APP_SERVER_FIXTURE_IDS.attemptId,
      claimId: CODEX_APP_SERVER_FIXTURE_IDS.claimId,
      claimRunId: CODEX_APP_SERVER_FIXTURE_IDS.claimRunId,
      manifestId: CODEX_APP_SERVER_FIXTURE_IDS.manifestId,
      lifecycleId: CODEX_APP_SERVER_FIXTURE_IDS.lifecycleId,
      artifactIds: [CODEX_APP_SERVER_FIXTURE_IDS.artifactId],
      phase: 'artifact_safety',
      reasonCode: 'unsafe_evidence_rejected',
      status: 'failed',
      outcome: 'failed',
      safeDiagnosticCategory: 'raw_transcript',
      safeHash: CODEX_APP_SERVER_SAFE_SHA256,
      safeSize: 128,
      createdAt: CODEX_APP_SERVER_FIXED_COMPLETED_AT,
    })
    expect(payload.counts).toMatchObject({
      artifactRefs: 1,
      rejectedFieldPaths: 1,
    })
    expect(payload.counts).not.toHaveProperty('inputTokens')
    expect(payload.counts).not.toHaveProperty('outputTokens')
    expect(payload.counts).not.toHaveProperty('totalTokens')

    const serializedPayload = JSON.stringify(payload)
    for (const marker of FORBIDDEN_ACTIVITY_MARKERS) {
      expect(serializedPayload).not.toContain(marker)
    }
  })
})
