/**
 * SPEC-008 — Raw-event dedupe and cross-source merge.
 *
 * Per FR-092 (dedup), FR-082 (confidence), FR-102 (merge_sources_json),
 * FR-386 (Q24/Q39/Q52 join logic). Implements the row-level dedupe key
 * and the merge function that coalesces N raw rows sharing
 * `(provider, provider_request_id, provider_timestamp_ms)` into one
 * canonical event with per-field `MAX(value)` tie-breaking.
 *
 * Dedupe key shape:
 *   `${provider}::${provider_request_id ?? ''}::${provider_timestamp_ms}`
 *
 * Confidence ladder (FR-082):
 *   - `singleton`: input contained exactly one row.
 *   - `high`: every row has a non-null `provider_request_id` and they all
 *     match the lead row's value (full triple).
 *   - `medium`: at least one row in the set has a NULL `provider_request_id`
 *     OR the request_id values differ. Caller's responsibility to use this
 *     signal (e.g., to gate hard-block enforcement).
 *   - `low`: reserved for heuristic joins where neither
 *     `provider_request_id` nor `provider_timestamp_ms` align (not
 *     produced by `mergeRawEvents` in this commit; the caller decides
 *     how to assemble such groups).
 *
 * Per-field tie-breaking (FR-092):
 *   - Numeric counters: `Math.max` ignoring nulls.
 *   - Strings (model, session_id): lexicographically-greatest non-null
 *     value (covers cases where one source resolved a more specific
 *     model id than another).
 *   - IDs (workspace_id, agent_id, task_id): first non-null value wins
 *     (these are usually identical across the set; a divergence is a
 *     signal the join is wrong, not a per-field merge).
 *
 * @see specs/008-resource-governance/spec.md FR-092, FR-082, FR-102, FR-386
 * @see specs/008-resource-governance/tasks.md T078
 * @see Constitution Convention J — strict-scope module
 */

import type {
  CanonicalProvenance,
  CanonicalUsageEvent,
  DedupeConfidence,
  MergedCanonical,
} from '@/types/observability';

/**
 * Subset of `raw_usage_events` columns needed by dedupe + merge.
 * Decoupled from the persisted-row shape so the caller can pre-project the
 * SELECT to just the columns the merge depends on.
 */
export interface RawEventForDedupe {
  id: number;
  source_id: string;
  provider: string;
  provider_request_id: string | null;
  provider_timestamp_ms: number;
  workspace_id: number | null;
  agent_id: number | null;
  task_id: number | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cache_read_in: number;
  cache_creation_in: number;
  cost_usd: number;
  duration_ms: number | null;
  session_id: string | null;
  partition_month: string;
}

/**
 * Build the dedupe key for one raw row. NULL `provider_request_id`
 * collapses to an empty positional segment so two rows with NULL ids do
 * not collide unless both their provider AND their timestamp also match.
 */
export function dedupeKey(row: RawEventForDedupe): string {
  const reqId = row.provider_request_id ?? '';
  return `${row.provider}::${reqId}::${row.provider_timestamp_ms.toString()}`;
}

/**
 * Take the max of two numbers ignoring nulls; both null → null.
 */
function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

/**
 * Take the lexicographically-greatest non-null string; both null → null.
 */
function maxStringNullable(
  a: string | null,
  b: string | null,
): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

/**
 * Take the first non-null id from (a, b). a wins when both are non-null.
 */
function firstNonNullId(a: number | null, b: number | null): number | null {
  return a ?? b;
}

/**
 * Compute the confidence of a merge given the input set. See ladder above.
 */
function confidenceOf(rows: readonly RawEventForDedupe[]): DedupeConfidence {
  if (rows.length === 1) return 'singleton';
  // every row has a non-null request_id AND they all match
  const first = rows[0];
  if (first === undefined) return 'singleton';
  const firstReq = first.provider_request_id;
  if (firstReq === null) return 'medium';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    if (r.provider_request_id === null) return 'medium';
    if (r.provider_request_id !== firstReq) return 'medium';
  }
  return 'high';
}

/**
 * Merge a non-empty set of raw rows sharing a dedupe key into a single
 * canonical event projection (no id, no emitted_at — those are assigned
 * by the materializer at insert time).
 *
 * Caller invariants:
 *   - `rows.length > 0` (function throws if empty).
 *   - Every row in the input shares `provider`, `provider_request_id`,
 *     and `provider_timestamp_ms` (caller is responsible for grouping by
 *     `dedupeKey`). The function does NOT re-validate this invariant
 *     because the cost is O(N) per call and the caller already paid it
 *     during the GROUP BY/HashMap pass.
 */
export function mergeRawEvents(
  rows: readonly RawEventForDedupe[],
): MergedCanonical {
  if (rows.length === 0) {
    throw new Error('mergeRawEvents: input must be non-empty');
  }

  // Anchor on the first row for the static fields (provider triple,
  // partition_month). Per-field accumulator pass scans all rows.
  const lead = rows[0];
  if (lead === undefined) {
    throw new Error('mergeRawEvents: lead row is undefined');
  }

  let workspace_id: number | null = lead.workspace_id;
  let agent_id: number | null = lead.agent_id;
  let task_id: number | null = lead.task_id;
  let model: string | null = lead.model;
  let session_id: string | null = lead.session_id;
  let tokens_in = lead.tokens_in;
  let tokens_out = lead.tokens_out;
  let cache_read_in = lead.cache_read_in;
  let cache_creation_in = lead.cache_creation_in;
  let cost_usd = lead.cost_usd;
  let duration_ms: number | null = lead.duration_ms;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    workspace_id = firstNonNullId(workspace_id, r.workspace_id);
    agent_id = firstNonNullId(agent_id, r.agent_id);
    task_id = firstNonNullId(task_id, r.task_id);
    model = maxStringNullable(model, r.model);
    session_id = maxStringNullable(session_id, r.session_id);
    tokens_in = Math.max(tokens_in, r.tokens_in);
    tokens_out = Math.max(tokens_out, r.tokens_out);
    cache_read_in = Math.max(cache_read_in, r.cache_read_in);
    cache_creation_in = Math.max(cache_creation_in, r.cache_creation_in);
    cost_usd = Math.max(cost_usd, r.cost_usd);
    duration_ms = maxNullable(duration_ms, r.duration_ms);
  }

  // Sorted-ascending merge_sources for deterministic JSON output.
  const merge_sources = rows
    .map((r) => r.id)
    .slice()
    .sort((a, b) => a - b);

  const provenance: CanonicalProvenance =
    rows.length === 1 ? 'single' : 'merged';

  const canonical: Omit<CanonicalUsageEvent, 'id' | 'emitted_at'> = {
    workspace_id,
    agent_id,
    task_id,
    provider: lead.provider,
    provider_request_id: lead.provider_request_id,
    provider_timestamp_ms: lead.provider_timestamp_ms,
    model,
    tokens_in,
    tokens_out,
    cache_read_in,
    cache_creation_in,
    cost_usd,
    duration_ms,
    session_id,
    provenance,
    merge_sources_json: JSON.stringify(merge_sources),
    dedupe_confidence: confidenceOf(rows),
    partition_month: lead.partition_month,
  };

  return {
    canonical,
    confidence: canonical.dedupe_confidence,
    merge_sources,
  };
}
