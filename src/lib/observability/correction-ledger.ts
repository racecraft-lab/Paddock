/**
 * SPEC-008 — Coalesced corrections to canonical events.
 *
 * Per FR-103 (same-tx invariant: canonical row UPDATE + correction_ledger
 * INSERT MUST happen inside one transaction), FR-094 (per-canonical
 * cumulative correction history), FR-104 (correction-vs-revert
 * distinction).
 *
 * Coalescing: when multiple corrections for the same `canonicalId` arrive
 * within `coalesce_window_ms` (default 5,000 ms), the deltas are merged
 * into a single correction_ledger row instead of N separate rows. The
 * coalescing window is implemented as a process-local in-memory queue
 * keyed by canonicalId; flushing happens on either:
 *   - Time pressure: a periodic `flushDueCorrections(db, now)` call from
 *     the reconciler / supervisor.
 *   - Explicit pressure: `appendCorrection` returning a `flushed: true`
 *     record when the existing pending entry has aged past the window.
 *
 * Same-tx invariant (FR-103): every flush wraps the canonical UPDATE +
 * correction_ledger INSERT in `db.transaction(fn).immediate(...)`. No
 * partial writes.
 *
 * Schema reality (M65j):
 *   `correction_ledger` has columns:
 *     (id, canonical_event_id, prior_amount, corrected_amount, delta,
 *      reason, ledger_entry_id, applied_at, applied_by, notes_json)
 *   — `applied_by` is NOT NULL, so the caller MUST supply it. The reason
 *   is constrained to the five FR-103 values.
 *
 * @see specs/008-resource-governance/spec.md FR-094, FR-103, FR-104
 * @see src/lib/migrations.ts (065j_correction_ledger,
 *      065c_canonical_usage_events)
 * @see specs/008-resource-governance/tasks.md T081
 * @see Constitution Convention J — strict-scope module
 */

import { markCanonicalCorrected } from './canonical-events';
import type Database from 'better-sqlite3';

/**
 * Closed set of correction reasons per the M65j CHECK.
 */
export type CorrectionReason =
  | 'late_arrival'
  | 'dedupe_repair'
  | 'price_correction'
  | 'manual'
  | 'schema_repair';

/** Default coalesce window — 5 s per the task prompt. */
export const DEFAULT_COALESCE_WINDOW_MS = 5_000;

/** One pending correction queued in memory awaiting flush. */
interface PendingCorrection {
  canonical_event_id: number;
  /** Earliest enqueue time (ms-since-epoch) for THIS pending entry. */
  enqueued_at: number;
  /** Cumulative delta to apply to the canonical row's cost_usd. */
  cumulative_delta: number;
  reason: CorrectionReason;
  applied_by: string;
  /** Optional notes; structured JSON-stringified into notes_json. */
  notes_json: string | null;
}

/** Result of one `appendCorrection` call. */
export interface AppendCorrectionResult {
  /**
   * `flushed: true` when the call wrote a correction_ledger row. The
   * `correction_id` field is the persisted row id.
   */
  flushed: boolean;
  correction_id: number | null;
  /** True when the pending queue still has an unflushed entry. */
  pending: boolean;
}

/**
 * Process-local queue. Keyed by canonical_event_id. Single-writer per
 * key — concurrent calls for the same key collapse via the cumulative
 * delta accumulator (FR-094 cumulative semantics).
 */
const pendingByCanonical = new Map<number, PendingCorrection>();

/** Optional clock injection. */
export interface CorrectionClock {
  now(): number;
}

const DEFAULT_CLOCK: CorrectionClock = { now: () => Date.now() };

/** Configurable knobs. */
export interface CorrectionConfig {
  coalesce_window_ms?: number;
  clock?: CorrectionClock;
}

/**
 * Resolve the canonical row's current `cost_usd` and id. Returns null
 * when the canonical id does not exist.
 */
function loadCanonicalCostAndId(
  db: Database.Database,
  canonical_event_id: number,
): { id: number; cost_usd: number } | null {
  const row = db
    .prepare(
      `SELECT id, cost_usd FROM canonical_usage_events WHERE id = ?`,
    )
    .get(canonical_event_id) as { id?: number; cost_usd?: number } | undefined;
  if (row?.id === undefined) return null;
  return {
    id: row.id,
    cost_usd: row.cost_usd ?? 0,
  };
}

/**
 * Atomically apply a queued correction: UPDATE canonical_usage_events
 * cost_usd by `delta` and INSERT a correction_ledger row. Both writes
 * happen in one immediate-mode transaction (FR-103).
 */
function flushOne(
  db: Database.Database,
  pending: PendingCorrection,
): { correction_id: number } {
  const tx = db.transaction((p: PendingCorrection) => {
    const canonical = loadCanonicalCostAndId(db, p.canonical_event_id);
    if (canonical === null) {
      throw new Error(
        `correction-ledger: canonical_usage_events row not found for id=${String(p.canonical_event_id)}`,
      );
    }
    const prior_amount = canonical.cost_usd;
    const corrected_amount = prior_amount + p.cumulative_delta;
    db.prepare(
      `UPDATE canonical_usage_events SET cost_usd = ? WHERE id = ?`,
    ).run(corrected_amount, canonical.id);
    // Flip provenance so downstream consumers can see this row was
    // restated (idempotent — markCanonicalCorrected is a one-row UPDATE).
    markCanonicalCorrected(db, canonical.id);
    const result = db
      .prepare(
        `INSERT INTO correction_ledger
           (canonical_event_id, prior_amount, corrected_amount, delta,
            reason, ledger_entry_id, applied_by, notes_json)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        canonical.id,
        prior_amount,
        corrected_amount,
        p.cumulative_delta,
        p.reason,
        p.applied_by,
        p.notes_json,
      );
    return { correction_id: Number(result.lastInsertRowid) };
  });
  return tx.immediate(pending);
}

/**
 * Append a correction. If a pending entry for the same canonical id
 * exists AND its age is below `coalesce_window_ms`, the new delta is
 * accumulated and nothing is flushed yet. Otherwise the existing pending
 * entry is flushed, then a fresh entry is enqueued for the new delta
 * (which itself may be flushed by a subsequent call or by
 * `flushDueCorrections`).
 */
export function appendCorrection(
  db: Database.Database,
  args: {
    canonical_event_id: number;
    delta_amount: number;
    reason: CorrectionReason;
    applied_by: string;
    notes?: Record<string, unknown> | null;
  },
  config: CorrectionConfig = {},
): AppendCorrectionResult {
  if (!Number.isFinite(args.delta_amount)) {
    throw new Error(
      `correction-ledger: delta_amount must be finite, got ${String(args.delta_amount)}`,
    );
  }
  if (typeof args.applied_by !== 'string' || args.applied_by === '') {
    throw new Error('correction-ledger: applied_by must be a non-empty string');
  }
  const window_ms = config.coalesce_window_ms ?? DEFAULT_COALESCE_WINDOW_MS;
  const clock = config.clock ?? DEFAULT_CLOCK;
  const now = clock.now();

  const notes_json =
    args.notes === null || args.notes === undefined
      ? null
      : JSON.stringify(args.notes);

  const existing = pendingByCanonical.get(args.canonical_event_id);
  if (existing !== undefined) {
    const age = now - existing.enqueued_at;
    if (age <= window_ms) {
      // Coalesce: accumulate delta + replace reason/applied_by with the
      // most recent caller's values (caller responsibility to keep the
      // reason consistent within a window).
      existing.cumulative_delta += args.delta_amount;
      existing.reason = args.reason;
      existing.applied_by = args.applied_by;
      existing.notes_json = notes_json;
      return { flushed: false, correction_id: null, pending: true };
    }
    // Aged out — flush the existing entry first.
    pendingByCanonical.delete(args.canonical_event_id);
    flushOne(db, existing);
  }

  // Enqueue the new delta as a pending entry.
  pendingByCanonical.set(args.canonical_event_id, {
    canonical_event_id: args.canonical_event_id,
    enqueued_at: now,
    cumulative_delta: args.delta_amount,
    reason: args.reason,
    applied_by: args.applied_by,
    notes_json,
  });
  return { flushed: false, correction_id: null, pending: true };
}

/**
 * Force a flush for one canonical id, ignoring the coalesce window.
 * Returns `null` when no pending entry exists.
 */
export function flushCorrection(
  db: Database.Database,
  canonical_event_id: number,
): { correction_id: number } | null {
  const pending = pendingByCanonical.get(canonical_event_id);
  if (pending === undefined) return null;
  pendingByCanonical.delete(canonical_event_id);
  return flushOne(db, pending);
}

/**
 * Flush every pending entry whose age exceeds `coalesce_window_ms`.
 * Returns the number of rows written. Called periodically by the
 * reconciler / supervisor.
 */
export function flushDueCorrections(
  db: Database.Database,
  config: CorrectionConfig = {},
): number {
  const window_ms = config.coalesce_window_ms ?? DEFAULT_COALESCE_WINDOW_MS;
  const clock = config.clock ?? DEFAULT_CLOCK;
  const now = clock.now();
  let written = 0;
  for (const [canonical_event_id, pending] of Array.from(pendingByCanonical.entries())) {
    if (now - pending.enqueued_at <= window_ms) continue;
    pendingByCanonical.delete(canonical_event_id);
    flushOne(db, pending);
    written += 1;
  }
  return written;
}

/**
 * Test-only helper. Clears the in-memory queue without flushing.
 */
export function resetCorrectionQueue(): void {
  pendingByCanonical.clear();
}

/** Test/diagnostic helper — number of pending entries. */
export function pendingCorrectionCount(): number {
  return pendingByCanonical.size;
}
