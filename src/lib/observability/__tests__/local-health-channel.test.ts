/**
 * SPEC-008 — Tests for `src/lib/observability/local-health-channel.ts` (T086).
 *
 * Acceptance: FR-080, FR-116, FR-122, FR-126, FR-283 — emit a synthetic
 * raw_usage_events row when OTel is unreachable.
 *
 * @see specs/008-resource-governance/tasks.md T086
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitLocalHealth,
  LOCAL_HEALTH_PARSER_VERSION,
  LOCAL_HEALTH_SOURCE_ID,
} from '../local-health-channel';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE source_emission_capability (
      source_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      enforcement_eligibility TEXT NOT NULL DEFAULT 'reconciliation_only',
      dedupe_confidence_default TEXT NOT NULL DEFAULT 'medium',
      expected_envelope_bytes INTEGER NOT NULL DEFAULT 4096,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE raw_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      workspace_id INTEGER,
      agent_id INTEGER,
      task_id INTEGER,
      provider TEXT,
      provider_request_id TEXT,
      provider_timestamp_ms INTEGER,
      session_id TEXT,
      generation_id INTEGER,
      raw_attributes_json TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      schema_version_observed TEXT,
      reconcile_status TEXT NOT NULL DEFAULT 'ok'
        CHECK (reconcile_status IN ('ok','schema_broken','schema_malicious','quarantined')),
      dedupe_confidence TEXT NOT NULL DEFAULT 'medium',
      enforcement_eligibility TEXT NOT NULL DEFAULT 'reconciliation_only',
      partition_month TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES source_emission_capability(source_id)
    );
  `);
}

describe('observability/local-health-channel', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('throws when event is empty', () => {
    expect(() => emitLocalHealth(db, { event: '' })).toThrow(/non-empty/);
  });

  it('writes one row to raw_usage_events with source_id=local-health', () => {
    const result = emitLocalHealth(db, {
      event: 'agent_started',
      workspace_id: 1,
      agent_id: 2,
      task_id: 3,
      session_id: 's-1',
      payload: { foo: 'bar' },
      provider_timestamp_ms: Date.parse('2026-05-01T10:00:00Z'),
    });
    expect(result.raw_event_id).toBeGreaterThan(0);

    const row = db
      .prepare('SELECT * FROM raw_usage_events WHERE id = ?')
      .get(result.raw_event_id) as Record<string, unknown>;
    expect(row['source_id']).toBe(LOCAL_HEALTH_SOURCE_ID);
    expect(row['parser_version']).toBe(LOCAL_HEALTH_PARSER_VERSION);
    expect(row['workspace_id']).toBe(1);
    expect(row['agent_id']).toBe(2);
    expect(row['task_id']).toBe(3);
    expect(row['session_id']).toBe('s-1');
    expect(row['enforcement_eligibility']).toBe('reconciliation_only');
    expect(row['partition_month']).toBe('2026-05');
    expect(row['reconcile_status']).toBe('ok');

    const attrs = JSON.parse(String(row['raw_attributes_json'])) as Record<string, unknown>;
    expect(attrs['event']).toBe('agent_started');
    expect((attrs['payload'] as Record<string, unknown>)['foo']).toBe('bar');
  });

  it('lazy-registers the local-health source emission capability row on first emit', () => {
    const before = db
      .prepare('SELECT COUNT(*) AS n FROM source_emission_capability WHERE source_id = ?')
      .get(LOCAL_HEALTH_SOURCE_ID) as { n: number };
    expect(before.n).toBe(0);

    emitLocalHealth(db, { event: 'tool_invoked' });

    const after = db
      .prepare('SELECT * FROM source_emission_capability WHERE source_id = ?')
      .get(LOCAL_HEALTH_SOURCE_ID) as Record<string, unknown>;
    expect(after['enforcement_eligibility']).toBe('reconciliation_only');
    expect(after['dedupe_confidence_default']).toBe('low');
  });

  it('idempotent registration -- repeated emits do not duplicate the registry row', () => {
    emitLocalHealth(db, { event: 'a' });
    emitLocalHealth(db, { event: 'b' });
    emitLocalHealth(db, { event: 'c' });

    const count = db
      .prepare('SELECT COUNT(*) AS n FROM source_emission_capability WHERE source_id = ?')
      .get(LOCAL_HEALTH_SOURCE_ID) as { n: number };
    expect(count.n).toBe(1);

    const rawCount = db
      .prepare('SELECT COUNT(*) AS n FROM raw_usage_events WHERE source_id = ?')
      .get(LOCAL_HEALTH_SOURCE_ID) as { n: number };
    expect(rawCount.n).toBe(3);
  });

  it('defaults provider_timestamp_ms to Date.now() and computes the partition month from it', () => {
    const before = Date.now();
    const result = emitLocalHealth(db, { event: 'heartbeat' });
    const after = Date.now();

    const row = db
      .prepare('SELECT provider_timestamp_ms, partition_month FROM raw_usage_events WHERE id = ?')
      .get(result.raw_event_id) as { provider_timestamp_ms: number; partition_month: string };

    expect(row.provider_timestamp_ms).toBeGreaterThanOrEqual(before);
    expect(row.provider_timestamp_ms).toBeLessThanOrEqual(after);
    expect(row.partition_month).toMatch(/^\d{4}-\d{2}$/);
  });
});
