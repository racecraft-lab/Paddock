/**
 * SPEC-008 — Tests for governance-rate-limit (T141, T154).
 *
 * Verifies:
 *   - First 10 grants/min are accepted.
 *   - The 11th grant within the same window is rejected with retry_after_ms.
 *   - Different actors are independent.
 *   - 429 emits both governance.api.rate_limited{bucket=overrides} and
 *     governance.overrides.rate_limited.
 *   - recordRateLimitBreach(bucket) emits the per-bucket metric (T154).
 *
 * @see specs/008-resource-governance/spec.md FR-203a, FR-203b
 * @see specs/008-resource-governance/tasks.md T141, T154
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkOverrideGrantRateLimit,
  OVERRIDE_GRANT_LIMIT,
  recordRateLimitBreach,
  _resetOverrideGrantBuckets,
} from '@/lib/governance-rate-limit';
import {
  getMetricsSnapshot,
  resetMetrics,
} from '@/lib/observability/self-obs-metrics';

beforeEach(() => {
  _resetOverrideGrantBuckets();
  resetMetrics();
});

afterEach(() => {
  _resetOverrideGrantBuckets();
  resetMetrics();
});

describe('SPEC-008 governance-rate-limit (T141)', () => {
  it('accepts the first OVERRIDE_GRANT_LIMIT (=10) calls per actor', () => {
    for (let i = 0; i < OVERRIDE_GRANT_LIMIT; i++) {
      const r = checkOverrideGrantRateLimit('operator:1');
      expect(r.ok).toBe(true);
    }
  });

  it('rejects the (LIMIT+1)th call with retry_after_ms', () => {
    for (let i = 0; i < OVERRIDE_GRANT_LIMIT; i++) {
      checkOverrideGrantRateLimit('operator:1');
    }
    const r = checkOverrideGrantRateLimit('operator:1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retry_after_ms).toBeGreaterThanOrEqual(0);
      expect(r.retry_after_ms).toBeLessThanOrEqual(60_000);
    }
  });

  it('different actors maintain independent buckets', () => {
    for (let i = 0; i < OVERRIDE_GRANT_LIMIT; i++) {
      checkOverrideGrantRateLimit('operator:1');
    }
    const other = checkOverrideGrantRateLimit('operator:2');
    expect(other.ok).toBe(true);
  });

  it('rate-limit breach emits governance.api.rate_limited{bucket=overrides} and governance.overrides.rate_limited (FR-203a, FR-203b)', () => {
    for (let i = 0; i < OVERRIDE_GRANT_LIMIT; i++) {
      checkOverrideGrantRateLimit('operator:5');
    }
    checkOverrideGrantRateLimit('operator:5');

    const snap = getMetricsSnapshot();
    const apiRateLimited = snap.counters.find(
      (c) =>
        c.name === 'governance.api.rate_limited' && c.labels.bucket === 'overrides',
    );
    expect(apiRateLimited).toBeDefined();
    expect(apiRateLimited?.value).toBeGreaterThanOrEqual(1);

    const overrideRateLimited = snap.counters.find(
      (c) => c.name === 'governance.overrides.rate_limited',
    );
    expect(overrideRateLimited).toBeDefined();
    expect(overrideRateLimited?.value).toBeGreaterThanOrEqual(1);
  });
});

describe('SPEC-008 recordRateLimitBreach per-bucket metric (T154)', () => {
  const buckets = ['policies', 'budgets', 'overrides', 'quarantine', 'windows', 'otlp'] as const;

  for (const bucket of buckets) {
    it(`emits governance.api.rate_limited{bucket=${bucket}}`, () => {
      recordRateLimitBreach(bucket);
      const snap = getMetricsSnapshot();
      const row = snap.counters.find(
        (c) => c.name === 'governance.api.rate_limited' && c.labels.bucket === bucket,
      );
      expect(row).toBeDefined();
      expect(row?.value).toBe(1);
    });
  }
});
