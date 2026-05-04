/**
 * SPEC-008 — LM Studio log-file adapter + Aegis local-mode capability probe (T102).
 *
 * Per FR-074 (local-LLM ingest), FR-362 (Aegis local-mode fallback to
 * LM Studio when the gateway is unreachable), FR-364 (capability
 * probe surface for the Aegis evaluator).
 *
 * Reads LM Studio's runtime log (`~/.lmstudio/logs/server.log` or
 * override) and emits one `raw_usage_events` row per recognized
 * usage line.
 *
 * Aegis local-mode hook:
 *   - `getLmStudioCapabilities()` returns whether LM Studio is
 *     reachable (synchronous fs probe of the log file + an env-driven
 *     base URL). The Aegis evaluator (out of scope here) calls this to
 *     decide whether to route a review to LM Studio.
 *
 * Absent-safe: missing log file returns
 * `{ ok:true, processed:0, skipped:0 }`.
 *
 * @see specs/008-resource-governance/spec.md FR-074, FR-362, FR-364
 * @see specs/008-resource-governance/tasks.md T102
 * @see Constitution Convention J — strict-scope module
 */

import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for LM Studio log ingest. */
export const LM_STUDIO_LOG_SOURCE_ID = 'lm_studio_log';

/** Parser-version tag stamped on every LM Studio-derived raw row. */
export const LM_STUDIO_LOG_PARSER_VERSION = 'lm-studio-log-v1';

/** Default LM Studio API base. */
export const LM_STUDIO_DEFAULT_BASE = 'http://127.0.0.1:1234/v1';

/** Capability surface used by the Aegis local-mode router. */
export interface LmStudioCapabilities {
  /** True when the log file exists at the resolved path. */
  log_present: boolean;
  /** Resolved log path (regardless of presence). */
  log_path: string;
  /** Resolved API base URL. */
  api_base: string;
}

/**
 * Resolve the LM Studio API base. `LM_STUDIO_BASE_URL` env wins,
 * otherwise the default `127.0.0.1:1234/v1` (matches LM Studio's
 * documented default).
 */
export function resolveLmStudioBase(envOverride?: string  ): string {
  if (envOverride !== undefined && envOverride !== '') return envOverride;
  const env = process.env['LM_STUDIO_BASE_URL'];
  if (typeof env === 'string' && env !== '') return env;
  return LM_STUDIO_DEFAULT_BASE;
}

function defaultLogPath(): string {
  return path.join(homedir(), '.lmstudio', 'logs', 'server.log');
}

/**
 * Synchronous capability probe used by the Aegis evaluator. Returns
 * `{ log_present, log_path, api_base }` so callers can decide whether
 * to route to LM Studio without paying an HTTP RTT cost.
 */
export function getLmStudioCapabilities(opts: {
  logPath?: string;
  apiBase?: string;
} = {}): LmStudioCapabilities {
  const log_path = opts.logPath ?? defaultLogPath();
  return {
    log_present: existsSync(log_path),
    log_path,
    api_base: resolveLmStudioBase(opts.apiBase),
  };
}

/** Adapter options. */
export interface ReadOptions {
  logPath?: string;
  workspaceId?: number | null;
  agentId?: number | null;
  taskId?: number | null;
  maxRows?: number;
}

/** Adapter result. */
export interface ReadResult {
  ok: true;
  processed: number;
  skipped: number;
  api_base: string;
}

interface LmLineEvent {
  timestamp_ms: number;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  request_id?: string | null;
  session_id?: string | null;
}

/** Register the lm_studio_log source. Idempotent. */
export function registerLmStudioLogSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: LM_STUDIO_LOG_SOURCE_ID,
    display_name: 'LM Studio Server Log',
    enforcement_eligibility: 'reconciliation_only',
    dedupe_confidence_default: 'low',
    expected_envelope_bytes: 1024,
  });
}

/**
 * Parse one log line. Recognizes JSON-line shape with `usage` field
 * (LM Studio mirrors the OpenAI Chat Completions response shape in its
 * server logs).
 */
function parseLmLine(line: string): LmLineEvent | null {
  const trimmed = line.trim();
  if (trimmed === '' || !trimmed.startsWith('{')) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const model = typeof obj['model'] === 'string' ? (obj['model']) : null;
  if (model === null) return null;

  let ts = Date.now();
  if (typeof obj['timestamp_ms'] === 'number') {
    ts = obj['timestamp_ms'];
  } else if (typeof obj['time'] === 'string') {
    const parsed = Date.parse(obj['time']);
    if (!Number.isNaN(parsed)) ts = parsed;
  }

  const usage = obj['usage'];
  let prompt_tokens: number | undefined;
  let completion_tokens: number | undefined;
  let total_tokens: number | undefined;
  if (typeof usage === 'object' && usage !== null) {
    const u = usage as Record<string, unknown>;
    if (typeof u['prompt_tokens'] === 'number') prompt_tokens = u['prompt_tokens'];
    if (typeof u['completion_tokens'] === 'number') completion_tokens = u['completion_tokens'];
    if (typeof u['total_tokens'] === 'number') total_tokens = u['total_tokens'];
  }

  return {
    timestamp_ms: ts,
    model,
    ...(prompt_tokens !== undefined ? { prompt_tokens } : {}),
    ...(completion_tokens !== undefined ? { completion_tokens } : {}),
    ...(total_tokens !== undefined ? { total_tokens } : {}),
    request_id: typeof obj['id'] === 'string' ? (obj['id']) : null,
    session_id: typeof obj['session_id'] === 'string' ? (obj['session_id']) : null,
  };
}

/**
 * Read the LM Studio log and emit one raw row per recognized line.
 * Absent-safe.
 */
export async function readLmStudioLog(
  db: Database.Database,
  opts: ReadOptions = {},
): Promise<ReadResult> {
  const filePath = opts.logPath ?? defaultLogPath();
  const maxRows = opts.maxRows ?? 10_000;
  const api_base = resolveLmStudioBase();
  let processed = 0;
  let skipped = 0;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, processed: 0, skipped: 0, api_base };
    }
    throw err;
  }

  registerLmStudioLogSource(db);

  const events: LmLineEvent[] = [];
  for (const line of content.split('\n')) {
    if (events.length >= maxRows) break;
    const ev = parseLmLine(line);
    if (ev === null) {
      if (line.trim() !== '') skipped += 1;
      continue;
    }
    events.push(ev);
  }

  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly LmLineEvent[]) => {
    for (const ev of batch) {
      const partition_month = partitionMonthFromMs(ev.timestamp_ms);
      const raw_attributes_json = JSON.stringify({
        api_base,
        model: ev.model,
        input_tokens: ev.prompt_tokens ?? 0,
        output_tokens: ev.completion_tokens ?? 0,
        total_tokens: ev.total_tokens ?? null,
      });
      insertRawUsageEvent(db, {
        source_id: LM_STUDIO_LOG_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider: 'lm-studio',
        provider_request_id: ev.request_id ?? null,
        provider_timestamp_ms: ev.timestamp_ms,
        session_id: ev.session_id ?? null,
        generation_id: null,
        raw_attributes_json,
        parser_version: LM_STUDIO_LOG_PARSER_VERSION,
        schema_version_observed: 'lm-studio-log-1',
        reconcile_status: 'ok',
        dedupe_confidence: 'low',
        enforcement_eligibility: 'reconciliation_only',
        partition_month,
      });
      processed += 1;
    }
  });
  tx.immediate(events);

  return { ok: true, processed, skipped, api_base };
}
