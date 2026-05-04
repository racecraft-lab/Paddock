/**
 * SPEC-008 — Restart-recovery scan tests (T158 — orchestrator plan).
 *
 * Per FR-006: state on `resource_governance_breaker` survives restart.
 * On boot, `recoverBreakersOnBoot(db)`:
 *   - keeps `open` rows whose cooldown has not elapsed
 *   - flips `open -> half_open` once `now - opened_at >= halfOpenAfterMs`
 *   - flips `half_open -> closed` when probe budget is exhausted AND
 *     consecutive_errors === 0
 *   - leaves `closed` rows untouched
 *
 * @see specs/008-resource-governance/tasks.md T156 (FR-006 work)
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CircuitBreaker } from '@/lib/resource-circuit-breaker';
import { FakeBreakerClock } from '@/lib/resource-breaker-clock';
import { recoverBreakersOnBoot } from '@/lib/resource-breaker-restart-recovery';

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

function readBreaker(scopeKind: string): {
  state: string;
  notes_json: string | null;
} {
  return db
    .prepare(
      `SELECT state, notes_json FROM resource_governance_breaker
        WHERE scope_kind = ? AND scope_id IS NULL`,
    )
    .get(scopeKind) as { state: string; notes_json: string | null };
}

describe('SPEC-008 recoverBreakersOnBoot — open -> half_open after cooldown (T158)', () => {
  it('preserves open state when wait window has not elapsed', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-a',
      errorThreshold: 1,
    });
    breaker.tickError('boom');
    expect(readBreaker('evaluator-a').state).toBe('open');

    // Simulate restart 30s later — under the 60s default wait.
    clock.advance(30_000);
    const summary = recoverBreakersOnBoot(db, { clock });
    expect(summary.openToHalfOpen).toBe(0);
    expect(summary.unchanged).toBe(1);
    expect(readBreaker('evaluator-a').state).toBe('open');
  });

  it('flips open -> half_open once cooldown elapsed', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-b',
      errorThreshold: 1,
    });
    breaker.tickError('boom');

    // Restart > 60s later.
    clock.advance(75_000);
    const summary = recoverBreakersOnBoot(db, { clock });
    expect(summary.openToHalfOpen).toBe(1);
    expect(readBreaker('evaluator-b').state).toBe('half_open');
  });

  it('is idempotent — second call returns same result on same input', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-c',
      errorThreshold: 1,
    });
    breaker.tickError('boom');

    clock.advance(120_000);
    const first = recoverBreakersOnBoot(db, { clock });
    expect(first.openToHalfOpen).toBe(1);

    const second = recoverBreakersOnBoot(db, { clock });
    expect(second.openToHalfOpen).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(readBreaker('evaluator-c').state).toBe('half_open');
  });

  it('mid-window restart preserves state then flips after second restart past window', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-d',
      errorThreshold: 1,
    });
    breaker.tickError('boom');

    // First restart — mid-window.
    clock.advance(20_000);
    const first = recoverBreakersOnBoot(db, { clock });
    expect(first.openToHalfOpen).toBe(0);

    // Time advances; second restart — past window.
    clock.advance(60_000);
    const second = recoverBreakersOnBoot(db, { clock });
    expect(second.openToHalfOpen).toBe(1);
    expect(readBreaker('evaluator-d').state).toBe('half_open');
  });

  it('half_open with exhausted probe budget AND no errors -> closed', () => {
    // Construct a half-open row directly with budget consumed.
    db.prepare(
      `INSERT INTO resource_governance_breaker
        (scope_kind, state, consecutive_errors, opened_at, notes_json)
       VALUES ('evaluator-e', 'half_open', 0, NULL, ?)`,
    ).run(JSON.stringify({ half_open_probes_in_flight: 3 }));

    const clock = new FakeBreakerClock(1_000_000);
    const summary = recoverBreakersOnBoot(db, { clock });
    expect(summary.halfOpenToClosed).toBe(1);
    expect(readBreaker('evaluator-e').state).toBe('closed');
  });

  it('closed rows are not modified', () => {
    db.prepare(
      `INSERT INTO resource_governance_breaker
         (scope_kind, state, consecutive_errors)
       VALUES ('evaluator-f', 'closed', 0)`,
    ).run();
    const clock = new FakeBreakerClock(0);
    const summary = recoverBreakersOnBoot(db, { clock });
    expect(summary.unchanged).toBe(1);
    expect(summary.openToHalfOpen).toBe(0);
    expect(summary.halfOpenToClosed).toBe(0);
    expect(readBreaker('evaluator-f').state).toBe('closed');
  });
});
