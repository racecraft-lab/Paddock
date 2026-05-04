/**
 * SPEC-008 — Deterministic-mode wrapper for the persistent circuit-breaker.
 *
 * Per FR-007 (deterministic mode via injectable clock) and FR-225
 * (replayability). The base `CircuitBreaker` already accepts a `clock`
 * option. This module wraps that constructor so tests can express
 * "deterministic breaker with a given fake clock" in one call,
 * threading the clock through the breaker's defaulted options without
 * reaching into private state.
 *
 * The wrapper does not duplicate the breaker's logic — every transition
 * runs through the same `CircuitBreaker` methods. The point of the
 * wrapper is twofold:
 *   1. Test ergonomics: `createDeterministicBreaker(clock)` returns a
 *      ready-to-drive breaker without callers re-spelling the options
 *      object on every test.
 *   2. Documentation surface: a single import name signals "this is the
 *      deterministic-mode entry point", separating it from production
 *      use of the singleton accessor.
 *
 * @see specs/008-resource-governance/spec.md FR-007, FR-225
 * @see specs/008-resource-governance/tasks.md T155 (orchestrator plan)
 */

import {
  CircuitBreaker,
  type CircuitBreakerOptions,
} from '@/lib/resource-circuit-breaker';
import type { BreakerClock } from '@/lib/resource-breaker-clock';

/**
 * Build a `CircuitBreaker` whose wall-clock reads are routed through
 * `clock`. All other options pass through unchanged. Callers control
 * `db` (typically an in-memory test connection) plus the threshold /
 * window knobs.
 */
export function createDeterministicBreaker(
  clock: BreakerClock,
  options: Omit<CircuitBreakerOptions, 'clock'> = {},
): CircuitBreaker {
  return new CircuitBreaker({ ...options, clock });
}
