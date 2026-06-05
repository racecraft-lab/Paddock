import { describe, expect, it } from 'vitest';
import {
  CODEX_APP_SERVER_FIXED_COMPLETED_AT,
  CODEX_APP_SERVER_SAFE_SHA256,
  CODEX_APP_SERVER_UNSAFE_OUTPUT_SAMPLES,
  buildCodexAppServerRunEvidence,
  buildCodexAppServerSafeArtifactRef,
  type CodexAppServerJsonValue,
  type CodexAppServerRunEvidenceFixture,
  type CodexAppServerSafeArtifactRef,
} from './codex-app-server-fixtures';

type UnknownModule = Record<string, unknown>;

interface ModuleLoadResult {
  readonly module: UnknownModule | null;
  readonly error: unknown;
}

interface CodexAppServerArtifactPolicy {
  readonly allowArtifactPublication: boolean;
  readonly allowSecretRedaction: boolean;
  readonly maxSafeSummaryChars: number;
  readonly maxArtifacts: number;
}

interface BuildCodexAppServerEvidenceArtifactsInput {
  readonly runEvidence: CodexAppServerRunEvidenceFixture;
  readonly output: CodexAppServerJsonValue;
  readonly artifactPolicy: CodexAppServerArtifactPolicy;
  readonly now: () => string;
}

interface CodexAppServerEvidenceArtifactSafetyResult {
  readonly accepted: boolean;
  readonly reasonCode: 'unsafe_evidence_rejected' | null;
  readonly safeDiagnosticCategory: string | null;
  readonly rejectedFieldPaths: readonly string[];
  readonly safeSummary: string | null;
  readonly artifactRefs: readonly CodexAppServerSafeArtifactRef[];
  readonly safety: CodexAppServerRunEvidenceFixture['safety'];
}

type BuildCodexAppServerEvidenceArtifacts = (
  input: BuildCodexAppServerEvidenceArtifactsInput,
) => CodexAppServerEvidenceArtifactSafetyResult;

interface UnsafeArtifactSafetySample {
  readonly label: string;
  readonly output: CodexAppServerJsonValue;
  readonly expectedRejectedFieldPaths: readonly string[];
  readonly safeDiagnosticCategory: string;
}

const DEFAULT_ARTIFACT_POLICY = {
  allowArtifactPublication: true,
  allowSecretRedaction: true,
  maxSafeSummaryChars: 512,
  maxArtifacts: 4,
} as const satisfies CodexAppServerArtifactPolicy;

const SECRET_VALUE = 'sk-spec014csecretvalue000000000000000000' as const;

const STRUCTURAL_UNSAFE_SAMPLES = [
  ...CODEX_APP_SERVER_UNSAFE_OUTPUT_SAMPLES.filter(
    (sample) => sample.label !== 'secret-shaped value retained',
  ),
  {
    label: 'raw artifact content retained',
    output: {
      artifactRefs: [
        {
          ...buildCodexAppServerSafeArtifactRef(),
          rawContent: 'raw artifact body must not be persisted',
        },
      ],
    },
    expectedRejectedFieldPaths: ['$.artifactRefs[0].rawContent'],
    safeDiagnosticCategory: 'raw_content',
  },
  {
    label: 'prompt body retained',
    output: {
      promptBody: 'PROMPT_BODY_MARKER_014C with raw instructions',
    },
    expectedRejectedFieldPaths: ['$.promptBody'],
    safeDiagnosticCategory: 'prompt_body',
  },
  {
    label: 'provider payload retained',
    output: {
      providerPayload: {
        provider: 'openai',
        marker: 'PROVIDER_PAYLOAD_MARKER_014C',
      },
    },
    expectedRejectedFieldPaths: ['$.providerPayload'],
    safeDiagnosticCategory: 'provider_payload',
  },
  {
    label: 'tool payload retained',
    output: {
      toolPayload: {
        tool: 'shell',
        marker: 'TOOL_PAYLOAD_MARKER_014C',
      },
    },
    expectedRejectedFieldPaths: ['$.toolPayload'],
    safeDiagnosticCategory: 'tool_payload',
  },
  {
    label: 'MCP payload retained',
    output: {
      mcpPayload: {
        server: 'fixture-mcp',
        marker: 'MCP_PAYLOAD_MARKER_014C',
      },
    },
    expectedRejectedFieldPaths: ['$.mcpPayload'],
    safeDiagnosticCategory: 'mcp_payload',
  },
] as const satisfies readonly UnsafeArtifactSafetySample[];

const FORBIDDEN_ARTIFACT_FIELDS = [
  'storageUri',
  'rawContent',
  'previewText',
  'originalFilename',
  'cwd',
  'sandboxPath',
  'hostPath',
  'url',
  'providerPayload',
  'toolPayload',
  'mcpPayload',
  'transcript',
  'promptBody',
  'commandDetails',
  'fileChangeDetails',
] as const;

const FORBIDDEN_SERIALIZED_MARKERS = [
  SECRET_VALUE,
  'raw artifact body must not be persisted',
  'PROMPT_BODY_MARKER_014C',
  'PROVIDER_PAYLOAD_MARKER_014C',
  'TOOL_PAYLOAD_MARKER_014C',
  'MCP_PAYLOAD_MARKER_014C',
  'raw transcript content must not be persisted',
  'raw protocol payload must not be retained',
  '/Users/operator/private/project/output.json',
  'file:///paddock/sandboxes/spec-014c/run-001/raw-output.json',
  'operator-private-notes.md',
] as const;

const loadModule = async (modulePath: string): Promise<ModuleLoadResult> => {
  try {
    return {
      module: (await import(modulePath)) as UnknownModule,
      error: null,
    };
  } catch (error) {
    return {
      module: null,
      error,
    };
  }
};

const formatLoadError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
};

const expectFunctionExport = (
  loadResult: ModuleLoadResult,
  exportName: string,
  moduleLabel: string,
): unknown => {
  expect(
    loadResult.error,
    `${moduleLabel} must be implemented and importable; current RED failure: ${formatLoadError(
      loadResult.error,
    )}`,
  ).toBeNull();

  if (loadResult.error !== null || loadResult.module === null) return null;

  const candidate = loadResult.module[exportName];
  expect(candidate, `${moduleLabel} must export ${exportName}`).toEqual(
    expect.any(Function),
  );

  return candidate;
};

const loadArtifactSafetyBuilder =
  async (): Promise<BuildCodexAppServerEvidenceArtifacts | null> => {
    const candidate = expectFunctionExport(
      await loadModule('../codex-app-server/evidence'),
      'buildCodexAppServerEvidenceArtifacts',
      'Codex app-server evidence module',
    );
    if (typeof candidate !== 'function') return null;
    return candidate as BuildCodexAppServerEvidenceArtifacts;
  };

const buildArtifactSafetyInput = (
  output: CodexAppServerJsonValue,
  policyOverrides: Partial<CodexAppServerArtifactPolicy> = {},
): BuildCodexAppServerEvidenceArtifactsInput => ({
  runEvidence: buildCodexAppServerRunEvidence(),
  output,
  artifactPolicy: {
    ...DEFAULT_ARTIFACT_POLICY,
    ...policyOverrides,
  },
  now: () => CODEX_APP_SERVER_FIXED_COMPLETED_AT,
});

const expectDescriptorOnlyArtifactRefs = (
  artifactRefs: readonly CodexAppServerSafeArtifactRef[],
): void => {
  expect(artifactRefs).toHaveLength(1);
  const ref = artifactRefs[0];
  expect(ref).toEqual(
    expect.objectContaining({
      artifactType: 'codex_app_server_summary',
      schemaVersion: 'codex_app_server_run.v1',
      mimeType: 'application/json',
      sha256: CODEX_APP_SERVER_SAFE_SHA256,
      securityScanStatus: 'passed',
    }),
  );

  const refRecord = ref as unknown as Record<string, unknown>;
  for (const field of FORBIDDEN_ARTIFACT_FIELDS) {
    expect(refRecord).not.toHaveProperty(field);
  }
};

const expectNoForbiddenSerializedMarkers = (value: unknown): void => {
  const serialized = JSON.stringify(value);
  for (const marker of FORBIDDEN_SERIALIZED_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
};

describe('SPEC-014C Codex app-server artifact safety', () => {
  it('accepts bounded safe summaries without retaining raw evidence', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const result = buildArtifacts(
      buildArtifactSafetyInput({
        safeSummary: 'Descriptor-only completion summary for the claimed implementation stage.',
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBeNull();
    expect(result.safeDiagnosticCategory).toBeNull();
    expect(result.rejectedFieldPaths).toEqual([]);
    expect(result.safeSummary).toBe(
      'Descriptor-only completion summary for the claimed implementation stage.',
    );
    expect(result.artifactRefs).toEqual([]);
    expect(result.safety).toEqual(
      expect.objectContaining({
        rawTranscriptRetained: false,
        rawProtocolRetained: false,
        providerPayloadRetained: false,
        toolPayloadRetained: false,
        promptBodyRetained: false,
        hostPathRetained: false,
        secretRetained: false,
        redactionApplied: false,
      }),
    );
    expectNoForbiddenSerializedMarkers(result);
  });

  it('accepts descriptor-only artifact references and exposes no storage, path, filename, transcript, prompt, or payload fields', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const safeRef = buildCodexAppServerSafeArtifactRef({
      safeSummary: 'Descriptor-only artifact reference for safe operator evidence.',
      safeLabel: 'codex-app-server-safe-summary',
    });
    const result = buildArtifacts(
      buildArtifactSafetyInput({
        artifactRefs: [safeRef],
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBeNull();
    expect(result.rejectedFieldPaths).toEqual([]);
    expectDescriptorOnlyArtifactRefs(result.artifactRefs);
    expect(result.artifactRefs[0]).toEqual(safeRef);
    expectNoForbiddenSerializedMarkers(result);
  });

  it('rejects structurally unsafe artifact content before redaction', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const result = buildArtifacts(
      buildArtifactSafetyInput({
        artifactRefs: [
          {
            ...buildCodexAppServerSafeArtifactRef(),
            rawContent: `raw payload with ${SECRET_VALUE}`,
          },
        ],
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.reasonCode).toBe('unsafe_evidence_rejected');
    expect(result.safeDiagnosticCategory).toBe('raw_content');
    expect(result.rejectedFieldPaths).toEqual(['$.artifactRefs[0].rawContent']);
    expect(result.artifactRefs).toEqual([]);
    expect(result.safety.redactionApplied).toBe(false);
    expectNoForbiddenSerializedMarkers(result);
  });

  it('redacts secret-shaped values only inside otherwise bounded safe summaries', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const result = buildArtifacts(
      buildArtifactSafetyInput({
        safeSummary: `Completed the claimed stage and removed leaked token ${SECRET_VALUE} from the summary.`,
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBeNull();
    expect(result.rejectedFieldPaths).toEqual([]);
    expect(result.safeSummary).toContain('Completed the claimed stage');
    expect(result.safeSummary).not.toContain(SECRET_VALUE);
    expect(result.safety.secretRetained).toBe(false);
    expect(result.safety.redactionApplied).toBe(true);
    expectNoForbiddenSerializedMarkers(result);
  });

  it('rejects artifact references when artifact publication policy disallows publication', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const result = buildArtifacts(
      buildArtifactSafetyInput(
        {
          artifactRefs: [buildCodexAppServerSafeArtifactRef()],
        },
        {
          allowArtifactPublication: false,
        },
      ),
    );

    expect(result.accepted).toBe(false);
    expect(result.reasonCode).toBe('unsafe_evidence_rejected');
    expect(result.safeDiagnosticCategory).toBe('artifact_policy');
    expect(result.rejectedFieldPaths).toEqual(['$.artifactRefs']);
    expect(result.artifactRefs).toEqual([]);
    expectNoForbiddenSerializedMarkers(result);
  });

  it('rejects redaction when no safe non-empty summary remains', async () => {
    const buildArtifacts = await loadArtifactSafetyBuilder();
    if (buildArtifacts === null) return;

    const result = buildArtifacts(
      buildArtifactSafetyInput({
        safeSummary: SECRET_VALUE,
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.reasonCode).toBe('unsafe_evidence_rejected');
    expect(result.safeDiagnosticCategory).toBe('redaction_empty');
    expect(result.rejectedFieldPaths).toEqual(['$.safeSummary']);
    expect(result.safeSummary).toBeNull();
    expect(result.safety.secretRetained).toBe(false);
    expectNoForbiddenSerializedMarkers(result);
  });

  it.each(STRUCTURAL_UNSAFE_SAMPLES)(
    'rejects unsafe output sample: $label',
    async (sample) => {
      const buildArtifacts = await loadArtifactSafetyBuilder();
      if (buildArtifacts === null) return;

      const result = buildArtifacts(buildArtifactSafetyInput(sample.output));

      expect(result.accepted).toBe(false);
      expect(result.reasonCode).toBe('unsafe_evidence_rejected');
      expect(result.safeDiagnosticCategory).toBe(sample.safeDiagnosticCategory);
      expect(result.rejectedFieldPaths).toEqual(sample.expectedRejectedFieldPaths);
      expect(result.artifactRefs).toEqual([]);
      expectNoForbiddenSerializedMarkers(result);
    },
  );
});
