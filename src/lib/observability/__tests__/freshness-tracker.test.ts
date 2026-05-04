/**
 * SPEC-008 — Tests for `src/lib/observability/freshness-tracker.ts` (T085).
 *
 * Acceptance: FR-115 (per-source freshness budget), FR-119 (per-source
 * freshness reads). `freshness_ms = now - max(canonical_event.emitted_at)`
 * where `emitted_at` is the persistence timestamp of the canonical row.
 *
 * Note on column choice: tasks.md prompt phrasing says `posted_at`, but
 * the M65c canonical_usage_events table has `emitted_at` (and
 * canonical_budget_effects has `posted_at`). Per the freshness-tracker
 * source comment, FR-115 tracks "time since the latest canonical row was
 * available to the dashboard" — that maps onto `emitted_at` on M65c.
 *
 * @see src/lib/observability/freshness-tracker.ts
 * @see specs/008-resource-governance/tasks.md T085
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getFreshness,
  getFreshnessForSources,
  type FreshnessClock,
} from '../freshness-tracker';

interface RawSeed {
  id: number;
  source_id: string;
  provider: string;
  provider_request_id: string | null;
  provider_timestamp_ms: number;
  partition_month: string;
}

interface CanonicalSeed {
  id: number;
  provider: string;
  provider_request_id: string | null;
  provider_timestamp_ms: number;
  partition_month: string;
  emitted_at: string;
  /** ascending raw ids that contributed to this canonical row */
  merge_sources: number[];
}

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE raw_usage_events (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      provider TEXT,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER,
      partition_month TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE canonical_usage_events (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER NOT NULL,
      merge_sources_json TEXT,
      partition_month TEXT NOT NULL,
      emitted_at TEXT NOT NULL
    );
  `);
}

function insertRaw(db: Database.Database, r: RawSeed): void {
  db.prepare(
    `INSERT INTO raw_usage_events
       (id, source_id, provider, provider_request_id, provider_timestamp_ms,
        partition_month)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.source_id,
    r.provider,
    r.provider_request_id,
    r.provider_timestamp_ms,
    r.partition_month,
  );
}

function insertCanonical(db: Database.Database, c: CanonicalSeed): void {
  db.prepare(
    `INSERT INTO canonical_usage_events
       (id, provider, provider_request_id, provider_timestamp_ms,
        merge_sources_json, partition_month, emitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id,
    c.provider,
    c.provider_request_id,
    c.provider_timestamp_ms,
    JSON.stringify(c.merge_sources),
    c.partition_month,
    c.emitted_at,
  );
}

function fixedClock(nowMs: number): FreshnessClock {
  return { now: () => nowMs };
}

describe('observability/freshness-tracker', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getFreshness', () => {
    it('returns null when the source has no canonical events', () => {
      const result = getFreshness(db, 'native_otel', fixedClock(1_000_000));
      expect(result).toBeNull();
    });

    it('returns null when raw events exist for the source but no canonical row references them', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      const result = getFreshness(db, 'native_otel', fixedClock(1_700_001_000_000));
      expect(result).toBeNull();
    });

    it('computes ms-elapsed since the latest canonical event for the source', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        merge_sources: [1],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:00.000Z',
      });
      // 5 seconds later
      const now = Date.parse('2026-05-01T12:00:05.000Z');
      const result = getFreshness(db, 'native_otel', fixedClock(now));
      expect(result).toBe(5_000);
    });

    it('returns 0 when the canonical emitted_at is in the future relative to the clock', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        merge_sources: [1],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:10.000Z',
      });
      const now = Date.parse('2026-05-01T12:00:05.000Z');
      const result = getFreshness(db, 'native_otel', fixedClock(now));
      expect(result).toBe(0);
    });

    it('uses the maximum emitted_at across all canonical rows for the source', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertRaw(db, {
        id: 2,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_b',
        provider_timestamp_ms: 1_700_000_001_000,
        partition_month: '2026-05',
      });
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        merge_sources: [1],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:00.000Z',
      });
      insertCanonical(db, {
        id: 101,
        provider: 'anthropic',
        provider_request_id: 'req_b',
        provider_timestamp_ms: 1_700_000_001_000,
        merge_sources: [2],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:30.000Z',
      });
      const now = Date.parse('2026-05-01T12:00:31.000Z');
      const result = getFreshness(db, 'native_otel', fixedClock(now));
      // 1s since the LATEST canonical row (id=101)
      expect(result).toBe(1_000);
    });

    it('isolates per-source: events from a different source do not affect freshness', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertRaw(db, {
        id: 2,
        source_id: 'cli_stdout_json',
        provider: 'anthropic',
        provider_request_id: 'req_b',
        provider_timestamp_ms: 1_700_000_001_000,
        partition_month: '2026-05',
      });
      // Canonical row only references the cli_stdout_json raw row.
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_b',
        provider_timestamp_ms: 1_700_000_001_000,
        merge_sources: [2],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:00.000Z',
      });
      const now = Date.parse('2026-05-01T12:00:05.000Z');
      expect(getFreshness(db, 'native_otel', fixedClock(now))).toBeNull();
      expect(getFreshness(db, 'cli_stdout_json', fixedClock(now))).toBe(5_000);
    });

    it('throws on malformed emitted_at', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        merge_sources: [1],
        partition_month: '2026-05',
        emitted_at: 'not-a-timestamp',
      });
      expect(() =>
        getFreshness(db, 'native_otel', fixedClock(1_700_000_000_000)),
      ).toThrow(/malformed/);
    });
  });

  describe('getFreshnessForSources', () => {
    it('returns a map covering every requested source, with null for unknown', () => {
      insertRaw(db, {
        id: 1,
        source_id: 'native_otel',
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        partition_month: '2026-05',
      });
      insertCanonical(db, {
        id: 100,
        provider: 'anthropic',
        provider_request_id: 'req_a',
        provider_timestamp_ms: 1_700_000_000_000,
        merge_sources: [1],
        partition_month: '2026-05',
        emitted_at: '2026-05-01T12:00:00.000Z',
      });
      const now = Date.parse('2026-05-01T12:00:02.000Z');
      const result = getFreshnessForSources(
        db,
        ['native_otel', 'gateway_otel', 'transcript_replay'],
        fixedClock(now),
      );
      expect(result.get('native_otel')).toBe(2_000);
      expect(result.get('gateway_otel')).toBeNull();
      expect(result.get('transcript_replay')).toBeNull();
    });
  });
});
