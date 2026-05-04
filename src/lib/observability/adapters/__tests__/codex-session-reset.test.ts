/**
 * SPEC-008 — Codex stdout session-reset tests (T098).
 *
 * Validates FR-072a: when the cumulative-per-session counter goes
 * backwards, the adapter MUST discard the event and write an
 * `activities` row tagged `codex_session_reset`. Subsequent events
 * resume from the new (lower) cumulative baseline.
 *
 * @see specs/008-resource-governance/tasks.md T098
 * @see src/lib/observability/adapters/codex-stdout.ts (T096)
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CODEX_SESSION_RESET_ACTIVITY_TYPE,
  CODEX_STDOUT_SOURCE_ID,
  ingestCodexTurnCompleted,
  _resetSessionState,
} from '../codex-stdout';

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
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

describe('observability/adapters/codex-stdout — FR-072a session reset', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
    _resetSessionState();
  });

  afterEach(() => {
    db.close();
  });

  it('emits a raw row on the first turn and the second monotonic turn', () => {
    const ts1 = 1_700_000_000_000;
    const ts2 = 1_700_000_001_000;
    const r1 = ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-A',
        cumulative_input_tokens: 100,
        cumulative_output_tokens: 200,
        timestamp_ms: ts1,
        provider: 'openai',
        request_id: 'req-1',
      },
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(typeof r1.raw_event_id).toBe('number');

    const r2 = ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-A',
        cumulative_input_tokens: 250,
        cumulative_output_tokens: 500,
        timestamp_ms: ts2,
        provider: 'openai',
        request_id: 'req-2',
      },
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(typeof r2.raw_event_id).toBe('number');

    const rows = db
      .prepare(`SELECT * FROM raw_usage_events WHERE source_id = ? ORDER BY id ASC`)
      .all(CODEX_STDOUT_SOURCE_ID) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    const second = rows[1];
    expect(second).toBeDefined();
    if (second === undefined) return;
    const attrs = JSON.parse(String(second['raw_attributes_json'])) as Record<string, unknown>;
    expect(attrs['input_tokens']).toBe(150);
    expect(attrs['output_tokens']).toBe(300);
  });

  it('discards the event AND writes an activity row when cumulative goes backwards', () => {
    ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-B',
        cumulative_input_tokens: 1000,
        cumulative_output_tokens: 2000,
        timestamp_ms: 1_700_000_000_000,
        provider: 'openai',
        request_id: 'req-1',
      },
    });

    const r = ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-B',
        cumulative_input_tokens: 50,
        cumulative_output_tokens: 100,
        timestamp_ms: 1_700_000_001_000,
        provider: 'openai',
        request_id: 'req-2',
      },
    });
    expect(r).toEqual({ ok: false, reason: 'session_reset' });

    const rawCount = db
      .prepare(`SELECT COUNT(*) AS c FROM raw_usage_events WHERE source_id = ?`)
      .get(CODEX_STDOUT_SOURCE_ID) as { c: number };
    expect(rawCount.c).toBe(1);

    const activity = db
      .prepare(`SELECT * FROM activities WHERE type = ?`)
      .get(CODEX_SESSION_RESET_ACTIVITY_TYPE) as Record<string, unknown> | undefined;
    expect(activity).toBeDefined();
    if (activity === undefined) return;
    const data = JSON.parse(String(activity['data'])) as Record<string, unknown>;
    expect(data['session_id']).toBe('sess-B');
    expect(data['last_cumulative_in']).toBe(1000);
    expect(data['new_cumulative_in']).toBe(50);
  });

  it('after a reset, the next monotonic event resumes from the new baseline', () => {
    ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-C',
        cumulative_input_tokens: 1000,
        cumulative_output_tokens: 2000,
        timestamp_ms: 1_700_000_000_000,
      },
    });
    ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-C',
        cumulative_input_tokens: 50,
        cumulative_output_tokens: 100,
        timestamp_ms: 1_700_000_001_000,
      },
    });
    const r3 = ingestCodexTurnCompleted(db, {
      type: 'turn.completed',
      usage: {
        session_id: 'sess-C',
        cumulative_input_tokens: 200,
        cumulative_output_tokens: 400,
        timestamp_ms: 1_700_000_002_000,
      },
    });
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(typeof r3.raw_event_id).toBe('number');

    const rows = db
      .prepare(`SELECT * FROM raw_usage_events WHERE source_id = ? ORDER BY id DESC LIMIT 1`)
      .all(CODEX_STDOUT_SOURCE_ID) as Record<string, unknown>[];
    const last = rows[0];
    expect(last).toBeDefined();
    if (last === undefined) return;
    const attrs = JSON.parse(String(last['raw_attributes_json'])) as Record<string, unknown>;
    expect(attrs['input_tokens']).toBe(150);
    expect(attrs['output_tokens']).toBe(300);
  });

  it('rejects a malformed event with reason=malformed_event', () => {
    const r = ingestCodexTurnCompleted(db, { type: 'something_else' });
    expect(r).toEqual({ ok: false, reason: 'malformed_event' });
  });
});
