/**
 * SPEC-008 — Tests for `src/lib/resource-reservation-reaper.ts`.
 *
 * Verifies:
 *   1. AC-Reap-1 — the reaper releases reservations whose `expires_at` has
 *      lapsed; `state` advances to `'expired'` (FR-064 / FR-294).
 *   2. The alert is emitted exactly once per cycle when reaped count
 *      exceeds the soft threshold (FR-185).
 *   3. Concurrent task-completion (reason='task_completion') racing the
 *      reaper for the same row produces ONE terminal write — no
 *      double-debit of the counter (FR-294 single-writer guarantee).
 *   4. The reaper is idempotent across cycles: a second run after the
 *      first reap finds zero candidates.
 *
 * @see specs/008-resource-governance/spec.md FR-064, FR-185, FR-294
 * @see specs/008-resource-governance/tasks.md T065
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-resource-reaper-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(async () => {
  try {
    const pool = await import('@/lib/db/connection-pool');
    pool.closeAllConnections();
  } catch {
    // ignore
  }
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function insertBudgetPolicy(database: Database.Database, limit: number): number {
  const stmt = database.prepare(`
    INSERT INTO resource_policies
      (workspace_id, policy_type, limit_kind, limit_value, enforcement,
       enabled, version)
    VALUES (?, 'budget', 'usd', ?, 'defer', 1, 1)
  `);
  const r = stmt.run(11, limit);
  return Number(r.lastInsertRowid);
}

/**
 * Insert an active reservation with the given `expires_at`. Counter is
 * pre-populated so the release primitive's debit path has a target.
 */
async function insertActiveReservation(
  database: Database.Database,
  args: { policy_id: number; amount: number; expires_at_iso: string },
): Promise<number> {
  const { ensureCounter, reserve } = await import('@/lib/resource-budget-counters');
  ensureCounter(database, {
    policy_id: args.policy_id,
    window_start: '2026-05-01T00:00:00Z',
  });
  const counterRes = reserve(database, {
    policy_id: args.policy_id,
    window_start: '2026-05-01T00:00:00Z',
    unit: 'usd',
    amount: args.amount,
    expected_version: 1,
    limit_value: 100,
  });
  if (!counterRes.committed) {
    throw new Error(
      `test setup: counter reserve failed conflict=${'conflict' in counterRes ? counterRes.conflict : 'unknown'}`,
    );
  }
  const stmt = database.prepare(`
    INSERT INTO resource_reservations
      (policy_id, counter_id, window_start, amount, unit, state,
       granted_by, expires_at)
    VALUES (?, ?, '2026-05-01T00:00:00Z', ?, 'usd', 'active',
            'system', ?)
  `);
  const r = stmt.run(args.policy_id, counterRes.counter_id, args.amount, args.expires_at_iso);
  return Number(r.lastInsertRowid);
}

describe('SPEC-008 resource-reservation-reaper — module surface', () => {
  it('exports runReaperOnce and startReaper', async () => {
    const mod = await import('@/lib/resource-reservation-reaper');
    expect(typeof mod.runReaperOnce).toBe('function');
    expect(typeof mod.startReaper).toBe('function');
  });
});

describe('SPEC-008 resource-reservation-reaper — happy path (FR-064)', () => {
  it('releases reservations whose expires_at has lapsed; advances state to expired', async () => {
    const policy_id = insertBudgetPolicy(db, 100);
    const past = '2026-01-01T00:00:00.000Z';
    const reservationRowId = await insertActiveReservation(db, {
      policy_id,
      amount: 5,
      expires_at_iso: past,
    });

    const { runReaperOnce } = await import('@/lib/resource-reservation-reaper');
    const fakeEmits: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const result = runReaperOnce({
      db,
      clock: {
        nowIso: () => '2026-05-01T00:01:00.000Z',
        setTimeoutFn: () => () => {},
      },
      emitActivity: (_db, kind, payload) => {
        fakeEmits.push({ kind, payload });
      },
    });

    expect(result.scanned).toBe(1);
    expect(result.released).toBe(1);
    expect(result.already_released).toBe(0);
    expect(result.alerted).toBe(false);

    const row = db
      .prepare(`SELECT state, finalized_reason FROM resource_reservations WHERE id = ?`)
      .get(reservationRowId) as { state: string; finalized_reason: string | null };
    expect(row.state).toBe('expired');
    expect(row.finalized_reason).toBe('expired_idle');

    // Release activity row was emitted.
    const releasedEmits = fakeEmits.filter(
      (e) => e.kind === 'mc.governance.reservation_reaper_released',
    );
    expect(releasedEmits).toHaveLength(1);
  });

  it('does not touch reservations whose expires_at is still in the future', async () => {
    const policy_id = insertBudgetPolicy(db, 100);
    const future = '2030-01-01T00:00:00.000Z';
    const id = await insertActiveReservation(db, {
      policy_id,
      amount: 3,
      expires_at_iso: future,
    });

    const { runReaperOnce } = await import('@/lib/resource-reservation-reaper');
    const result = runReaperOnce({
      db,
      clock: {
        nowIso: () => '2026-05-01T00:01:00.000Z',
        setTimeoutFn: () => () => {},
      },
      emitActivity: () => {},
    });

    expect(result.scanned).toBe(0);
    expect(result.released).toBe(0);
    const row = db
      .prepare(`SELECT state FROM resource_reservations WHERE id = ?`)
      .get(id) as { state: string };
    expect(row.state).toBe('active');
  });
});

describe('SPEC-008 resource-reservation-reaper — alert above soft threshold (FR-185)', () => {
  it('emits governance_reservation_reaper_alert exactly once when released > softThreshold', async () => {
    const policy_id = insertBudgetPolicy(db, 100);
    const past = '2026-01-01T00:00:00.000Z';
    // Pre-populate the counter via test helper, then insert 3 reservations
    // by hand (helper runs reserve() once per call which would race).
    const { ensureCounter, reserve } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });
    let version = 1;
    for (let i = 0; i < 3; i++) {
      const r = reserve(db, {
        policy_id,
        window_start: '2026-05-01T00:00:00Z',
        unit: 'usd',
        amount: 1,
        expected_version: version,
        limit_value: 100,
      });
      if (!r.committed) throw new Error('test setup failed');
      version = r.new_version;
      db.prepare(
        `INSERT INTO resource_reservations
          (policy_id, counter_id, window_start, amount, unit, state,
           granted_by, expires_at)
         VALUES (?, ?, '2026-05-01T00:00:00Z', 1, 'usd', 'active',
                 'system', ?)`,
      ).run(policy_id, r.counter_id, past);
    }

    const { runReaperOnce } = await import('@/lib/resource-reservation-reaper');
    const fakeEmits: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const result = runReaperOnce({
      db,
      softThreshold: 2, // 3 reapings will exceed
      clock: {
        nowIso: () => '2026-05-01T00:01:00.000Z',
        setTimeoutFn: () => () => {},
      },
      emitActivity: (_db, kind, payload) => {
        fakeEmits.push({ kind, payload });
      },
    });

    expect(result.released).toBe(3);
    expect(result.alerted).toBe(true);

    const alertEmits = fakeEmits.filter(
      (e) => e.kind === 'governance_reservation_reaper_alert',
    );
    expect(alertEmits).toHaveLength(1);
    expect(alertEmits[0]?.payload['released_count']).toBe(3);
    expect(alertEmits[0]?.payload['soft_threshold']).toBe(2);
  });
});

describe('SPEC-008 resource-reservation-reaper — concurrent release safety (FR-294)', () => {
  it('no double-release: task-completion winning before the reaper yields already_released', async () => {
    const policy_id = insertBudgetPolicy(db, 100);
    const past = '2026-01-01T00:00:00.000Z';
    const id = await insertActiveReservation(db, {
      policy_id,
      amount: 5,
      expires_at_iso: past,
    });

    // Simulate task-completion winning the CAS first.
    const { releaseReservation } = await import('@/lib/resource-reservation-release');
    const first = releaseReservation(db, id, 'task_completion');
    expect(first.released).toBe(true);
    expect(first.state).toBe('released');

    // Now the reaper picks up the same row — it must short-circuit
    // because state !== 'active'. But the SQL predicate (state='active'
    // AND expires_at < now) excludes it from the scan, so released
    // should be zero. We assert the scan size and the row's state hasn't
    // moved.
    const { runReaperOnce } = await import('@/lib/resource-reservation-reaper');
    const result = runReaperOnce({
      db,
      clock: {
        nowIso: () => '2026-05-01T00:01:00.000Z',
        setTimeoutFn: () => () => {},
      },
      emitActivity: () => {},
    });
    expect(result.scanned).toBe(0);
    expect(result.released).toBe(0);
    const row = db
      .prepare(`SELECT state, finalized_reason FROM resource_reservations WHERE id = ?`)
      .get(id) as { state: string; finalized_reason: string };
    expect(row.state).toBe('released');
    expect(row.finalized_reason).toBe('task_completion');

    // Counter was debited exactly once (NOT twice).
    const counter = db
      .prepare(
        `SELECT reserved_usd FROM resource_budget_counters WHERE policy_id = ?`,
      )
      .get(policy_id) as { reserved_usd: number };
    expect(counter.reserved_usd).toBe(0);
  });
});

describe('SPEC-008 resource-reservation-reaper — idempotency across cycles', () => {
  it('second cycle finds zero candidates after first reap', async () => {
    const policy_id = insertBudgetPolicy(db, 100);
    const past = '2026-01-01T00:00:00.000Z';
    await insertActiveReservation(db, {
      policy_id,
      amount: 5,
      expires_at_iso: past,
    });

    const { runReaperOnce } = await import('@/lib/resource-reservation-reaper');
    const r1 = runReaperOnce({
      db,
      clock: { nowIso: () => '2026-05-01T00:01:00.000Z', setTimeoutFn: () => () => {} },
      emitActivity: () => {},
    });
    const r2 = runReaperOnce({
      db,
      clock: { nowIso: () => '2026-05-01T00:02:00.000Z', setTimeoutFn: () => () => {} },
      emitActivity: () => {},
    });

    expect(r1.released).toBe(1);
    expect(r2.scanned).toBe(0);
    expect(r2.released).toBe(0);
  });
});
