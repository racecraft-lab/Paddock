/**
 * SPEC-008 — Batched background-connection reconciler.
 *
 * Per FR-077 (per-source reconciliation), FR-098 (cursor-based resume),
 * FR-339 (per-tx caps: max_rows_per_txn=500 / max_wall_clock_per_txn_ms=200),
 * FR-387 (reconciler-lease — one reconciler per (source, window) tuple).
 *
 * Pipeline shape:
 *   raw_usage_events (M65b, append-only)
 *     → groupBy(dedupeKey)            via dedupeKey() from T078
 *       → materializeCanonical()      from T079
 *         → canonical_usage_events    in M65c
 *
 * Concurrency design:
 *   - Lease: M65m `reconciler_lease` table is composite-PK
 *     (source_id, window_start, window_end). For our process-group lease,
 *     we use a sentinel window of ('1970-01-01T00:00:00Z',
 *     '9999-12-31T23:59:59Z') — semantically "the reconciler's lease for
 *     all-time on this source". The sentinel keeps the lease per-source
 *     instead of per-window, which is faithful to the schema and matches
 *     the cursor-based reconciler model. A separate (per-window) lease
 *     row is acquired by the backfill workers (out of scope for T080).
 *   - Lease TTL: leaseholder UPDATE re-extends `expires_at = now + ttl`
 *     on each tick. If a stale lease is found (expires_at < now), the
 *     new caller wins.
 *   - Cursor: `last_reconciled_raw_id` persisted in
 *     `governance_audit_verification_state` keyed by
 *     `table_name='reconciler:<source_id>'`. The verification table is
 *     repurposed here because it already carries (table_name PK,
 *     last_verified_id INTEGER) — the same shape we need for the
 *     reconciler cursor.
 *
 * Per-tx caps (FR-339):
 *   - `max_rows_per_txn`: default 500, configurable via governance.json
 *     `reconciler.max_rows_per_txn`.
 *   - `max_wall_clock_per_txn_ms`: default 200 ms.
 *   - Each tx commits as soon as EITHER cap is hit; the reconciler
 *     yields control to the event loop and resumes on the next tick.
 *
 * Connection: caller MUST pass a `Database.Database` from the
 * background pool (`getBackgroundDb()`). The hot-path foreground pool
 * has a 50 ms busy_timeout and would starve under reconciler load.
 *
 * @see specs/008-resource-governance/spec.md FR-077, FR-098, FR-339,
 *      FR-387
 * @see src/lib/migrations.ts (065b_raw_usage_events,
 *      065c_canonical_usage_events, 065m governance final tables)
 * @see specs/008-resource-governance/tasks.md T080
 * @see Constitution Convention J — strict-scope module
 */

import { materializeCanonical } from './canonical-events';
import {
  dedupeKey,
  type RawEventForDedupe,
} from './dedupe';
import type Database from 'better-sqlite3';

/** Sentinel window for the per-source reconciler lease. */
const LEASE_SENTINEL_START = '1970-01-01T00:00:00Z';
const LEASE_SENTINEL_END = '9999-12-31T23:59:59Z';
const DEFAULT_LEASE_TTL_MS = 60_000;
const DEFAULT_MAX_ROWS_PER_TXN = 500;
const DEFAULT_MAX_WALL_CLOCK_PER_TXN_MS = 200;

/** Configurable knobs. */
export interface ReconcilerConfig {
  source_id: string;
  leaseholder?: string;
  lease_ttl_ms?: number;
  max_rows_per_txn?: number;
  max_wall_clock_per_txn_ms?: number;
  /** Optional clock injection for deterministic tests. */
  clock?: { now(): number };
  /** Optional yield hook for tests — called between tx commits. */
  onYield?: () => void;
}

/** Tick result. */
export interface ReconcilerTickResult {
  rows_processed: number;
  canonical_rows_inserted: number;
  canonical_rows_reused: number;
  txns_committed: number;
  /** True when the lease could not be acquired this tick. */
  lease_denied: boolean;
  /** Final cursor value after this tick. */
  cursor_after: number;
}

/** Persisted cursor row shape. */
interface CursorRow {
  last_id: number;
}

/** Resolve / generate the cursor row key for a source. */
function cursorKey(source_id: string): string {
  return `reconciler:${source_id}`;
}

/** Read the persisted cursor for a source. Returns 0 when absent. */
function readCursor(db: Database.Database, source_id: string): number {
  const row = db
    .prepare(
      `SELECT last_verified_id AS last_id
         FROM governance_audit_verification_state
        WHERE table_name = ?`,
    )
    .get(cursorKey(source_id)) as CursorRow | undefined;
  return row?.last_id ?? 0;
}

/** Persist the cursor for a source (upsert). */
function writeCursor(
  db: Database.Database,
  source_id: string,
  last_id: number,
): void {
  db.prepare(
    `INSERT INTO governance_audit_verification_state
       (table_name, last_verified_id, last_verified_at, verification_status)
     VALUES (?, ?, CURRENT_TIMESTAMP, 'reconciler_ok')
     ON CONFLICT(table_name) DO UPDATE SET
       last_verified_id = excluded.last_verified_id,
       last_verified_at = excluded.last_verified_at,
       verification_status = excluded.verification_status`,
  ).run(cursorKey(source_id), last_id);
}

/**
 * Try to acquire (or extend) the per-source lease. Returns true on
 * success, false when another active leaseholder owns it.
 *
 * Sentinel-window strategy: the lease row is keyed by
 * (source_id, '1970-01-01T00:00:00Z', '9999-12-31T23:59:59Z'). This
 * keeps the lease per-source while honoring the M65m composite PK.
 * Per-window lease rows used by backfill workers occupy different PK
 * tuples (real window_start / window_end values).
 */
function acquireLease(
  db: Database.Database,
  source_id: string,
  leaseholder: string,
  ttl_ms: number,
  now_ms: number,
): boolean {
  const now_iso = new Date(now_ms).toISOString();
  const expires_iso = new Date(now_ms + ttl_ms).toISOString();

  const existing = db
    .prepare(
      `SELECT leaseholder, expires_at
         FROM reconciler_lease
        WHERE source_id = ?
          AND window_start = ?
          AND window_end = ?`,
    )
    .get(source_id, LEASE_SENTINEL_START, LEASE_SENTINEL_END) as
    | { leaseholder: string; expires_at: string }
    | undefined;

  if (existing === undefined) {
    db.prepare(
      `INSERT INTO reconciler_lease
         (source_id, window_start, window_end, leaseholder,
          acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      source_id,
      LEASE_SENTINEL_START,
      LEASE_SENTINEL_END,
      leaseholder,
      now_iso,
      expires_iso,
    );
    return true;
  }
  // Existing row: extend if it's ours OR if the prior lease has expired.
  const prior_expires_ms = Date.parse(existing.expires_at);
  const expired = Number.isFinite(prior_expires_ms) && prior_expires_ms < now_ms;
  if (existing.leaseholder !== leaseholder && !expired) {
    return false;
  }
  db.prepare(
    `UPDATE reconciler_lease
        SET leaseholder = ?,
            acquired_at = ?,
            expires_at = ?
      WHERE source_id = ?
        AND window_start = ?
        AND window_end = ?`,
  ).run(
    leaseholder,
    now_iso,
    expires_iso,
    source_id,
    LEASE_SENTINEL_START,
    LEASE_SENTINEL_END,
  );
  return true;
}

/** Release the lease (best-effort; idempotent). */
export function releaseReconcilerLease(
  db: Database.Database,
  source_id: string,
  leaseholder: string,
): void {
  db.prepare(
    `DELETE FROM reconciler_lease
       WHERE source_id = ?
         AND window_start = ?
         AND window_end = ?
         AND leaseholder = ?`,
  ).run(source_id, LEASE_SENTINEL_START, LEASE_SENTINEL_END, leaseholder);
}

/** SELECT projection shape for `raw_usage_events`. */
interface RawUsageEventRow {
  id?: number;
  source_id?: string;
  provider?: string;
  provider_request_id?: string | null;
  provider_timestamp_ms?: number;
  workspace_id?: number | null;
  agent_id?: number | null;
  task_id?: number | null;
  session_id?: string | null;
  partition_month?: string;
}

/** Project a raw_usage_events SELECT row to the dedupe shape. */
function projectRawForDedupe(row: RawUsageEventRow): RawEventForDedupe {
  return {
    id: row.id ?? 0,
    source_id: row.source_id ?? '',
    provider: row.provider ?? '',
    provider_request_id: row.provider_request_id ?? null,
    provider_timestamp_ms: row.provider_timestamp_ms ?? 0,
    workspace_id: row.workspace_id ?? null,
    agent_id: row.agent_id ?? null,
    task_id: row.task_id ?? null,
    model: null, // raw rows don't carry model on M65b — caller-derived
    tokens_in: 0,
    tokens_out: 0,
    cache_read_in: 0,
    cache_creation_in: 0,
    cost_usd: 0,
    duration_ms: null,
    session_id: row.session_id ?? null,
    partition_month: row.partition_month ?? '',
  };
}

/**
 * Read the next chunk of unreconciled raw events for a source. Caller
 * passes the prior cursor; rows are filtered to id > cursor and capped
 * at `chunk_size`.
 */
function readChunk(
  db: Database.Database,
  source_id: string,
  cursor_after: number,
  chunk_size: number,
): RawEventForDedupe[] {
  const rows = db
    .prepare(
      `SELECT id, source_id, provider, provider_request_id,
              provider_timestamp_ms, workspace_id, agent_id, task_id,
              session_id, partition_month
         FROM raw_usage_events
        WHERE source_id = ?
          AND id > ?
          AND reconcile_status = 'ok'
        ORDER BY id ASC
        LIMIT ?`,
    )
    .all(source_id, cursor_after, chunk_size) as RawUsageEventRow[];
  return rows.map(projectRawForDedupe);
}

/**
 * Run one reconciler tick. Acquires the lease, processes one or more
 * batches (each within the per-tx caps), commits the cursor between
 * batches, and returns aggregate stats.
 *
 * The function returns when EITHER:
 *   - There are no more unreconciled rows for the source, OR
 *   - Both per-tx caps have been respected and the caller's quantum is
 *     up (one tick = one batch, but the caller may invoke many ticks in
 *     a row).
 *
 * Caller invocation pattern:
 *   const result = runReconcilerTick(db, { source_id });
 *   if (!result.lease_denied && result.rows_processed === 0) break;
 */
export function runReconcilerTick(
  db: Database.Database,
  config: ReconcilerConfig,
): ReconcilerTickResult {
  const max_rows = config.max_rows_per_txn ?? DEFAULT_MAX_ROWS_PER_TXN;
  const max_wall_ms =
    config.max_wall_clock_per_txn_ms ?? DEFAULT_MAX_WALL_CLOCK_PER_TXN_MS;
  const lease_ttl_ms = config.lease_ttl_ms ?? DEFAULT_LEASE_TTL_MS;
  const leaseholder = config.leaseholder ?? `pid:${String(process.pid)}`;
  const clock = config.clock ?? { now: () => Date.now() };
  const onYield = config.onYield ?? ((): void => undefined);

  const now0 = clock.now();
  const acquired = acquireLease(db, config.source_id, leaseholder, lease_ttl_ms, now0);
  if (!acquired) {
    return {
      rows_processed: 0,
      canonical_rows_inserted: 0,
      canonical_rows_reused: 0,
      txns_committed: 0,
      lease_denied: true,
      cursor_after: readCursor(db, config.source_id),
    };
  }

  let cursor = readCursor(db, config.source_id);
  let rows_processed = 0;
  let canonical_inserted = 0;
  let canonical_reused = 0;
  let txns = 0;

  // One tick = read one chunk (capped by max_rows), then run the
  // group-by-key + materialize loop in a single tx with a wall-clock
  // guard. After commit, yield and let the caller decide whether to
  // re-tick.
  const chunk = readChunk(db, config.source_id, cursor, max_rows);
  if (chunk.length === 0) {
    return {
      rows_processed: 0,
      canonical_rows_inserted: 0,
      canonical_rows_reused: 0,
      txns_committed: 0,
      lease_denied: false,
      cursor_after: cursor,
    };
  }

  // Group by dedupeKey to coalesce raw rows that share a triple.
  const groups = new Map<string, RawEventForDedupe[]>();
  for (const r of chunk) {
    const key = dedupeKey(r);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [r]);
    } else {
      bucket.push(r);
    }
  }

  const tx_start = clock.now();
  const tx = db.transaction((entries: [string, RawEventForDedupe[]][]) => {
    for (const entry of entries) {
      const rows = entry[1];
      const wall = clock.now() - tx_start;
      if (wall >= max_wall_ms) {
        // Wall-clock guard tripped — break out of the loop, commit what
        // we've materialized so far, and let the caller invoke the next
        // tick on a fresh budget.
        return;
      }
      const result = materializeCanonical(db, rows);
      if (result.reused) canonical_reused += 1;
      else canonical_inserted += 1;
      let max_id = 0;
      for (const r of rows) {
        rows_processed += 1;
        if (r.id > max_id) max_id = r.id;
      }
      if (max_id > cursor) cursor = max_id;
    }
  });
  tx.immediate(Array.from(groups.entries()));
  txns += 1;

  // Persist cursor (the cursor write is its own tiny tx — it's the resume
  // marker for the next tick).
  writeCursor(db, config.source_id, cursor);
  onYield();

  return {
    rows_processed,
    canonical_rows_inserted: canonical_inserted,
    canonical_rows_reused: canonical_reused,
    txns_committed: txns,
    lease_denied: false,
    cursor_after: cursor,
  };
}

/**
 * Read the persisted cursor — exported for tests/diagnostics.
 */
export function getReconcilerCursor(
  db: Database.Database,
  source_id: string,
): number {
  return readCursor(db, source_id);
}
