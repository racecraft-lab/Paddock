/**
 * SPEC-008 — Determinism test for the persistent circuit-breaker.
 *
 * Per FR-007 (deterministic-mode via injectable clock) and FR-225
 * (replayable behavior across two test runs given the same call
 * sequence). Drives the breaker through closed -> open -> half_open ->
 * closed transitions using `FakeBreakerClock`. Asserts that the
 * persisted state at each step matches the predicted lifecycle.
 *
 * Maps to tasks.md T158 (FR-007, FR-225) — orchestrator plan T155.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDeterministicBreaker } from '@/lib/resource-circuit-breaker-deterministic';
import { FakeBreakerClock } from '@/lib/resource-breaker-clock';

let db: Database.Database;

const BREAKER_TABLE = `
  CREATE TABLE resource_governance_breaker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL,
    scope_id INTEGER,
    state TEXT NOT NULL CHECK (state IN ('closed','half_open','open')),
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    opened_at TEXT,
    reset_at TEXT,
    notes_json TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope_kind, scope_id)
  )
`;
const ACTIVITY_TABLE = `
  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT,
    payload_json TEXT,
    created_at TEXT
  )
`;

beforeEach(() => {
  db = new Database(':memory:');
  db.prepare(BREAKER_TABLE).run();
  db.prepare(ACTIVITY_TABLE).run();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

function readState(scopeKind: string): string {
  const row = db
    .prepare(
      `SELECT state FROM resource_governance_breaker
        WHERE scope_kind = ? AND scope_id IS NULL`,
    )
    .get(scopeKind) as { state: string };
  return row.state;
}

describe('SPEC-008 createDeterministicBreaker — replayable transitions (T158)', () => {
  it('closed -> open after errorThreshold ticks', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = createDeterministicBreaker(clock, {
      db,
      scopeKind: 'det-1',
      errorThreshold: 3,
    });
    expect(readState('det-1')).toBe('closed');
    breaker.tickError('e1');
    breaker.tickError('e2');
    expect(readState('det-1')).toBe('closed');
    breaker.tickError('e3');
    expect(readState('det-1')).toBe('open');
  });

  it('open -> half_open after halfOpenAfterMs', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = createDeterministicBreaker(clock, {
      db,
      scopeKind: 'det-2',
      errorThreshold: 1,
      halfOpenAfterMs: 60_000,
    });
    breaker.tickError('boom');
    expect(readState('det-2')).toBe('open');
    clock.advance(30_000);
    expect(breaker.currentState()).toBe('open');
    clock.advance(31_000);
    expect(breaker.currentState()).toBe('half_open');
  });

  it('half_open -> closed on tickSuccess', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = createDeterministicBreaker(clock, {
      db,
      scopeKind: 'det-3',
      errorThreshold: 1,
      halfOpenAfterMs: 1_000,
    });
    breaker.tickError('boom');
    clock.advance(1_500);
    expect(breaker.currentState()).toBe('half_open');
    breaker.tickSuccess();
    expect(readState('det-3')).toBe('closed');
  });

  it('half-open probe budget caps at halfOpenProbeBudget', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = createDeterministicBreaker(clock, {
      db,
      scopeKind: 'det-4',
      errorThreshold: 1,
      halfOpenAfterMs: 500,
      halfOpenProbeBudget: 2,
    });
    breaker.tickError('boom');
    clock.advance(1_000);
    expect(breaker.currentState()).toBe('half_open');

    expect(breaker.tryProbe().admitted).toBe(true);
    expect(breaker.tryProbe().admitted).toBe(true);
    expect(breaker.tryProbe().admitted).toBe(false);
  });

  it('two replays of the same call sequence produce identical end-state', () => {
    function replay(): string {
      const localDb = new Database(':memory:');
      localDb.prepare(BREAKER_TABLE).run();
      localDb.prepare(ACTIVITY_TABLE).run();
      const clock = new FakeBreakerClock(0);
      const breaker = createDeterministicBreaker(clock, {
        db: localDb,
        scopeKind: 'replay',
        errorThreshold: 2,
        halfOpenAfterMs: 5_000,
      });
      breaker.tickError('a');
      breaker.tickError('b'); // open
      clock.advance(6_000);
      breaker.currentState(); // -> half_open
      breaker.tickSuccess(); // -> closed
      const state = (
        localDb
          .prepare(
            `SELECT state FROM resource_governance_breaker WHERE scope_kind = 'replay'`,
          )
          .get() as { state: string }
      ).state;
      localDb.close();
      return state;
    }
    expect(replay()).toBe(replay());
    expect(replay()).toBe('closed');
  });
});
