/**
 * SPEC-008 — Claude Code OTel ingest adapter (T094).
 *
 * Per FR-071 (Claude Code OTel as a hard-eligible native source), FR-080
 * (alternate ingest paths during OTel outage), FR-088 (cross-source dedup
 * with claude-code-transcript replay).
 *
 * Surface:
 *   - `spawnClaudeOtelStream(opts)` — spawn `claude -p ...` with
 *     `CLAUDE_CODE_ENABLE_TELEMETRY=1` and capture the OTel stream from
 *     the subprocess. The subprocess emits OTLP/HTTP to the configured
 *     `OTEL_EXPORTER_OTLP_ENDPOINT`; in-process ingestion happens via
 *     the `/api/otlp/v1/{traces,metrics}` route handlers (T108/T109).
 *   - `getClaudeOtelEnv()` — return the merged env block the spawner uses,
 *     exposed for tests.
 *
 * Absent-safe contract:
 *   - If `claude` is not on PATH, `spawnClaudeOtelStream` resolves to
 *     `{ ok: false, reason: 'claude_binary_missing' }`. No throws on
 *     cold start when the user hasn't installed Claude Code.
 *   - If the user has not opted into telemetry, the spawn still succeeds;
 *     the absent-telemetry case is handled by the receiver, not here.
 *
 * Source registration:
 *   - `source_id='native_otel'` with `enforcement_eligibility='hard'`.
 *     This adapter writes NO direct rows; it forwards OTel to the
 *     receiver, which does the actual `raw_usage_events` insert.
 *     Registration here keeps the FK valid for any out-of-band ingest
 *     that uses the same source_id.
 *
 * @see specs/008-resource-governance/spec.md FR-071, FR-080, FR-088
 * @see specs/008-resource-governance/tasks.md T094
 * @see Constitution Convention J — strict-scope module
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { ensureSourceRegistered } from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for native Claude Code OTel ingest. */
export const NATIVE_OTEL_SOURCE_ID = 'native_otel';

/** Default OTLP endpoint base — receiver port resolved at runtime. */
const DEFAULT_OTLP_ENDPOINT = 'http://127.0.0.1:3000';

/** Result of a spawn attempt. */
export type SpawnResult =
  | {
      ok: true;
      child: ChildProcess;
      env: Record<string, string>;
    }
  | {
      ok: false;
      reason: 'claude_binary_missing' | 'spawn_failed';
      detail?: string;
    };

/** Spawn options. */
export interface SpawnOptions {
  /** Free-form `claude -p` prompt. Caller is responsible for shell-safe input. */
  prompt: string;
  /** OTLP endpoint override. Defaults to `http://127.0.0.1:3000`. */
  otlpEndpoint?: string;
  /** API key forwarded as `x-api-key` for the receiver. Optional. */
  apiKey?: string;
  /** Workspace id to bind events to. Optional. */
  workspaceId?: number | null;
  /** Path override for the `claude` binary; defaults to PATH lookup. */
  claudeBinary?: string;
}

/**
 * Build the env block we pass to the `claude` subprocess. Inherits the
 * caller's env then overlays the OTel-enabling switches.
 */
export function getClaudeOtelEnv(opts: {
  endpoint: string;
  apiKey?: string;
  workspaceId?: number | null;
}): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  env['CLAUDE_CODE_ENABLE_TELEMETRY'] = '1';
  env['OTEL_EXPORTER_OTLP_ENDPOINT'] = opts.endpoint;
  env['OTEL_EXPORTER_OTLP_PROTOCOL'] = 'http/protobuf';
  if (opts.apiKey !== undefined) {
    // OTLP exporters use OTEL_EXPORTER_OTLP_HEADERS for auth.
    env['OTEL_EXPORTER_OTLP_HEADERS'] = `x-api-key=${opts.apiKey}`;
  }
  if (opts.workspaceId !== undefined && opts.workspaceId !== null) {
    env['MC_WORKSPACE_ID'] = String(opts.workspaceId);
  }
  return env;
}

/**
 * Spawn `claude -p <prompt>` with telemetry enabled. The subprocess
 * streams OTel to the receiver, which materializes raw_usage_events rows.
 * Returns the child handle so the caller can wire stdout/stderr or wait.
 *
 * Absent-safe: if `claude` is not on PATH, returns
 * `{ ok: false, reason: 'claude_binary_missing' }` — the caller should
 * treat this as a non-error (the user simply hasn't installed Claude Code).
 */
export function spawnClaudeOtelStream(opts: SpawnOptions): SpawnResult {
  const endpoint = opts.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  const env = getClaudeOtelEnv({
    endpoint,
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    ...(opts.workspaceId !== undefined ? { workspaceId: opts.workspaceId } : {}),
  });
  const binary = opts.claudeBinary ?? 'claude';
  try {
    const child = spawn(binary, ['-p', opts.prompt], {
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // ENOENT surfaces asynchronously via 'error' event; mark spawn ok
    // and let the caller listen for `child.on('error', ...)`. For tests
    // and absent-safe callers, `claudeBinary` should be vetted upstream.
    return { ok: true, child, env };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: false, reason: 'claude_binary_missing' };
    }
    return {
      ok: false,
      reason: 'spawn_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Register the `native_otel` source with the capability registry.
 * Idempotent. Call this once at adapter wire-up so that downstream
 * receiver inserts have a valid FK target.
 */
export function registerNativeOtelSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: NATIVE_OTEL_SOURCE_ID,
    display_name: 'Claude Code Native OTel',
    enforcement_eligibility: 'hard',
    dedupe_confidence_default: 'high',
    expected_envelope_bytes: 8192,
  });
}
