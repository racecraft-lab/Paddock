/**
 * SPEC-008 — Tests for `src/lib/observability/dedupe.ts` (T077/T078).
 *
 * Acceptance: AC-Dedup-1
 *   Insert 100 raw events from 2 sources, all sharing
 *   `(provider, provider_request_id, provider_timestamp_ms)` → exactly 1
 *   canonical row, ledger debit count = 1.
 *
 * Per-field tie-breaking: `MAX(value)` for numeric fields. The merge
 * tracks every contributing source row id in `merge_sources_json`.
 *
 * @see specs/008-resource-governance/spec.md FR-092, FR-082, FR-102, FR-386
 * @see specs/008-resource-governance/tasks.md T077, T078
 */

import { describe, expect, it } from 'vitest';
import {
  dedupeKey,
  mergeRawEvents,
  type RawEventForDedupe,
} from '../dedupe';

describe('observability/dedupe', () => {
  describe('dedupeKey', () => {
    it('produces stable key from (provider, provider_request_id, provider_timestamp_ms)', () => {
      const r: RawEventForDedupe = {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_abc',
        provider_timestamp_ms: 1714600000000,
        workspace_id: 1,
        agent_id: null,
        task_id: null,
        model: 'claude-3-5-sonnet',
        tokens_in: 100,
        tokens_out: 200,
        cache_read_in: 0,
        cache_creation_in: 0,
        cost_usd: 0.001,
        duration_ms: 50,
        session_id: 's-1',
        partition_month: '2026-05',
      };
      expect(dedupeKey(r)).toBe('anthropic::req_abc::1714600000000');
    });

    it('preserves NULL values as empty positions in the key', () => {
      const r: RawEventForDedupe = {
        id: 2,
        source_id: 'transcript_replay',
        provider: 'openai',
        provider_request_id: null,
        provider_timestamp_ms: 1714600000001,
        workspace_id: 1,
        agent_id: null,
        task_id: null,
        model: null,
        tokens_in: 50,
        tokens_out: 0,
        cache_read_in: 0,
        cache_creation_in: 0,
        cost_usd: 0,
        duration_ms: null,
        session_id: null,
        partition_month: '2026-05',
      };
      expect(dedupeKey(r)).toBe('openai::::1714600000001');
    });
  });

  describe('mergeRawEvents — AC-Dedup-1', () => {
    it('merges 100 raw events from 2 sources sharing dedupe key into 1 canonical row', () => {
      const rows: RawEventForDedupe[] = [];
      // 50 from native_otel, 50 from cli_stdout_json — same dedupe triple
      for (let i = 0; i < 50; i++) {
        rows.push({
          id: i + 1,
          source_id: 'native_otel',
          provider: 'anthropic',
          provider_request_id: 'req_shared',
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-sonnet',
          tokens_in: 100, // same across the set, will be MAX'd
          tokens_out: 200,
          cache_read_in: 10,
          cache_creation_in: 0,
          cost_usd: 0.0015,
          duration_ms: 50,
          session_id: 's-shared',
          partition_month: '2026-05',
        });
      }
      for (let i = 50; i < 100; i++) {
        rows.push({
          id: i + 1,
          source_id: 'cli_stdout_json',
          provider: 'anthropic',
          provider_request_id: 'req_shared',
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-sonnet',
          tokens_in: 105, // larger value — MAX should win
          tokens_out: 200,
          cache_read_in: 10,
          cache_creation_in: 0,
          cost_usd: 0.00155, // larger
          duration_ms: 51, // larger
          session_id: 's-shared',
          partition_month: '2026-05',
        });
      }

      const merged = mergeRawEvents(rows);

      // exactly one canonical row was produced
      expect(merged.canonical.provider).toBe('anthropic');
      expect(merged.canonical.provider_request_id).toBe('req_shared');
      expect(merged.canonical.provider_timestamp_ms).toBe(1714600000000);

      // per-field MAX tie-breaking
      expect(merged.canonical.tokens_in).toBe(105);
      expect(merged.canonical.tokens_out).toBe(200);
      expect(merged.canonical.cost_usd).toBe(0.00155);
      expect(merged.canonical.duration_ms).toBe(51);

      // merge_sources covers every contributing raw id (sorted ascending)
      expect(merged.merge_sources).toHaveLength(100);
      expect(merged.merge_sources[0]).toBe(1);
      expect(merged.merge_sources[99]).toBe(100);

      // provenance is 'merged' (multi-source, multi-row)
      expect(merged.canonical.provenance).toBe('merged');

      // confidence is 'high' — all rows share the full dedupe triple
      expect(merged.confidence).toBe('high');
    });

    it('returns confidence=singleton when given a single row', () => {
      const r: RawEventForDedupe = {
        id: 42,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_one',
        provider_timestamp_ms: 1714600000000,
        workspace_id: 1,
        agent_id: null,
        task_id: null,
        model: 'claude-3-5-sonnet',
        tokens_in: 10,
        tokens_out: 20,
        cache_read_in: 0,
        cache_creation_in: 0,
        cost_usd: 0.0001,
        duration_ms: 5,
        session_id: 's-1',
        partition_month: '2026-05',
      };
      const merged = mergeRawEvents([r]);
      expect(merged.confidence).toBe('singleton');
      expect(merged.canonical.provenance).toBe('single');
      expect(merged.merge_sources).toEqual([42]);
    });

    it('confidence=medium when provider_request_id is NULL across the set', () => {
      const rows: RawEventForDedupe[] = [
        {
          id: 1,
          source_id: 'native_otel',
          provider: 'anthropic',
          provider_request_id: null,
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-sonnet',
          tokens_in: 10,
          tokens_out: 20,
          cache_read_in: 0,
          cache_creation_in: 0,
          cost_usd: 0.0001,
          duration_ms: 5,
          session_id: 's-1',
          partition_month: '2026-05',
        },
        {
          id: 2,
          source_id: 'transcript_replay',
          provider: 'anthropic',
          provider_request_id: null,
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-sonnet',
          tokens_in: 12,
          tokens_out: 22,
          cache_read_in: 0,
          cache_creation_in: 0,
          cost_usd: 0.00012,
          duration_ms: 6,
          session_id: 's-1',
          partition_month: '2026-05',
        },
      ];
      const merged = mergeRawEvents(rows);
      expect(merged.confidence).toBe('medium');
      expect(merged.canonical.tokens_in).toBe(12);
      expect(merged.canonical.tokens_out).toBe(22);
    });

    it('throws when given an empty input array', () => {
      expect(() => mergeRawEvents([])).toThrow(/empty/);
    });

    it('takes the lexicographically-greatest non-null model when models differ', () => {
      const rows: RawEventForDedupe[] = [
        {
          id: 1,
          source_id: 'native_otel',
          provider: 'anthropic',
          provider_request_id: 'req_x',
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-haiku',
          tokens_in: 10,
          tokens_out: 20,
          cache_read_in: 0,
          cache_creation_in: 0,
          cost_usd: 0.0001,
          duration_ms: 5,
          session_id: 's-1',
          partition_month: '2026-05',
        },
        {
          id: 2,
          source_id: 'cli_stdout_json',
          provider: 'anthropic',
          provider_request_id: 'req_x',
          provider_timestamp_ms: 1714600000000,
          workspace_id: 1,
          agent_id: null,
          task_id: null,
          model: 'claude-3-5-sonnet',
          tokens_in: 10,
          tokens_out: 20,
          cache_read_in: 0,
          cache_creation_in: 0,
          cost_usd: 0.0001,
          duration_ms: 5,
          session_id: 's-1',
          partition_month: '2026-05',
        },
      ];
      const merged = mergeRawEvents(rows);
      expect(merged.canonical.model).toBe('claude-3-5-sonnet');
    });
  });
});
