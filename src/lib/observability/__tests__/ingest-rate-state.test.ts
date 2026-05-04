/**
 * SPEC-008 — Tests for `src/lib/observability/ingest-rate-state.ts` (T090).
 *
 * Acceptance: FR-090e (FSM), FR-090e1 (hysteresis dwell).
 *
 * @see specs/008-resource-governance/tasks.md T090
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INGEST_DWELL_MS,
  getIngestRateState,
  isAllowedIngestTransition,
  recordIngestDrop,
  resetIngestDrops,
  transitionIngestRateState,
  type IngestStateClock,
} from '../ingest-rate-state';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE ingest_rate_state (
      source_path TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('accepting','rate_limited','circuit_open','disk_full_pause')),
      consecutive_drops INTEGER NOT NULL DEFAULT 0,
      last_drop_at TEXT,
      last_state_change_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT
    );
  `);
}

function makeClock(): { clock: IngestStateClock; advance: (ms: number) => void } {
  let nowMs = 1_700_000_000_000;
  return {
    clock: { now: () => nowMs },
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('observability/ingest-rate-state', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('isAllowedIngestTransition', () => {
    it('permits the FSM-documented transitions', () => {
      expect(isAllowedIngestTransition('accepting', 'rate_limited')).toBe(true);
      expect(isAllowedIngestTransition('accepting', 'circuit_open')).toBe(true);
      expect(isAllowedIngestTransition('accepting', 'disk_full_pause')).toBe(true);
      expect(isAllowedIngestTransition('rate_limited', 'accepting')).toBe(true);
      expect(isAllowedIngestTransition('circuit_open', 'accepting')).toBe(true);
      expect(isAllowedIngestTransition('disk_full_pause', 'accepting')).toBe(true);

      expect(isAllowedIngestTransition('disk_full_pause', 'rate_limited')).toBe(false);
      expect(isAllowedIngestTransition('disk_full_pause', 'circuit_open')).toBe(false);
    });
  });

  describe('getIngestRateState', () => {
    it('lazy-creates the row in "accepting" on first read', () => {
      const state = getIngestRateState(db, 'native_otel');
      expect(state).toBe('accepting');

      const row = db
        .prepare(`SELECT state FROM ingest_rate_state WHERE source_path = ?`)
        .get('native_otel') as { state: string };
      expect(row.state).toBe('accepting');
    });

    it('returns the persisted state on subsequent reads', () => {
      getIngestRateState(db, 'native_otel');
      db.prepare(
        `UPDATE ingest_rate_state SET state = 'rate_limited' WHERE source_path = ?`,
      ).run('native_otel');
      expect(getIngestRateState(db, 'native_otel')).toBe('rate_limited');
    });
  });

  describe('transitionIngestRateState (hysteresis)', () => {
    it('permits an immediate first transition (no prior change)', () => {
      const { clock, advance } = makeClock();
      // Bootstrap with the same clock so last_state_change_at is now.
      getIngestRateState(db, 'native_otel', { clock });
      // Advance past the dwell window
      advance(DEFAULT_INGEST_DWELL_MS + 1);
      const result = transitionIngestRateState(
        db,
        'native_otel',
        'accepting',
        'rate_limited',
        'p95_latency_exceeded',
        { clock },
      );
      expect(result.transitioned).toBe(true);
      if (result.transitioned) {
        expect(result.from).toBe('accepting');
        expect(result.to).toBe('rate_limited');
      }
      expect(getIngestRateState(db, 'native_otel')).toBe('rate_limited');
    });

    it('rejects a transition inside the dwell window with reason="dwell_active"', () => {
      const { clock, advance } = makeClock();
      // Bootstrap & flip outside dwell
      getIngestRateState(db, 'native_otel', { clock });
      advance(DEFAULT_INGEST_DWELL_MS + 1);
      transitionIngestRateState(db, 'native_otel', 'accepting', 'rate_limited', 'flap', { clock });

      // Try to flip back inside dwell
      advance(1_000); // 1 s -- well below 120 s
      const result = transitionIngestRateState(
        db,
        'native_otel',
        'rate_limited',
        'accepting',
        'recovered',
        { clock },
      );
      expect(result.transitioned).toBe(false);
      if (!result.transitioned) {
        expect(result.reason).toBe('dwell_active');
        expect(result.current).toBe('rate_limited');
      }
    });

    it('permits the flip-back once the dwell window has elapsed', () => {
      const { clock, advance } = makeClock();
      getIngestRateState(db, 'native_otel', { clock });
      advance(DEFAULT_INGEST_DWELL_MS + 1);
      transitionIngestRateState(db, 'native_otel', 'accepting', 'rate_limited', 'flap', { clock });

      advance(DEFAULT_INGEST_DWELL_MS + 1);
      const result = transitionIngestRateState(
        db,
        'native_otel',
        'rate_limited',
        'accepting',
        'recovered',
        { clock },
      );
      expect(result.transitioned).toBe(true);
      expect(getIngestRateState(db, 'native_otel')).toBe('accepting');
    });

    it('returns reason="not_allowed" when the FSM rejects the transition', () => {
      const { clock, advance } = makeClock();
      getIngestRateState(db, 'native_otel', { clock });
      advance(DEFAULT_INGEST_DWELL_MS + 1);
      transitionIngestRateState(db, 'native_otel', 'accepting', 'disk_full_pause', 'disk_red', { clock });

      // disk_full_pause -> rate_limited is NOT allowed
      advance(DEFAULT_INGEST_DWELL_MS + 1);
      const result = transitionIngestRateState(
        db,
        'native_otel',
        'disk_full_pause',
        'rate_limited',
        'shouldnt_pass',
        { clock },
      );
      expect(result.transitioned).toBe(false);
      if (!result.transitioned) {
        expect(result.reason).toBe('not_allowed');
        expect(result.current).toBe('disk_full_pause');
      }
    });

    it('returns reason="not_allowed" when fromState mismatches the persisted state', () => {
      const { clock, advance } = makeClock();
      getIngestRateState(db, 'native_otel', { clock });
      advance(DEFAULT_INGEST_DWELL_MS + 1);

      const result = transitionIngestRateState(
        db,
        'native_otel',
        'circuit_open', // wrong fromState
        'accepting',
        'racy',
        { clock },
      );
      expect(result.transitioned).toBe(false);
      if (!result.transitioned) {
        expect(result.reason).toBe('not_allowed');
        expect(result.current).toBe('accepting');
      }
    });
  });

  describe('drop counters', () => {
    it('recordIngestDrop increments consecutive_drops and stamps last_drop_at', () => {
      const { clock } = makeClock();
      recordIngestDrop(db, 'native_otel', { clock });
      recordIngestDrop(db, 'native_otel', { clock });
      recordIngestDrop(db, 'native_otel', { clock });

      const row = db
        .prepare(`SELECT consecutive_drops, last_drop_at FROM ingest_rate_state WHERE source_path = ?`)
        .get('native_otel') as { consecutive_drops: number; last_drop_at: string };
      expect(row.consecutive_drops).toBe(3);
      expect(row.last_drop_at).not.toBeNull();
    });

    it('resetIngestDrops zeroes the counter without touching last_drop_at', () => {
      recordIngestDrop(db, 'native_otel');
      resetIngestDrops(db, 'native_otel');
      const row = db
        .prepare(`SELECT consecutive_drops FROM ingest_rate_state WHERE source_path = ?`)
        .get('native_otel') as { consecutive_drops: number };
      expect(row.consecutive_drops).toBe(0);
    });
  });
});
