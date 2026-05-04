/**
 * SPEC-008 — Cumulative-delta-aware periodic snapshot writer.
 *
 * Per FR-111 (cumulative-counter reconciliation), FR-112 (per-source ×
 * per-workspace snapshot lanes), FR-117 (audit chain via
 * source_emission_fingerprint), FR-121 (snapshot idempotency),
 * FR-123 (gap tolerance — null-delta marker), FR-127 (generation-id
 * resets reset the cumulative line).
 *
 * Cumulative-counter semantics (Q19):
 *   - Each (source_id, scope_kind, scope_id) lane keeps a monotonically
 *     non-decreasing cumulative line: cumulative_tokens_in,
 *     cumulative_tokens_out, cumulative_cost_usd, cumulative_requests.
 *   - The reconciler computes per-window usage by subtracting
 *     `delta_from_prior` between adjacent snapshots in the same lane.
 *   - When the upstream provider resets its counter (a new
 *     `generation_id`), the cumulative line resets too. The writer
 *     detects the reset by comparing the new cumulative_* values to the
 *     prior snapshot in the lane: if any field is *less* than the prior
 *     value, the lane is treated as a generation reset and
 *     `delta_from_prior=null` is written (downstream reconciler
 *     interprets null-delta as "do not subtract").
 *
 * Gap tolerance (FR-123):
 *   - When the caller skips an interval (e.g., the snapshot job missed a
 *     tick), the next snapshot's delta is computed normally — there is
 *     no special handling because the cumulative line is monotonic. The
 *     writer's responsibility is only to NOT crash when the lane has
 *     been quiet for many intervals.
 *
 * Idempotency (FR-121):
 *   - The M65k UNIQUE(source_id, scope_kind, scope_id, snapshot_at)
 *     constraint rejects re-ingesting the same upstream snapshot tuple.
 *     The writer uses INSERT OR IGNORE so a retried snapshot from the
 *     same provider is a no-op.
 *
 * Caller MUST hold a write transaction or pass a connection from the
 * background pool. Per `src/lib/db/connection-pool.ts`,
 * `getBackgroundDb()` is the right slot — snapshots are written by the
 * reconciler / collector, not on the admission hot path.
 *
 * @see specs/008-resource-governance/spec.md FR-111, FR-112, FR-117,
 *      FR-121, FR-123, FR-127
 * @see src/lib/migrations.ts (065k_resource_snapshots)
 * @see specs/008-resource-governance/tasks.md T084
 * @see Constitution Convention J — strict-scope module
 */

import type { SnapshotScopeKind } from '@/types/observability';
import type Database from 'better-sqlite3';

/** Input shape for one snapshot write. */
export interface SnapshotWrite {
  source_id: string;
  scope_kind: SnapshotScopeKind;
  scope_id: number | null;
  /** ISO-8601 UTC timestamp of the upstream snapshot. */
  snapshot_at: string;
  cumulative_tokens_in: number;
  cumulative_tokens_out: number;
  cumulative_cost_usd: number;
  cumulative_requests: number;
  /**
   * Source-emission fingerprint per FR-117. Caller computes (typically a
   * SHA-256 of the upstream payload + source_id + snapshot_at).
   */
  source_emission_fingerprint: string;
}

/** Outcome of a snapshot write. */
export interface SnapshotResult {
  /** Persisted row id (or the prior row's id if INSERT was IGNOREd). */
  snapshot_id: number;
  /**
   * Computed delta vs the prior snapshot in the same lane:
   *   - 'normal'  — strictly-greater cumulative; delta is positive.
   *   - 'reset'   — at least one field decreased; null-delta (FR-127).
   *   - 'first'   — no prior snapshot exists for the lane.
   *   - 'duplicate' — UNIQUE conflict; nothing was written, prior id returned.
   */
  delta_kind: 'normal' | 'reset' | 'first' | 'duplicate';
  /** delta_from_prior persisted (null for reset/first/duplicate). */
  delta_from_prior: number | null;
}

interface PriorSnapshot {
  id: number;
  cumulative_tokens_in: number;
  cumulative_tokens_out: number;
  cumulative_cost_usd: number;
  cumulative_requests: number;
}

/** Look up the immediately-prior snapshot in this lane. */
function findPriorSnapshot(
  db: Database.Database,
  args: {
    source_id: string;
    scope_kind: SnapshotScopeKind;
    scope_id: number | null;
    snapshot_at: string;
  },
): PriorSnapshot | null {
  const sql = args.scope_id === null
    ? `SELECT id, cumulative_tokens_in, cumulative_tokens_out,
              cumulative_cost_usd, cumulative_requests
         FROM resource_snapshots
        WHERE source_id = ?
          AND scope_kind = ?
          AND scope_id IS NULL
          AND snapshot_at < ?
        ORDER BY snapshot_at DESC
        LIMIT 1`
    : `SELECT id, cumulative_tokens_in, cumulative_tokens_out,
              cumulative_cost_usd, cumulative_requests
         FROM resource_snapshots
        WHERE source_id = ?
          AND scope_kind = ?
          AND scope_id = ?
          AND snapshot_at < ?
        ORDER BY snapshot_at DESC
        LIMIT 1`;
  const stmt = db.prepare(sql);
  const row = (args.scope_id === null
    ? stmt.get(args.source_id, args.scope_kind, args.snapshot_at)
    : stmt.get(args.source_id, args.scope_kind, args.scope_id, args.snapshot_at)) as
    | Record<string, unknown>
    | undefined;
  if (row === undefined) return null;
  return {
    id: Number(row['id'] ?? 0),
    cumulative_tokens_in: Number(row['cumulative_tokens_in'] ?? 0),
    cumulative_tokens_out: Number(row['cumulative_tokens_out'] ?? 0),
    cumulative_cost_usd: Number(row['cumulative_cost_usd'] ?? 0),
    cumulative_requests: Number(row['cumulative_requests'] ?? 0),
  };
}

/** Lookup an existing snapshot by the UNIQUE tuple. Returns id or null. */
function findExistingSnapshot(
  db: Database.Database,
  args: {
    source_id: string;
    scope_kind: SnapshotScopeKind;
    scope_id: number | null;
    snapshot_at: string;
  },
): number | null {
  const sql = args.scope_id === null
    ? `SELECT id FROM resource_snapshots
        WHERE source_id = ? AND scope_kind = ? AND scope_id IS NULL
          AND snapshot_at = ?`
    : `SELECT id FROM resource_snapshots
        WHERE source_id = ? AND scope_kind = ? AND scope_id = ?
          AND snapshot_at = ?`;
  const stmt = db.prepare(sql);
  const row = (args.scope_id === null
    ? stmt.get(args.source_id, args.scope_kind, args.snapshot_at)
    : stmt.get(args.source_id, args.scope_kind, args.scope_id, args.snapshot_at)) as
    | { id?: number }
    | undefined;
  if (row?.id === undefined) return null;
  return row.id;
}

/** Compute partition_month (YYYY-MM) from an ISO-8601 timestamp. */
function partitionMonthFromIso(iso: string): string {
  const slice = iso.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(slice)) return slice;
  return new Date().toISOString().slice(0, 7);
}

/** True when ANY cumulative field decreased vs the prior snapshot. */
function isGenerationReset(prior: PriorSnapshot, w: SnapshotWrite): boolean {
  return (
    w.cumulative_tokens_in < prior.cumulative_tokens_in
    || w.cumulative_tokens_out < prior.cumulative_tokens_out
    || w.cumulative_cost_usd < prior.cumulative_cost_usd
    || w.cumulative_requests < prior.cumulative_requests
  );
}

/**
 * Write one cumulative snapshot. Returns the persisted row id and the
 * delta classification. Caller MUST hold a write transaction.
 */
export function writeSnapshot(
  db: Database.Database,
  w: SnapshotWrite,
): SnapshotResult {
  // Idempotency: if the exact (source, scope, snapshot_at) tuple already
  // exists, return its id without a second INSERT.
  const existing = findExistingSnapshot(db, {
    source_id: w.source_id,
    scope_kind: w.scope_kind,
    scope_id: w.scope_id,
    snapshot_at: w.snapshot_at,
  });
  if (existing !== null) {
    return { snapshot_id: existing, delta_kind: 'duplicate', delta_from_prior: null };
  }

  const prior = findPriorSnapshot(db, {
    source_id: w.source_id,
    scope_kind: w.scope_kind,
    scope_id: w.scope_id,
    snapshot_at: w.snapshot_at,
  });

  let delta_kind: 'normal' | 'reset' | 'first';
  let delta_from_prior: number | null;
  if (prior === null) {
    delta_kind = 'first';
    delta_from_prior = null;
  } else if (isGenerationReset(prior, w)) {
    delta_kind = 'reset';
    delta_from_prior = null;
  } else {
    // Sum the per-field positive deltas as a single integer summary.
    // The reconciler reads the four cumulative_* columns directly when it
    // needs per-field deltas; this single-integer column is the at-a-glance
    // summary surfaced on the dashboard (FR-111).
    delta_kind = 'normal';
    const dTokensIn = w.cumulative_tokens_in - prior.cumulative_tokens_in;
    const dTokensOut = w.cumulative_tokens_out - prior.cumulative_tokens_out;
    const dRequests = w.cumulative_requests - prior.cumulative_requests;
    delta_from_prior = Math.max(0, Math.round(dTokensIn + dTokensOut + dRequests));
  }

  const partition_month = partitionMonthFromIso(w.snapshot_at);
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO resource_snapshots
         (source_id, scope_kind, scope_id, snapshot_at,
          cumulative_tokens_in, cumulative_tokens_out,
          cumulative_cost_usd, cumulative_requests,
          delta_from_prior, source_emission_fingerprint, partition_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      w.source_id,
      w.scope_kind,
      w.scope_id,
      w.snapshot_at,
      w.cumulative_tokens_in,
      w.cumulative_tokens_out,
      w.cumulative_cost_usd,
      w.cumulative_requests,
      delta_from_prior,
      w.source_emission_fingerprint,
      partition_month,
    );

  // Race-safe re-read: if another writer beat us to the UNIQUE tuple, our
  // INSERT OR IGNORE was a no-op; we still need to return the persisted id.
  if (result.changes === 0) {
    const fallback = findExistingSnapshot(db, {
      source_id: w.source_id,
      scope_kind: w.scope_kind,
      scope_id: w.scope_id,
      snapshot_at: w.snapshot_at,
    });
    if (fallback === null) {
      throw new Error(
        `snapshot-writer: INSERT OR IGNORE collided but row not found: ${w.source_id}/${w.scope_kind}/${String(w.scope_id)}/${w.snapshot_at}`,
      );
    }
    return { snapshot_id: fallback, delta_kind: 'duplicate', delta_from_prior: null };
  }

  return {
    snapshot_id: Number(result.lastInsertRowid),
    delta_kind,
    delta_from_prior,
  };
}
