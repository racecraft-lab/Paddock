/**
 * SPEC-008 — Tests for `src/lib/observability/ingest-admission.ts` (T091).
 *
 * Acceptance: FR-079, FR-089, FR-090e, FR-203, FR-278, FR-279, FR-281.
 *
 * @see specs/008-resource-governance/tasks.md T091
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  admissionBucketSize,
  admitIngestion,
  resetAdmissionBuckets,
  type AdmissionClock,
  type DiskPressureInput,
  type RateLimitConfig,
} from '../ingest-admission';

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

function makeClock(): { clock: AdmissionClock; advance: (ms: number) => void } {
  let nowMs = 1_700_000_000_000;
  return {
    clock: { now: () => nowMs },
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

const DEFAULT_RL: RateLimitConfig = {
  steady_per_min: 60,
  burst_per_window: 5,
  window_seconds: 60,
};

const HEALTHY_DISK: DiskPressureInput = {
  free_bytes: 100 * 1024 * 1024 * 1024,
  total_bytes: 200 * 1024 * 1024 * 1024,
  free_pct: 50,
  amber_bytes_threshold: 5 * 1024 * 1024 * 1024,
  amber_pct_threshold: 10,
  red_bytes_threshold: 2 * 1024 * 1024 * 1024,
  red_pct_threshold: 5,
};

describe('observability/ingest-admission', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
    resetAdmissionBuckets();
  });

  afterEach(() => {
    resetAdmissionBuckets();
    db.close();
  });

  it('admits the first request when bucket is full and FSM is accepting', () => {
    const result = admitIngestion(db, {
      source_id: 'native_otel',
      rate_limits: DEFAULT_RL,
      disk: HEALTHY_DISK,
    });
    expect(result.admit).toBe(true);
  });

  it('rejects with token_bucket_drained after exhausting the burst capacity', () => {
    const { clock } = makeClock();
    // Burst capacity = 5; 5 admits, 6th rejected (assuming no refill in same ms).
    for (let i = 0; i < 5; i++) {
      const r = admitIngestion(
        db,
        { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
        clock,
      );
      expect(r.admit).toBe(true);
    }
    const sixth = admitIngestion(
      db,
      { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
      clock,
    );
    expect(sixth.admit).toBe(false);
    if (!sixth.admit) {
      expect(sixth.reason).toBe('token_bucket_drained');
    }
  });

  it('refills tokens over time at steady_per_min rate', () => {
    const { clock, advance } = makeClock();

    for (let i = 0; i < 5; i++) {
      admitIngestion(
        db,
        { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
        clock,
      );
    }
    // Bucket is empty
    const empty = admitIngestion(
      db,
      { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
      clock,
    );
    expect(empty.admit).toBe(false);

    // 60/min = 1/s; advance 2s -> ~2 tokens regenerated
    advance(2_000);
    const r1 = admitIngestion(
      db,
      { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
      clock,
    );
    const r2 = admitIngestion(
      db,
      { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
      clock,
    );
    expect(r1.admit).toBe(true);
    expect(r2.admit).toBe(true);
  });

  it('rejects with disk_pressure_red when disk band is red', () => {
    const redDisk: DiskPressureInput = {
      ...HEALTHY_DISK,
      free_bytes: 1 * 1024 * 1024 * 1024, // 1 GiB -- below the 2 GiB red threshold
      free_pct: 1,
    };
    const result = admitIngestion(db, {
      source_id: 'native_otel',
      rate_limits: DEFAULT_RL,
      disk: redDisk,
    });
    expect(result.admit).toBe(false);
    if (!result.admit) {
      expect(result.reason).toBe('disk_pressure_red');
    }
  });

  it('amber disk admits cleanly without rejection', () => {
    const amberDisk: DiskPressureInput = {
      ...HEALTHY_DISK,
      free_bytes: 4 * 1024 * 1024 * 1024,
      free_pct: 8, // <= 10 amber_pct_threshold
    };
    const result = admitIngestion(db, {
      source_id: 'native_otel',
      rate_limits: DEFAULT_RL,
      disk: amberDisk,
    });
    expect(result.admit).toBe(true);
  });

  it('rejects with rate_limited when persisted FSM = rate_limited', () => {
    db.prepare(
      `INSERT INTO ingest_rate_state (source_path, state) VALUES (?, 'rate_limited')`,
    ).run('native_otel');

    const result = admitIngestion(db, {
      source_id: 'native_otel',
      rate_limits: DEFAULT_RL,
      disk: HEALTHY_DISK,
    });
    expect(result.admit).toBe(false);
    if (!result.admit) {
      expect(result.reason).toBe('rate_limited');
    }
  });

  it('rejects with disk_pressure_red when persisted FSM = disk_full_pause', () => {
    db.prepare(
      `INSERT INTO ingest_rate_state (source_path, state) VALUES (?, 'disk_full_pause')`,
    ).run('native_otel');

    const result = admitIngestion(db, {
      source_id: 'native_otel',
      rate_limits: DEFAULT_RL,
      disk: HEALTHY_DISK,
    });
    expect(result.admit).toBe(false);
    if (!result.admit) {
      expect(result.reason).toBe('disk_pressure_red');
    }
  });

  it('records a drop in ingest_rate_state when rejected', () => {
    const { clock } = makeClock();
    for (let i = 0; i < 5; i++) {
      admitIngestion(
        db,
        { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
        clock,
      );
    }
    admitIngestion(
      db,
      { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK },
      clock,
    );

    const row = db
      .prepare(`SELECT consecutive_drops FROM ingest_rate_state WHERE source_path = ?`)
      .get('native_otel') as { consecutive_drops: number };
    expect(row.consecutive_drops).toBeGreaterThanOrEqual(1);
  });

  it('admissionBucketSize reflects post-admit count', () => {
    admitIngestion(db, { source_id: 'native_otel', rate_limits: DEFAULT_RL, disk: HEALTHY_DISK });
    expect(admissionBucketSize('native_otel')).toBeGreaterThanOrEqual(0);
    expect(admissionBucketSize('unknown_source')).toBe(-1);
  });
});
