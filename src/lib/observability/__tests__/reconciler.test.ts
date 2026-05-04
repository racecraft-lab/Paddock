/**
 * SPEC-008 — Tests for `src/lib/observability/reconciler.ts` (T080).
 *
 * Acceptance: FR-077, FR-098, FR-339, FR-387.
 *   - Chunk respects max_rows cap.
 *   - Wall-clock cap forces tx commit (yield).
 *   - Lease prevents concurrent runs.
 *   - Cursor resumes after restart.
 *
 * @see specs/008-resource-governance/tasks.md T080
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getReconcilerCursor,
  releaseReconcilerLease,
  runReconcilerTick,
} from '../reconciler';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE raw_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      workspace_id INTEGER,
      agent_id INTEGER,
      task_id INTEGER,
      provider TEXT,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER,
      session_id TEXT,
      generation_id INTEGER,
      raw_attributes_json TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      schema_version_observed TEXT,
      reconcile_status TEXT NOT NULL DEFAULT 'ok',
      dedupe_confidence TEXT NOT NULL DEFAULT 'medium',
      enforcement_eligibility TEXT NOT NULL DEFAULT 'reconciliation_only',
      partition_month TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE canonical_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      agent_id INTEGER,
      task_id INTEGER,
      provider TEXT NOT NULL,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER NOT NULL,
      model TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cache_read_in INTEGER NOT NULL DEFAULT 0,
      cache_creation_in INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      session_id TEXT,
      provenance TEXT NOT NULL DEFAULT 'single',
      merge_sources_json TEXT,
      dedupe_confidence TEXT NOT NULL DEFAULT 'high',
      partition_month TEXT NOT NULL,
      emitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_canonical_dedup
      ON canonical_usage_events(provider, provider_request_id, provider_timestamp_ms)
      WHERE provider_request_id IS NOT NULL;
    CREATE TABLE reconciler_lease (
      source_id TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      leaseholder TEXT NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (source_id, window_start, window_end)
    );
    CREATE TABLE governance_audit_verification_state (
      table_name TEXT PRIMARY KEY,
      last_verified_id INTEGER NOT NULL DEFAULT 0,
      last_verified_at TEXT,
      verification_status TEXT,
      notes_json TEXT
    );
  `);
}

function insertRaw(db: Database.Database, count: number, source_id: string, opts: { sharedTriple?: boolean } = {}): void {
  const stmt = db.prepare(
    `INSERT INTO raw_usage_events
       (source_id, provider, provider_request_id, provider_timestamp_ms,
        workspace_id, partition_month, raw_attributes_json,
        parser_version, reconcile_status)
     VALUES (?, 'anthropic', ?, ?, 1, '2026-05', '{}', 'v1', 'ok')`,
  );
  for (let i = 0; i < count; i++) {
    const reqId = opts.sharedTriple === true ? 'req_shared' : `req_${i.toString()}`;
    const ts = opts.sharedTriple === true ? 1_700_000_000_000 : 1_700_000_000_000 + i;
    stmt.run(source_id, reqId, ts);
  }
}

describe('observability/reconciler', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns rows_processed=0 when no raw rows exist', () => {
    const result = runReconcilerTick(db, { source_id: 'native_otel' });
    expect(result.rows_processed).toBe(0);
    expect(result.lease_denied).toBe(false);
    expect(result.cursor_after).toBe(0);
  });

  it('respects max_rows_per_txn cap', () => {
    insertRaw(db, 50, 'native_otel');
    const result = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 10,
    });
    expect(result.rows_processed).toBe(10);
    expect(result.canonical_rows_inserted).toBe(10);
    expect(result.cursor_after).toBe(10);

    const cursor = getReconcilerCursor(db, 'native_otel');
    expect(cursor).toBe(10);
  });

  it('wall-clock cap forces an early commit', () => {
    insertRaw(db, 20, 'native_otel');
    // Forge a fake clock that jumps past the wall-clock cap on the
    // SECOND group iteration (so at least one row materializes).
    let calls = 0;
    const clock = {
      now(): number {
        calls += 1;
        // First few calls (lease + tx_start + first iteration) return 0;
        // subsequent calls return a value past the wall-clock cap.
        if (calls <= 4) return 1_000;
        return 1_000 + 999_999;
      },
    };
    const result = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_wall_clock_per_txn_ms: 50,
      clock,
    });
    // The wall-clock guard kicks in after the first group materializes;
    // the rest are deferred to the next tick.
    expect(result.rows_processed).toBeGreaterThan(0);
    expect(result.rows_processed).toBeLessThan(20);
    // Cursor advances to whatever was committed
    expect(result.cursor_after).toBeGreaterThan(0);
  });

  it('lease prevents concurrent runs', () => {
    insertRaw(db, 10, 'native_otel');

    // Holder A acquires lease; lease is committed inside acquireLease.
    const a = runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'A',
      max_rows_per_txn: 5,
    });
    expect(a.lease_denied).toBe(false);

    // Holder B tries to acquire while A's lease is still fresh.
    const b = runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'B',
      max_rows_per_txn: 5,
      // 30 s in the future -- still inside A's TTL of 60 s.
      clock: { now: () => Date.now() + 30_000 },
    });
    expect(b.lease_denied).toBe(true);
    expect(b.rows_processed).toBe(0);
  });

  it('lease is re-extendable by the same leaseholder', () => {
    insertRaw(db, 10, 'native_otel');
    const a1 = runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'A',
      max_rows_per_txn: 5,
    });
    expect(a1.lease_denied).toBe(false);
    const a2 = runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'A',
      max_rows_per_txn: 5,
    });
    expect(a2.lease_denied).toBe(false);
    expect(a2.rows_processed).toBe(5);
  });

  it('expired lease can be claimed by a new holder', () => {
    insertRaw(db, 10, 'native_otel');
    const baseTime = 1_000_000_000_000;
    runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'A',
      max_rows_per_txn: 5,
      lease_ttl_ms: 1_000,
      clock: { now: () => baseTime },
    });
    // Advance time past A's TTL
    const result = runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'B',
      max_rows_per_txn: 5,
      clock: { now: () => baseTime + 5_000 },
    });
    expect(result.lease_denied).toBe(false);
    expect(result.rows_processed).toBeGreaterThan(0);
  });

  it('cursor resumes after restart -- second tick processes remaining rows', () => {
    insertRaw(db, 25, 'native_otel');

    const t1 = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 10,
    });
    expect(t1.rows_processed).toBe(10);
    expect(t1.cursor_after).toBe(10);

    const t2 = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 10,
    });
    expect(t2.rows_processed).toBe(10);
    expect(t2.cursor_after).toBe(20);

    const t3 = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 10,
    });
    expect(t3.rows_processed).toBe(5);
    expect(t3.cursor_after).toBe(25);

    const t4 = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 10,
    });
    expect(t4.rows_processed).toBe(0);
    expect(t4.cursor_after).toBe(25);
  });

  it('groups raw rows sharing a dedupe triple into one canonical row', () => {
    insertRaw(db, 20, 'native_otel', { sharedTriple: true });
    const result = runReconcilerTick(db, {
      source_id: 'native_otel',
      max_rows_per_txn: 100,
    });
    expect(result.rows_processed).toBe(20);
    expect(result.canonical_rows_inserted).toBe(1); // all 20 share one triple

    const canonicalCount = db
      .prepare('SELECT COUNT(*) AS n FROM canonical_usage_events')
      .get() as { n: number };
    expect(canonicalCount.n).toBe(1);
  });

  it('releaseReconcilerLease clears the lease row for the holder', () => {
    runReconcilerTick(db, {
      source_id: 'native_otel',
      leaseholder: 'A',
    });
    const before = db
      .prepare(`SELECT COUNT(*) AS n FROM reconciler_lease WHERE leaseholder = 'A'`)
      .get() as { n: number };
    expect(before.n).toBe(1);

    releaseReconcilerLease(db, 'native_otel', 'A');
    const after = db
      .prepare(`SELECT COUNT(*) AS n FROM reconciler_lease WHERE leaseholder = 'A'`)
      .get() as { n: number };
    expect(after.n).toBe(0);
  });
});
