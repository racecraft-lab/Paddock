/**
 * SPEC-008 — Atomic budget counter primitives.
 *
 * Per FR-052 (precomputed `(policy_id, window_start)` per-window balances),
 * FR-053 (split UPDATE patterns: separate `reserve` / `release` / `consume`
 * paths), FR-054 (BEGIN IMMEDIATE + conditional UPDATE optimistic-lock),
 * FR-070 (single-index counter lookup), FR-333 (rowcount=0 from the
 * conditional UPDATE is the canonical contention signal).
 *
 * Schema reminder (M65f):
 *   resource_budget_counters(
 *     id, policy_id, window_start,
 *     consumed_usd, consumed_token, consumed_request, consumed_session,
 *     reserved_usd, reserved_token, reserved_request, reserved_session,
 *     version, pending_rebuild_job_id, updated_at,
 *     UNIQUE(policy_id, window_start)
 *   )
 *
 * The schema does NOT have a `counter_value` column; the FR-054 spec text
 * is generalized in this implementation by dispatching on `unit` and
 * updating the matching `consumed_<unit>` / `reserved_<unit>` pair. The
 * optimistic-lock predicate is `version = :expected_version` plus a
 * caller-supplied limit comparison (the policy's `limit_value` is loaded
 * separately by the evaluator and threaded into the predicate).
 *
 * Behavior contract:
 *   - `reserve(unit, amount)` — moves `amount` from "free budget" into
 *     `reserved_<unit>`. Conditional UPDATE: predicate asserts the
 *     remaining-after-reservation is non-negative AND `version` matches.
 *     Returns `{ committed: true, version, ... }` or
 *     `{ committed: false, conflict: 'version_mismatch' | 'insufficient' }`.
 *   - `release(unit, amount)` — reverses a reservation; returns the
 *     budget to the free pool. Predicate: `reserved_<unit> >= amount AND
 *     version = :expected_version`.
 *   - `consume(unit, amount)` — converts a reservation into actual
 *     consumption: `reserved_<unit>` decreases by `amount`,
 *     `consumed_<unit>` increases by `amount`. Predicate: `reserved_<unit>
 *     >= amount AND version = :expected_version`.
 *
 * Each path bumps `version` and updates `updated_at`. The caller MUST
 * load the row's current `version` before calling so the optimistic-lock
 * compare-and-swap is valid (the typical pattern is the FR-025
 * read-snapshot transaction).
 *
 * @see specs/008-resource-governance/spec.md FR-052, FR-053, FR-054,
 *      FR-070, FR-333
 * @see specs/008-resource-governance/data-model.md M65f
 * @see specs/008-resource-governance/tasks.md T061
 */

import type { LedgerUnit } from '@/lib/resource-budget-ledger';
import type Database from 'better-sqlite3';

/** Closed alias of the four canonical units. */
export type CounterUnit = LedgerUnit;

/** Snapshot of one counter row (only the unit-relevant pair is meaningful). */
export interface CounterSnapshot {
  id: number;
  policy_id: number;
  window_start: string;
  consumed_usd: number;
  consumed_token: number;
  consumed_request: number;
  consumed_session: number;
  reserved_usd: number;
  reserved_token: number;
  reserved_request: number;
  reserved_session: number;
  version: number;
  pending_rebuild_job_id: string | null;
}

/** Conditional-UPDATE result returned by every counter primitive. */
export type CounterUpdateResult =
  | {
      committed: true;
      new_version: number;
      counter_id: number;
    }
  | {
      committed: false;
      conflict:
        | 'version_mismatch'
        | 'insufficient'
        | 'not_found'
        | 'rebuild_pending';
    };

/** Map a unit → consumed/reserved column names (compile-time exhaustive). */
function columnsForUnit(unit: CounterUnit): {
  consumed: string;
  reserved: string;
} {
  switch (unit) {
    case 'usd':
      return { consumed: 'consumed_usd', reserved: 'reserved_usd' };
    case 'token':
      return { consumed: 'consumed_token', reserved: 'reserved_token' };
    case 'request':
      return { consumed: 'consumed_request', reserved: 'reserved_request' };
    case 'session':
      return { consumed: 'consumed_session', reserved: 'reserved_session' };
  }
}

/**
 * Read the current snapshot for a `(policy_id, window_start)` row. Returns
 * `null` if the row is absent — callers SHOULD use `ensureCounter` to
 * upsert a zeroed row before calling `reserve`/`release`/`consume`.
 */
export function getCounter(
  db: Database.Database,
  args: { policy_id: number; window_start: string },
): CounterSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, policy_id, window_start,
              consumed_usd, consumed_token, consumed_request, consumed_session,
              reserved_usd, reserved_token, reserved_request, reserved_session,
              version, pending_rebuild_job_id
         FROM resource_budget_counters
         WHERE policy_id = ? AND window_start = ?`,
    )
    .get(args.policy_id, args.window_start) as CounterSnapshot | undefined;
  return row ?? null;
}

/**
 * Idempotent insert of a zeroed counter row. Used by writers that don't
 * want to special-case "first ever reservation for this window". The
 * UNIQUE(policy_id, window_start) constraint guarantees only one row.
 *
 * Returns the existing OR newly-inserted row's `id`.
 */
export function ensureCounter(
  db: Database.Database,
  args: { policy_id: number; window_start: string },
): number {
  const existing = getCounter(db, args);
  if (existing !== null) return existing.id;
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO resource_budget_counters
         (policy_id, window_start)
       VALUES (?, ?)`,
    )
    .run(args.policy_id, args.window_start);
  if (result.changes > 0) return Number(result.lastInsertRowid);
  // Lost the race; re-read.
  const after = getCounter(db, args);
  if (after === null) {
    throw new Error('resource-budget-counters: ensureCounter failed to upsert');
  }
  return after.id;
}

/**
 * Reserve `amount` units against the policy's per-window budget.
 *
 * The conditional UPDATE asserts:
 *   - `version = expected_version` (FR-053 optimistic lock).
 *   - `consumed_<unit> + reserved_<unit> + amount <= limit_value` (the
 *     remaining-budget invariant; the caller passes the policy's
 *     `limit_value` from the FR-025 read snapshot).
 *
 * Returns `{ committed: true, new_version }` on success. On `changes=0`
 * the result is `{ committed: false, conflict: 'version_mismatch' |
 * 'insufficient' }`. The disambiguation requires a follow-up read; callers
 * who care about the distinction should re-read with `getCounter` and
 * compare `version` and the consumed+reserved sum.
 */
export function reserve(
  db: Database.Database,
  args: {
    policy_id: number;
    window_start: string;
    unit: CounterUnit;
    amount: number;
    expected_version: number;
    limit_value: number;
  },
): CounterUpdateResult {
  if (!Number.isFinite(args.amount) || args.amount < 0) {
    throw new Error(`resource-budget-counters: amount must be non-negative finite: ${String(args.amount)}`);
  }
  const { consumed, reserved } = columnsForUnit(args.unit);
  // Hard-block guard (FR-057 / FR-345): when drift detection has flagged
  // a counter for rebuild (`pending_rebuild_job_id IS NOT NULL`), no new
  // reservations may be granted against it. The conditional UPDATE simply
  // refuses to match such rows; the snapshot re-read below disambiguates.
  const result = db
    .prepare(
      `UPDATE resource_budget_counters
          SET ${reserved} = ${reserved} + ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE policy_id = ?
          AND window_start = ?
          AND version = ?
          AND pending_rebuild_job_id IS NULL
          AND (${consumed} + ${reserved} + ?) <= ?`,
    )
    .run(
      args.amount,
      args.policy_id,
      args.window_start,
      args.expected_version,
      args.amount,
      args.limit_value,
    );
  if (result.changes === 0) {
    // Disambiguate the conflict with one re-read so callers get a typed
    // error code without a second round trip.
    const snap = getCounter(db, args);
    if (snap === null) return { committed: false, conflict: 'not_found' };
    if (snap.pending_rebuild_job_id !== null) {
      return { committed: false, conflict: 'rebuild_pending' };
    }
    if (snap.version !== args.expected_version) {
      return { committed: false, conflict: 'version_mismatch' };
    }
    return { committed: false, conflict: 'insufficient' };
  }
  const after = getCounter(db, args);
  return {
    committed: true,
    new_version: after?.version ?? args.expected_version + 1,
    counter_id: after?.id ?? 0,
  };
}

/**
 * Release `amount` units of an existing reservation back to the free pool.
 * Predicate: `reserved_<unit> >= amount AND version = expected_version`.
 */
export function release(
  db: Database.Database,
  args: {
    policy_id: number;
    window_start: string;
    unit: CounterUnit;
    amount: number;
    expected_version: number;
  },
): CounterUpdateResult {
  if (!Number.isFinite(args.amount) || args.amount < 0) {
    throw new Error(`resource-budget-counters: amount must be non-negative finite: ${String(args.amount)}`);
  }
  const { reserved } = columnsForUnit(args.unit);
  const result = db
    .prepare(
      `UPDATE resource_budget_counters
          SET ${reserved} = ${reserved} - ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE policy_id = ?
          AND window_start = ?
          AND version = ?
          AND ${reserved} >= ?`,
    )
    .run(
      args.amount,
      args.policy_id,
      args.window_start,
      args.expected_version,
      args.amount,
    );
  if (result.changes === 0) {
    const snap = getCounter(db, args);
    if (snap === null) return { committed: false, conflict: 'not_found' };
    if (snap.version !== args.expected_version) {
      return { committed: false, conflict: 'version_mismatch' };
    }
    return { committed: false, conflict: 'insufficient' };
  }
  const after = getCounter(db, args);
  return {
    committed: true,
    new_version: after?.version ?? args.expected_version + 1,
    counter_id: after?.id ?? 0,
  };
}

/**
 * Convert a reservation into actual consumption. `reserved_<unit>`
 * decreases by `amount`, `consumed_<unit>` increases by `amount`.
 * Predicate: `reserved_<unit> >= amount AND version = expected_version`.
 */
export function consume(
  db: Database.Database,
  args: {
    policy_id: number;
    window_start: string;
    unit: CounterUnit;
    amount: number;
    expected_version: number;
  },
): CounterUpdateResult {
  if (!Number.isFinite(args.amount) || args.amount < 0) {
    throw new Error(`resource-budget-counters: amount must be non-negative finite: ${String(args.amount)}`);
  }
  const { consumed, reserved } = columnsForUnit(args.unit);
  const result = db
    .prepare(
      `UPDATE resource_budget_counters
          SET ${reserved} = ${reserved} - ?,
              ${consumed} = ${consumed} + ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE policy_id = ?
          AND window_start = ?
          AND version = ?
          AND ${reserved} >= ?`,
    )
    .run(
      args.amount,
      args.amount,
      args.policy_id,
      args.window_start,
      args.expected_version,
      args.amount,
    );
  if (result.changes === 0) {
    const snap = getCounter(db, args);
    if (snap === null) return { committed: false, conflict: 'not_found' };
    if (snap.version !== args.expected_version) {
      return { committed: false, conflict: 'version_mismatch' };
    }
    return { committed: false, conflict: 'insufficient' };
  }
  const after = getCounter(db, args);
  return {
    committed: true,
    new_version: after?.version ?? args.expected_version + 1,
    counter_id: after?.id ?? 0,
  };
}
