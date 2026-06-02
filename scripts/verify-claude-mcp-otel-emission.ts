#!/usr/bin/env -S npx tsx
/**
 * SPEC-008 Phase-0 Verification Spike — Claude `mcp serve` OTel emission
 *
 * Decision: Q16 / FR-071a — When Claude Code is invoked as an MCP-server
 *   child of an orchestrating agent (e.g., `mc-mcp-server.cjs`), do OTLP
 *   emissions reach the receiver, OR does the stdio MCP transport
 *   (which reserves stdout for MCP protocol frames) shadow telemetry?
 *
 * Hypothesis (FR-071a):
 *   Because the MCP stdio transport reserves stdout for protocol frames,
 *   any Claude-Code-emitted OTel data must be routed via OTLP/HTTP to the
 *   configured endpoint OR be lost. The expected empirical outcome is that
 *   OTLP emissions DO reach the receiver in some Claude Code versions but
 *   NOT in others, and field-set parity is not guaranteed. The expected
 *   verdict is therefore 'downgraded' with downgrade_target=
 *   'claude_code.transcript_replay'.
 *
 * Operator Procedure
 * ------------------
 *   1. Install Claude Code CLI ≥ 1.0.0 on the operator node.
 *   2. Start a local OTLP/HTTP receiver listening on http://127.0.0.1:4318
 *      (otelcol-contrib v0.108.0 OR `--stub-receiver`).
 *   3. Run:
 *        pnpm tsx scripts/verify-claude-mcp-otel-emission.ts \
 *          --sample-size 10 \
 *          --mcp-prompt 'list_files . | head -3'
 *   4. The script spawns `claude mcp serve` as a child of a synthetic MCP
 *      orchestrator that issues an MCP `tool_call` request, captures any
 *      OTLP frames received during the session, AND captures the
 *      transcript-replay file path that Claude Code writes (used by the
 *      FR-071a downgrade fallback in
 *      `src/lib/observability/adapters/claude-code-transcript.ts`).
 *   5. Evidence written to
 *      `docs/ai/specs/spikes/verify-claude-mcp-otel-emission.json`.
 *   6. If verdict='downgraded' (expected), confirm the FR-071a
 *      `cli_mcp_serve` source-registry row will be seeded with
 *      `enforcement_eligibility='soft'` AND a
 *      `governance_claude_mcp_telemetry_absent` activity row will fire at
 *      Paddock startup (T083 / T094-T095 implementation).
 *
 * Evidence Schema (FR-090a) — same shape as T001 with additional
 *   transcript-replay observations.
 *
 * NOTE — Author-only here. Operator-side execution.
 *
 * @see specs/008-resource-governance/spec.md FR-071a, FR-082, FR-090a
 * @see specs/008-resource-governance/tasks.md T002
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EVIDENCE_PATH = resolve(
  __dirname,
  '..',
  'docs',
  'ai',
  'specs',
  'spikes',
  'verify-claude-mcp-otel-emission.json',
);

interface CliArgs {
  sampleSize: number;
  mcpPrompt: string;
  stubReceiver: boolean;
  receiverPort: number;
  timeoutMs: number;
}

interface ReceiverObservation {
  bodyBytes: number;
  hadTokenUsage: boolean;
  hadCostUsage: boolean;
  hadModel: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sampleSize: 10,
    mcpPrompt: 'list_files .',
    stubReceiver: false,
    receiverPort: 4318,
    timeoutMs: 90_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample-size' && argv[i + 1]) {
      args.sampleSize = Number.parseInt(argv[++i] ?? '10', 10);
    } else if (a === '--mcp-prompt' && argv[i + 1]) {
      args.mcpPrompt = String(argv[++i]);
    } else if (a === '--stub-receiver') {
      args.stubReceiver = true;
    } else if (a === '--port' && argv[i + 1]) {
      args.receiverPort = Number.parseInt(argv[++i] ?? '4318', 10);
    } else if (a === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number.parseInt(argv[++i] ?? '90000', 10);
    }
  }
  return args;
}

function startStubReceiver(port: number, observations: ReceiverObservation[]): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      observations.push({
        bodyBytes: body.length,
        hadTokenUsage: /claude_code\.token\.usage/.test(body),
        hadCostUsage: /claude_code\.cost\.usage/.test(body),
        hadModel: /\bmodel\b/.test(body),
      });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/x-protobuf');
      res.end();
    });
  });
  server.listen(port, '127.0.0.1');
  return server;
}

interface McpSessionResult {
  receivedAnyMcpFrame: boolean;
  exitCode: number | null;
  stderrHint: string;
}

async function runMcpSessionOnce(
  mcpPrompt: string,
  port: number,
  timeoutMs: number,
): Promise<McpSessionResult> {
  return new Promise((resolveP) => {
    const env = {
      ...process.env,
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    };
    const child: ChildProcessWithoutNullStreams = spawn('claude', ['mcp', 'serve'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    // Synthetic MCP-orchestrator: send an `initialize` then one `tool_call`.
    // The exact wire format follows MCP's stdio transport (LSP-style framed
    // JSON-RPC over stdin/stdout). For the spike we only need to verify
    // that whatever MCP traffic occurs does NOT block OTLP emission.
    let receivedAnyMcpFrame = false;
    child.stdout.on('data', (c: Buffer) => {
      if (c.length > 0) receivedAnyMcpFrame = true;
    });

    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', clientInfo: { name: 'spike', version: '1' } },
    };
    const toolCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'unknown', arguments: { prompt: mcpPrompt } },
    };
    const writeFrame = (msg: Record<string, unknown>): void => {
      const body = `${JSON.stringify(msg)}\r\n`;
      const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
      child.stdin.write(header);
      child.stdin.write(body);
    };
    try {
      writeFrame(initialize);
      writeFrame(toolCall);
    } catch {
      // ignore — child may have closed
    }

    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolveP({
        receivedAnyMcpFrame,
        exitCode,
        stderrHint: Buffer.concat(stderrChunks).toString('utf8'),
      });
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      finish(code);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const observations: ReceiverObservation[] = [];
  let server: Server | null = null;
  if (args.stubReceiver) {
    server = startStubReceiver(args.receiverPort, observations);
  }

  const sessionResults: McpSessionResult[] = [];
  for (let i = 0; i < args.sampleSize; i++) {
    sessionResults.push(await runMcpSessionOnce(args.mcpPrompt, args.receiverPort, args.timeoutMs));
  }

  if (server) await new Promise<void>((res) => server!.close(() => res()));

  const framesReceived = observations.length;
  const framesWithToken = observations.filter((o) => o.hadTokenUsage).length;
  const sessionsWithMcpTraffic = sessionResults.filter((r) => r.receivedAnyMcpFrame).length;

  // FR-071a expects 'downgraded' as the empirical outcome.
  // 'confirmed' requires every session to deliver at least one OTLP frame
  // containing claude_code.token.usage AND the MCP transport to remain
  // functional (sessionsWithMcpTraffic == sampleSize).
  const meetsConfirmedBar =
    framesReceived >= args.sampleSize &&
    framesWithToken >= args.sampleSize &&
    sessionsWithMcpTraffic === args.sampleSize;
  const verdict: 'confirmed' | 'downgraded' = meetsConfirmedBar ? 'confirmed' : 'downgraded';

  const evidence = {
    decision_q: 'Q16',
    hypothesis:
      "Claude Code 'mcp serve' (stdio MCP transport) DOES emit OTLP/HTTP frames to the configured OTEL_EXPORTER_OTLP_ENDPOINT alongside MCP protocol traffic on stdout. Expected empirical verdict: 'downgraded' (stdout reservation prevents reliable OTel parity).",
    sample_size_min: args.sampleSize,
    observed: {
      frames_received: framesReceived,
      frames_with_token_usage: framesWithToken,
      sessions_with_mcp_traffic: sessionsWithMcpTraffic,
      sessions_attempted: args.sampleSize,
      stderr_hint: sessionResults[sessionResults.length - 1]?.stderrHint?.slice(0, 4096) ?? null,
    },
    verdict,
    ...(verdict === 'downgraded'
      ? { downgrade_target: 'claude_code.transcript_replay' }
      : {}),
    captured_at: new Date().toISOString(),
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    `verify-claude-mcp-otel-emission: verdict=${verdict} frames=${framesReceived}/${args.sampleSize} mcp_sessions=${sessionsWithMcpTraffic}/${args.sampleSize} → ${EVIDENCE_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error('verify-claude-mcp-otel-emission FAILED:', err);
  process.exit(1);
});
