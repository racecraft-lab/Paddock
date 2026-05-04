/**
 * SPEC-008 — Tests for `src/lib/observability/snapshot-writer.ts` (T084).
 *
 * Acceptance: FR-111, FR-112, FR-117, FR-121, FR-123, FR-127.
 *
 * @see specs/008-resource-governance/tasks.md T084
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeSnapshot, type SnapshotWrite } from '../snapshot-writer';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE resource_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_id INTEGER,
      snapshot_at TEXT NOT NULL,
      cumulative_tokens_in INTEGER NOT NULL DEFAULT 0,
      cumulative_tokens_out INTEGER NOT NULL DEFAULT 0,
      cumulative_cost_usd REAL NOT NULL DEFAULT 0,
      cumulative_requests INTEGER NOT NULL DEFAULT 0,
      delta_from_prior INTEGER,
      source_emission_fingerprint TEXT NOT NULL,
      partition_month TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, scope_kind, scope_id, snapshot_at)
    );
  `);
}

function makeSnap(over: Partial<SnapshotWrite>): SnapshotWrite {
  return {
    source_id: 'native_otel',
    scope_kind: 'workspace',
    scope_id: 1,
    snapshot_at: '2026-05-01T12:00:00.000Z',
    cumulative_tokens_in: 1000,
    cumulative_tokens_out: 2000,
    cumulative_cost_usd: 0.5,
    cumulative_requests: 10,
    source_emission_fingerprint: 'fp:abc',
    ...over,
  };
}

describe('observability/snapshot-writer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('first snapshot in a lane returns delta_kind=first with null delta', () => {
    const result = writeSnapshot(db, makeSnap({}));
    expect(result.delta_kind).toBe('first');
    expect(result.delta_from_prior).toBeNull();
    expect(result.snapshot_id).toBeGreaterThan(0);

    const row = db
      .prepare('SELECT * FROM resource_snapshots WHERE id = ?')
      .get(result.snapshot_id) as Record<string, unknown>;
    expect(row['source_id']).toBe('native_otel');
    expect(row['delta_from_prior']).toBeNull();
    expect(row['partition_month']).toBe('2026-05');
  });

  it('second snapshot with monotonic increase yields delta_kind=normal with positive delta', () => {
    writeSnapshot(db, makeSnap({ snapshot_at: '2026-05-01T12:00:00.000Z' }));
    const result = writeSnapshot(
      db,
      makeSnap({
        snapshot_at: '2026-05-01T12:05:00.000Z',
        cumulative_tokens_in: 1100,
        cumulative_tokens_out: 2050,
        cumulative_requests: 12,
      }),
    );
    expect(result.delta_kind).toBe('normal');
    // 100 + 50 + 2 = 152
    expect(result.delta_from_prior).toBe(152);

    const persisted = db
      .prepare('SELECT delta_from_prior FROM resource_snapshots WHERE id = ?')
      .get(result.snapshot_id) as { delta_from_prior: number };
    expect(persisted.delta_from_prior).toBe(152);
  });

  it('detects generation reset when any cumulative field decreases (FR-127)', () => {
    writeSnapshot(
      db,
      makeSnap({
        snapshot_at: '2026-05-01T12:00:00.000Z',
        cumulative_tokens_in: 5000,
      }),
    );
    const result = writeSnapshot(
      db,
      makeSnap({
        snapshot_at: '2026-05-01T12:05:00.000Z',
        cumulative_tokens_in: 100, // RESET -- went down from 5000 to 100
      }),
    );
    expect(result.delta_kind).toBe('reset');
    expect(result.delta_from_prior).toBeNull();
  });

  it('idempotent re-write of the same (lane, snapshot_at) returns delta_kind=duplicate without inserting', () => {
    const first = writeSnapshot(db, makeSnap({}));
    const second = writeSnapshot(db, makeSnap({}));
    expect(second.delta_kind).toBe('duplicate');
    expect(second.snapshot_id).toBe(first.snapshot_id);

    const count = db
      .prepare('SELECT COUNT(*) AS n FROM resource_snapshots')
      .get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('isolates lanes by (source_id, scope_kind, scope_id)', () => {
    writeSnapshot(db, makeSnap({ scope_id: 1 }));
    const result = writeSnapshot(db, makeSnap({ scope_id: 2, snapshot_at: '2026-05-01T12:00:00.000Z' }));
    // Different lane -- should be 'first', not duplicate.
    expect(result.delta_kind).toBe('first');
  });

  it('handles facility-scope lanes (scope_id IS NULL)', () => {
    writeSnapshot(
      db,
      makeSnap({
        scope_kind: 'facility',
        scope_id: null,
        snapshot_at: '2026-05-01T12:00:00.000Z',
        cumulative_tokens_in: 100,
      }),
    );
    const result = writeSnapshot(
      db,
      makeSnap({
        scope_kind: 'facility',
        scope_id: null,
        snapshot_at: '2026-05-01T12:05:00.000Z',
        cumulative_tokens_in: 150,
        cumulative_tokens_out: 2050,
        cumulative_requests: 11,
      }),
    );
    expect(result.delta_kind).toBe('normal');
    // delta = 50 + 50 + 1 = 101
    expect(result.delta_from_prior).toBe(101);
  });

  it('tolerates skipped intervals (gap detection -- no special-casing required)', () => {
    writeSnapshot(db, makeSnap({ snapshot_at: '2026-05-01T12:00:00.000Z', cumulative_tokens_in: 100 }));
    // Skip several intervals; next snapshot is 1h later
    const result = writeSnapshot(
      db,
      makeSnap({
        snapshot_at: '2026-05-01T13:00:00.000Z',
        cumulative_tokens_in: 5000,
        cumulative_tokens_out: 2000,
        cumulative_requests: 10,
      }),
    );
    expect(result.delta_kind).toBe('normal');
    // 4900 + 0 + 0 = 4900
    expect(result.delta_from_prior).toBe(4900);
  });

  it('persists source_emission_fingerprint for the audit chain (FR-117)', () => {
    const result = writeSnapshot(
      db,
      makeSnap({ source_emission_fingerprint: 'fp:xyz123' }),
    );
    const row = db
      .prepare('SELECT source_emission_fingerprint FROM resource_snapshots WHERE id = ?')
      .get(result.snapshot_id) as { source_emission_fingerprint: string };
    expect(row.source_emission_fingerprint).toBe('fp:xyz123');
  });
});
