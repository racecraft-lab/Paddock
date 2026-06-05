import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  CODEX_APP_SERVER_ADAPTER_ID,
  CODEX_APP_SERVER_COMMAND,
  CODEX_APP_SERVER_FIXTURE_IDS,
  CODEX_APP_SERVER_FIXED_NOW,
  CODEX_APP_SERVER_SUBPROCESS_RESULTS,
  buildCodexAppServerLaunchInput,
  buildCodexAppServerProtocolSequence,
  type CodexAppServerLaunchInputFixture,
  type CodexAppServerProtocolStep,
  type CodexAppServerSubprocessResult,
  type CodexAppServerThreadStartParams,
  type CodexAppServerTurnInputText,
  type CodexAppServerTurnStartParams,
  type CodexAppServerWireMessage,
} from './codex-app-server-fixtures';

type UnknownModule = Record<string, unknown>;

interface ModuleLoadResult {
  readonly module: UnknownModule | null;
  readonly error: unknown;
}

interface CodexAppServerSpawnOptions {
  readonly cwd: string;
  readonly shell: false;
  readonly stdio: 'pipe' | readonly ['pipe', 'pipe', 'pipe'];
}

interface CodexAppServerSpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: CodexAppServerSpawnOptions;
}

interface CodexAppServerRunnerDeps {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: CodexAppServerSpawnOptions,
  ) => unknown;
  readonly protocolSequence: readonly CodexAppServerProtocolStep[];
  readonly now: () => string;
}

interface CodexAppServerCleanupEvidence {
  readonly status: 'cleanup_failed';
  readonly outcome: 'failed';
  readonly phase: 'subprocess_termination' | 'lifecycle_cleanup';
  readonly reasonCode: 'cleanup_failed';
  readonly failure: {
    readonly safeDiagnosticCategory: 'cleanup_failed';
    readonly relatedIds: readonly string[];
    readonly runErrorLabel: string;
  };
  readonly preservedTerminalOutcome?: {
    readonly status: 'completed' | 'failed' | 'timeout' | 'abandoned';
    readonly outcome: 'success' | 'failed' | 'abandoned';
    readonly phase: string;
    readonly reasonCode?: string | null;
    readonly attemptStatus: 'succeeded' | 'failed' | 'not_written';
    readonly claimRelease:
      | 'launch_handoff_completed'
      | 'dispatch_failed'
      | 'existing_authority_wins';
  };
}

interface CodexAppServerLaunchResult {
  readonly subprocessCount: number;
  readonly protocolSteps: readonly CodexAppServerProtocolStep[];
  readonly clientMessages: readonly CodexAppServerWireMessage[];
  readonly threadStartParams: CodexAppServerThreadStartParams;
  readonly turnStartParams: CodexAppServerTurnStartParams;
  readonly subprocess?: CodexAppServerSubprocessResult;
  readonly cleanupEvidence?: CodexAppServerCleanupEvidence;
  readonly runEvidence?: {
    readonly status: string;
    readonly outcome: string;
    readonly phase: string;
    readonly reasonCode?: string;
    readonly protocol?: unknown;
    readonly failure?: {
      readonly safeDiagnosticCategory?: string;
      readonly runErrorLabel?: string;
    };
  };
}

type LaunchCodexAppServerAttempt = (
  input: CodexAppServerLaunchInputFixture,
  deps: CodexAppServerRunnerDeps,
) => Promise<CodexAppServerLaunchResult>;

type BuildCodexAppServerTurnInput = (
  input: CodexAppServerLaunchInputFixture,
) => readonly CodexAppServerTurnInputText[];

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

interface FakeChildProcessOptions {
  readonly killResult?: boolean;
  readonly onKill?: (signal: string | undefined) => void;
}

const buildFakeChildProcess = (options: FakeChildProcessOptions = {}) => ({
  pid: 14014,
  stdin: {
    write: () => true,
    end: () => undefined,
  },
  stdout: {
    on: () => undefined,
  },
  stderr: {
    on: () => undefined,
  },
  on: () => undefined,
  once: () => undefined,
  kill: (signal?: string) => {
    options.onKill?.(signal);
    return options.killResult ?? true;
  },
});

interface RunAdmittedLaunchOptions {
  readonly input?: CodexAppServerLaunchInputFixture;
  readonly protocolSequence?: readonly CodexAppServerProtocolStep[];
  readonly spawn?: CodexAppServerRunnerDeps['spawn'];
  readonly now?: () => string;
  readonly extraDeps?: Record<string, unknown>;
}

interface LiveProtocolChild {
  readonly pid: number;
  readonly stdin: {
    readonly write: (chunk: string | Buffer) => boolean;
    readonly end: () => void;
  };
  readonly stdout: EventEmitter;
  readonly stderr: EventEmitter;
  readonly on: () => undefined;
  readonly once: () => undefined;
  readonly kill: (signal?: string) => boolean;
}

const runAdmittedLaunch = async (options: RunAdmittedLaunchOptions = {}): Promise<{
  readonly result: CodexAppServerLaunchResult;
  readonly spawnCalls: readonly CodexAppServerSpawnCall[];
} | null> => {
  const candidate = expectFunctionExport(
    await loadModule('../codex-app-server/runner'),
    'launchCodexAppServerAttempt',
    'Codex app-server runner module',
  );
  if (typeof candidate !== 'function') return null;
  const launch = candidate as LaunchCodexAppServerAttempt;

  const spawnCalls: CodexAppServerSpawnCall[] = [];
  const input = options.input ?? buildCodexAppServerLaunchInput();
  const result = await launch(input, {
    spawn: (command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions });
      if (options.spawn) return options.spawn(command, args, spawnOptions);
      return buildFakeChildProcess();
    },
    protocolSequence: options.protocolSequence ?? buildCodexAppServerProtocolSequence({
      includeAgentMessage: false,
      includeTokenUsage: false,
    }),
    now: options.now ?? (() => CODEX_APP_SERVER_FIXED_NOW),
    ...options.extraDeps,
  } as CodexAppServerRunnerDeps);

  return { result, spawnCalls };
};

const renderTurnInput = (
  inputItems: readonly CodexAppServerTurnInputText[],
): string => inputItems.map((item) => item.text).join('\n');

const protocolBeforeTerminal = (): readonly CodexAppServerProtocolStep[] =>
  buildCodexAppServerProtocolSequence({
    includeAgentMessage: false,
    includeTokenUsage: false,
  }).filter((step) => step.step !== 'turn_completed_notification');

const buildEnoentError = (): Error & { code: 'ENOENT' } => {
  const error = new Error('spawn codex ENOENT') as Error & { code: 'ENOENT' };
  error.code = 'ENOENT';
  return error;
};

const messageMethod = (message: CodexAppServerWireMessage): string =>
  'method' in message && typeof message.method === 'string'
    ? message.method
    : '';

const buildLiveProtocolChild = (): {
  readonly child: LiveProtocolChild;
  readonly writtenMessages: readonly CodexAppServerWireMessage[];
} => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const writtenMessages: CodexAppServerWireMessage[] = [];
  const serverSequence = buildCodexAppServerProtocolSequence({
    includeAgentMessage: false,
    includeTokenUsage: false,
  });
  const serverMessagesByClientMethod = new Map<string, readonly CodexAppServerWireMessage[]>([
    ['initialize', [serverSequence[1]?.message].filter((message): message is CodexAppServerWireMessage => message !== undefined)],
    ['initialized', []],
    ['thread/start', [
      serverSequence[4]?.message,
      serverSequence[5]?.message,
    ].filter((message): message is CodexAppServerWireMessage => message !== undefined)],
    ['turn/start', [
      serverSequence[7]?.message,
      serverSequence[8]?.message,
      serverSequence[9]?.message,
    ].filter((message): message is CodexAppServerWireMessage => message !== undefined)],
  ]);

  const child = {
    pid: 14014,
    stdin: {
      write: (chunk: string | Buffer) => {
        const line = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        const message = JSON.parse(line.trim()) as CodexAppServerWireMessage;
        writtenMessages.push(message);
        const method = messageMethod(message);
        for (const serverMessage of serverMessagesByClientMethod.get(method) ?? []) {
          queueMicrotask(() => {
            stdout.emit('data', Buffer.from(`${JSON.stringify(serverMessage)}\n`));
          });
        }
        return true;
      },
      end: () => undefined,
    },
    stdout,
    stderr,
    on: () => undefined,
    once: () => undefined,
    kill: () => true,
  } satisfies LiveProtocolChild;

  return { child, writtenMessages };
};

describe('SPEC-014C Codex app-server runner launch', () => {
  it('spawns exactly one codex app-server proxy subprocess without a shell from the lifecycle root', async () => {
    const launch = await runAdmittedLaunch();
    if (launch === null) return;
    const spawnCall = launch.spawnCalls[0];

    expect(launch.spawnCalls).toHaveLength(1);
    expect(spawnCall).toBeDefined();
    if (spawnCall === undefined) return;
    expect(spawnCall.command).toBe(CODEX_APP_SERVER_COMMAND[0]);
    expect(spawnCall.args).toEqual(CODEX_APP_SERVER_COMMAND.slice(1));
    expect(spawnCall.options.cwd).toBe(CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot);
    expect(spawnCall.options.shell).toBe(false);
    expect(launch.result.subprocessCount).toBe(1);
  });

  it('bounds process cwd, thread cwd, turn cwd, sandbox policy, and runtime workspace roots to the lifecycle root', async () => {
    const launch = await runAdmittedLaunch();
    if (launch === null) return;

    const lifecycleRoot = CODEX_APP_SERVER_FIXTURE_IDS.lifecycleRoot;
    const threadStart = launch.result.threadStartParams;
    const turnStart = launch.result.turnStartParams;

    expect(launch.spawnCalls[0]?.options.cwd).toBe(lifecycleRoot);
    expect(threadStart.cwd).toBe(lifecycleRoot);
    expect(threadStart.runtimeWorkspaceRoots).toEqual([lifecycleRoot]);
    expect(threadStart.sandbox).toBe('workspace-write');
    expect(threadStart.permissions).toBeNull();
    expect(turnStart.cwd).toBe(lifecycleRoot);
    expect(turnStart.sandboxPolicy).toMatchObject({
      type: 'workspaceWrite',
      writableRoots: [lifecycleRoot],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });

    const launchEnvelope = JSON.stringify({
      spawn: launch.spawnCalls,
      threadStart,
      turnStart,
    });
    expect(launchEnvelope).not.toContain('/Users/');
    expect(launchEnvelope).not.toContain('/var/folders/');
    expect(launchEnvelope).not.toContain('/tmp/');
  });

  it('performs the initialize, initialized, thread/start, turn/start, and turn/started launch sequence in order', async () => {
    const launch = await runAdmittedLaunch();
    if (launch === null) return;

    const expectedLaunchSteps = buildCodexAppServerProtocolSequence({
      includeAgentMessage: false,
      includeTokenUsage: false,
    })
      .slice(0, 9)
      .map((step) => step.step);

    expect(launch.result.protocolSteps.map((step) => step.step)).toEqual(
      expectedLaunchSteps,
    );
    expect(launch.result.clientMessages.map((message) => {
      if ('method' in message) return message.method;
      return `response:${String(message.id)}`;
    })).toEqual(['initialize', 'initialized', 'thread/start', 'turn/start']);
  });

  it('exchanges the launch protocol over live child-process stdio when no fixture sequence is injected', async () => {
    const liveChild = buildLiveProtocolChild();
    const launch = await runAdmittedLaunch({
      protocolSequence: [],
      spawn: () => liveChild.child,
    });
    if (launch === null) return;

    expect(liveChild.writtenMessages.map(messageMethod)).toEqual([
      'initialize',
      'initialized',
      'thread/start',
      'turn/start',
    ]);
    expect(launch.result.protocolSteps.map((step) => step.step)).toEqual([
      'initialize_request',
      'initialize_response',
      'initialized_notification',
      'thread_start_request',
      'thread_start_response',
      'thread_started_notification',
      'turn_start_request',
      'turn_start_response',
      'turn_started_notification',
      'turn_completed_notification',
    ]);
    expect(launch.result.runEvidence).toMatchObject({
      status: 'completed',
      outcome: 'success',
      phase: 'terminal',
    });
    expect(launch.result.subprocess).toMatchObject({
      pid: 14014,
      status: 'completed',
      stdoutLineCount: 6,
    });
  });
});

describe('SPEC-014C Codex app-server fail-closed runner events', () => {
  it('maps manifest timeout to timeout evidence and terminates the subprocess', async () => {
    const killSignals: (string | undefined)[] = [];
    const launch = await runAdmittedLaunch({
      input: buildCodexAppServerLaunchInput({ timeoutMs: 50 }),
      protocolSequence: protocolBeforeTerminal(),
      spawn: () => buildFakeChildProcess({
        onKill: (signal) => killSignals.push(signal),
      }),
      extraDeps: {
        subprocessResult: CODEX_APP_SERVER_SUBPROCESS_RESULTS.timeout,
      },
    });
    if (launch === null) return;

    expect(launch.result.runEvidence).toMatchObject({
      status: 'timeout',
      outcome: 'failed',
      phase: 'running',
      reasonCode: 'timeout_budget_expired',
      failure: {
        safeDiagnosticCategory: 'timeout_budget_expired',
        runErrorLabel: 'manifest_timeout_expired',
      },
    });
    expect(launch.result.subprocess).toMatchObject({
      status: 'timeout',
      reasonCode: 'timeout_budget_expired',
      signal: 'SIGTERM',
    });
    expect(killSignals).toContain('SIGTERM');
  });

  it('maps unavailable Codex binary spawn failure to failed spawn evidence without protocol ids', async () => {
    let launch: Awaited<ReturnType<typeof runAdmittedLaunch>> | null = null;
    let thrown: unknown = null;

    try {
      launch = await runAdmittedLaunch({
        protocolSequence: [],
        spawn: () => {
          throw buildEnoentError();
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(
      thrown,
      'runner should classify ENOENT as binary_unavailable instead of rejecting',
    ).toBeNull();
    if (launch === null) return;

    expect(launch.result.runEvidence).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      phase: 'spawn',
      reasonCode: 'binary_unavailable',
      failure: {
        safeDiagnosticCategory: 'binary_unavailable',
        runErrorLabel: 'ENOENT',
      },
    });
    expect(launch.result.runEvidence).not.toHaveProperty('protocol');
    expect(launch.result.subprocess).toMatchObject({
      pid: null,
      status: 'binary_unavailable',
      reasonCode: 'binary_unavailable',
      errorLabel: 'ENOENT',
    });
  });

  it('appends cleanup_failed evidence when subprocess termination fails after terminal evidence', async () => {
    const killSignals: (string | undefined)[] = [];
    const launch = await runAdmittedLaunch({
      protocolSequence: buildCodexAppServerProtocolSequence({
        includeAgentMessage: false,
        includeTokenUsage: false,
      }),
      spawn: () => buildFakeChildProcess({
        killResult: false,
        onKill: (signal) => killSignals.push(signal),
      }),
      extraDeps: {
        subprocessResult: CODEX_APP_SERVER_SUBPROCESS_RESULTS.terminationFailed,
      },
    });
    if (launch === null) return;

    expect(launch.result.runEvidence).toMatchObject({
      status: 'completed',
      outcome: 'success',
      phase: 'terminal',
    });
    expect(launch.result.cleanupEvidence).toMatchObject({
      status: 'cleanup_failed',
      outcome: 'failed',
      phase: 'subprocess_termination',
      reasonCode: 'cleanup_failed',
      failure: {
        safeDiagnosticCategory: 'cleanup_failed',
        runErrorLabel: 'subprocess_termination_failed',
      },
    });
    expect(killSignals).toContain('SIGKILL');
  });

  it('appends lifecycle cleanup failure evidence without replacing completed terminal evidence', async () => {
    const launch = await runAdmittedLaunch({
      protocolSequence: buildCodexAppServerProtocolSequence({
        includeAgentMessage: false,
        includeTokenUsage: false,
      }),
      extraDeps: {
        cleanupLifecycle: () => ({
          status: 'cleanup_failed',
          phase: 'lifecycle_cleanup',
          errorLabel: 'lifecycle_cleanup_failed',
        }),
      },
    });
    if (launch === null) return;

    expect(launch.result.runEvidence).toMatchObject({
      status: 'completed',
      outcome: 'success',
      phase: 'terminal',
    });
    expect(launch.result.cleanupEvidence).toMatchObject({
      status: 'cleanup_failed',
      outcome: 'failed',
      phase: 'lifecycle_cleanup',
      reasonCode: 'cleanup_failed',
      failure: {
        safeDiagnosticCategory: 'cleanup_failed',
        runErrorLabel: 'lifecycle_cleanup_failed',
      },
    });
  });

  it('preserves original run, attempt, claim, and reason outcome when cleanup fails', async () => {
    const launch = await runAdmittedLaunch({
      protocolSequence: buildCodexAppServerProtocolSequence({
        includeAgentMessage: false,
        includeTokenUsage: false,
      }),
      extraDeps: {
        cleanupLifecycle: () => ({
          status: 'cleanup_failed',
          phase: 'lifecycle_cleanup',
          errorLabel: 'lifecycle_cleanup_failed',
        }),
      },
    });
    if (launch === null) return;

    expect(launch.result.cleanupEvidence?.preservedTerminalOutcome).toEqual({
      status: 'completed',
      outcome: 'success',
      phase: 'terminal',
      reasonCode: null,
      attemptStatus: 'succeeded',
      claimRelease: 'launch_handoff_completed',
    });
  });
});

describe('SPEC-014C Codex app-server input minimization', () => {
  it('builds bounded task-stage input from only the admitted GitHub issue, workflow stage, assignment, repository, claim, manifest, capability, and handoff fields', async () => {
    const candidate = expectFunctionExport(
      await loadModule('../codex-app-server/input'),
      'buildCodexAppServerTurnInput',
      'Codex app-server input module',
    );
    if (typeof candidate !== 'function') return;
    const buildTurnInput = candidate as BuildCodexAppServerTurnInput;

    const launchInput = buildCodexAppServerLaunchInput();
    const renderedInput = renderTurnInput(buildTurnInput(launchInput));

    expect(renderedInput).toContain(launchInput.githubIssueTitle);
    expect(renderedInput).toContain(launchInput.githubIssueBody);
    expect(renderedInput).toContain(launchInput.githubIssueUrl);
    expect(renderedInput).toContain(launchInput.workflowTemplateId);
    expect(renderedInput).toContain(launchInput.stageInstructions);
    expect(renderedInput).toContain(launchInput.taskId);
    expect(renderedInput).toContain(launchInput.stageKey);
    expect(renderedInput).toContain(launchInput.assignmentRole);
    expect(renderedInput).toContain(launchInput.repository);
    expect(renderedInput).toContain(launchInput.workspaceId);
    expect(renderedInput).toContain(launchInput.claimId);
    expect(renderedInput).toContain(launchInput.claimRunId);
    expect(renderedInput).toContain(launchInput.manifestId);
    expect(renderedInput).toContain(CODEX_APP_SERVER_ADAPTER_ID);
    expect(renderedInput).toContain('artifactPublication');
    expect(renderedInput).toContain('tokenRuntimeAccounting');
    expect(renderedInput).toContain('approvalPolicy');
    expect(renderedInput).toContain('userInputPolicy');
    expect(renderedInput).toContain('descriptor-only');
    expect(renderedInput).toContain('launch_handoff_completed');
    expect(renderedInput).not.toContain(launchInput.lifecycleRoot);
  });

  it('omits forbidden raw rows, secrets, transcripts, provider/tool payloads, broad context, unrelated history, and host paths from task-stage input', async () => {
    const candidate = expectFunctionExport(
      await loadModule('../codex-app-server/input'),
      'buildCodexAppServerTurnInput',
      'Codex app-server input module',
    );
    if (typeof candidate !== 'function') return;
    const buildTurnInput = candidate as BuildCodexAppServerTurnInput;

    const forbiddenMarkers = [
      'raw_db_row_marker_014c',
      'paddock_secret_014c',
      'BEGIN_RAW_TRANSCRIPT_014C',
      'provider_payload_marker_014c',
      'tool_payload_marker_014c',
      'BROAD_OPERATOR_CONTEXT_014C',
      'unrelated_task_history_014c',
      '/Users/operator/private/spec-014c',
      '/var/db/paddock/secret.sqlite',
    ] as const;

    const launchInput = {
      ...buildCodexAppServerLaunchInput({
        githubIssueBody: [
          'Bounded GitHub issue body for SPEC-014C.',
          'raw_db_row_marker_014c',
          'paddock_secret_014c',
          'BEGIN_RAW_TRANSCRIPT_014C',
          'provider_payload_marker_014c',
          'tool_payload_marker_014c',
          '/Users/operator/private/spec-014c',
        ].join('\n'),
        stageInstructions: [
          'Follow the bounded implementation stage instructions.',
          'BROAD_OPERATOR_CONTEXT_014C',
          'unrelated_task_history_014c',
          '/var/db/paddock/secret.sqlite',
        ].join('\n'),
      }),
      rawTaskRow: {
        marker: 'raw_db_row_marker_014c',
        fullRecord: { id: 14014, workspace_secret: 'paddock_secret_014c' },
      },
      rawTranscript: 'BEGIN_RAW_TRANSCRIPT_014C assistant reasoning payload',
      providerPayload: { marker: 'provider_payload_marker_014c' },
      toolPayload: { marker: 'tool_payload_marker_014c' },
      broadContext: 'BROAD_OPERATOR_CONTEXT_014C',
      unrelatedHistory: ['unrelated_task_history_014c'],
      hostPaths: [
        '/Users/operator/private/spec-014c',
        '/var/db/paddock/secret.sqlite',
      ],
    } as CodexAppServerLaunchInputFixture & Record<string, unknown>;

    const renderedInput = renderTurnInput(buildTurnInput(launchInput));

    expect(renderedInput).toContain('Bounded GitHub issue body for SPEC-014C.');
    expect(renderedInput).toContain(
      'Follow the bounded implementation stage instructions.',
    );
    for (const marker of forbiddenMarkers) {
      expect(renderedInput).not.toContain(marker);
    }
  });
});
