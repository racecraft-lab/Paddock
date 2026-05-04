/**
 * SPEC-008 — Tests for `src/lib/observability/correction-ledger.ts` (T081).
 *
 * Acceptance: FR-094, FR-103, FR-104. Same-tx invariant: the canonical
 * row UPDATE + correction_ledger INSERT happen in one transaction.
 * Coalescing: multiple deltas within the window collapse into one row.
 *
 * @see specs/008-resource-governance/tasks.md T081
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendCorrection,
  DEFAULT_COALESCE_WINDOW_MS,
  flushCorrection,
  flushDueCorrections,
  pendingCorrectionCount,
  resetCorrectionQueue,
  type CorrectionClock,
} from '../correction-ledger';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE canonical_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      provenance TEXT NOT NULL DEFAULT 'single',
      partition_month TEXT NOT NULL,
      emitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE correction_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_event_id INTEGER NOT NULL,
      prior_amount REAL NOT NULL,
      corrected_amount REAL NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('late_arrival','dedupe_repair','price_correction','manual','schema_repair')),
      ledger_entry_id INTEGER,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_by TEXT NOT NULL,
      notes_json TEXT
    );
  `);
}

function insertCanonical(db: Database.Database, id: number, cost_usd: number): void {
  db.prepare(
    `INSERT INTO canonical_usage_events
       (id, provider, provider_request_id, provider_timestamp_ms,
        cost_usd, partition_month)
     VALUES (?, 'anthropic', 'req_a', 1700000000000, ?, '2026-05')`,
  ).run(id, cost_usd);
}

function makeClock(): { clock: CorrectionClock; advance: (ms: number) => void } {
  let nowMs = 1_700_000_000_000;
  return {
    clock: { now: () => nowMs },
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('observability/correction-ledger', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
    resetCorrectionQueue();
  });

  afterEach(() => {
    resetCorrectionQueue();
    db.close();
  });

  describe('appendCorrection', () => {
    it('rejects non-finite delta', () => {
      expect(() =>
        appendCorrection(db, {
          canonical_event_id: 1,
          delta_amount: NaN,
          reason: 'manual',
          applied_by: 'op',
        }),
      ).toThrow(/finite/);
    });

    it('rejects empty applied_by', () => {
      expect(() =>
        appendCorrection(db, {
          canonical_event_id: 1,
          delta_amount: 0.1,
          reason: 'manual',
          applied_by: '',
        }),
      ).toThrow(/applied_by/);
    });

    it('queues the first delta without writing -- flush=false, pending=true', () => {
      insertCanonical(db, 1, 1.0);
      const result = appendCorrection(db, {
        canonical_event_id: 1,
        delta_amount: 0.1,
        reason: 'manual',
        applied_by: 'operator:fred',
      });
      expect(result.flushed).toBe(false);
      expect(result.pending).toBe(true);
      expect(result.correction_id).toBeNull();
      expect(pendingCorrectionCount()).toBe(1);
    });

    it('coalesces multiple deltas within the coalesce window into one entry', () => {
      insertCanonical(db, 1, 1.0);
      const { clock, advance } = makeClock();

      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.1, reason: 'manual', applied_by: 'op' },
        { clock },
      );
      advance(1_000); // 1 s -- well under the 5 s window
      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.2, reason: 'manual', applied_by: 'op' },
        { clock },
      );
      advance(2_000);
      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.3, reason: 'manual', applied_by: 'op' },
        { clock },
      );
      // Still pending -- three calls, ZERO ledger rows so far.
      expect(pendingCorrectionCount()).toBe(1);
      const ledgerCount = db
        .prepare('SELECT COUNT(*) AS n FROM correction_ledger')
        .get() as { n: number };
      expect(ledgerCount.n).toBe(0);
    });

    it('flushes the prior pending entry when a new delta arrives after the window expires', () => {
      insertCanonical(db, 1, 1.0);
      const { clock, advance } = makeClock();

      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.1, reason: 'manual', applied_by: 'op' },
        { clock },
      );
      advance(DEFAULT_COALESCE_WINDOW_MS + 1);
      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.2, reason: 'manual', applied_by: 'op' },
        { clock },
      );

      // Prior entry was flushed; new entry is pending.
      const ledgerCount = db
        .prepare('SELECT COUNT(*) AS n FROM correction_ledger')
        .get() as { n: number };
      expect(ledgerCount.n).toBe(1);
      expect(pendingCorrectionCount()).toBe(1);

      const row = db
        .prepare('SELECT prior_amount, corrected_amount, delta FROM correction_ledger')
        .get() as { prior_amount: number; corrected_amount: number; delta: number };
      // First flush wrote the 0.1 delta against the original 1.0 cost.
      expect(row.prior_amount).toBeCloseTo(1.0, 6);
      expect(row.corrected_amount).toBeCloseTo(1.1, 6);
      expect(row.delta).toBeCloseTo(0.1, 6);
    });
  });

  describe('flushCorrection', () => {
    it('writes the canonical UPDATE and the correction_ledger INSERT in one tx (FR-103)', () => {
      insertCanonical(db, 1, 1.0);
      appendCorrection(db, {
        canonical_event_id: 1,
        delta_amount: 0.25,
        reason: 'price_correction',
        applied_by: 'system:price-sweep',
      });
      const flushResult = flushCorrection(db, 1);
      expect(flushResult).not.toBeNull();
      expect(flushResult?.correction_id).toBeGreaterThan(0);

      // Canonical cost_usd was updated AND provenance flipped to 'corrected'
      const c = db
        .prepare('SELECT cost_usd, provenance FROM canonical_usage_events WHERE id = ?')
        .get(1) as { cost_usd: number; provenance: string };
      expect(c.cost_usd).toBeCloseTo(1.25, 6);
      expect(c.provenance).toBe('corrected');

      // correction_ledger row carries the same delta
      const l = db
        .prepare('SELECT prior_amount, corrected_amount, delta, reason, applied_by FROM correction_ledger WHERE id = ?')
        .get(flushResult?.correction_id) as {
        prior_amount: number;
        corrected_amount: number;
        delta: number;
        reason: string;
        applied_by: string;
      };
      expect(l.prior_amount).toBeCloseTo(1.0, 6);
      expect(l.corrected_amount).toBeCloseTo(1.25, 6);
      expect(l.delta).toBeCloseTo(0.25, 6);
      expect(l.reason).toBe('price_correction');
      expect(l.applied_by).toBe('system:price-sweep');

      // Pending queue is empty after flush
      expect(pendingCorrectionCount()).toBe(0);
    });

    it('returns null when there is no pending entry for the canonical id', () => {
      expect(flushCorrection(db, 999)).toBeNull();
    });

    it('throws when the canonical row does not exist', () => {
      // No canonical id 1
      appendCorrection(db, {
        canonical_event_id: 1,
        delta_amount: 0.1,
        reason: 'manual',
        applied_by: 'op',
      });
      expect(() => flushCorrection(db, 1)).toThrow(/canonical_usage_events/);
    });
  });

  describe('flushDueCorrections', () => {
    it('flushes only entries past the window', () => {
      insertCanonical(db, 1, 1.0);
      insertCanonical(db, 2, 2.0);
      const { clock, advance } = makeClock();

      appendCorrection(
        db,
        { canonical_event_id: 1, delta_amount: 0.1, reason: 'manual', applied_by: 'op' },
        { clock },
      );
      advance(DEFAULT_COALESCE_WINDOW_MS + 1);
      appendCorrection(
        db,
        { canonical_event_id: 2, delta_amount: 0.2, reason: 'manual', applied_by: 'op' },
        { clock },
      );

      // First entry's age is now > window (we advanced after enqueue);
      // second is fresh. flushDueCorrections should write 1 row.
      const written = flushDueCorrections(db, { clock });
      expect(written).toBe(1);
      expect(pendingCorrectionCount()).toBe(1);

      const c1 = db
        .prepare('SELECT cost_usd FROM canonical_usage_events WHERE id = 1')
        .get() as { cost_usd: number };
      const c2 = db
        .prepare('SELECT cost_usd FROM canonical_usage_events WHERE id = 2')
        .get() as { cost_usd: number };
      expect(c1.cost_usd).toBeCloseTo(1.1, 6);
      expect(c2.cost_usd).toBeCloseTo(2.0, 6); // unflushed
    });
  });

  describe('coalesce semantics -- cumulative delta on flush', () => {
    it('three coalesced deltas of 0.1 + 0.2 + 0.3 produce one ledger row with delta=0.6', () => {
      insertCanonical(db, 1, 1.0);
      const { clock, advance } = makeClock();

      appendCorrection(db, { canonical_event_id: 1, delta_amount: 0.1, reason: 'manual', applied_by: 'op' }, { clock });
      advance(500);
      appendCorrection(db, { canonical_event_id: 1, delta_amount: 0.2, reason: 'manual', applied_by: 'op' }, { clock });
      advance(500);
      appendCorrection(db, { canonical_event_id: 1, delta_amount: 0.3, reason: 'manual', applied_by: 'op' }, { clock });

      const r = flushCorrection(db, 1);
      expect(r).not.toBeNull();

      const rowCount = db
        .prepare('SELECT COUNT(*) AS n FROM correction_ledger')
        .get() as { n: number };
      expect(rowCount.n).toBe(1);

      const row = db
        .prepare('SELECT delta, corrected_amount FROM correction_ledger WHERE id = ?')
        .get(r?.correction_id) as { delta: number; corrected_amount: number };
      expect(row.delta).toBeCloseTo(0.6, 6);
      expect(row.corrected_amount).toBeCloseTo(1.6, 6);
    });
  });
});
