/**
 * SPEC-008 — Injectable clock for the persistent circuit-breaker.
 *
 * Per FR-007 (deterministic mode for tests) and FR-225 (replayability
 * with an injected clock). The interface lives in
 * `resource-circuit-breaker.ts`; this module owns the default real
 * clock + a `FakeBreakerClock` driver for unit tests.
 *
 * Usage:
 *
 *   const clock = new FakeBreakerClock(0);
 *   const breaker = new CircuitBreaker({ clock });
 *   clock.advance(60_000);  // 1 minute later
 *   breaker.tickError('boom');
 *
 * @see specs/008-resource-governance/spec.md FR-007, FR-225
 * @see specs/008-resource-governance/tasks.md T067
 */

import {
  realBreakerClock,
  type BreakerClock,
} from '@/lib/resource-circuit-breaker';

/** Re-export the real clock so callers can pin the dependency in one file. */
export { realBreakerClock };
export type { BreakerClock };

/**
 * Test clock with explicit time control. `now()` returns the current
 * mock time; callers advance via `advance(deltaMs)` or set via
 * `setNow(absoluteMs)`. Two test-runs with the same call sequence MUST
 * produce identical `nowMs()` reads (FR-225 determinism).
 */
export class FakeBreakerClock implements BreakerClock {
  private currentMs: number;

  constructor(startMs = 0) {
    this.currentMs = startMs;
  }

  /** Read-only snapshot of the mock time. */
  public nowMs(): number {
    return this.currentMs;
  }

  /** Move time forward by `deltaMs`. Negative deltas are rejected. */
  public advance(deltaMs: number): void {
    if (deltaMs < 0) {
      throw new Error(
        `FakeBreakerClock.advance: negative delta ${String(deltaMs)} forbidden`,
      );
    }
    this.currentMs += deltaMs;
  }

  /** Set absolute mock time. Forbids regressions to keep tests deterministic. */
  public setNow(absoluteMs: number): void {
    if (absoluteMs < this.currentMs) {
      throw new Error(
        `FakeBreakerClock.setNow: regression ${String(absoluteMs)} < ${String(
          this.currentMs,
        )}`,
      );
    }
    this.currentMs = absoluteMs;
  }
}
