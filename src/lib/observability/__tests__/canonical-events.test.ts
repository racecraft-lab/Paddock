/**
 * SPEC-008 — Tests for `src/lib/observability/canonical-events.ts` (T079).
 *
 * Acceptance: FR-091, FR-102, FR-107
 *   - One canonical row per dedupe triple
 *   - merge_sources_json carries every contributing raw id
 *   - provenance enum: single | merged | corrected
 *   - Idempotent re-run returns the existing canonical id without
 *     producing a second row.
 *
 * @see specs/008-resource-governance/tasks.md T079
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  materializeCanonical,
  markCanonicalCorrected,
  type RawEventForDedupe,
} from '../canonical-events';

function setupCanonicalSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE canonical_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      agent_id INTEGER,
      task_id INTEGER,
      provider TEXT NOT NULL,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER NOT NULL,
      model TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cache_read_in INTEGER NOT NULL DEFAULT 0,
      cache_creation_in INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      session_id TEXT,
      provenance TEXT NOT NULL DEFAULT 'single',
      merge_sources_json TEXT,
      dedupe_confidence TEXT NOT NULL DEFAULT 'high',
      partition_month TEXT NOT NULL,
      emitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_canonical_dedup
      ON canonical_usage_events(provider, provider_request_id, provider_timestamp_ms)
      WHERE provider_request_id IS NOT NULL;
  `);
}

function makeRaw(over: Partial<RawEventForDedupe>): RawEventForDedupe {
  return {
    id: 1,
    source_id: 'native_otel',
    provider: 'anthropic',
    provider_request_id: 'req_a',
    provider_timestamp_ms: 1_700_000_000_000,
    workspace_id: 1,
    agent_id: null,
    task_id: null,
    model: 'claude-3-5-sonnet',
    tokens_in: 100,
    tokens_out: 200,
    cache_read_in: 0,
    cache_creation_in: 0,
    cost_usd: 0.01,
    duration_ms: 50,
    session_id: 's-1',
    partition_month: '2026-05',
    ...over,
  };
}

describe('observability/canonical-events', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupCanonicalSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('throws on empty input', () => {
    expect(() => materializeCanonical(db, [])).toThrow(/non-empty/);
  });

  describe('single -> single provenance', () => {
    it('inserts one canonical row with provenance=single, returns canonical_id and reused=false', () => {
      const r = makeRaw({});
      const result = materializeCanonical(db, [r]);
      expect(result.reused).toBe(false);
      expect(result.provenance).toBe('single');
      expect(result.canonical_id).toBeGreaterThan(0);

      const rows = db
        .prepare('SELECT id, provenance, merge_sources_json FROM canonical_usage_events')
        .all() as { id: number; provenance: string; merge_sources_json: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.provenance).toBe('single');
      expect(JSON.parse(rows[0]?.merge_sources_json ?? '[]')).toEqual([1]);
    });
  });

  describe('multi -> merged provenance', () => {
    it('inserts one canonical row with provenance=merged covering every raw id', () => {
      const rs: RawEventForDedupe[] = [
        makeRaw({ id: 1, source_id: 'native_otel', tokens_in: 100, cost_usd: 0.01 }),
        makeRaw({ id: 2, source_id: 'cli_stdout_json', tokens_in: 105, cost_usd: 0.012 }),
        makeRaw({ id: 3, source_id: 'transcript_replay', tokens_in: 102, cost_usd: 0.011 }),
      ];
      const result = materializeCanonical(db, rs);
      expect(result.reused).toBe(false);
      expect(result.provenance).toBe('merged');

      const row = db
        .prepare('SELECT * FROM canonical_usage_events WHERE id = ?')
        .get(result.canonical_id) as Record<string, unknown>;
      expect(row['provenance']).toBe('merged');
      // MAX value tie-breaking
      expect(row['tokens_in']).toBe(105);
      expect(row['cost_usd']).toBe(0.012);
      // merge_sources_json covers all contributing raw ids, sorted asc
      expect(JSON.parse(String(row['merge_sources_json']))).toEqual([1, 2, 3]);
    });
  });

  describe('idempotent re-run (Q24)', () => {
    it('re-running materializeCanonical for the same dedupe triple does NOT insert a second row (request_id non-null)', () => {
      const rs: RawEventForDedupe[] = [
        makeRaw({ id: 1, provider_request_id: 'req_x' }),
        makeRaw({ id: 2, source_id: 'cli_stdout_json', provider_request_id: 'req_x' }),
      ];
      const first = materializeCanonical(db, rs);
      expect(first.reused).toBe(false);

      const second = materializeCanonical(db, rs);
      expect(second.reused).toBe(true);
      expect(second.canonical_id).toBe(first.canonical_id);

      const count = db
        .prepare('SELECT COUNT(*) AS n FROM canonical_usage_events')
        .get() as { n: number };
      expect(count.n).toBe(1);
    });

    it('handles NULL provider_request_id idempotency via the manual triple lookup (partial index does not cover it)', () => {
      const rs: RawEventForDedupe[] = [
        makeRaw({ id: 1, provider_request_id: null, provider_timestamp_ms: 1_700_000_500_000 }),
      ];
      const first = materializeCanonical(db, rs);
      expect(first.reused).toBe(false);

      const second = materializeCanonical(db, rs);
      expect(second.reused).toBe(true);
      expect(second.canonical_id).toBe(first.canonical_id);

      const count = db
        .prepare('SELECT COUNT(*) AS n FROM canonical_usage_events')
        .get() as { n: number };
      expect(count.n).toBe(1);
    });
  });

  describe('markCanonicalCorrected', () => {
    it('flips provenance to "corrected" for an existing row', () => {
      const r = makeRaw({});
      const { canonical_id } = materializeCanonical(db, [r]);

      const flipped = markCanonicalCorrected(db, canonical_id);
      expect(flipped).toBe(true);

      const row = db
        .prepare('SELECT provenance FROM canonical_usage_events WHERE id = ?')
        .get(canonical_id) as { provenance: string };
      expect(row.provenance).toBe('corrected');
    });

    it('returns false when the canonical id does not exist', () => {
      expect(markCanonicalCorrected(db, 999)).toBe(false);
    });
  });
});
