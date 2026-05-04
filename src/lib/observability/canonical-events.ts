/**
 * SPEC-008 — Canonical event materializer.
 *
 * Per FR-091 (one canonical row per dedupe triple), FR-102 (merge_sources
 * linkage from canonical → raw), FR-107 (provenance ladder
 * `single | merged | corrected`).
 *
 * Pipeline shape:
 *   raw_usage_events (M65b)
 *     → groupBy(dedupeKey)
 *         → mergeRawEvents()  (T078, src/lib/observability/dedupe.ts)
 *             → materializeCanonical()  (this file)
 *                 → INSERT INTO canonical_usage_events (M65c)
 *
 * Idempotency contract (Q24):
 *   - The M65c table has a PARTIAL unique index on
 *     (provider, provider_request_id, provider_timestamp_ms) WHERE
 *     provider_request_id IS NOT NULL. Re-running the materializer for a
 *     dedupe set with non-NULL request_id is a no-op (UPSERT).
 *   - When provider_request_id IS NULL the partial index does NOT cover
 *     the row and SQLite has no canonical-uniqueness guarantee. The
 *     materializer guards with an explicit pre-INSERT lookup using the
 *     full triple match (provider + NULL request_id + provider_timestamp_ms).
 *
 * Concurrency: callers MUST hold a write transaction so the lookup-then-
 * INSERT race window is closed. The reconciler (T080) wraps each
 * materialization batch in `db.transaction(fn).immediate(args)`.
 *
 * @see specs/008-resource-governance/spec.md FR-091, FR-102, FR-107
 * @see specs/008-resource-governance/tasks.md T079
 * @see Constitution Convention J — strict-scope module
 */

import {
  mergeRawEvents,
  type RawEventForDedupe,
} from './dedupe';
import type {
  CanonicalProvenance,
  CanonicalUsageEvent,
} from '@/types/observability';
import type Database from 'better-sqlite3';

/**
 * Result of one materialization call. Carries the persisted canonical id
 * (`canonical_id`) plus the provenance the materializer wrote (which may
 * differ from the merger's provenance if the row already existed and was
 * upserted as a `corrected` revision).
 */
export interface MaterializeResult {
  canonical_id: number;
  provenance: CanonicalProvenance;
  /** True when an existing row was reused; false when a new row was inserted. */
  reused: boolean;
}

/**
 * Look up a canonical row by the dedupe triple, including the NULL-request_id
 * branch the partial index does not cover. Returns null when no match exists.
 */
function findExistingCanonical(
  db: Database.Database,
  args: {
    provider: string;
    provider_request_id: string | null;
    provider_timestamp_ms: number;
  },
): { id: number; provenance: CanonicalProvenance } | null {
  const sql = args.provider_request_id === null
    ? `SELECT id, provenance
         FROM canonical_usage_events
        WHERE provider = ?
          AND provider_request_id IS NULL
          AND provider_timestamp_ms = ?
        LIMIT 1`
    : `SELECT id, provenance
         FROM canonical_usage_events
        WHERE provider = ?
          AND provider_request_id = ?
          AND provider_timestamp_ms = ?
        LIMIT 1`;
  const stmt = db.prepare(sql);
  const row = (args.provider_request_id === null
    ? stmt.get(args.provider, args.provider_timestamp_ms)
    : stmt.get(
        args.provider,
        args.provider_request_id,
        args.provider_timestamp_ms,
      )) as { id?: number; provenance?: string } | undefined;
  if (row?.id === undefined) return null;
  const prov = row.provenance ?? 'single';
  return {
    id: row.id,
    provenance: narrowProvenance(prov),
  };
}

function narrowProvenance(p: string): CanonicalProvenance {
  if (p === 'single' || p === 'merged' || p === 'corrected') return p;
  // Defensive default — unrecognized values legacy through as 'single'.
  return 'single';
}

/**
 * Materialize a non-empty raw-event group sharing one dedupe key into one
 * canonical_usage_events row. Caller MUST already hold a write transaction.
 *
 * Behavior:
 *   - Calls mergeRawEvents() to compute the per-field MAX'd canonical
 *     projection.
 *   - If no existing canonical row matches the dedupe triple, INSERTs a
 *     fresh row and returns `{reused: false, provenance: <merger's>}`.
 *   - If an existing row matches, leaves it in place (idempotent) and
 *     returns `{reused: true, provenance: <existing row's>}`. The caller
 *     who wants to apply a correction-style revision must use the
 *     correction-ledger module (T081) instead.
 */
export function materializeCanonical(
  db: Database.Database,
  rawEvents: readonly RawEventForDedupe[],
): MaterializeResult {
  if (rawEvents.length === 0) {
    throw new Error('materializeCanonical: input must be non-empty');
  }

  const merged = mergeRawEvents(rawEvents);
  const c = merged.canonical;

  const existing = findExistingCanonical(db, {
    provider: c.provider,
    provider_request_id: c.provider_request_id,
    provider_timestamp_ms: c.provider_timestamp_ms,
  });
  if (existing !== null) {
    return {
      canonical_id: existing.id,
      provenance: existing.provenance,
      reused: true,
    };
  }

  const result = db
    .prepare(
      `INSERT INTO canonical_usage_events
         (workspace_id, agent_id, task_id,
          provider, provider_request_id, provider_timestamp_ms,
          model, tokens_in, tokens_out,
          cache_read_in, cache_creation_in,
          cost_usd, duration_ms, session_id,
          provenance, merge_sources_json,
          dedupe_confidence, partition_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      c.workspace_id,
      c.agent_id,
      c.task_id,
      c.provider,
      c.provider_request_id,
      c.provider_timestamp_ms,
      c.model,
      c.tokens_in,
      c.tokens_out,
      c.cache_read_in,
      c.cache_creation_in,
      c.cost_usd,
      c.duration_ms,
      c.session_id,
      c.provenance,
      c.merge_sources_json,
      c.dedupe_confidence,
      c.partition_month,
    );

  return {
    canonical_id: Number(result.lastInsertRowid),
    provenance: c.provenance,
    reused: false,
  };
}

/**
 * Mark an existing canonical row as `corrected`. Returns false when the
 * row does not exist. The correction-ledger module (T081) is the
 * authoritative path for applying a correction; this helper is exported
 * for the materializer's downstream consumers that need to flip the
 * provenance after a coalesced correction has been recorded.
 */
export function markCanonicalCorrected(
  db: Database.Database,
  canonical_id: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE canonical_usage_events
          SET provenance = 'corrected'
        WHERE id = ?`,
    )
    .run(canonical_id);
  return result.changes > 0;
}

/**
 * Re-export `RawEventForDedupe` so consumers can author input arrays
 * without importing the dedupe module twice.
 */
export type { RawEventForDedupe };

/**
 * Re-export `CanonicalUsageEvent` for consumers reading the persisted row
 * shape.
 */
export type { CanonicalUsageEvent };
