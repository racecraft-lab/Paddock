/**
 * SPEC-008 — Shared release primitive for `resource_reservations`.
 *
 * Per FR-294 (concurrent-edit safety), FR-064 (reaper / task-completion /
 * operator-revoke all share one writer), FR-185 (alerting), and FR-063
 * (atomic grant invariant — releases reverse the grant exactly).
 *
 * Why a separate module: the reaper (T064) and the reservation grant
 * (T063) would otherwise import each other (the grant module owns the
 * counter UPDATE primitives, the reaper owns the wall-clock TTL scan).
 * Extracting `releaseReservation` into its own file keeps each call site
 * importing one direction only.
 *
 * FR-294 contract (verbatim from spec.md):
 *   - Compare-and-set on `state`: `UPDATE resource_reservations SET
 *     state = <terminal> WHERE id = ? AND state = 'active'`. The terminal
 *     state is determined by the caller-supplied `reason`:
 *       - reason='expired_idle' (reaper) → state='expired'
 *       - reason='task_completion'        → state='released'
 *       - reason='operator_revoke'        → state='released'
 *   - When `changes() === 1` the caller is the winner: it MUST proceed to
 *     debit `reserved_<unit>` via `release()` from resource-budget-counters
 *     and append a `kind='release'` ledger row.
 *   - When `changes() === 0` the caller LOST the race (another writer
 *     already terminated this reservation). Return `{released:false,
 *     already_released:true}` — NOT an error. The reaper emits a metric;
 *     the operator-revoke endpoint returns HTTP 200 with
 *     `{"already_released":true,"released_by":<state>}`.
 *
 * The state-transition trigger `trg_resource_reservations_state_transition`
 * (M65g) raises SQLITE_CONSTRAINT on any non-`active → terminal` move so
 * the compare-and-set is structurally safe even against a buggy caller.
 *
 * @see specs/008-resource-governance/spec.md FR-063, FR-064, FR-294
 * @see specs/008-resource-governance/tasks.md T064
 */

import {
  getCounter,
  release as releaseCounter,
  type CounterUnit,
} from '@/lib/resource-budget-counters';
import { appendLedger } from '@/lib/resource-budget-ledger';
import type Database from 'better-sqlite3';

/**
 * Reasons accepted by `releaseReservation`. `expired_idle` maps the
 * reservation to `state='expired'`; the others map to `state='released'`.
 */
export type ReleaseReason =
  | 'expired_idle'
  | 'task_completion'
  | 'operator_revoke';

/** Per-FR-294 the state column receives one of these terminal values. */
export type TerminalReservationState = 'expired' | 'released';

/** Result envelope returned by `releaseReservation`. */
export interface ReleaseResult {
  /** True iff THIS caller won the compare-and-set and applied the debit. */
  released: boolean;
  /** True iff a different writer already terminated this reservation. */
  already_released: boolean;
  /** Final state observed for the row (after the CAS or pre-existing). */
  state: TerminalReservationState | 'active' | 'consumed' | null;
  /** Reservation row id (echoed back for caller logging). */
  reservation_id: number;
  /** Counter version after a successful debit; null when CAS lost. */
  counter_after_version: number | null;
}

/**
 * Map a `ReleaseReason` to the terminal `state` column value per FR-294.
 * Centralized so all three callers (reaper, task-completion handler,
 * operator-revoke endpoint) cannot drift on the mapping.
 */
function terminalStateFor(reason: ReleaseReason): TerminalReservationState {
  switch (reason) {
    case 'expired_idle':
      return 'expired';
    case 'task_completion':
    case 'operator_revoke':
      return 'released';
  }
}

/** Compact reservation row used during the release CAS. */
interface ReservationRow {
  id: number;
  policy_id: number;
  counter_id: number | null;
  window_start: string;
  amount: number;
  unit: string;
  state: 'active' | 'consumed' | 'released' | 'expired';
  originating_decision_id: string | null;
}

function getReservation(
  db: Database.Database,
  reservation_id: number,
): ReservationRow | null {
  const row = db
    .prepare(
      `SELECT id, policy_id, counter_id, window_start, amount, unit, state,
              originating_decision_id
         FROM resource_reservations
         WHERE id = ?`,
    )
    .get(reservation_id) as ReservationRow | undefined;
  return row ?? null;
}

/**
 * Atomic release. Wraps the CAS + counter debit + ledger append in one
 * `db.transaction(fn).immediate(args)` so all writers serialize through
 * the SQLite RESERVED lock (FR-294 single-writer guarantee).
 *
 * Idempotent by construction: if the row's state is already terminal,
 * the UPDATE's WHERE clause matches zero rows and the function returns
 * `{released:false, already_released:true}`.
 */
export function releaseReservation(
  db: Database.Database,
  reservation_id: number,
  reason: ReleaseReason,
): ReleaseResult {
  const tx = db.transaction((rid: number, rsn: ReleaseReason): ReleaseResult => {
    const before = getReservation(db, rid);
    if (before === null) {
      return {
        released: false,
        already_released: false,
        state: null,
        reservation_id: rid,
        counter_after_version: null,
      };
    }
    if (before.state !== 'active') {
      // A prior writer already terminated this row; short-circuit per
      // FR-294 (NOT an error).
      return {
        released: false,
        already_released: true,
        state: before.state,
        reservation_id: rid,
        counter_after_version: null,
      };
    }

    const newState = terminalStateFor(rsn);
    const cas = db
      .prepare(
        `UPDATE resource_reservations
            SET state = ?,
                finalized_at = CURRENT_TIMESTAMP,
                finalized_reason = ?
          WHERE id = ?
            AND state = 'active'`,
      )
      .run(newState, rsn, rid);
    if (cas.changes === 0) {
      // Another writer beat us inside the same tx (impossible given the
      // SELECT above, but the SQLite WAL guarantee permits a busy retry
      // path so we treat zero changes as a lost race per FR-294).
      const after = getReservation(db, rid);
      return {
        released: false,
        already_released: true,
        state: after?.state ?? null,
        reservation_id: rid,
        counter_after_version: null,
      };
    }

    // Debit the counter — pull current `version` for the optimistic-lock
    // baseline. Within the BEGIN IMMEDIATE the version cannot drift
    // between the read and the conditional UPDATE.
    const counter = getCounter(db, {
      policy_id: before.policy_id,
      window_start: before.window_start,
    });
    if (counter === null) {
      // No counter row means the original grant skipped `ensureCounter`;
      // we treat this as a structural error so the operator can investigate.
      throw new Error(
        `resource-reservation-release: missing counter for policy_id=${String(
          before.policy_id,
        )} window_start=${before.window_start}`,
      );
    }

    const debit = releaseCounter(db, {
      policy_id: before.policy_id,
      window_start: before.window_start,
      unit: before.unit as CounterUnit,
      amount: before.amount,
      expected_version: counter.version,
    });
    if (!debit.committed) {
      // The CAS already won; the counter UPDATE failure is a programming
      // bug (we hold BEGIN IMMEDIATE so no concurrent writer should be
      // able to advance the version). Surface a hard error.
      throw new Error(
        `resource-reservation-release: counter debit failed conflict=${debit.conflict}`,
      );
    }

    // Append the ledger release row. `kind='release'` is admitted by the
    // M65e CHECK; `notes_json` carries the reservation id + reason for
    // post-hoc audit trace.
    appendLedger(db, {
      policy_id: before.policy_id,
      counter_id: counter.id,
      window_start: before.window_start,
      kind: 'release',
      amount: before.amount,
      unit: before.unit as CounterUnit,
      source_event_id: null,
      decision_id: before.originating_decision_id,
      notes_json: JSON.stringify({
        reservation_id: rid,
        reason: rsn,
        released_state: newState,
      }),
    });

    return {
      released: true,
      already_released: false,
      state: newState,
      reservation_id: rid,
      counter_after_version: debit.new_version,
    };
  });

  return tx.immediate(reservation_id, reason);
}
