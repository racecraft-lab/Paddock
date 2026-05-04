/**
 * SPEC-008 — Manual-post provenance shim (T104).
 *
 * Per FR-076 (source registry; provenance for operator-initiated
 * cost/usage rows).
 *
 * Mission Control already has a `/api/tokens` POST path that lets
 * operators record token usage out-of-band (manual entry). Pre-SPEC-008
 * those rows landed in the legacy `tokens` table without an audit
 * trail back to the source-registry. This shim adapts each manual
 * post into a `raw_usage_events` row tagged
 * `source_id='manual_post'` so the canonical pipeline sees the same
 * provenance contract every other adapter provides.
 *
 * Source registration:
 *   - `source_id='manual_post'`, `enforcement_eligibility='advisory'`
 *     (manual posts are operator-grade; cannot drive synchronous
 *     block decisions). `dedupe_confidence_default='medium'` because
 *     the operator MAY supply a request id to coalesce against an
 *     ingested raw row.
 *
 * @see specs/008-resource-governance/spec.md FR-076
 * @see specs/008-resource-governance/tasks.md T104
 * @see Constitution Convention J — strict-scope module
 */

import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for manual-post ingest. */
export const MANUAL_POST_SOURCE_ID = 'manual_post';

/** Parser-version tag stamped on every manual-post-derived raw row. */
export const MANUAL_POST_PARSER_VERSION = 'manual-post-v1';

/** One manual-post payload. */
export interface ManualPostPayload {
  workspace_id?: number | null;
  agent_id?: number | null;
  task_id?: number | null;
  provider: string;
  model?: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd?: number;
  /** Optional operator-supplied request id. */
  request_id?: string | null;
  /** Optional session id. */
  session_id?: string | null;
  /** Operator-supplied timestamp; defaults to Date.now(). */
  timestamp_ms?: number;
  /** Free-form annotation captured in raw_attributes_json. */
  note?: string | null;
}

/** Result of one manual-post adaptation. */
export interface AdaptResult {
  ok: true;
  raw_event_id: number;
}

/** Register the manual_post source. Idempotent. */
export function registerManualPostSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: MANUAL_POST_SOURCE_ID,
    display_name: 'Manual /api/tokens POST',
    enforcement_eligibility: 'advisory',
    dedupe_confidence_default: 'medium',
    expected_envelope_bytes: 1024,
  });
}

/**
 * Adapt one manual-post payload into a raw_usage_events row.
 * Returns the persisted id.
 */
export function adaptManualPost(
  db: Database.Database,
  payload: ManualPostPayload,
): AdaptResult {
  registerManualPostSource(db);
  const ts = payload.timestamp_ms ?? Date.now();
  const partition_month = partitionMonthFromMs(ts);
  const raw_attributes_json = JSON.stringify({
    model: payload.model ?? null,
    tokens_in: payload.tokens_in,
    tokens_out: payload.tokens_out,
    cost_usd: payload.cost_usd ?? 0,
    note: payload.note ?? null,
  });
  const id = insertRawUsageEvent(db, {
    source_id: MANUAL_POST_SOURCE_ID,
    workspace_id: payload.workspace_id ?? null,
    agent_id: payload.agent_id ?? null,
    task_id: payload.task_id ?? null,
    provider: payload.provider,
    provider_request_id: payload.request_id ?? null,
    provider_timestamp_ms: ts,
    session_id: payload.session_id ?? null,
    generation_id: null,
    raw_attributes_json,
    parser_version: MANUAL_POST_PARSER_VERSION,
    schema_version_observed: 'manual-post-1',
    reconcile_status: 'ok',
    dedupe_confidence: payload.request_id !== undefined && payload.request_id !== null ? 'medium' : 'low',
    enforcement_eligibility: 'advisory',
    partition_month,
  });
  return { ok: true, raw_event_id: id };
}
