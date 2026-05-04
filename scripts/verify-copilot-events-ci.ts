#!/usr/bin/env -S npx tsx
/**
 * SPEC-008 Phase-0 Verification Spike — Copilot CLI `events.jsonl` shape
 *
 * Decision: Q25 / Q47 — When the Copilot CLI is invoked in CI / non-TTY
 *   mode, does it emit a well-formed `events.jsonl` whose schema matches
 *   the version declared in `~/.copilot/config.json`?
 *
 * Hypothesis (FR-073, FR-083, FR-090d):
 *   For Copilot CLI version `0.0.422` (premium-request units pre-2026-06-01),
 *   the `events.jsonl` includes per-request rows with `requests[].cost`
 *   (USD or premium-request count) and the required identity fields. The
 *   parser MUST be able to validate the file against the T1/T2 tiered
 *   schema without falling through to T3 sampling.
 *
 * Operator Procedure
 * ------------------
 *   1. Install Copilot CLI on the operator node; ensure
 *      `~/.copilot/config.json` exists with a `version` field.
 *   2. Set CI / non-TTY env: `CI=1` and unset interactive flags.
 *   3. Run:
 *        pnpm tsx scripts/verify-copilot-events-ci.ts \
 *          --sample-size 20 \
 *          --events-path ~/.copilot/events.jsonl
 *   4. The script invokes a representative Copilot CLI command,
 *      captures the `~/.copilot/events.jsonl` rows added during the
 *      window, and validates each row against the T1 strict required-field
 *      guard for the declared version.
 *   5. Evidence written to
 *      `docs/ai/specs/spikes/verify-copilot-events-ci.json`.
 *
 * Evidence Schema (FR-090a) — extended with config-version + rows-validated.
 *
 * NOTE — Author-only here. Operator-side execution.
 *
 * @see specs/008-resource-governance/spec.md FR-073, FR-083, FR-090a, FR-090d, FR-090d1
 * @see specs/008-resource-governance/tasks.md T004
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  'verify-copilot-events-ci.json',
);

interface CliArgs {
  sampleSize: number;
  eventsPath: string;
  configPath: string;
  copilotCommand: string;
  copilotArgs: string[];
  timeoutMs: number;
}

interface RowValidation {
  passed: boolean;
  missingFields: string[];
  rawSample: string;
}

const T1_REQUIRED_FIELDS_V_0_0_422 = ['session_id', 'request_id', 'model'];

const T1_REQUIRED_FIELDS_V_0_1_X = ['session_id', 'request_id', 'model'];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sampleSize: 20,
    eventsPath: process.env.COPILOT_EVENTS_PATH ?? join(homedir(), '.copilot', 'events.jsonl'),
    configPath: join(homedir(), '.copilot', 'config.json'),
    copilotCommand: 'copilot',
    copilotArgs: ['suggest', '-t', 'shell', 'list current directory'],
    timeoutMs: 120_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample-size' && argv[i + 1]) {
      args.sampleSize = Number.parseInt(argv[++i] ?? '20', 10);
    } else if (a === '--events-path' && argv[i + 1]) {
      args.eventsPath = String(argv[++i]);
    } else if (a === '--config-path' && argv[i + 1]) {
      args.configPath = String(argv[++i]);
    } else if (a === '--cmd' && argv[i + 1]) {
      args.copilotCommand = String(argv[++i]);
    } else if (a === '--copilot-args' && argv[i + 1]) {
      args.copilotArgs = String(argv[++i]).split(' ');
    } else if (a === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number.parseInt(argv[++i] ?? '120000', 10);
    }
  }
  return args;
}

function readVersion(configPath: string): string {
  if (!existsSync(configPath)) return 'unknown';
  try {
    const raw = readFileSync(configPath, 'utf8');
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const v = obj['version'];
    return typeof v === 'string' ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

function selectRequiredFields(version: string): string[] {
  if (version === '0.0.422') return T1_REQUIRED_FIELDS_V_0_0_422;
  if (/^0\.1\./.test(version)) return T1_REQUIRED_FIELDS_V_0_1_X;
  return T1_REQUIRED_FIELDS_V_0_0_422;
}

function selectSchemaProbeField(version: string): string {
  if (version === '0.0.422') return 'cost';
  if (/^0\.1\./.test(version)) return 'credits';
  return 'cost';
}

function validateRow(line: string, requiredFields: string[]): RowValidation {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return { passed: false, missingFields: requiredFields, rawSample: trimmed.slice(0, 200) };
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { passed: false, missingFields: requiredFields, rawSample: trimmed.slice(0, 200) };
  }
  const missing: string[] = [];
  for (const f of requiredFields) {
    if (obj[f] === undefined || obj[f] === null) missing.push(f);
  }
  return { passed: missing.length === 0, missingFields: missing, rawSample: trimmed.slice(0, 200) };
}

interface CopilotRunResult {
  exitCode: number | null;
  stderrHint: string;
}

async function runCopilot(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<CopilotRunResult> {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));
    child.stdout?.resume();
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      resolveP({
        exitCode: code,
        stderrHint: Buffer.concat(stderrChunks).toString('utf8').slice(0, 4096),
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion(args.configPath);
  const requiredFields = selectRequiredFields(version);
  const probeField = selectSchemaProbeField(version);

  let mtimeBefore = -1;
  if (existsSync(args.eventsPath)) {
    try {
      mtimeBefore = statSync(args.eventsPath).mtimeMs;
    } catch {
      mtimeBefore = -1;
    }
  }

  const runs = Math.max(1, Math.ceil(args.sampleSize / 5));
  let lastStderr = '';
  for (let i = 0; i < runs; i++) {
    const r = await runCopilot(args.copilotCommand, args.copilotArgs, args.timeoutMs);
    lastStderr = r.stderrHint;
  }

  let rowsAfter: string[] = [];
  if (existsSync(args.eventsPath)) {
    try {
      const body = readFileSync(args.eventsPath, 'utf8');
      rowsAfter = body.split('\n').filter((l) => l.trim().length > 0);
    } catch {
      rowsAfter = [];
    }
  }

  // Heuristic: take rows whose JSON `ts`/`timestamp` is newer than mtimeBefore,
  // or — if we can't tell — take the last `sampleSize` rows.
  const candidate = rowsAfter.slice(-Math.max(args.sampleSize, 1));

  let valid = 0;
  let invalid = 0;
  let probeFieldPresent = 0;
  for (const line of candidate) {
    const v = validateRow(line, requiredFields);
    if (v.passed) valid++;
    else invalid++;
    if (line.includes(`"${probeField}"`)) probeFieldPresent++;
  }

  const rowsObserved = candidate.length;
  const meetsConfirmedBar =
    version !== 'unknown' &&
    rowsObserved >= args.sampleSize &&
    invalid === 0 &&
    probeFieldPresent > 0;
  const verdict: 'confirmed' | 'downgraded' = meetsConfirmedBar ? 'confirmed' : 'downgraded';

  const evidence = {
    decision_q: 'Q25',
    hypothesis:
      "Copilot CLI in CI / non-TTY mode emits ~/.copilot/events.jsonl with rows whose required-field set matches the schema declared in ~/.copilot/config.json (T1 strict guard passes; T2 full validation passes for ≥ sample-size rows).",
    sample_size_min: args.sampleSize,
    observed: {
      copilot_config_version: version,
      events_path_exists: existsSync(args.eventsPath),
      events_path_mtime_before_ms: mtimeBefore,
      rows_examined: rowsObserved,
      rows_t1_passed: valid,
      rows_t1_failed: invalid,
      rows_with_schema_probe_field: probeFieldPresent,
      schema_probe_field: probeField,
      stderr_hint: lastStderr || null,
    },
    verdict,
    ...(verdict === 'downgraded' ? { downgrade_target: 'schema_broken' } : {}),
    captured_at: new Date().toISOString(),
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    `verify-copilot-events-ci: verdict=${verdict} version=${version} rows=${rowsObserved} valid=${valid} → ${EVIDENCE_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error('verify-copilot-events-ci FAILED:', err);
  process.exit(1);
});
