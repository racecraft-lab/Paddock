/**
 * SPEC-008 — Circuit-breaker restart-recovery scan.
 *
 * Per FR-006 (state survives process restart) and FR-022 (recover the
 * chronic-alert posture across restarts). On boot we scan every row in
 * `resource_governance_breaker` and recompute the auto-transitions the
 * runtime-resident breaker would compute on its next read:
 *
 *   - `open` rows whose `now - opened_at >= halfOpenAfterMs` advance
 *     to `half_open` and reset the in-flight probe counter.
 *   - `half_open` rows whose probe budget is fully consumed AND whose
 *     `consecutive_errors === 0` are nudged to `closed`. (The base
 *     `CircuitBreaker.tryProbe()` does not auto-close — it only blocks
 *     further admission. After a restart we want the persisted state
 *     to reflect what the live driver would converge on, so a budget-
 *     exhausted half-open with no observed failures becomes closed.)
 *   - `closed` rows are not modified.
 *
 * Idempotency: the scan is a single `db.transaction` that reads every
 * row, filters the work-set in TS, and writes only the rows that need
 * a transition. Repeated invocations on the same input yield identical
 * output — a property the unit test exercises directly.
 *
 * Wiring: callers pass a Database connection (typically the foreground
 * one) and an optional clock for tests. The function is intentionally
 * NOT plumbed into actual app boot in this commit; the prompt is
 * "provide the function". The integration into `src/lib/db/init.ts`
 * (or wherever the boot sequence lives) lands in a later task.
 *
 * @see specs/008-resource-governance/spec.md FR-006, FR-022
 * @see specs/008-resource-governance/tasks.md T156 (orchestrator plan)
 */

import {
  realBreakerClock,
  type BreakerClock,
} from '@/lib/resource-breaker-clock';
import type Database from 'better-sqlite3';

/** Persisted row shape — mirrors `M65m`. */
interface BreakerStateRow {
  id: number;
  scope_kind: string;
  scope_id: number | null;
  state: 'closed' | 'half_open' | 'open';
  consecutive_errors: number;
  opened_at: string | null;
  reset_at: string | null;
  notes_json: string | null;
  updated_at: string;
}

/** Recovery options — knobs match `CircuitBreaker` defaults. */
export interface RecoveryOptions {
  clock?: BreakerClock;
  /** Default 60 000 ms — same as `CircuitBreaker.halfOpenAfterMs`. */
  halfOpenAfterMs?: number;
  /** Default 3 — same as `CircuitBreaker.halfOpenProbeBudget`. */
  halfOpenProbeBudget?: number;
}

/** Return summary so the caller can log the scan outcome. */
export interface RecoveryResult {
  rowsScanned: number;
  openToHalfOpen: number;
  halfOpenToClosed: number;
  unchanged: number;
}

/**
 * Scan every breaker row and apply restart-time auto-transitions.
 * Returns a per-class transition summary for logging.
 */
export function recoverBreakersOnBoot(
  db: Database.Database,
  options: RecoveryOptions = {},
): RecoveryResult {
  const clock = options.clock ?? realBreakerClock;
  const halfOpenAfterMs = options.halfOpenAfterMs ?? 60_000;
  const halfOpenProbeBudget = options.halfOpenProbeBudget ?? 3;

  const summary: RecoveryResult = {
    rowsScanned: 0,
    openToHalfOpen: 0,
    halfOpenToClosed: 0,
    unchanged: 0,
  };

  const tx = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT id, scope_kind, scope_id, state, consecutive_errors,
                opened_at, reset_at, notes_json, updated_at
           FROM resource_governance_breaker`,
      )
      .all() as BreakerStateRow[];

    summary.rowsScanned = rows.length;
    const nowMs = clock.nowMs();
    const nowIso = new Date(nowMs).toISOString();

    for (const row of rows) {
      // open → half_open when the wait window has elapsed.
      if (row.state === 'open' && row.opened_at !== null) {
        const openedAtMs = Date.parse(row.opened_at);
        if (
          !Number.isNaN(openedAtMs) &&
          nowMs - openedAtMs >= halfOpenAfterMs
        ) {
          db.prepare(
            `UPDATE resource_governance_breaker
                SET state = 'half_open',
                    notes_json = ?,
                    updated_at = ?
              WHERE id = ? AND state = 'open'`,
          ).run(
            JSON.stringify({
              half_open_probes_in_flight: 0,
              half_open_at: nowIso,
              recovered_at: nowIso,
            }),
            nowIso,
            row.id,
          );
          summary.openToHalfOpen += 1;
          continue;
        }
        summary.unchanged += 1;
        continue;
      }

      // half_open → closed when the probe budget is exhausted AND no
      // residual failures are queued. This is the "drained" case the
      // live driver would emit on the next tickSuccess; on restart we
      // converge there directly so the row matches what an in-process
      // breaker would believe.
      if (row.state === 'half_open') {
        let inFlight = 0;
        try {
          if (row.notes_json !== null) {
            const parsed = JSON.parse(row.notes_json) as Record<
              string,
              unknown
            >;
            const raw = parsed['half_open_probes_in_flight'];
            if (typeof raw === 'number') inFlight = raw;
          }
        } catch {
          // unreadable notes — treat as zero.
        }
        if (
          inFlight >= halfOpenProbeBudget &&
          row.consecutive_errors === 0
        ) {
          db.prepare(
            `UPDATE resource_governance_breaker
                SET state = 'closed',
                    consecutive_errors = 0,
                    reset_at = ?,
                    notes_json = ?,
                    updated_at = ?
              WHERE id = ? AND state = 'half_open'`,
          ).run(
            nowIso,
            JSON.stringify({ recovered_at: nowIso }),
            nowIso,
            row.id,
          );
          summary.halfOpenToClosed += 1;
          continue;
        }
        summary.unchanged += 1;
        continue;
      }

      // closed rows — no transition.
      summary.unchanged += 1;
    }

    return summary;
  });

  return tx.immediate();
}
