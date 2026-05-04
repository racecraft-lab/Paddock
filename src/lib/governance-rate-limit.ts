/**
 * SPEC-008 — Per-bucket rate limiters for governance routes (T141, T154).
 *
 * Per FR-203, FR-203a, FR-203b. Implements a small in-process sliding-
 * window limiter keyed on `(bucket, actor)`:
 *
 *   - Override-grant bucket: 10 grants/min/actor (FR-203a).
 *   - Operator default bucket: 60 req/min/actor (FR-203).
 *   - Per-bucket 429 emits `governance.api.rate_limited{bucket=...}` (FR-203b).
 *   - Override-grant breaches additionally emit
 *     `governance.overrides.rate_limited` for FR-191/FR-280 dashboards.
 *
 * Concurrency: single-process; the Node event loop serializes the
 * increment / read pair, so no lock is required.
 *
 * The route adapter (`governance-route-context.ts`) already exposes a
 * `mutationLimiter` for the legacy 60/min general bucket. This module
 * is layered on top — the override-grant route calls
 * `checkOverrideGrantRateLimit(actorKey)` BEFORE doing any work; the
 * route's existing `mutationLimiter` continues to enforce the
 * coarse-grained 60/min bucket.
 *
 * @see specs/008-resource-governance/spec.md FR-203, FR-203a, FR-203b
 * @see specs/008-resource-governance/tasks.md T141, T154
 */

import { incrementMetric } from '@/lib/observability/self-obs-metrics';

/** Closed bucket-name set for the per-bucket metric label. */
export type RateLimitBucket =
  | 'policies'
  | 'budgets'
  | 'overrides'
  | 'quarantine'
  | 'windows'
  | 'otlp';

/** Override-grant bucket: 10/min/actor (FR-203a). */
export const OVERRIDE_GRANT_LIMIT = 10;
export const OVERRIDE_GRANT_WINDOW_MS = 60_000;

interface BucketState {
  count: number;
  reset_at_ms: number;
}

const overrideGrantBuckets = new Map<string, BucketState>();

/**
 * Attempt to consume one slot in the override-grant bucket for `actorKey`.
 * Returns null when the slot is granted (caller should proceed) or a
 * `{retry_after_ms}` envelope when the bucket is exhausted (caller
 * should respond 429).
 *
 * On 429 the function emits BOTH `governance.api.rate_limited{bucket=overrides}`
 * (FR-203b dashboard surfacing) AND `governance.overrides.rate_limited`
 * (FR-203a override-specific counter for operator alerts).
 */
export function checkOverrideGrantRateLimit(
  actorKey: string,
): { ok: true } | { ok: false; retry_after_ms: number } {
  const now = Date.now();
  const existing = overrideGrantBuckets.get(actorKey);

  if (existing === undefined || now >= existing.reset_at_ms) {
    overrideGrantBuckets.set(actorKey, {
      count: 1,
      reset_at_ms: now + OVERRIDE_GRANT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (existing.count < OVERRIDE_GRANT_LIMIT) {
    existing.count += 1;
    return { ok: true };
  }

  // Bucket exhausted. Emit the metric pair and return retry-after.
  incrementMetric('governance.api.rate_limited', { bucket: 'overrides' });
  incrementMetric('governance.overrides.rate_limited', { actor: actorKey });
  return {
    ok: false,
    retry_after_ms: Math.max(0, existing.reset_at_ms - now),
  };
}

/**
 * Test-only helper — clear the bucket map. Production callers MUST NOT
 * use this; it lives here so vitest can isolate per-test state.
 */
export function _resetOverrideGrantBuckets(): void {
  overrideGrantBuckets.clear();
}

/**
 * Emit the per-bucket 429 metric on behalf of a route that ran
 * `mutationLimiter` and got a 429 envelope (T154). The label
 * discriminator `path_family → bucket` is computed by the caller; this
 * function is the canonical place to bump the counter so all routes
 * agree on the metric name and label schema.
 */
export function recordRateLimitBreach(bucket: RateLimitBucket): void {
  incrementMetric('governance.api.rate_limited', { bucket });
}
