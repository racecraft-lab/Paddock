/**
 * SPEC-008 — Append-only budget ledger writer.
 *
 * Per FR-051, FR-061, FR-067, FR-176a, FR-219m. The ledger is the
 * synchronous source-of-truth for budget state; reads from the counter
 * cache MUST validate against the ledger on hot-path retry.
 *
 * Storage contract (M65e):
 *   - Append-only via BEFORE UPDATE/DELETE triggers (FR-176a).
 *   - Genesis row at policy_id=0 with `prev_hash` = 64-char zero string
 *     (FR-219m). Inserted by the M65e migration; this writer asserts on
 *     the genesis row's existence at first append.
 *   - Each appended row carries `prev_hash` = previous row's `row_hash`
 *     and `row_hash` = SHA-256 of the canonical pipe-delimited form
 *     documented in M65e:
 *       prev_hash | policy_id | counter_id | window_start | kind |
 *       amount | unit | source_event_id | decision_id | partition_month |
 *       notes_json (NULL → empty string)
 *   - `partition_month` is the YYYY-MM derived from `window_start` so
 *     row partitioning aligns with the budget window per FR-249.
 *
 * Concurrency:
 *   - Caller is expected to hold a write transaction (FR-054 reservation
 *     grant uses BEGIN IMMEDIATE). The writer issues `prepare(...).run()`
 *     against the supplied connection; it does NOT open its own
 *     transaction so callers retain control of commit/rollback.
 *   - The ledger tail (last row by id DESC) is read inside the same
 *     transaction so the prev_hash linkage is consistent under contention.
 *
 * @see specs/008-resource-governance/spec.md FR-051, FR-061, FR-067,
 *      FR-176a, FR-219m
 * @see src/lib/migrations.ts (065e_resource_budget_ledger genesis row)
 * @see specs/008-resource-governance/tasks.md T060
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

/** Closed set of ledger entry kinds per the M65e CHECK constraint. */
export type LedgerKind = 'debit' | 'credit' | 'correction' | 'reservation' | 'release';

/** Closed set of budget units per the M65e CHECK constraint. */
export type LedgerUnit = 'usd' | 'token' | 'request' | 'session';

/** Genesis-row prev_hash (FR-219m: 64 zero characters). */
export const GENESIS_PREV_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

/** One ledger append request. All fields validated below. */
export interface LedgerAppend {
  policy_id: number;
  counter_id: number | null;
  /** ISO-8601 UTC timestamp of the window start. Drives partition_month. */
  window_start: string;
  kind: LedgerKind;
  amount: number;
  unit: LedgerUnit;
  /** FR-061: cite a canonical-event id for reconcile-ability. */
  source_event_id: number | null;
  /** Optional `dispatch_decision_log.decision_id` linkage (FR-189). */
  decision_id: string | null;
  notes_json: string | null;
}

/** Persisted ledger row (subset of `resource_budget_ledger` columns). */
export interface LedgerRow extends LedgerAppend {
  id: number;
  prev_hash: string;
  row_hash: string;
  partition_month: string;
}

/** Canonical-form helper: stringify a nullable number, NULL → empty. */
function nullableNumberToCanonical(v: number | null): string {
  return v === null ? '' : String(v);
}

/** Canonical-form helper: pass-through nullable string, NULL → empty. */
function nullableStringToCanonical(v: string | null): string {
  return v ?? '';
}

/**
 * Compute the canonical pipe-delimited form of a row exactly as the M65e
 * genesis migration does. Tested in `migrations-M65e-h.test.ts` to be
 * byte-identical with the persisted genesis row's hash.
 */
export function canonicalLedgerForm(args: {
  prev_hash: string;
  policy_id: number;
  counter_id: number | null;
  window_start: string;
  kind: LedgerKind;
  amount: number;
  unit: LedgerUnit;
  source_event_id: number | null;
  decision_id: string | null;
  partition_month: string;
  notes_json: string | null;
}): string {
  return [
    args.prev_hash,
    String(args.policy_id),
    nullableNumberToCanonical(args.counter_id),
    args.window_start,
    args.kind,
    String(args.amount),
    args.unit,
    nullableNumberToCanonical(args.source_event_id),
    nullableStringToCanonical(args.decision_id),
    args.partition_month,
    nullableStringToCanonical(args.notes_json),
  ].join('|');
}

/** SHA-256 hex digest of the canonical form. */
export function hashLedgerRow(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Read the most-recently-appended row's `row_hash`. Returns the genesis
 * row's hash if the ledger is empty of non-genesis appends. Caller MUST
 * hold a transaction so the tail is stable during the next append.
 */
function tailHash(db: Database.Database): string {
  const row = db
    .prepare(
      `SELECT row_hash FROM resource_budget_ledger ORDER BY id DESC LIMIT 1`,
    )
    .get() as { row_hash: string } | undefined;
  if (row === undefined) {
    throw new Error(
      'resource-budget-ledger: missing genesis row — M65e migration must run before any append',
    );
  }
  return row.row_hash;
}

/**
 * Derive `partition_month` (YYYY-MM) from an ISO-8601 timestamp. Falls
 * back to the current month when `window_start` is malformed; the
 * fallback never crashes the writer because the storage column is
 * non-null.
 */
function partitionMonth(windowStartIso: string): string {
  const slice = windowStartIso.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(slice)) return slice;
  return new Date().toISOString().slice(0, 7);
}

/**
 * Append one row to `resource_budget_ledger`. Returns the persisted
 * `LedgerRow` (with id + computed hashes). The caller's connection MUST
 * already be in a write transaction so the prev_hash linkage cannot race.
 *
 * Validation:
 *   - `amount` MUST be a finite real (NaN/Infinity rejected).
 *   - `kind` and `unit` MUST be in the closed sets above (the SQLite
 *     CHECK would reject them, but we fail fast here for a typed error).
 */
export function appendLedger(
  db: Database.Database,
  entry: LedgerAppend,
): LedgerRow {
  if (!Number.isFinite(entry.amount)) {
    throw new Error(`resource-budget-ledger: amount is not finite: ${String(entry.amount)}`);
  }
  if (!['debit', 'credit', 'correction', 'reservation', 'release'].includes(entry.kind)) {
    throw new Error(`resource-budget-ledger: unknown kind: ${entry.kind}`);
  }
  if (!['usd', 'token', 'request', 'session'].includes(entry.unit)) {
    throw new Error(`resource-budget-ledger: unknown unit: ${entry.unit}`);
  }

  const prev_hash = tailHash(db);
  const partition_month = partitionMonth(entry.window_start);
  const canonical = canonicalLedgerForm({
    prev_hash,
    policy_id: entry.policy_id,
    counter_id: entry.counter_id,
    window_start: entry.window_start,
    kind: entry.kind,
    amount: entry.amount,
    unit: entry.unit,
    source_event_id: entry.source_event_id,
    decision_id: entry.decision_id,
    partition_month,
    notes_json: entry.notes_json,
  });
  const row_hash = hashLedgerRow(canonical);

  const result = db
    .prepare(
      `INSERT INTO resource_budget_ledger
         (policy_id, counter_id, window_start, kind, amount, unit,
          source_event_id, decision_id, prev_hash, row_hash,
          partition_month, notes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.policy_id,
      entry.counter_id,
      entry.window_start,
      entry.kind,
      entry.amount,
      entry.unit,
      entry.source_event_id,
      entry.decision_id,
      prev_hash,
      row_hash,
      partition_month,
      entry.notes_json,
    );

  return {
    id: Number(result.lastInsertRowid),
    policy_id: entry.policy_id,
    counter_id: entry.counter_id,
    window_start: entry.window_start,
    kind: entry.kind,
    amount: entry.amount,
    unit: entry.unit,
    source_event_id: entry.source_event_id,
    decision_id: entry.decision_id,
    notes_json: entry.notes_json,
    prev_hash,
    row_hash,
    partition_month,
  };
}

/**
 * SUM the absolute amounts for a (policy_id, window_start, unit) grouping
 * for a given set of kinds. Used by the FR-389 drift detector and by the
 * FR-067 hot-path validation (counter cache vs. ledger reconciliation).
 */
export function sumLedger(
  db: Database.Database,
  args: {
    policy_id: number;
    window_start: string;
    unit: LedgerUnit;
    kinds: LedgerKind[];
  },
): number {
  if (args.kinds.length === 0) return 0;
  const placeholders = args.kinds.map(() => '?').join(',');
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM resource_budget_ledger
         WHERE policy_id = ?
           AND window_start = ?
           AND unit = ?
           AND kind IN (${placeholders})`,
    )
    .get(args.policy_id, args.window_start, args.unit, ...args.kinds) as {
    total: number;
  };
  return row.total;
}
