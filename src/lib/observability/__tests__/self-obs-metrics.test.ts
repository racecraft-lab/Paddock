/**
 * SPEC-008 — Tests for `src/lib/observability/self-obs-metrics.ts` (T089).
 *
 * Acceptance: FR-016, FR-024, FR-105, FR-196a, FR-276, FR-277, FR-354.
 *
 * @see specs/008-resource-governance/tasks.md T089
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EVALUATOR_LATENCY_BUCKETS_MS,
  getMetricsSnapshot,
  incrementMetric,
  observeHistogram,
  resetMetrics,
} from '../self-obs-metrics';

describe('observability/self-obs-metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
  });

  describe('incrementMetric', () => {
    it('starts at 0 and increments to 1 by default', () => {
      incrementMetric('decisions_by_precedence_rank', { rank: 1 });
      const snap = getMetricsSnapshot();
      expect(snap.counters).toHaveLength(1);
      expect(snap.counters[0]?.name).toBe('decisions_by_precedence_rank');
      expect(snap.counters[0]?.labels).toEqual({ rank: '1' });
      expect(snap.counters[0]?.value).toBe(1);
    });

    it('accumulates across calls with the same labels', () => {
      incrementMetric('adapter_heartbeat', { adapter: 'native_otel' });
      incrementMetric('adapter_heartbeat', { adapter: 'native_otel' });
      incrementMetric('adapter_heartbeat', { adapter: 'native_otel' }, 5);

      const snap = getMetricsSnapshot();
      expect(snap.counters).toHaveLength(1);
      expect(snap.counters[0]?.value).toBe(7);
    });

    it('separates counters with different label sets', () => {
      incrementMetric('drift_counter', { kind: 'auto_repair' });
      incrementMetric('drift_counter', { kind: 'operator_confirmed' });
      incrementMetric('drift_counter', { kind: 'hard_block' });

      const snap = getMetricsSnapshot();
      expect(snap.counters).toHaveLength(3);
      const map = new Map(snap.counters.map((c) => [c.labels['kind'], c.value]));
      expect(map.get('auto_repair')).toBe(1);
      expect(map.get('operator_confirmed')).toBe(1);
      expect(map.get('hard_block')).toBe(1);
    });

    it('treats label-order independent identity (sorted by key)', () => {
      incrementMetric('audit_chain_integrity', { table: 'ledger', result: 'verified' });
      incrementMetric('audit_chain_integrity', { result: 'verified', table: 'ledger' });

      const snap = getMetricsSnapshot();
      expect(snap.counters).toHaveLength(1);
      expect(snap.counters[0]?.value).toBe(2);
    });

    it('rejects negative or non-finite amounts', () => {
      expect(() => { incrementMetric('x', {}, -1); }).toThrow(/non-negative/);
      expect(() => { incrementMetric('x', {}, NaN); }).toThrow(/non-negative/);
      expect(() => { incrementMetric('x', {}, Infinity); }).toThrow(/non-negative/);
    });
  });

  describe('observeHistogram (FR-354 fixed buckets)', () => {
    it('exposes the FR-354 fixed bucket schedule', () => {
      expect(EVALUATOR_LATENCY_BUCKETS_MS).toEqual([1, 5, 15, 30, 60, 100, 250, 500, 1000]);
    });

    it('places observation in the lowest matching bucket and every higher one (cumulative)', () => {
      observeHistogram('evaluator_latency_ms', 12);

      const snap = getMetricsSnapshot();
      expect(snap.histograms).toHaveLength(1);
      const h = snap.histograms[0];
      expect(h?.count).toBe(1);
      expect(h?.sum).toBe(12);

      const counts = h?.bucket_counts ?? [];
      // Buckets: [1, 5, 15, 30, 60, 100, 250, 500, 1000, +Inf]
      // 12 should land at >= 15, so buckets at idx 0,1 stay 0; idx 2..9 = 1
      expect(counts[0]).toBe(0); // <=1
      expect(counts[1]).toBe(0); // <=5
      expect(counts[2]).toBe(1); // <=15
      expect(counts[3]).toBe(1); // <=30
      expect(counts[4]).toBe(1); // <=60
      expect(counts[5]).toBe(1); // <=100
      expect(counts[6]).toBe(1); // <=250
      expect(counts[7]).toBe(1); // <=500
      expect(counts[8]).toBe(1); // <=1000
      expect(counts[9]).toBe(1); // +Inf
    });

    it('routes overflow (>1000ms) into +Inf only', () => {
      observeHistogram('evaluator_latency_ms', 5000);

      const h = getMetricsSnapshot().histograms[0];
      const counts = h?.bucket_counts ?? [];
      expect(counts.slice(0, 9).every((c) => c === 0)).toBe(true);
      expect(counts[9]).toBe(1);
      expect(h?.count).toBe(1);
      expect(h?.sum).toBe(5000);
    });

    it('handles fast-path observations (<=1ms)', () => {
      observeHistogram('evaluator_latency_ms', 0.5);
      const counts = getMetricsSnapshot().histograms[0]?.bucket_counts ?? [];
      // 0.5 <= 1, so every bucket is incremented
      for (const c of counts) {
        expect(c).toBe(1);
      }
    });

    it('separates histograms by labels', () => {
      observeHistogram('reconciler_latency_ms', 10, { source: 'native_otel' });
      observeHistogram('reconciler_latency_ms', 20, { source: 'gateway_otel' });

      const snap = getMetricsSnapshot();
      expect(snap.histograms).toHaveLength(2);
    });

    it('rejects non-finite values', () => {
      expect(() => { observeHistogram('x', NaN); }).toThrow(/finite/);
      expect(() => { observeHistogram('x', Infinity); }).toThrow(/finite/);
    });
  });

  describe('getMetricsSnapshot', () => {
    it('returns deterministic ordering by name then identity key', () => {
      incrementMetric('zeta_counter', { a: '1' });
      incrementMetric('alpha_counter', { a: '1' });

      const snap = getMetricsSnapshot();
      expect(snap.counters[0]?.name).toBe('alpha_counter');
      expect(snap.counters[1]?.name).toBe('zeta_counter');
    });

    it('snapshot is JSON-serializable', () => {
      incrementMetric('reaper_alerted', {});
      observeHistogram('reconciler_latency_ms', 100);

      const snap = getMetricsSnapshot();
      const json = JSON.stringify(snap);
      const round = JSON.parse(json) as { counters: { name: string }[]; histograms: { name: string }[] };
      expect(round.counters[0]?.name).toBe('reaper_alerted');
      expect(round.histograms[0]?.name).toBe('reconciler_latency_ms');
    });
  });
});
