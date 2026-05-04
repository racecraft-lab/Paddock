/**
 * SPEC-008 — FR-335 throttle supervisor.
 *
 * Per FR-335 (engage at p95 >= 25 ms), FR-336 (resume below 15 ms),
 * FR-337 (120 s dwell window for resume), FR-338 (in-flight admission
 * rejection reason `admission_throttle`).
 *
 * Design:
 *   - Caller invokes `recordAdmissionLatency(ms)` once per completed
 *     admission decision (admit OR reject). Latency observations are
 *     stored in a ring buffer of timestamp + value pairs.
 *   - Each `getThrottleState()` call computes p95 over the last 60 s
 *     of observations (a rolling-window p95, NOT a histogram bucket).
 *   - The supervisor flips into `throttling` when p95 >= engage_p95_ms
 *     for ANY observation past the engage threshold.
 *   - The supervisor flips back to `idle` only after p95 < resume_p95_ms
 *     AND the dwell window (`resume_dwell_ms`) has elapsed since the
 *     LAST observation past the engage threshold. This prevents flap.
 *
 * `shouldThrottle()` returns true iff state == 'throttling'. Callers
 * (T091 ingest-admission) consult this before admitting; when true the
 * decision is `{admit: false, reason: 'admission_throttle'}`.
 *
 * @see specs/008-resource-governance/spec.md FR-335..FR-338
 * @see specs/008-resource-governance/tasks.md T092
 * @see Constitution Convention J — strict-scope module
 */

import type { ThrottleState } from '@/types/observability';

/** Engage threshold per FR-335. */
export const DEFAULT_ENGAGE_P95_MS = 25;
/** Resume threshold per FR-336. */
export const DEFAULT_RESUME_P95_MS = 15;
/** Dwell window per FR-337. */
export const DEFAULT_RESUME_DWELL_MS = 120_000;
/** Sampling window per FR-335 ("rolling 60s p95"). */
export const DEFAULT_WINDOW_MS = 60_000;

interface Observation {
  t_ms: number;
  v_ms: number;
}

interface SupervisorState {
  observations: Observation[];
  state: ThrottleState;
  /** Last time an observation crossed the engage threshold. */
  last_engage_breach_ms: number;
}

const state: SupervisorState = {
  observations: [],
  state: 'idle',
  last_engage_breach_ms: 0,
};

/** Test-only reset. */
export function resetThrottleSupervisor(): void {
  state.observations = [];
  state.state = 'idle';
  state.last_engage_breach_ms = 0;
}

/** Configurable knobs. */
export interface ThrottleSupervisorConfig {
  engage_p95_ms?: number;
  resume_p95_ms?: number;
  resume_dwell_ms?: number;
  window_ms?: number;
  clock?: { now(): number };
}

const DEFAULT_CLOCK = { now: () => Date.now() };

/** Drop observations older than the rolling window. */
function evictOldObservations(now_ms: number, window_ms: number): void {
  const cutoff = now_ms - window_ms;
  // observations are appended chronologically — drop from the head.
  let drop = 0;
  for (const o of state.observations) {
    if (o.t_ms < cutoff) drop += 1;
    else break;
  }
  if (drop > 0) state.observations.splice(0, drop);
}

/** Compute p95 over the current observation buffer. */
function computeP95(): number {
  if (state.observations.length === 0) return 0;
  const sorted = state.observations.map((o) => o.v_ms).slice().sort((a, b) => a - b);
  // Standard p95: ceil(0.95 * n) - 1 (zero-indexed).
  const idx = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  const v = sorted[idx];
  return v ?? 0;
}

/**
 * Record one admission-latency observation. Returns the new throttle
 * state computed after the observation is folded in.
 */
export function recordAdmissionLatency(
  v_ms: number,
  config: ThrottleSupervisorConfig = {},
): ThrottleState {
  if (!Number.isFinite(v_ms) || v_ms < 0) {
    throw new Error(
      `throttle-supervisor: latency must be a non-negative finite number, got ${String(v_ms)}`,
    );
  }
  const window_ms = config.window_ms ?? DEFAULT_WINDOW_MS;
  const engage = config.engage_p95_ms ?? DEFAULT_ENGAGE_P95_MS;
  const resume = config.resume_p95_ms ?? DEFAULT_RESUME_P95_MS;
  const dwell = config.resume_dwell_ms ?? DEFAULT_RESUME_DWELL_MS;
  const clock = config.clock ?? DEFAULT_CLOCK;
  const now_ms = clock.now();

  state.observations.push({ t_ms: now_ms, v_ms });
  evictOldObservations(now_ms, window_ms);

  if (v_ms >= engage) {
    state.last_engage_breach_ms = now_ms;
  }

  const p95 = computeP95();

  // Engage state machine
  if (state.state === 'idle') {
    if (p95 >= engage) state.state = 'throttling';
  } else {
    // Currently throttling — only resume if below resume threshold AND
    // dwell window since last breach has elapsed.
    if (p95 < resume && now_ms - state.last_engage_breach_ms >= dwell) {
      state.state = 'idle';
    }
  }

  return state.state;
}

/** Read the current state without recording an observation. */
export function getThrottleState(): ThrottleState {
  return state.state;
}

/** Sugar — true iff currently throttling. */
export function shouldThrottle(): boolean {
  return state.state === 'throttling';
}

/** Diagnostic helper. */
export function currentP95(): number {
  return computeP95();
}

/** Diagnostic helper — number of observations in the rolling window. */
export function observationCount(): number {
  return state.observations.length;
}
