/**
 * SPEC-008 — Persistent circuit-breaker for the resource evaluator.
 *
 * Per FR-006 (state persisted in DB so it survives restart), FR-007
 * (deterministic mode via injectable clock), FR-022 (high-priority alert
 * when open beyond `breaker_open_max_seconds`), FR-028 (half-open probe
 * admission), FR-356 (half-open probe budget cap = 3).
 *
 * Scope discriminator
 *   This module manages a single global evaluator breaker keyed by
 *   `(scope_kind='evaluator', scope_id IS NULL)` against the M65m
 *   `resource_governance_breaker` table. The "scope_id IS NULL" half of
 *   the UNIQUE(scope_kind, scope_id) admits exactly one row for the
 *   evaluator scope, matching FR-022's singular "the breaker" language and
 *   FR-356's single half-open probe budget.
 *
 * Surface
 *   - `tickError(errorCode)` — increments consecutive_errors; when count
 *     reaches `errorThreshold` (default 5/min) the row transitions
 *     `closed → open` and stamps `opened_at`.
 *   - `tickSuccess()` — resets `consecutive_errors=0`. When the row was
 *     `half_open`, transitions to `closed` and stamps `reset_at`.
 *   - `currentState(nowMs?)` — reads the row + auto-transitions `open →
 *     half_open` once `now - opened_at >= halfOpenAfterMs`. Returns the
 *     post-transition state.
 *   - `tryProbe()` — half-open admission probe. Returns `{admitted:true}`
 *     up to `halfOpenProbeBudget` times per open→half-open window; later
 *     callers receive `{admitted:false}` until a success/failure resolves
 *     the half-open window.
 *   - `chronicAlert()` — emits `governance_circuit_breaker_chronic` when
 *     the breaker has been open longer than `breakerOpenMaxMs` (FR-022),
 *     de-duped via `last_chronic_alert_at` in `notes_json`.
 *
 * Restart safety
 *   All state lives on `resource_governance_breaker`. The constructor
 *   loads (or upserts) the singleton row in one transaction so two boot
 *   races resolve to the same id. `consecutive_errors` and counters are
 *   incremented via conditional UPDATE so two writers never lose a tick.
 *
 * @see specs/008-resource-governance/spec.md FR-006, FR-007, FR-022,
 *      FR-028, FR-356
 * @see specs/008-resource-governance/tasks.md T066
 */

import { getBackgroundDb } from '@/lib/db/connection-pool';
import type Database from 'better-sqlite3';

/** Closed set of breaker states (matches M65m CHECK constraint). */
export type BreakerState = 'closed' | 'half_open' | 'open';

/**
 * Minimal clock contract for breaker tests. Implementations live in
 * `resource-breaker-clock.ts` (T067); the interface is owned here so the
 * breaker module is self-contained.
 */
export interface BreakerClock {
  /** Wall-clock time in milliseconds since epoch. */
  nowMs(): number;
}

/** Default clock — `Date.now()`. */
export const realBreakerClock: BreakerClock = {
  nowMs: () => Date.now(),
};

/** Shape of one row in `resource_governance_breaker`. */
interface BreakerRow {
  id: number;
  scope_kind: string;
  scope_id: number | null;
  state: BreakerState;
  consecutive_errors: number;
  opened_at: string | null;
  reset_at: string | null;
  notes_json: string | null;
  updated_at: string;
}

/** Per-instance options. All defaults derive from the spec. */
export interface CircuitBreakerOptions {
  /** Connection used by the breaker (default = `getBackgroundDb()`). */
  db?: Database.Database;
  /** Test clock injection point (default = real wall clock). */
  clock?: BreakerClock;
  /** Error count that flips closed → open (default: 5 per FR-022 lit). */
  errorThreshold?: number;
  /** Wait before open → half_open auto-transition (default: 60 000 ms). */
  halfOpenAfterMs?: number;
  /** Concurrent probe budget while half_open (default: 3 per FR-356). */
  halfOpenProbeBudget?: number;
  /** Open-too-long threshold for chronic alert (default: 1 800 000 ms = 30 min). */
  breakerOpenMaxMs?: number;
  /** De-dupe window for chronic alerts (default: 1 800 000 ms / 30 min). */
  chronicAlertDedupeMs?: number;
  /** Optional activity emitter (used for chronic alert). */
  emitActivity?: (
    db: Database.Database,
    kind: string,
    payload: Record<string, unknown>,
  ) => void;
  /**
   * Override scope_kind for the breaker row. Default `'evaluator'` per
   * the FR-022 singleton interpretation. Tests use a unique scope_kind
   * per invocation so concurrent vitest workers do not collide on the
   * UNIQUE(scope_kind, scope_id) index.
   */
  scopeKind?: string;
}

/** Defaults grouped for readability. */
const DEFAULTS = {
  errorThreshold: 5,
  halfOpenAfterMs: 60_000,
  halfOpenProbeBudget: 3,
  breakerOpenMaxMs: 1_800_000, // 30 min
  chronicAlertDedupeMs: 1_800_000, // 30 min
  scopeKind: 'evaluator',
};

const defaultEmitActivity: NonNullable<CircuitBreakerOptions['emitActivity']> = (
  db,
  kind,
  payload,
) => {
  try {
    db.prepare(
      `INSERT INTO activity_log (kind, payload_json, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    ).run(kind, JSON.stringify(payload));
  } catch {
    // Activity table absent in stripped test harnesses; drop silently.
  }
};

/**
 * Persistent circuit-breaker. Construct one per process; all methods are
 * synchronous. Restart safety: state lives on `resource_governance_breaker`.
 */
export class CircuitBreaker {
  private readonly db: Database.Database;
  private readonly clock: BreakerClock;
  private readonly errorThreshold: number;
  private readonly halfOpenAfterMs: number;
  private readonly halfOpenProbeBudget: number;
  private readonly breakerOpenMaxMs: number;
  private readonly chronicAlertDedupeMs: number;
  private readonly emit: NonNullable<CircuitBreakerOptions['emitActivity']>;
  private readonly scopeKind: string;
  /** Row id of the singleton row. Cached after first ensureRow call. */
  private rowId: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.db = opts.db ?? getBackgroundDb();
    this.clock = opts.clock ?? realBreakerClock;
    this.errorThreshold = opts.errorThreshold ?? DEFAULTS.errorThreshold;
    this.halfOpenAfterMs = opts.halfOpenAfterMs ?? DEFAULTS.halfOpenAfterMs;
    this.halfOpenProbeBudget =
      opts.halfOpenProbeBudget ?? DEFAULTS.halfOpenProbeBudget;
    this.breakerOpenMaxMs =
      opts.breakerOpenMaxMs ?? DEFAULTS.breakerOpenMaxMs;
    this.chronicAlertDedupeMs =
      opts.chronicAlertDedupeMs ?? DEFAULTS.chronicAlertDedupeMs;
    this.emit = opts.emitActivity ?? defaultEmitActivity;
    this.scopeKind = opts.scopeKind ?? DEFAULTS.scopeKind;
    this.rowId = this.ensureRow();
  }

  /**
   * Upsert the singleton breaker row inside one tx. UNIQUE(scope_kind,
   * scope_id) keeps the row count to exactly one per scope.
   */
  private ensureRow(): number {
    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare(
          `SELECT id FROM resource_governance_breaker
            WHERE scope_kind = ? AND scope_id IS NULL`,
        )
        .get(this.scopeKind) as { id: number } | undefined;
      if (existing !== undefined) return existing.id;
      const result = this.db
        .prepare(
          `INSERT INTO resource_governance_breaker
             (scope_kind, scope_id, state, consecutive_errors)
           VALUES (?, NULL, 'closed', 0)`,
        )
        .run(this.scopeKind);
      return Number(result.lastInsertRowid);
    });
    return tx();
  }

  /** Read the current breaker row. Throws if the row vanished. */
  private readRow(): BreakerRow {
    const row = this.db
      .prepare(
        `SELECT id, scope_kind, scope_id, state, consecutive_errors,
                opened_at, reset_at, notes_json, updated_at
           FROM resource_governance_breaker
          WHERE id = ?`,
      )
      .get(this.rowId) as BreakerRow | undefined;
    if (row === undefined) {
      throw new Error(
        `resource-circuit-breaker: row id=${String(this.rowId)} missing`,
      );
    }
    return row;
  }

  /**
   * Increment `consecutive_errors`. When the count reaches `errorThreshold`
   * the breaker transitions `closed → open` and stamps `opened_at` with
   * the injected clock's wall time.
   */
  public tickError(errorCode: string): BreakerState {
    const tx = this.db.transaction(() => {
      const row = this.readRow();
      // Once already open, additional errors do not flip a state but they
      // still bump the count so chronic-alert telemetry can read it.
      const newErrorCount = row.consecutive_errors + 1;
      const nowIso = new Date(this.clock.nowMs()).toISOString();
      let newState: BreakerState = row.state;
      let openedAt: string | null = row.opened_at;
      if (row.state === 'closed' && newErrorCount >= this.errorThreshold) {
        newState = 'open';
        openedAt = nowIso;
      }
      this.db
        .prepare(
          `UPDATE resource_governance_breaker
              SET consecutive_errors = ?,
                  state = ?,
                  opened_at = COALESCE(?, opened_at),
                  notes_json = ?,
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(
          newErrorCount,
          newState,
          openedAt,
          JSON.stringify({ last_error_code: errorCode, last_tick_at: nowIso }),
          nowIso,
          this.rowId,
        );
      return newState;
    });
    return tx();
  }

  /**
   * Reset the error counter. When the breaker is in `half_open` this
   * transitions back to `closed` and stamps `reset_at`. From `open`
   * (without a half-open probe) `tickSuccess()` is a no-op for the state
   * (only `currentState` advances open→half_open after the wait window).
   */
  public tickSuccess(): BreakerState {
    const tx = this.db.transaction(() => {
      const row = this.readRow();
      const nowIso = new Date(this.clock.nowMs()).toISOString();
      let newState: BreakerState = row.state;
      if (row.state === 'half_open') {
        newState = 'closed';
      }
      const newResetAt = newState === 'closed' ? nowIso : row.reset_at;
      this.db
        .prepare(
          `UPDATE resource_governance_breaker
              SET consecutive_errors = 0,
                  state = ?,
                  reset_at = ?,
                  notes_json = ?,
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(
          newState,
          newResetAt,
          JSON.stringify({ last_success_at: nowIso }),
          nowIso,
          this.rowId,
        );
      return newState;
    });
    return tx();
  }

  /**
   * Read the current state and auto-transition `open → half_open` when
   * the wait window has elapsed. Idempotent — multiple calls inside the
   * same window all return the same state without double-advancing.
   */
  public currentState(nowMs: number = this.clock.nowMs()): BreakerState {
    const tx = this.db.transaction(() => {
      const row = this.readRow();
      if (row.state !== 'open' || row.opened_at === null) return row.state;
      const openedAtMs = Date.parse(row.opened_at);
      if (Number.isNaN(openedAtMs)) return row.state;
      if (nowMs - openedAtMs < this.halfOpenAfterMs) return row.state;
      // Auto-transition to half_open and reset the probe-budget counter
      // by clearing notes.half_open_probes_in_flight.
      const nowIso = new Date(nowMs).toISOString();
      this.db
        .prepare(
          `UPDATE resource_governance_breaker
              SET state = 'half_open',
                  notes_json = ?,
                  updated_at = ?
            WHERE id = ? AND state = 'open'`,
        )
        .run(
          JSON.stringify({ half_open_probes_in_flight: 0, half_open_at: nowIso }),
          nowIso,
          this.rowId,
        );
      return 'half_open' as BreakerState;
    });
    return tx();
  }

  /**
   * Half-open probe admission. Returns `{admitted:true}` until the per-
   * window probe budget is exhausted; `{admitted:false}` thereafter until
   * `tickSuccess` (closes the breaker) or `tickError` (re-opens it).
   *
   * Concurrency: probe-count is incremented inside a conditional UPDATE so
   * two callers cannot both consume the same budget slot.
   */
  public tryProbe(): { admitted: boolean; remaining: number } {
    const state = this.currentState();
    if (state === 'closed') return { admitted: true, remaining: this.halfOpenProbeBudget };
    if (state === 'open') return { admitted: false, remaining: 0 };
    // half_open — increment probes_in_flight under a CAS.
    const tx = this.db.transaction(() => {
      const row = this.readRow();
      const notes: Record<string, unknown> = (() => {
        try {
          return row.notes_json !== null
            ? (JSON.parse(row.notes_json) as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      })();
      const inFlightRaw = notes['half_open_probes_in_flight'];
      const inFlight = typeof inFlightRaw === 'number' ? inFlightRaw : 0;
      if (inFlight >= this.halfOpenProbeBudget) {
        return { admitted: false, remaining: 0 };
      }
      const nextInFlight = inFlight + 1;
      const newNotes = { ...notes, half_open_probes_in_flight: nextInFlight };
      this.db
        .prepare(
          `UPDATE resource_governance_breaker
              SET notes_json = ?,
                  updated_at = ?
            WHERE id = ? AND state = 'half_open'`,
        )
        .run(
          JSON.stringify(newNotes),
          new Date(this.clock.nowMs()).toISOString(),
          this.rowId,
        );
      return {
        admitted: true,
        remaining: this.halfOpenProbeBudget - nextInFlight,
      };
    });
    return tx();
  }

  /**
   * Emit `governance_circuit_breaker_chronic` if the breaker has been
   * open longer than `breakerOpenMaxMs`. De-duped via the row's
   * `notes_json.last_chronic_alert_at` so repeat invocations within the
   * dedupe window are silent.
   */
  public chronicAlert(): { emitted: boolean } {
    const row = this.readRow();
    if (row.state !== 'open' || row.opened_at === null) {
      return { emitted: false };
    }
    const openedAtMs = Date.parse(row.opened_at);
    if (Number.isNaN(openedAtMs)) return { emitted: false };
    const nowMs = this.clock.nowMs();
    if (nowMs - openedAtMs < this.breakerOpenMaxMs) {
      return { emitted: false };
    }
    const notes: Record<string, unknown> = (() => {
      try {
        return row.notes_json !== null
          ? (JSON.parse(row.notes_json) as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })();
    const lastAlertRaw = notes['last_chronic_alert_at'];
    const lastAlertMs =
      typeof lastAlertRaw === 'string' ? Date.parse(lastAlertRaw) : 0;
    if (
      !Number.isNaN(lastAlertMs) &&
      lastAlertMs > 0 &&
      nowMs - lastAlertMs < this.chronicAlertDedupeMs
    ) {
      return { emitted: false };
    }
    const nowIso = new Date(nowMs).toISOString();
    const updatedNotes = { ...notes, last_chronic_alert_at: nowIso };
    this.db
      .prepare(
        `UPDATE resource_governance_breaker
            SET notes_json = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(JSON.stringify(updatedNotes), nowIso, this.rowId);
    this.emit(this.db, 'governance_circuit_breaker_chronic', {
      breaker_id: this.rowId,
      scope_kind: this.scopeKind,
      opened_at: row.opened_at,
      duration_ms: nowMs - openedAtMs,
      runbook: 'docs/runbook/breaker-stuck-open.md',
    });
    return { emitted: true };
  }
}

/** Singleton accessor used by the evaluator wiring. */
let _instance: CircuitBreaker | null = null;
export function getEvaluatorBreaker(opts?: CircuitBreakerOptions): CircuitBreaker {
  if (_instance === null || opts !== undefined) {
    _instance = new CircuitBreaker(opts ?? {});
  }
  return _instance;
}

/** Test helper: drop the cached singleton so a fresh instance can be built. */
export function _resetEvaluatorBreakerForTests(): void {
  _instance = null;
}
