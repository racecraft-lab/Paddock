/**
 * SPEC-008 — Atomic budget-reservation grant.
 *
 * Per FR-054 (BEGIN IMMEDIATE + counter conditional UPDATE), FR-055
 * (deterministic conflicts under contention), FR-065 (reservation row
 * creation), FR-173 / FR-174 (atomic three-row write: counter UPDATE +
 * reservation INSERT + ledger append in one transaction).
 *
 * Surface:
 *   - `reserveBudget(input, db?)` — synchronous; runs the whole grant
 *     inside `db.transaction(fn).immediate(args)` so the writer holds a
 *     RESERVED lock from the first SELECT through the final INSERT. On
 *     conflict the transaction rolls back and a typed `ReservationResult`
 *     failure is returned.
 *
 * Result mapping (CounterUpdateResult → ReservationResult):
 *   - `version_mismatch` → `code='counter_conflict'`
 *   - `insufficient`     → `code='budget_exhausted'`
 *   - `not_found`        → `code='counter_conflict'` (caller should pre-
 *     populate via `ensureCounter` to avoid this)
 *   - policy outside `enabled_at`/`disabled_at` window → `code=
 *     'reservation_window_invalid'` (returned BEFORE the counter UPDATE
 *     so we never write a reservation against a dead policy)
 *
 * Reservation row:
 *   - `state='active'` (the M65g CHECK admits only `'active'`,
 *     `'consumed'`, `'released'`, `'expired'` — there is no `'pending'`).
 *   - `expires_at = now + ttl_ms` (ISO-8601 UTC).
 *   - `granted_by` is the operator/system actor; required so the audit
 *     trail can attribute the grant.
 *
 * Ledger row:
 *   - `kind='reservation'` (per the M65e CHECK closed set).
 *   - `source_event_id=null` for system grants; operator-issued overrides
 *     thread their decision_id through `originating_decision_id`.
 *
 * @see specs/008-resource-governance/spec.md FR-054, FR-055, FR-065,
 *      FR-173, FR-174
 * @see specs/008-resource-governance/tasks.md T063
 * @see Constitution Convention J (`src/lib/resource-*.ts` is in
 *      `tsconfig.spec-strict.json` and the strict-scope ESLint override)
 */

import { randomUUID } from 'node:crypto';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  ensureCounter,
  getCounter,
  reserve,
} from '@/lib/resource-budget-counters';
import {
  appendLedger,
  type LedgerUnit,
} from '@/lib/resource-budget-ledger';
import { isPolicyLive, loadPolicyById } from '@/lib/resource-policy-loader';
import type Database from 'better-sqlite3';

/** Budget unit; closed set matching `LedgerUnit` and the M65g CHECK. */
export type ReservationUnit = LedgerUnit;

/**
 * Input for one reservation grant.
 *
 * `expected_version` is OPTIONAL — when omitted the writer reads the
 * current counter version inside the transaction and uses it as the
 * optimistic-lock baseline (no contention possible because the BEGIN
 * IMMEDIATE lock is already held). When supplied (the FR-025 read-
 * snapshot path), the conditional UPDATE asserts `version =
 * expected_version` so concurrent writers detect a stale snapshot.
 */
export interface ReservationInput {
  policy_id: number;
  window_start: string;
  unit: ReservationUnit;
  amount: number;
  granted_by: string;
  /** Lifetime in milliseconds; expires_at = now + ttl_ms. */
  ttl_ms: number;
  /** Optional FR-025 read-snapshot version baseline. */
  expected_version?: number;
  /** Optional `dispatch_decision_log.decision_id` for grant linkage. */
  originating_decision_id?: string | null;
}

/** Successful grant. */
export interface ReservationResultOk {
  ok: true;
  /** Stable opaque id (`res_<uuid>`). */
  reservation_id: string;
  /** Counter version after the optimistic-lock UPDATE. */
  counter_after: number;
}

/** Failure envelope; `code` distinguishes the failure class. */
export interface ReservationResultErr {
  ok: false;
  code: 'counter_conflict' | 'reservation_window_invalid' | 'budget_exhausted';
  /** Caller-supplied (or freshly-read) version baseline. */
  expected_old: number;
  /** Currently-observed `consumed_<unit> + reserved_<unit>` total. */
  observed: number;
  /** Currently-observed counter `version`. */
  version: number;
}

export type ReservationResult = ReservationResultOk | ReservationResultErr;

/** Build a stable `reservation_id` from a UUID. */
function newReservationId(): string {
  return `res_${randomUUID()}`;
}

/** Compute the per-unit consumed+reserved total from a counter snapshot. */
function totalForUnit(
  snap: ReturnType<typeof getCounter>,
  unit: ReservationUnit,
): number {
  if (snap === null) return 0;
  switch (unit) {
    case 'usd':
      return snap.consumed_usd + snap.reserved_usd;
    case 'token':
      return snap.consumed_token + snap.reserved_token;
    case 'request':
      return snap.consumed_request + snap.reserved_request;
    case 'session':
      return snap.consumed_session + snap.reserved_session;
  }
}

/**
 * Atomic reservation grant. Returns `{ok:true, reservation_id,
 * counter_after}` on success or `{ok:false, code, expected_old, observed,
 * version}` on failure.
 *
 * The full grant (counter UPDATE + reservation INSERT + ledger append) is
 * wrapped in `db.transaction(...).immediate(...)` so the writer holds a
 * RESERVED lock from the first SELECT to commit. Failure paths roll back
 * the entire write set; callers see a typed error envelope and never need
 * to compensate manually.
 */
export function reserveBudget(
  input: ReservationInput,
  dbArg?: Database.Database,
): ReservationResult {
  const db = dbArg ?? getForegroundDb();

  // FR-027 / FR-048 window predicate — return early before any state
  // mutation so an out-of-window policy never produces a reservation row
  // or a ledger entry. `loadPolicyById` returns null only when the row is
  // absent; the window predicate (`enabled=1`, `enabled_at <= now`,
  // `disabled_at > now`) is checked separately via `isPolicyLive`.
  const policy = loadPolicyById(db, input.policy_id);
  if (policy === null || !isPolicyLive(policy)) {
    return {
      ok: false,
      code: 'reservation_window_invalid',
      expected_old: input.expected_version ?? 0,
      observed: 0,
      version: 0,
    };
  }

  // Build the transaction body. The `.immediate(args)` invocation upgrades
  // the implicit `BEGIN` to `BEGIN IMMEDIATE` so a writer lock is taken
  // before the first SELECT runs.
  const txBody = db.transaction((args: ReservationInput): ReservationResult => {
    // Make sure the counter row exists before the conditional UPDATE; the
    // first reservation for a (policy_id, window_start) tuple would
    // otherwise hit `not_found`.
    ensureCounter(db, {
      policy_id: args.policy_id,
      window_start: args.window_start,
    });

    // Read snapshot inside the same write tx so the version we use as the
    // optimistic-lock baseline is consistent with the UPDATE that follows.
    const before = getCounter(db, {
      policy_id: args.policy_id,
      window_start: args.window_start,
    });
    const expected_old =
      args.expected_version ?? before?.version ?? 1;

    const limit_value = policy.limit_value;
    if (limit_value === null) {
      // A budget policy with NULL limit_value is malformed; treat as a
      // window-invalid response so the caller does not loop trying.
      return {
        ok: false,
        code: 'reservation_window_invalid',
        expected_old,
        observed: totalForUnit(before, args.unit),
        version: before?.version ?? 0,
      };
    }

    const reserveResult = reserve(db, {
      policy_id: args.policy_id,
      window_start: args.window_start,
      unit: args.unit,
      amount: args.amount,
      expected_version: expected_old,
      limit_value,
    });

    if (!reserveResult.committed) {
      const after = getCounter(db, {
        policy_id: args.policy_id,
        window_start: args.window_start,
      });
      // Re-read for accurate error envelope; the counter may have moved
      // since the snapshot above when an out-of-band write committed.
      const observed = totalForUnit(after, args.unit);
      const version = after?.version ?? 0;
      const code: ReservationResultErr['code'] =
        reserveResult.conflict === 'insufficient'
          ? 'budget_exhausted'
          : 'counter_conflict';
      // Throwing here forces the .immediate() wrapper to ROLLBACK so the
      // tx is byte-clean. The throw is caught below and the typed error
      // envelope is rebuilt outside the tx.
      throw new ReservationFailure({
        ok: false,
        code,
        expected_old,
        observed,
        version,
      });
    }

    // Reservation row insert.
    const reservation_id = newReservationId();
    const expires_at = new Date(Date.now() + args.ttl_ms).toISOString();
    db.prepare(
      `INSERT INTO resource_reservations
         (policy_id, counter_id, window_start, amount, unit, state,
          granted_by, originating_decision_id, expires_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      args.policy_id,
      reserveResult.counter_id,
      args.window_start,
      args.amount,
      args.unit,
      args.granted_by,
      args.originating_decision_id ?? null,
      expires_at,
    );

    // Ledger append (FR-051 / FR-061 / FR-219m). `kind='reservation'`
    // matches the M65e CHECK closed set.
    appendLedger(db, {
      policy_id: args.policy_id,
      counter_id: reserveResult.counter_id,
      window_start: args.window_start,
      kind: 'reservation',
      amount: args.amount,
      unit: args.unit,
      source_event_id: null,
      decision_id: args.originating_decision_id ?? null,
      notes_json: JSON.stringify({ reservation_id, granted_by: args.granted_by }),
    });

    return {
      ok: true,
      reservation_id,
      counter_after: reserveResult.new_version,
    };
  });

  try {
    return txBody.immediate(input);
  } catch (err) {
    // The conflict path inside the tx throws a `ReservationFailure` which
    // carries the typed error envelope. Re-raise any other error so true
    // bugs surface (e.g., FK violation, OOM).
    if (err instanceof ReservationFailure) {
      return err.payload;
    }
    throw err;
  }
}

/**
 * Internal sentinel error used to escape the transaction with a typed
 * error envelope while still triggering ROLLBACK. NOT exported — callers
 * never see this; they receive the `ReservationResultErr` payload it carries.
 */
class ReservationFailure extends Error {
  public readonly payload: ReservationResultErr;
  constructor(payload: ReservationResultErr) {
    super(`resource-reservation: ${payload.code}`);
    this.name = 'ReservationFailure';
    this.payload = payload;
  }
}
