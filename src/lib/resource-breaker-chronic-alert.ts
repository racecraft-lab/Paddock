/**
 * SPEC-008 — Chronic-open alert background job for the persistent breaker.
 *
 * Per FR-022 (high-priority alert when breaker stuck open beyond
 * `breaker_open_max_seconds`) and FR-090l (operator runbook for chronic
 * open). The base `CircuitBreaker.chronicAlert()` does the per-row work
 * and de-dupes against `notes_json.last_chronic_alert_at`. This module
 * is the cadence wrapper that invokes that primitive at a 60-second
 * tick (default), iterating every persisted breaker row so multi-scope
 * breakers (when SPEC-008 expands beyond a single evaluator scope) all
 * get covered by one job.
 *
 * The job is exposed as a function — `runChronicAlertJob(db, clock)` —
 * that returns the count of rows where an alert was emitted on this
 * tick. The host scheduler (cron, setInterval, queue worker) decides
 * cadence; we do not own the timer here. Tests drive the function
 * directly with a `FakeBreakerClock` and assert the de-dup invariants.
 *
 * @see specs/008-resource-governance/spec.md FR-022, FR-090l
 * @see specs/008-resource-governance/tasks.md T157 (orchestrator plan)
 */

import {
  realBreakerClock,
  type BreakerClock,
} from '@/lib/resource-breaker-clock';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
} from '@/lib/resource-circuit-breaker';
import type Database from 'better-sqlite3';

/** Job options — pass `clock` for deterministic tests. */
export interface ChronicAlertJobOptions {
  clock?: BreakerClock;
  /** Threshold (ms) after which an open breaker is "chronic". */
  breakerOpenMaxMs?: number;
  /** Dedup window (ms) before a re-alert is allowed. */
  chronicAlertDedupeMs?: number;
  /** Activity emitter override (delegates to `CircuitBreaker`). */
  emitActivity?: CircuitBreakerOptions['emitActivity'];
}

/** Job result — number of rows that emitted an alert on this tick. */
export interface ChronicAlertJobResult {
  rowsScanned: number;
  alertsEmitted: number;
}

/**
 * Iterate every breaker row, build a one-shot `CircuitBreaker` keyed to
 * the row's `scope_kind`, and call `chronicAlert()`. The method is a
 * read+conditional-update against the row, so wrapping each row with a
 * fresh instance is safe; the row's own `notes_json.last_chronic_alert_at`
 * is what carries de-dup state across ticks.
 */
export function runChronicAlertJob(
  db: Database.Database,
  options: ChronicAlertJobOptions = {},
): ChronicAlertJobResult {
  const clock = options.clock ?? realBreakerClock;
  const result: ChronicAlertJobResult = {
    rowsScanned: 0,
    alertsEmitted: 0,
  };

  const rows = db
    .prepare(
      `SELECT scope_kind FROM resource_governance_breaker
        WHERE state = 'open'`,
    )
    .all() as { scope_kind: string }[];

  result.rowsScanned = rows.length;

  for (const row of rows) {
    const ctorOpts: CircuitBreakerOptions = {
      db,
      clock,
      scopeKind: row.scope_kind,
    };
    if (options.breakerOpenMaxMs !== undefined) {
      ctorOpts.breakerOpenMaxMs = options.breakerOpenMaxMs;
    }
    if (options.chronicAlertDedupeMs !== undefined) {
      ctorOpts.chronicAlertDedupeMs = options.chronicAlertDedupeMs;
    }
    if (options.emitActivity !== undefined) {
      ctorOpts.emitActivity = options.emitActivity;
    }
    const breaker = new CircuitBreaker(ctorOpts);
    const { emitted } = breaker.chronicAlert();
    if (emitted) result.alertsEmitted += 1;
  }

  return result;
}
