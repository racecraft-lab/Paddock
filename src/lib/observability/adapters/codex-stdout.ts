/**
 * SPEC-008 — Codex stdout adapter (T096).
 *
 * Per FR-072 (Codex usage events), FR-072a (session-reset detection),
 * FR-082 (dedup confidence ladder).
 *
 * Codex CLI (`codex`) emits stdout JSON of the form:
 *   {"type":"turn.completed","usage":{
 *      "session_id":"...","input_tokens":N,"output_tokens":N,
 *      "cumulative_input_tokens":N,"cumulative_output_tokens":N,
 *      "model":"...","cost_usd":...,"timestamp_ms":...,
 *      "provider":"openai","request_id":"req_..."
 *   }}
 *
 * Codex usage is *cumulative per session* — every event reports the
 * running total, not the per-turn delta. The hot path is:
 *   1) Track cumulative-per-session in process memory.
 *   2) On each event, compute delta = current - last_seen_for_session.
 *   3) Emit a raw row with the delta as `tokens_in`/`tokens_out`.
 *   4) FR-072a: if delta < 0 (cumulative *decreased*), the session
 *      reset. DO NOT emit a row. Instead, write an `activities` row
 *      tagged `codex_session_reset` and reset the in-memory counter.
 *
 * Source registration:
 *   - `source_id='codex_stdout'`, `enforcement_eligibility='hard'`
 *     (codex stdout is structured + reliable). `dedupe_confidence_default
 *     ='high'` because (provider, request_id, timestamp_ms) all carry.
 *
 * @see specs/008-resource-governance/spec.md FR-072, FR-072a, FR-082
 * @see specs/008-resource-governance/tasks.md T096, T098
 * @see Constitution Convention J — strict-scope module
 */

import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for codex stdout ingest. */
export const CODEX_STDOUT_SOURCE_ID = 'codex_stdout';

/** Parser-version tag stamped on every codex stdout-derived raw row. */
export const CODEX_STDOUT_PARSER_VERSION = 'codex-stdout-v1';

/** Activity type for FR-072a session-reset rows. */
export const CODEX_SESSION_RESET_ACTIVITY_TYPE = 'codex_session_reset';

/**
 * Per-session cumulative-counter snapshot. Stored in a process-local
 * Map keyed on session_id. Reset when delta goes negative (FR-072a).
 */
interface SessionCumulative {
  cumulative_input_tokens: number;
  cumulative_output_tokens: number;
}

/** Codex stdout `turn.completed` payload (narrow). */
export interface CodexTurnCompleted {
  type: 'turn.completed';
  usage: {
    session_id: string;
    cumulative_input_tokens: number;
    cumulative_output_tokens: number;
    model?: string;
    cost_usd?: number;
    timestamp_ms?: number;
    provider?: string;
    request_id?: string;
    duration_ms?: number;
  };
}

/** Ingest result. */
export type IngestResult =
  | { ok: true; raw_event_id: number }
  | { ok: false; reason: 'session_reset' | 'malformed_event' };

/** In-memory cumulative state. Exported so tests can reset it. */
const sessionState = new Map<string, SessionCumulative>();

/** Reset the in-memory state (test helper). */
export function _resetSessionState(): void {
  sessionState.clear();
}

/** Type guard for `turn.completed` events. */
export function isTurnCompleted(v: unknown): v is CodexTurnCompleted {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r['type'] !== 'turn.completed') return false;
  const u = r['usage'];
  if (typeof u !== 'object' || u === null) return false;
  const ur = u as Record<string, unknown>;
  return (
    typeof ur['session_id'] === 'string' &&
    typeof ur['cumulative_input_tokens'] === 'number' &&
    typeof ur['cumulative_output_tokens'] === 'number'
  );
}

/** Register the codex_stdout source. Idempotent. */
export function registerCodexStdoutSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: CODEX_STDOUT_SOURCE_ID,
    display_name: 'Codex CLI Stdout',
    enforcement_eligibility: 'hard',
    dedupe_confidence_default: 'high',
    expected_envelope_bytes: 2048,
  });
}

/** Optional ingest context. */
export interface IngestContext {
  workspaceId?: number | null;
  agentId?: number | null;
  taskId?: number | null;
}

/**
 * Write an `activities` row recording an FR-072a session-reset event.
 * The activities table exists pre-SPEC-008; we use the same shape as
 * `governance-route-context#logGovernanceActivity` but with
 * `entity_type='codex_session'`.
 */
function logSessionResetActivity(
  db: Database.Database,
  args: {
    session_id: string;
    workspace_id: number | null;
    last_cumulative_in: number;
    last_cumulative_out: number;
    new_cumulative_in: number;
    new_cumulative_out: number;
  },
): void {
  db.prepare(
    `INSERT INTO activities
       (type, entity_type, entity_id, actor, description, data, workspace_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    CODEX_SESSION_RESET_ACTIVITY_TYPE,
    'codex_session',
    0,
    'codex-stdout-adapter',
    `Codex session reset detected for ${args.session_id}; cumulative counter went backwards.`,
    JSON.stringify({
      session_id: args.session_id,
      last_cumulative_in: args.last_cumulative_in,
      last_cumulative_out: args.last_cumulative_out,
      new_cumulative_in: args.new_cumulative_in,
      new_cumulative_out: args.new_cumulative_out,
    }),
    args.workspace_id,
  );
}

/**
 * Ingest one codex `turn.completed` event. Returns the persisted
 * `raw_usage_events.id` on success, or a `session_reset` /
 * `malformed_event` outcome.
 *
 * The function is hot-path safe — it does NOT open a transaction for
 * a single insert. The caller MAY wrap a batch in
 * `db.transaction(fn).immediate()` if desired.
 */
export function ingestCodexTurnCompleted(
  db: Database.Database,
  event: unknown,
  ctx: IngestContext = {},
): IngestResult {
  if (!isTurnCompleted(event)) {
    return { ok: false, reason: 'malformed_event' };
  }
  const u = event.usage;
  const session_id = u.session_id;
  const newIn = u.cumulative_input_tokens;
  const newOut = u.cumulative_output_tokens;

  const prior = sessionState.get(session_id);
  if (prior !== undefined) {
    if (newIn < prior.cumulative_input_tokens || newOut < prior.cumulative_output_tokens) {
      // FR-072a: cumulative went backwards → session was reset.
      // Discard this event; record an activity row; reset the counter.
      logSessionResetActivity(db, {
        session_id,
        workspace_id: ctx.workspaceId ?? null,
        last_cumulative_in: prior.cumulative_input_tokens,
        last_cumulative_out: prior.cumulative_output_tokens,
        new_cumulative_in: newIn,
        new_cumulative_out: newOut,
      });
      sessionState.set(session_id, {
        cumulative_input_tokens: newIn,
        cumulative_output_tokens: newOut,
      });
      return { ok: false, reason: 'session_reset' };
    }
  }

  const deltaIn = prior === undefined ? newIn : newIn - prior.cumulative_input_tokens;
  const deltaOut = prior === undefined ? newOut : newOut - prior.cumulative_output_tokens;

  sessionState.set(session_id, {
    cumulative_input_tokens: newIn,
    cumulative_output_tokens: newOut,
  });

  const ts = u.timestamp_ms ?? Date.now();
  const partition_month = partitionMonthFromMs(ts);
  registerCodexStdoutSource(db);

  const raw_attributes_json = JSON.stringify({
    model: u.model ?? null,
    input_tokens: deltaIn,
    output_tokens: deltaOut,
    cumulative_input_tokens: newIn,
    cumulative_output_tokens: newOut,
    cost_usd: u.cost_usd ?? 0,
    duration_ms: u.duration_ms ?? null,
  });

  const id = insertRawUsageEvent(db, {
    source_id: CODEX_STDOUT_SOURCE_ID,
    workspace_id: ctx.workspaceId ?? null,
    agent_id: ctx.agentId ?? null,
    task_id: ctx.taskId ?? null,
    provider: u.provider ?? 'openai',
    provider_request_id: u.request_id ?? null,
    provider_timestamp_ms: ts,
    session_id,
    generation_id: null,
    raw_attributes_json,
    parser_version: CODEX_STDOUT_PARSER_VERSION,
    schema_version_observed: 'codex-stdout-1',
    reconcile_status: 'ok',
    dedupe_confidence: 'high',
    enforcement_eligibility: 'hard',
    partition_month,
  });

  return { ok: true, raw_event_id: id };
}
