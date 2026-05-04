/**
 * SPEC-008 — Chronic-alert background job tests (T159 — orchestrator plan).
 *
 * Per FR-022 (chronic alert when breaker open beyond
 * `breaker_open_max_seconds`) and FR-090l (single alert per chronic
 * episode). The job MUST:
 *   - emit `governance_circuit_breaker_chronic` once per chronic episode
 *   - de-dup repeat invocations within `chronicAlertDedupeMs`
 *   - re-emit after the dedupe window has elapsed
 *
 * @see specs/008-resource-governance/tasks.md T156 (FR-022 work)
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '@/lib/resource-circuit-breaker';
import { FakeBreakerClock } from '@/lib/resource-breaker-clock';
import { runChronicAlertJob } from '@/lib/resource-breaker-chronic-alert';

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

beforeEach(() => {
  db = new Database(':memory:');
  db.prepare(BREAKER_TABLE).run();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

describe('SPEC-008 runChronicAlertJob — single alert per chronic episode (T159)', () => {
  it('emits exactly one alert when called five times within the dedupe window', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-aa',
      errorThreshold: 1,
      breakerOpenMaxMs: 1_800_000,
    });
    breaker.tickError('boom');

    // Push wall-clock past the chronic threshold.
    clock.advance(1_900_000); // 31m40s

    const emitter = vi.fn();
    let totalEmitted = 0;
    for (let i = 0; i < 5; i++) {
      const result = runChronicAlertJob(db, {
        clock,
        breakerOpenMaxMs: 1_800_000,
        chronicAlertDedupeMs: 1_800_000,
        emitActivity: emitter,
      });
      totalEmitted += result.alertsEmitted;
      // Tick forward 1 minute between calls — well inside dedupe.
      clock.advance(60_000);
    }
    expect(totalEmitted).toBe(1);
    expect(emitter).toHaveBeenCalledTimes(1);
  });

  it('re-emits after the dedupe window has elapsed', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-bb',
      errorThreshold: 1,
      breakerOpenMaxMs: 1_800_000,
      chronicAlertDedupeMs: 1_800_000,
    });
    breaker.tickError('boom');

    clock.advance(1_900_000); // chronic threshold crossed
    const emitter = vi.fn();
    const first = runChronicAlertJob(db, {
      clock,
      breakerOpenMaxMs: 1_800_000,
      chronicAlertDedupeMs: 1_800_000,
      emitActivity: emitter,
    });
    expect(first.alertsEmitted).toBe(1);

    // Advance past dedupe window.
    clock.advance(2_000_000);
    const second = runChronicAlertJob(db, {
      clock,
      breakerOpenMaxMs: 1_800_000,
      chronicAlertDedupeMs: 1_800_000,
      emitActivity: emitter,
    });
    expect(second.alertsEmitted).toBe(1);
    expect(emitter).toHaveBeenCalledTimes(2);
  });

  it('manual reset of last_chronic_alert_at allows immediate re-emit', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-cc',
      errorThreshold: 1,
      breakerOpenMaxMs: 1_800_000,
    });
    breaker.tickError('boom');

    clock.advance(1_900_000);
    const emitter = vi.fn();
    runChronicAlertJob(db, {
      clock,
      breakerOpenMaxMs: 1_800_000,
      emitActivity: emitter,
    });
    expect(emitter).toHaveBeenCalledTimes(1);

    // Manual clear of dedupe marker (operator workflow).
    db.prepare(
      `UPDATE resource_governance_breaker
          SET notes_json = ?
        WHERE scope_kind = ?`,
    ).run(JSON.stringify({}), 'evaluator-cc');

    const second = runChronicAlertJob(db, {
      clock,
      breakerOpenMaxMs: 1_800_000,
      emitActivity: emitter,
    });
    expect(second.alertsEmitted).toBe(1);
    expect(emitter).toHaveBeenCalledTimes(2);
  });

  it('does not emit when no breakers are open', () => {
    const clock = new FakeBreakerClock(0);
    new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-dd',
      errorThreshold: 1,
    });
    const emitter = vi.fn();
    const result = runChronicAlertJob(db, { clock, emitActivity: emitter });
    expect(result.rowsScanned).toBe(0);
    expect(result.alertsEmitted).toBe(0);
    expect(emitter).not.toHaveBeenCalled();
  });

  it('does not emit when breaker is open but under chronic threshold', () => {
    const clock = new FakeBreakerClock(0);
    const breaker = new CircuitBreaker({
      db,
      clock,
      scopeKind: 'evaluator-ee',
      errorThreshold: 1,
      breakerOpenMaxMs: 1_800_000,
    });
    breaker.tickError('boom');

    // Only 5 minutes — under 30min threshold.
    clock.advance(300_000);
    const emitter = vi.fn();
    const result = runChronicAlertJob(db, {
      clock,
      breakerOpenMaxMs: 1_800_000,
      emitActivity: emitter,
    });
    expect(result.alertsEmitted).toBe(0);
    expect(emitter).not.toHaveBeenCalled();
  });
});
