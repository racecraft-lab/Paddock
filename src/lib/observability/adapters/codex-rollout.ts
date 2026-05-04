/**
 * SPEC-008 — Codex rollout-file watcher + stdout↔rollout join (T097).
 *
 * Per FR-072 (Codex usage events), FR-082 (dedup confidence), FR-388
 * (parity-precondition for cross-source dedup downgrade).
 *
 * Codex emits rollout files at `~/.codex/rollouts/<session_id>.jsonl`
 * after a session completes. Each rollout entry mirrors the stdout
 * `turn.completed` payload but is written from the parent process, so
 * the two streams MAY disagree on `provider_timestamp_ms` (different
 * clock reads). Per Q52 / FR-388, the cross-source dedup downgrades
 * confidence to `medium` when parity fails.
 *
 * This adapter reads rollout JSONL files and writes raw rows tagged
 * `source_id='codex_rollout'`. Confidence is decided per-row:
 *   - `high` when stdout-derived row exists with matching
 *     (provider, request_id, provider_timestamp_ms) — parity holds.
 *   - `medium` otherwise — parity violated.
 *
 * Absent-safe: missing rollouts directory returns
 * `{ ok: true, processed: 0, files: 0 }`.
 *
 * @see specs/008-resource-governance/spec.md FR-072, FR-082, FR-388
 * @see specs/008-resource-governance/tasks.md T097
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
import type { DedupeConfidence } from '@/types/observability';
import type Database from 'better-sqlite3';

/** Source id for codex rollout ingest. */
export const CODEX_ROLLOUT_SOURCE_ID = 'codex_rollout';

/** Parser-version tag stamped on every rollout-derived raw row. */
export const CODEX_ROLLOUT_PARSER_VERSION = 'codex-rollout-v1';

/** Codex rollout entry shape (subset). */
interface RolloutEntry {
  type?: string;
  usage?: {
    session_id?: string;
    cumulative_input_tokens?: number;
    cumulative_output_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    model?: string;
    cost_usd?: number;
    timestamp_ms?: number;
    provider?: string;
    request_id?: string;
    duration_ms?: number;
  };
}

/** Watch options. */
export interface WatchOptions {
  /** Override rollouts directory. Defaults to `~/.codex/rollouts/`. */
  rolloutsDir?: string;
  workspaceId?: number | null;
  agentId?: number | null;
  taskId?: number | null;
  maxRows?: number;
}

/** Watch result. */
export interface WatchResult {
  ok: true;
  processed: number;
  skipped: number;
  files: number;
  parityDowngrades: number;
}

function defaultRolloutsDir(): string {
  return path.join(homedir(), '.codex', 'rollouts');
}

/**
 * Look up whether a stdout-derived row with parity-matching
 * (provider, request_id, provider_timestamp_ms) already exists in
 * raw_usage_events. When yes → confidence='high' (parity).
 * When no → confidence='medium' (parity-fail downgrade per FR-388).
 */
function dedupConfidenceForRollout(
  db: Database.Database,
  args: {
    provider: string;
    request_id: string | null;
    provider_timestamp_ms: number;
  },
): DedupeConfidence {
  // Without a request_id we can't match parity → always medium.
  if (args.request_id === null) return 'medium';
  const row = db
    .prepare(
      `SELECT 1 FROM raw_usage_events
       WHERE source_id = ?
         AND provider = ?
         AND provider_request_id = ?
         AND provider_timestamp_ms = ?
       LIMIT 1`,
    )
    .get(
      'codex_stdout',
      args.provider,
      args.request_id,
      args.provider_timestamp_ms,
    );
  return row !== undefined ? 'high' : 'medium';
}

/** Register the codex_rollout source. Idempotent. */
export function registerCodexRolloutSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: CODEX_ROLLOUT_SOURCE_ID,
    display_name: 'Codex CLI Rollout File',
    enforcement_eligibility: 'soft',
    dedupe_confidence_default: 'medium',
    expected_envelope_bytes: 2048,
  });
}

/**
 * Read every rollout `*.jsonl` and emit one raw_usage_events row per
 * usage entry. Matches against codex_stdout rows for confidence
 * decision (high vs medium per parity).
 *
 * Absent-safe — missing directory returns
 * `{ok:true, processed:0, files:0, parityDowngrades:0}`.
 */
export async function readRollouts(
  db: Database.Database,
  opts: WatchOptions = {},
): Promise<WatchResult> {
  const dir = opts.rolloutsDir ?? defaultRolloutsDir();
  const maxRows = opts.maxRows ?? 10_000;
  let processed = 0;
  let skipped = 0;
  let parityDowngrades = 0;
  let files = 0;

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, processed: 0, skipped: 0, files: 0, parityDowngrades: 0 };
    }
    throw err;
  }

  registerCodexRolloutSource(db);

  const jsonlFiles = dirEntries.filter((n) => n.endsWith('.jsonl'));
  files = jsonlFiles.length;

  interface Buffered {
    entry: RolloutEntry;
    confidence: DedupeConfidence;
  }
  const rowsToInsert: Buffered[] = [];

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
      let parsed: RolloutEntry;
      try {
        parsed = JSON.parse(trimmed) as RolloutEntry;
      } catch {
        skipped += 1;
        continue;
      }
      const u = parsed.usage;
      if (
        u === undefined ||
        typeof u.session_id !== 'string' ||
        typeof u.timestamp_ms !== 'number'
      ) {
        skipped += 1;
        continue;
      }
      const confidence = dedupConfidenceForRollout(db, {
        provider: u.provider ?? 'openai',
        request_id: u.request_id ?? null,
        provider_timestamp_ms: u.timestamp_ms,
      });
      if (confidence === 'medium') parityDowngrades += 1;
      rowsToInsert.push({ entry: parsed, confidence });
    }
  }

  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly Buffered[]) => {
    for (const item of batch) {
      const u = item.entry.usage;
      if (u === undefined) continue;
      const ts = u.timestamp_ms ?? Date.now();
      const partition_month = partitionMonthFromMs(ts);
      const raw_attributes_json = JSON.stringify({
        model: u.model ?? null,
        input_tokens: u.input_tokens ?? null,
        output_tokens: u.output_tokens ?? null,
        cumulative_input_tokens: u.cumulative_input_tokens ?? null,
        cumulative_output_tokens: u.cumulative_output_tokens ?? null,
        cost_usd: u.cost_usd ?? 0,
        duration_ms: u.duration_ms ?? null,
      });
      insertRawUsageEvent(db, {
        source_id: CODEX_ROLLOUT_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider: u.provider ?? 'openai',
        provider_request_id: u.request_id ?? null,
        provider_timestamp_ms: ts,
        session_id: u.session_id ?? null,
        generation_id: null,
        raw_attributes_json,
        parser_version: CODEX_ROLLOUT_PARSER_VERSION,
        schema_version_observed: 'codex-rollout-1',
        reconcile_status: 'ok',
        dedupe_confidence: item.confidence,
        enforcement_eligibility: 'soft',
        partition_month,
      });
      processed += 1;
    }
  });
  tx.immediate(rowsToInsert);

  return { ok: true, processed, skipped, files, parityDowngrades };
}
