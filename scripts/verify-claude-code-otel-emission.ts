#!/usr/bin/env -S npx tsx
/**
 * SPEC-008 Phase-0 Verification Spike — Claude Code subprocess OTel emission
 *
 * Decision: Q16 — Does `claude -p` (subprocess mode) actually emit OTLP
 *   when CLAUDE_CODE_ENABLE_TELEMETRY=1 is set, and can the receiver capture
 *   the canonical `claude_code.token.usage` / `claude_code.cost.usage` events
 *   with full field parity?
 *
 * Hypothesis (FR-071):
 *   Setting CLAUDE_CODE_ENABLE_TELEMETRY=1 + OTEL_EXPORTER_OTLP_ENDPOINT
 *   causes `claude -p` to push canonical OTLP/HTTP frames to the receiver.
 *   Expected verdict: 'confirmed' (FR-071 enforcement_eligibility='hard').
 *
 * If the spike observes no frames OR truncated/non-canonical frames, the
 * verdict downgrades to 'downgraded' with downgrade_target=
 * 'claude_code.transcript_replay' (FR-071a).
 *
 * Operator Procedure
 * ------------------
 *   1. Install Claude Code CLI ≥ 1.0.0 on the operator node.
 *   2. Start a local OTLP/HTTP receiver listening on
 *      http://127.0.0.1:4318 (otelcol-contrib v0.108.0 with the
 *      `<DATA_DIR>/otelcol/config.yaml` shipped in T112; or run a stub
 *      receiver via `npx tsx scripts/verify-claude-code-otel-emission.ts
 *      --stub-receiver`).
 *   3. Run `pnpm tsx scripts/verify-claude-code-otel-emission.ts \
 *        --sample-size 10 --prompt "1+1"`.
 *   4. The script invokes `claude -p` with telemetry env vars, captures
 *      stdout / stderr / received OTLP frames over `--sample-size`
 *      iterations, and writes evidence JSON to
 *      `docs/ai/specs/spikes/verify-claude-code-otel-emission.json`
 *      (schema per FR-090a).
 *   5. Review the verdict; if `downgraded`, confirm the FR-071a fallback
 *      is wired in `src/lib/observability/adapters/claude-code-transcript.ts`
 *      and proceed to Phase-1 implementation.
 *   6. Phase 5 task generation is BLOCKED until this evidence file exists
 *      with verdict='confirmed' OR verdict='downgraded' matching the
 *      FR-prescribed downgrade_target.
 *
 * Evidence Schema (FR-090a)
 * -------------------------
 *   {
 *     "decision_q":          "Q16",
 *     "hypothesis":          string,
 *     "sample_size_min":     number,
 *     "observed":            {
 *       "frames_received":      number,
 *       "frames_with_token_usage": number,
 *       "frames_with_cost_usage":  number,
 *       "fields_present":       string[],
 *       "fields_missing":       string[],
 *       "stderr_hint":          string | null
 *     },
 *     "verdict":             "confirmed" | "downgraded",
 *     "downgrade_target":    string?,
 *     "captured_at":         ISO-8601 string
 *   }
 *
 * NOTE — Author-only here. The script is INVOKED by an operator on a node
 * with the Claude Code CLI installed. CI does not run this script.
 *
 * @see specs/008-resource-governance/spec.md FR-071, FR-071a, FR-090a
 * @see specs/008-resource-governance/tasks.md T001
 */

import { spawn } from 'node:child_process';
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
  'verify-claude-code-otel-emission.json',
);

const REQUIRED_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'model',
  'request_id',
  'session_id',
  'cost_usd',
  'duration_ms',
];

interface CliArgs {
  sampleSize: number;
  prompt: string;
  stubReceiver: boolean;
  receiverPort: number;
  timeoutMs: number;
}

interface FrameObservation {
  hasTokenUsage: boolean;
  hasCostUsage: boolean;
  fieldsPresent: Set<string>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sampleSize: 10,
    prompt: '1+1',
    stubReceiver: false,
    receiverPort: 4318,
    timeoutMs: 60_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample-size' && argv[i + 1]) {
      args.sampleSize = Number.parseInt(argv[++i] ?? '10', 10);
    } else if (a === '--prompt' && argv[i + 1]) {
      args.prompt = String(argv[++i]);
    } else if (a === '--stub-receiver') {
      args.stubReceiver = true;
    } else if (a === '--port' && argv[i + 1]) {
      args.receiverPort = Number.parseInt(argv[++i] ?? '4318', 10);
    } else if (a === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number.parseInt(argv[++i] ?? '60000', 10);
    }
  }
  return args;
}

function startStubReceiver(port: number, observations: FrameObservation[]): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const obs: FrameObservation = {
        hasTokenUsage: /claude_code\.token\.usage/.test(body),
        hasCostUsage: /claude_code\.cost\.usage/.test(body),
        fieldsPresent: new Set<string>(),
      };
      for (const f of REQUIRED_FIELDS) {
        if (body.includes(f)) obs.fieldsPresent.add(f);
      }
      observations.push(obs);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/x-protobuf');
      res.end();
    });
  });
  server.listen(port, '127.0.0.1');
  return server;
}

function runClaudeOnce(prompt: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolveP) => {
    const env = {
      ...process.env,
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    };
    const child = spawn('claude', ['-p', prompt], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        resolveP(Buffer.concat(stderrChunks).toString('utf8'));
      }
    }, timeoutMs);
    child.on('exit', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolveP(Buffer.concat(stderrChunks).toString('utf8'));
      }
    });
    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolveP(Buffer.concat(stderrChunks).toString('utf8'));
      }
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const observations: FrameObservation[] = [];
  let server: Server | null = null;
  if (args.stubReceiver) {
    server = startStubReceiver(args.receiverPort, observations);
  }

  let lastStderr = '';
  for (let i = 0; i < args.sampleSize; i++) {
    lastStderr = await runClaudeOnce(args.prompt, args.receiverPort, args.timeoutMs);
  }

  if (server) await new Promise<void>((res) => server!.close(() => res()));

  const framesReceived = observations.length;
  const framesWithToken = observations.filter((o) => o.hasTokenUsage).length;
  const framesWithCost = observations.filter((o) => o.hasCostUsage).length;
  const allFieldsSeen = new Set<string>();
  for (const o of observations) for (const f of o.fieldsPresent) allFieldsSeen.add(f);
  const fieldsMissing = REQUIRED_FIELDS.filter((f) => !allFieldsSeen.has(f));

  const meetsConfirmedBar =
    framesReceived >= args.sampleSize && framesWithToken > 0 && fieldsMissing.length === 0;
  const verdict: 'confirmed' | 'downgraded' = meetsConfirmedBar ? 'confirmed' : 'downgraded';

  const evidence = {
    decision_q: 'Q16',
    hypothesis:
      "Setting CLAUDE_CODE_ENABLE_TELEMETRY=1 + OTEL_EXPORTER_OTLP_ENDPOINT causes 'claude -p' subprocess to emit canonical OTLP frames containing claude_code.token.usage with full FR-071a field parity.",
    sample_size_min: args.sampleSize,
    observed: {
      frames_received: framesReceived,
      frames_with_token_usage: framesWithToken,
      frames_with_cost_usage: framesWithCost,
      fields_present: Array.from(allFieldsSeen).sort(),
      fields_missing: fieldsMissing,
      stderr_hint: lastStderr ? lastStderr.slice(0, 4096) : null,
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
    `verify-claude-code-otel-emission: verdict=${verdict} frames=${framesReceived}/${args.sampleSize} → ${EVIDENCE_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error('verify-claude-code-otel-emission FAILED:', err);
  process.exit(1);
});
