/**
 * SPEC-008 — Tests for `src/lib/observability/throttle-supervisor.ts` (T092).
 *
 * Acceptance: FR-335 (engage at p95 >= 25 ms), FR-336 (resume below
 * 15 ms), FR-337 (120 s dwell), FR-338 (admission rejection reason).
 *
 * @see specs/008-resource-governance/tasks.md T092
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  currentP95,
  DEFAULT_ENGAGE_P95_MS,
  DEFAULT_RESUME_DWELL_MS,
  DEFAULT_RESUME_P95_MS,
  getThrottleState,
  observationCount,
  recordAdmissionLatency,
  resetThrottleSupervisor,
  shouldThrottle,
} from '../throttle-supervisor';

function makeClock(): { clock: { now(): number }; advance: (ms: number) => void } {
  let nowMs = 1_700_000_000_000;
  return {
    clock: { now: () => nowMs },
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('observability/throttle-supervisor', () => {
  beforeEach(() => {
    resetThrottleSupervisor();
  });

  afterEach(() => {
    resetThrottleSupervisor();
  });

  it('starts in idle with no observations', () => {
    expect(getThrottleState()).toBe('idle');
    expect(shouldThrottle()).toBe(false);
    expect(observationCount()).toBe(0);
    expect(currentP95()).toBe(0);
  });

  it('rejects non-finite or negative latency observations', () => {
    expect(() => recordAdmissionLatency(NaN)).toThrow(/non-negative/);
    expect(() => recordAdmissionLatency(-1)).toThrow(/non-negative/);
    expect(() => recordAdmissionLatency(Infinity)).toThrow(/non-negative/);
  });

  it('engages throttle when p95 reaches engage threshold (>=25 ms)', () => {
    const { clock } = makeClock();
    // 20 fast observations + 1 slow observation -- p95 with 21 obs is the
    // (ceil(0.95*21) - 1)th = idx 19 sorted asc, which is the 20th-fastest.
    // To force p95 >= 25, push enough slow observations so the 95th
    // percentile crosses the engage threshold.
    for (let i = 0; i < 95; i++) {
      recordAdmissionLatency(5, { clock });
    }
    // Add 5 slow observations -- with 100 obs total, p95 = idx 94 sorted = 5
    // (still below engage). Need >= 5% of obs at >= 25 ms.
    for (let i = 0; i < 10; i++) {
      recordAdmissionLatency(40, { clock });
    }
    // Now obs = 105: idx ceil(0.95 * 105) - 1 = idx 99 sorted asc.
    // The top 10 are 40 ms each, so idx 99 = 40 ms >= 25 -> engage.
    expect(getThrottleState()).toBe('throttling');
    expect(shouldThrottle()).toBe(true);
  });

  it('does NOT resume from throttling until p95 falls below resume threshold AND dwell elapses', () => {
    const { clock, advance } = makeClock();

    // Engage by pushing slow observations
    for (let i = 0; i < 100; i++) {
      recordAdmissionLatency(40, { clock });
    }
    expect(getThrottleState()).toBe('throttling');

    // Push fast observations -- p95 drops below resume threshold
    advance(1_000);
    for (let i = 0; i < 100; i++) {
      recordAdmissionLatency(5, { clock });
    }

    // Still inside the dwell window since the last breach
    expect(getThrottleState()).toBe('throttling');

    // Advance past the dwell window AND keep pushing fast obs
    advance(DEFAULT_RESUME_DWELL_MS + 1);
    recordAdmissionLatency(5, { clock });
    expect(getThrottleState()).toBe('idle');
  });

  it('keeps throttling if p95 remains at/above resume threshold', () => {
    const { clock, advance } = makeClock();

    for (let i = 0; i < 100; i++) {
      recordAdmissionLatency(40, { clock });
    }
    expect(getThrottleState()).toBe('throttling');

    // Advance past dwell, but keep observations at >= resume threshold
    advance(DEFAULT_RESUME_DWELL_MS + 1);
    for (let i = 0; i < 100; i++) {
      recordAdmissionLatency(20, { clock });
    }
    // 20 ms is above the 15 ms resume threshold AND each obs at 20 ms
    // also resets last_engage_breach_ms? No — engage threshold is 25 ms,
    // so 20 doesn't qualify as a breach. p95 of 100 obs at 20 = 20.
    // 20 >= resume_p95_ms (15) -> stay throttling.
    expect(getThrottleState()).toBe('throttling');
  });

  it('a single breach observation re-arms the dwell timer', () => {
    const { clock, advance } = makeClock();

    for (let i = 0; i < 100; i++) {
      recordAdmissionLatency(40, { clock });
    }
    expect(getThrottleState()).toBe('throttling');

    // Push fast observations to drive p95 below resume
    advance(1_000);
    for (let i = 0; i < 200; i++) {
      recordAdmissionLatency(5, { clock });
    }

    // Advance past dwell -> would resume
    advance(DEFAULT_RESUME_DWELL_MS - 5_000);
    // But push one breach observation, re-arming the dwell timer
    recordAdmissionLatency(50, { clock });

    // Advance past what would have been dwell since the original breach
    advance(10_000);
    recordAdmissionLatency(5, { clock });

    // Total time since last breach is only ~10 s -- still within dwell
    expect(getThrottleState()).toBe('throttling');
  });

  it('evicts observations older than the rolling 60 s window', () => {
    const { clock, advance } = makeClock();

    // Push 50 fast observations
    for (let i = 0; i < 50; i++) {
      recordAdmissionLatency(5, { clock });
    }
    expect(observationCount()).toBe(50);

    advance(70_000); // > 60 s window
    recordAdmissionLatency(5, { clock });
    // Old 50 evicted, only the newest remains
    expect(observationCount()).toBe(1);
  });

  it('exports the FR-335..FR-337 default constants', () => {
    expect(DEFAULT_ENGAGE_P95_MS).toBe(25);
    expect(DEFAULT_RESUME_P95_MS).toBe(15);
    expect(DEFAULT_RESUME_DWELL_MS).toBe(120_000);
  });
});
