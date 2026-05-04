/**
 * SPEC-008 — Claude Code transcript-replay adapter (T095).
 *
 * Per FR-071a (transcript replay as alternate ingest path), FR-088
 * (cross-source dedup with native_otel via provider_request_id +
 * provider_timestamp_ms triple).
 *
 * Reads JSONL transcript files from `~/.claude/transcripts/*.jsonl` (or
 * the configured override) and emits one `raw_usage_events` row per
 * usage-bearing entry. Field-set parity with native OTel: provider,
 * model, tokens_in, tokens_out, cache_read_in, cache_creation_in,
 * cost_usd, duration_ms, session_id, provider_request_id,
 * provider_timestamp_ms.
 *
 * The transcript shape (Claude Code 1.x):
 *   { type: 'message_complete', timestamp_ms, request_id, model,
 *     usage: { input_tokens, output_tokens, cache_read_input_tokens,
 *              cache_creation_input_tokens },
 *     cost_usd, duration_ms, session_id }
 * Other entry types (`status`, `tool_use`, `text_delta`, ...) are
 * skipped — only `message_complete` carries usage.
 *
 * Absent-safe contract:
 *   - If the transcripts directory is missing, `replayTranscripts`
 *     resolves to `{ ok: true, processed: 0, skipped: 0 }`.
 *   - Malformed JSON lines are counted as `skipped` and discarded; the
 *     replay proceeds to the next line. No throw.
 *
 * Source registration:
 *   - `source_id='claude_transcript'`, `enforcement_eligibility='soft'`
 *     per advisor guidance (transcript replay is replay-grade — never
 *     drives synchronous block decisions). Dedup confidence default
 *     `medium` because the transcript may lag the native OTel emit.
 *
 * @see specs/008-resource-governance/spec.md FR-071a, FR-088
 * @see specs/008-resource-governance/tasks.md T095
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

/** Source id for transcript-replay ingest. */
export const CLAUDE_TRANSCRIPT_SOURCE_ID = 'claude_transcript';

/** Parser-version tag stamped on every transcript-derived raw row. */
export const CLAUDE_TRANSCRIPT_PARSER_VERSION = 'claude-transcript-v1';

/** Replay options. */
export interface ReplayOptions {
  /** Override transcripts directory. Defaults to `~/.claude/transcripts/`. */
  transcriptsDir?: string;
  /** Optional workspace context for the resulting raw rows. */
  workspaceId?: number | null;
  /** Optional agent context. */
  agentId?: number | null;
  /** Optional task context. */
  taskId?: number | null;
  /** Bound on rows ingested per call (default 10_000). */
  maxRows?: number;
}

/** Replay result summary. */
export interface ReplayResult {
  ok: true;
  processed: number;
  skipped: number;
  files: number;
}

/** Narrow shape of a `message_complete` transcript entry. */
interface MessageCompleteEntry {
  type: 'message_complete';
  timestamp_ms: number;
  request_id?: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
}

function isMessageComplete(v: unknown): v is MessageCompleteEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return r['type'] === 'message_complete' && typeof r['timestamp_ms'] === 'number';
}

/** Default transcripts directory. */
function defaultTranscriptsDir(): string {
  return path.join(homedir(), '.claude', 'transcripts');
}

/**
 * Register the `claude_transcript` source. Idempotent.
 */
export function registerClaudeTranscriptSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: CLAUDE_TRANSCRIPT_SOURCE_ID,
    display_name: 'Claude Code Transcript Replay',
    enforcement_eligibility: 'soft',
    dedupe_confidence_default: 'medium',
    expected_envelope_bytes: 4096,
  });
}

/**
 * Replay every `*.jsonl` file under the transcripts directory, emitting
 * one raw_usage_events row per `message_complete` entry. Multi-statement
 * inserts run inside a single immediate transaction for throughput.
 *
 * Absent-safe — missing directory / no .jsonl files returns
 * `{ ok: true, processed: 0, skipped: 0, files: 0 }`.
 */
export async function replayTranscripts(
  db: Database.Database,
  opts: ReplayOptions = {},
): Promise<ReplayResult> {
  const dir = opts.transcriptsDir ?? defaultTranscriptsDir();
  const maxRows = opts.maxRows ?? 10_000;
  let processed = 0;
  let skipped = 0;
  let files = 0;

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, processed: 0, skipped: 0, files: 0 };
    }
    throw err;
  }

  registerClaudeTranscriptSource(db);

  const jsonlFiles = dirEntries.filter((n) => n.endsWith('.jsonl'));
  files = jsonlFiles.length;

  // Collect all rows first so the entire replay fits in one tx for
  // throughput. The maxRows cap protects against unbounded directories.
  const rowsToInsert: {
    entry: MessageCompleteEntry;
  }[] = [];

  for (const file of jsonlFiles) {
    if (rowsToInsert.length >= maxRows) break;
    const fullPath = path.join(dir, file);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      skipped += 1;
      continue;
    }
    const lines = content.split('\n');
    for (const line of lines) {
      if (rowsToInsert.length >= maxRows) break;
      const trimmed = line.trim();
      if (trimmed === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        skipped += 1;
        continue;
      }
      if (!isMessageComplete(parsed)) continue;
      rowsToInsert.push({ entry: parsed });
    }
  }

  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly { entry: MessageCompleteEntry }[]) => {
    for (const item of batch) {
      const e = item.entry;
      const ts = e.timestamp_ms;
      const partition_month = partitionMonthFromMs(ts);
      const usage = e.usage ?? {};
      const raw_attributes_json = JSON.stringify({
        model: e.model ?? null,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd: e.cost_usd ?? 0,
        duration_ms: e.duration_ms ?? null,
      });
      insertRawUsageEvent(db, {
        source_id: CLAUDE_TRANSCRIPT_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider: 'anthropic',
        provider_request_id: e.request_id ?? null,
        provider_timestamp_ms: ts,
        session_id: e.session_id ?? null,
        generation_id: null,
        raw_attributes_json,
        parser_version: CLAUDE_TRANSCRIPT_PARSER_VERSION,
        schema_version_observed: 'claude-transcript-1',
        reconcile_status: 'ok',
        dedupe_confidence: 'medium',
        enforcement_eligibility: 'soft',
        partition_month,
      });
      processed += 1;
    }
  });
  tx.immediate(rowsToInsert);

  return { ok: true, processed, skipped, files };
}
