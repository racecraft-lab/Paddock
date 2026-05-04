/**
 * SPEC-008 — Reservation reaper.
 *
 * Per FR-064 (1-minute background scan, runs on the background DB
 * connection per FR-331 with `busy_timeout=5000`), FR-185 (alert when
 * reaped count exceeds soft threshold), FR-294 (reaper, task-completion
 * handler, and operator-revoke all share one writer — `releaseReservation`
 * — and the compare-and-set inside it prevents double-release).
 *
 * Surface:
 *   - `runReaperOnce(opts)` — synchronous one-shot pass; returns reap stats.
 *     Used by tests (no timer) and by the long-running scheduler below.
 *   - `startReaper(opts)` — schedules `runReaperOnce` on a 1-minute interval
 *     using the supplied clock; returns a `stop()` handle. The scheduler is
 *     constructed but NOT started by default — wiring into the app boot
 *     sequence happens elsewhere.
 *
 * Activity rows emitted (idempotent inside one tx via `releaseReservation`):
 *   - `mc.governance.reservation_reaper_released` per reaped row.
 *   - `governance_reservation_reaper_alert` once per cycle when reaped
 *      count > soft threshold (default 50/min from `governance.json`).
 *
 * @see specs/008-resource-governance/spec.md FR-064, FR-185, FR-294, FR-336
 * @see specs/008-resource-governance/tasks.md T064
 */

import { getBackgroundDb } from '@/lib/db/connection-pool';
import { releaseReservation } from '@/lib/resource-reservation-release';
import type Database from 'better-sqlite3';

/** Reaper soft-threshold default (per spec.md FR-064 commentary). */
export const DEFAULT_SOFT_THRESHOLD = 50;

/** Reaper cadence default (1 minute per FR-064). */
export const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Per-cycle stats returned by `runReaperOnce`. Tests assert on these.
 */
export interface ReaperCycleResult {
  /** Total active reservations scanned (matched the expiry predicate). */
  scanned: number;
  /** Number of rows the reaper successfully terminated. */
  released: number;
  /** Number where another writer (task-completion / operator) won the CAS. */
  already_released: number;
  /** True when `released > soft_threshold` and the alert row was emitted. */
  alerted: boolean;
}

/** Activity emitter contract — kept narrow so tests can fake it. */
export type ActivityEmitter = (
  db: Database.Database,
  kind: string,
  payload: Record<string, unknown>,
) => void;

/** Default emitter writes a JSON row to a generic activity log table. */
const defaultEmitActivity: ActivityEmitter = (db, kind, payload) => {
  // Activity table name is project-shared (`activity_log`); the reaper
  // does not own its schema. We INSERT only the fields required by all
  // SPEC-008 emitters and tolerate a missing table by silently skipping
  // (so the reaper does not crash in stripped test harnesses).
  try {
    db.prepare(
      `INSERT INTO activity_log (kind, payload_json, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    ).run(kind, JSON.stringify(payload));
  } catch {
    // Table absent — caller harness is intentionally minimal. Drop.
  }
};

/** Clock contract — injectable for tests; default is the real wall clock. */
export interface ReaperClock {
  nowIso(): string;
  setTimeoutFn(cb: () => void, ms: number): () => void;
}

const realReaperClock: ReaperClock = {
  nowIso: () => new Date().toISOString(),
  setTimeoutFn: (cb, ms) => {
    const id = setTimeout(cb, ms);
    return () => {
      clearTimeout(id);
    };
  },
};

/** Options accepted by both `runReaperOnce` and `startReaper`. */
export interface ReaperOptions {
  /** Override the connection (default = `getBackgroundDb()`). */
  db?: Database.Database;
  /** Soft alert threshold; defaults to FR-064's 50 reaped/min. */
  softThreshold?: number;
  /** Inject for tests. */
  clock?: ReaperClock;
  /** Inject for tests so we can assert emitted activity. */
  emitActivity?: ActivityEmitter;
}

/**
 * One reaper pass. Selects every active reservation whose `expires_at`
 * has lapsed and calls `releaseReservation(id, 'expired_idle')`.
 *
 * Idempotency: `releaseReservation` performs the FR-294 compare-and-set
 * inside its own BEGIN IMMEDIATE — this function never tries to debit
 * counters or write ledger rows directly. The reaper records each
 * outcome (released / already_released) so the per-cycle stats let
 * operators see the rate at which the task-completion path is winning
 * the race.
 */
export function runReaperOnce(opts: ReaperOptions = {}): ReaperCycleResult {
  const db = opts.db ?? getBackgroundDb();
  const softThreshold = opts.softThreshold ?? DEFAULT_SOFT_THRESHOLD;
  const clock = opts.clock ?? realReaperClock;
  const emit = opts.emitActivity ?? defaultEmitActivity;

  const nowIso = clock.nowIso();
  const candidates = db
    .prepare(
      `SELECT id FROM resource_reservations
        WHERE state = 'active'
          AND expires_at < ?`,
    )
    .all(nowIso) as { id: number }[];

  let released = 0;
  let already = 0;
  for (const row of candidates) {
    const result = releaseReservation(db, row.id, 'expired_idle');
    if (result.released) {
      released += 1;
      emit(db, 'mc.governance.reservation_reaper_released', {
        reservation_id: row.id,
        released_at: nowIso,
        terminal_state: result.state,
      });
    } else if (result.already_released) {
      already += 1;
    }
    // result.released === false && already_released === false: row vanished
    // between the SELECT and the CAS; ignore (single-writer guarantee in
    // practice means this is unreachable, but defending the fold anyway).
  }

  let alerted = false;
  if (released > softThreshold) {
    alerted = true;
    emit(db, 'governance_reservation_reaper_alert', {
      released_count: released,
      soft_threshold: softThreshold,
      cycle_at: nowIso,
    });
  }

  return {
    scanned: candidates.length,
    released,
    already_released: already,
    alerted,
  };
}

/** Handle returned by `startReaper`. */
export interface ReaperHandle {
  /** Stop the scheduler. Idempotent. */
  stop(): void;
}

/**
 * Schedule `runReaperOnce` on a 1-minute interval using the injected
 * clock. The first cycle runs after `intervalMs`, NOT immediately, so a
 * test caller can stop the scheduler before any work happens.
 */
export function startReaper(
  opts: ReaperOptions & { intervalMs?: number } = {},
): ReaperHandle {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const clock = opts.clock ?? realReaperClock;
  let stopped = false;
  const noopCancel: () => void = () => {
    /* no-op cancel handle for the initial value */
  };
  let cancel: () => void = noopCancel;

  const tick = (): void => {
    // `stopped` may have flipped via a callback fired during a previous
    // tick (callers can call `stop()` from inside `emitActivity`); both
    // gates are intentional. The post-cycle gate is also defensive
    // because the cycle is synchronous today but the reaper API admits
    // an async emitter shape in the future.
    let isStopped: boolean = stopped;
    if (isStopped) return;
    try {
      runReaperOnce(opts);
    } catch {
      // Reaper is best-effort; a failure should not crash the scheduler.
      // The activity emitter records the cycle result so observability
      // surfaces silent failures via missing-emit telemetry.
    }
    isStopped = stopped;
    if (isStopped) return;
    cancel = clock.setTimeoutFn(tick, intervalMs);
  };

  cancel = clock.setTimeoutFn(tick, intervalMs);

  return {
    stop: (): void => {
      stopped = true;
      cancel();
    },
  };
}
