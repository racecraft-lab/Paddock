/**
 * SPEC-008 — Ollama log-file adapter (T101).
 *
 * Per FR-074 (local-LLM ingest), FR-260b (resolve local-proxy port from
 * `OLLAMA_HOST` env or default `127.0.0.1:11434`).
 *
 * Reads Ollama runtime logs (default `~/.ollama/logs/server.log`) and
 * extracts model-completion events. Each event materializes one
 * `raw_usage_events` row with `provider='ollama'` and the resolved
 * model id.
 *
 * Source registration:
 *   - `source_id='ollama_log'`, `enforcement_eligibility='reconciliation_only'`,
 *     `dedupe_confidence_default='low'` — log lines lack a stable
 *     request id, so dedup is heuristic.
 *
 * Absent-safe: missing log file returns
 * `{ ok:true, processed:0, skipped:0 }`.
 *
 * @see specs/008-resource-governance/spec.md FR-074, FR-260b
 * @see specs/008-resource-governance/tasks.md T101
 * @see Constitution Convention J — strict-scope module
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for Ollama log ingest. */
export const OLLAMA_LOG_SOURCE_ID = 'ollama_log';

/** Parser-version tag stamped on every Ollama-derived raw row. */
export const OLLAMA_LOG_PARSER_VERSION = 'ollama-log-v1';

/** Default Ollama daemon address. */
export const OLLAMA_DEFAULT_HOST = '127.0.0.1:11434';

/**
 * Resolve the local-proxy address for Ollama per FR-260b. Honors
 * `OLLAMA_HOST` env (canonical) and falls back to the default.
 */
export function resolveOllamaHost(envOverride?: string  ): string {
  if (envOverride !== undefined && envOverride !== '') return envOverride;
  // CLAUDE.md note: `process.env.FEATURE_*` is forbidden outside feature-flags.
  // OLLAMA_HOST is plain runtime config, not a feature flag — direct read OK.
  const env = process.env['OLLAMA_HOST'];
  if (typeof env === 'string' && env !== '') return env;
  return OLLAMA_DEFAULT_HOST;
}

/** Adapter options. */
export interface ReadOptions {
  /** Override log file path. Defaults to `~/.ollama/logs/server.log`. */
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
  host: string;
}

/** Subset of an Ollama log line (line-mode JSON + plain text). */
interface OllamaLineEvent {
  timestamp_ms: number;
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration_ns?: number;
  request_id?: string | null;
  session_id?: string | null;
}

function defaultLogPath(): string {
  return path.join(homedir(), '.ollama', 'logs', 'server.log');
}

/** Register the ollama_log source. Idempotent. */
export function registerOllamaLogSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: OLLAMA_LOG_SOURCE_ID,
    display_name: 'Ollama Server Log',
    enforcement_eligibility: 'reconciliation_only',
    dedupe_confidence_default: 'low',
    expected_envelope_bytes: 1024,
  });
}

/**
 * Parse one log line. Recognizes two shapes:
 *   1) JSON: `{"time":"...","model":"...","prompt_eval_count":N,"eval_count":N}`
 *   2) Plain text: ignored (returned as null).
 */
function parseOllamaLine(line: string): OllamaLineEvent | null {
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

  // Either `time` (RFC3339) or `timestamp_ms` (epoch).
  let ts = Date.now();
  if (typeof obj['timestamp_ms'] === 'number') {
    ts = obj['timestamp_ms'];
  } else if (typeof obj['time'] === 'string') {
    const parsed = Date.parse(obj['time']);
    if (!Number.isNaN(parsed)) ts = parsed;
  }

  const out: OllamaLineEvent = {
    timestamp_ms: ts,
    model,
    request_id: typeof obj['request_id'] === 'string' ? (obj['request_id']) : null,
    session_id: typeof obj['session_id'] === 'string' ? (obj['session_id']) : null,
  };
  if (typeof obj['prompt_eval_count'] === 'number') {
    out.prompt_eval_count = obj['prompt_eval_count'];
  }
  if (typeof obj['eval_count'] === 'number') {
    out.eval_count = obj['eval_count'];
  }
  if (typeof obj['total_duration'] === 'number') {
    out.total_duration_ns = obj['total_duration'];
  }
  return out;
}

/**
 * Read the Ollama log and emit one raw_usage_events row per recognized
 * line. Absent-safe.
 */
export async function readOllamaLog(
  db: Database.Database,
  opts: ReadOptions = {},
): Promise<ReadResult> {
  const filePath = opts.logPath ?? defaultLogPath();
  const maxRows = opts.maxRows ?? 10_000;
  const host = resolveOllamaHost();
  let processed = 0;
  let skipped = 0;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, processed: 0, skipped: 0, host };
    }
    throw err;
  }

  registerOllamaLogSource(db);

  const events: OllamaLineEvent[] = [];
  for (const line of content.split('\n')) {
    if (events.length >= maxRows) break;
    const ev = parseOllamaLine(line);
    if (ev === null) {
      if (line.trim() !== '') skipped += 1;
      continue;
    }
    events.push(ev);
  }

  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly OllamaLineEvent[]) => {
    for (const ev of batch) {
      const partition_month = partitionMonthFromMs(ev.timestamp_ms);
      const raw_attributes_json = JSON.stringify({
        host,
        model: ev.model,
        input_tokens: ev.prompt_eval_count ?? 0,
        output_tokens: ev.eval_count ?? 0,
        duration_ms:
          ev.total_duration_ns !== undefined
            ? Math.round(ev.total_duration_ns / 1_000_000)
            : null,
      });
      insertRawUsageEvent(db, {
        source_id: OLLAMA_LOG_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider: 'ollama',
        provider_request_id: ev.request_id ?? null,
        provider_timestamp_ms: ev.timestamp_ms,
        session_id: ev.session_id ?? null,
        generation_id: null,
        raw_attributes_json,
        parser_version: OLLAMA_LOG_PARSER_VERSION,
        schema_version_observed: 'ollama-log-1',
        reconcile_status: 'ok',
        dedupe_confidence: 'low',
        enforcement_eligibility: 'reconciliation_only',
        partition_month,
      });
      processed += 1;
    }
  });
  tx.immediate(events);

  return { ok: true, processed, skipped, host };
}
