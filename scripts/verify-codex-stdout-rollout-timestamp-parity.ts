#!/usr/bin/env -S npx tsx
/**
 * SPEC-008 Phase-0 Verification Spike — Codex stdout↔rollout
 *   `provider_timestamp_ms` parity
 *
 * Decision: Q39 / FR-082 — Do Codex `turn.completed.usage` events emitted
 *   on stdout carry the SAME `provider_timestamp_ms` value as the
 *   corresponding rows in the `rollout-*.jsonl` file?
 *
 * Hypothesis (FR-082):
 *   For a representative sample of ≥ 100 codex turns, EVERY turn's stdout
 *   `turn.completed.usage` event has a `provider_timestamp_ms` that
 *   matches the rollout-file row for the same `(session_id, turn_id)`.
 *   Expected verdict: 'confirmed' (FR-082 → cli_stdout_json
 *   enforcement_eligibility='hard', dedupe_confidence='high').
 *
 * If parity does NOT hold the verdict downgrades to 'downgraded' with
 *   downgrade_target='medium-confidence' — `cli_stdout_json` source-registry
 *   row gets `enforcement_eligibility='soft'`, all Codex canonical events
 *   carry `dedupe_confidence='medium'`, and a one-time
 *   `governance_codex_dedupe_downgraded` activity row fires at startup.
 *
 * Operator Procedure
 * ------------------
 *   1. Install Codex CLI ≥ 0.x on the operator node.
 *   2. Identify the rollout directory (default: `~/.codex/rollouts/` or
 *      `$CODEX_ROLLOUT_DIR`).
 *   3. Run:
 *        pnpm tsx scripts/verify-codex-stdout-rollout-timestamp-parity.ts \
 *          --sample-size 100 \
 *          --rollout-dir ~/.codex/rollouts
 *   4. The script spawns Codex with a deterministic prompt set to
 *      generate ≥ sample-size turns. It captures stdout
 *      `turn.completed.usage` events via JSON-line parsing AND scans the
 *      newest `rollout-*.jsonl` files for matching rows. For each turn it
 *      compares `provider_timestamp_ms`.
 *   5. Evidence written to
 *      `docs/ai/specs/spikes/verify-codex-stdout-rollout-timestamp-parity.json`.
 *
 * Evidence Schema (FR-090a) — extended with parity-mismatch counts.
 *
 * NOTE — Author-only here. Operator-side execution.
 *
 * @see specs/008-resource-governance/spec.md FR-072, FR-082, FR-090a, FR-388
 * @see specs/008-resource-governance/tasks.md T003
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EVIDENCE_PATH = resolve(
  __dirname,
  '..',
  'docs',
  'ai',
  'specs',
  'spikes',
  'verify-codex-stdout-rollout-timestamp-parity.json',
);

interface CliArgs {
  sampleSize: number;
  rolloutDir: string;
  prompt: string;
  timeoutMs: number;
}

interface UsageEvent {
  sessionId: string;
  turnId: string;
  providerTimestampMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sampleSize: 100,
    rolloutDir: process.env.CODEX_ROLLOUT_DIR ?? join(homedir(), '.codex', 'rollouts'),
    prompt: 'Reply with the single word OK.',
    timeoutMs: 600_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample-size' && argv[i + 1]) {
      args.sampleSize = Number.parseInt(argv[++i] ?? '100', 10);
    } else if (a === '--rollout-dir' && argv[i + 1]) {
      args.rolloutDir = String(argv[++i]);
    } else if (a === '--prompt' && argv[i + 1]) {
      args.prompt = String(argv[++i]);
    } else if (a === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number.parseInt(argv[++i] ?? '600000', 10);
    }
  }
  return args;
}

function tryExtractUsage(line: string): UsageEvent | null {
  // Codex stdout emits JSON lines for protocol events; the
  // `turn.completed.usage` event carries `session_id`, `turn_id`, and a
  // top-level `provider_timestamp_ms` (or nested `meta.provider_timestamp_ms`).
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const type = obj['type'] ?? obj['event'] ?? '';
    if (type !== 'turn.completed.usage' && type !== 'turn.completed') return null;
    const sessionId = String(obj['session_id'] ?? '');
    const turnId = String(obj['turn_id'] ?? '');
    const ptsTop = obj['provider_timestamp_ms'];
    const meta = obj['meta'];
    let providerTimestampMs = NaN;
    if (typeof ptsTop === 'number') providerTimestampMs = ptsTop;
    else if (meta && typeof meta === 'object') {
      const ptsMeta = (meta as Record<string, unknown>)['provider_timestamp_ms'];
      if (typeof ptsMeta === 'number') providerTimestampMs = ptsMeta;
    }
    if (!sessionId || !turnId || !Number.isFinite(providerTimestampMs)) return null;
    return { sessionId, turnId, providerTimestampMs };
  } catch {
    return null;
  }
}

interface CodexCaptureResult {
  stdoutEvents: UsageEvent[];
  stderrHint: string;
  exitCode: number | null;
}

async function runCodex(prompt: string, timeoutMs: number): Promise<CodexCaptureResult> {
  return new Promise((resolveP) => {
    const child = spawn('codex', ['exec', '--json', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutBuf: string[] = [];
    const stderrBuf: Buffer[] = [];
    const events: UsageEvent[] = [];
    let buffer = '';
    child.stdout?.on('data', (c: Buffer) => {
      buffer += c.toString('utf8');
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        stdoutBuf.push(line);
        const e = tryExtractUsage(line);
        if (e) events.push(e);
        nl = buffer.indexOf('\n');
      }
    });
    child.stderr?.on('data', (c: Buffer) => stderrBuf.push(c));
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      resolveP({
        stdoutEvents: events,
        stderrHint: Buffer.concat(stderrBuf).toString('utf8').slice(0, 4096),
        exitCode: code,
      });
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      finish(null);
    }, timeoutMs);
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

function readRolloutEvents(rolloutDir: string): UsageEvent[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(rolloutDir);
  } catch {
    return [];
  }
  const files = entries
    .filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))
    .map((f) => ({ name: f, mtime: statSync(join(rolloutDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
    .map((x) => join(rolloutDir, x.name));
  const events: UsageEvent[] = [];
  for (const f of files) {
    let body: string;
    try {
      body = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of body.split('\n')) {
      const e = tryExtractUsage(line);
      if (e) events.push(e);
    }
  }
  return events;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rolloutBefore = readRolloutEvents(args.rolloutDir);
  const beforeKeys = new Set(rolloutBefore.map((e) => `${e.sessionId}:${e.turnId}`));

  const codexResult = await runCodex(args.prompt, args.timeoutMs);
  const stdoutEvents = codexResult.stdoutEvents;

  // Re-read rollout AFTER codex run to capture newly written rows.
  const rolloutAfter = readRolloutEvents(args.rolloutDir);
  const newRolloutEvents = rolloutAfter.filter(
    (e) => !beforeKeys.has(`${e.sessionId}:${e.turnId}`),
  );

  const rolloutByKey = new Map<string, UsageEvent>();
  for (const e of newRolloutEvents) rolloutByKey.set(`${e.sessionId}:${e.turnId}`, e);

  let matched = 0;
  let mismatched = 0;
  let stdoutOnly = 0;
  for (const s of stdoutEvents) {
    const r = rolloutByKey.get(`${s.sessionId}:${s.turnId}`);
    if (!r) {
      stdoutOnly++;
    } else if (r.providerTimestampMs === s.providerTimestampMs) {
      matched++;
    } else {
      mismatched++;
    }
  }
  const rolloutOnly = newRolloutEvents.filter(
    (r) => !stdoutEvents.some((s) => s.sessionId === r.sessionId && s.turnId === r.turnId),
  ).length;

  const turnsObserved = stdoutEvents.length;
  const meetsConfirmedBar =
    turnsObserved >= args.sampleSize && mismatched === 0 && stdoutOnly === 0 && rolloutOnly === 0;
  const verdict: 'confirmed' | 'downgraded' = meetsConfirmedBar ? 'confirmed' : 'downgraded';

  const evidence = {
    decision_q: 'Q39',
    hypothesis:
      "For ≥ sample-size codex turns, every stdout 'turn.completed.usage' event's provider_timestamp_ms matches the rollout-*.jsonl row for the same (session_id, turn_id). Confirmed verdict locks cli_stdout_json enforcement_eligibility='hard' and dedupe_confidence='high'.",
    sample_size_min: args.sampleSize,
    observed: {
      stdout_events: turnsObserved,
      rollout_events_new: newRolloutEvents.length,
      matched,
      mismatched,
      stdout_only: stdoutOnly,
      rollout_only: rolloutOnly,
      stderr_hint: codexResult.stderrHint || null,
    },
    verdict,
    ...(verdict === 'downgraded' ? { downgrade_target: 'medium-confidence' } : {}),
    captured_at: new Date().toISOString(),
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    `verify-codex-stdout-rollout-timestamp-parity: verdict=${verdict} matched=${matched} mismatched=${mismatched} stdout_only=${stdoutOnly} rollout_only=${rolloutOnly} → ${EVIDENCE_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error('verify-codex-stdout-rollout-timestamp-parity FAILED:', err);
  process.exit(1);
});
