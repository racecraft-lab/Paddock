/**
 * SPEC-008 — Tests for governance-idempotency-cache (T142).
 *
 * Verifies:
 *   - Miss → record → hit replay returns the cached body byte-identically.
 *   - Same key + different body hash → body_mismatch (FR-391).
 *   - Expired rows are swept and surface as miss.
 *
 * Production-equivalent SQLite (WAL + 50ms busy_timeout) per FR-060.
 *
 * @see specs/008-resource-governance/spec.md FR-209, FR-219a, FR-391
 * @see specs/008-resource-governance/tasks.md T142
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-idem-cache-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('SPEC-008 governance-idempotency-cache (T142)', () => {
  it('miss when no row exists', async () => {
    const { lookupIdempotency, hashRequestBody } = await import(
      '@/lib/governance-idempotency-cache'
    );
    const r = lookupIdempotency(
      {
        actor_id: 1,
        idempotency_key: 'idem-001',
        request_body_hash: hashRequestBody('{"a":1}'),
      },
      db,
    );
    expect(r.kind).toBe('miss');
  });

  it('record then replay returns the cached response byte-identically', async () => {
    const { lookupIdempotency, recordIdempotency, hashRequestBody } =
      await import('@/lib/governance-idempotency-cache');

    const body = '{"a":1}';
    const hash = hashRequestBody(body);
    recordIdempotency(
      {
        actor_id: 7,
        idempotency_key: 'idem-replay',
        request_body_hash: hash,
        response: {
          status: 201,
          body_json: '{"override_id":42,"expires_at":"2026-05-02T00:00:00.000Z"}',
          headers: { location: '/api/governance/overrides/42', etag: 'W/"1-abc"' },
        },
      },
      db,
    );

    const r = lookupIdempotency(
      { actor_id: 7, idempotency_key: 'idem-replay', request_body_hash: hash },
      db,
    );
    expect(r.kind).toBe('hit');
    if (r.kind === 'hit') {
      expect(r.response.status).toBe(201);
      expect(r.response.body_json).toBe(
        '{"override_id":42,"expires_at":"2026-05-02T00:00:00.000Z"}',
      );
      expect(r.response.headers.location).toBe('/api/governance/overrides/42');
      expect(r.response.headers.etag).toBe('W/"1-abc"');
    }
  });

  it('same key + different body hash returns body_mismatch (FR-391)', async () => {
    const { lookupIdempotency, recordIdempotency, hashRequestBody } =
      await import('@/lib/governance-idempotency-cache');

    recordIdempotency(
      {
        actor_id: 7,
        idempotency_key: 'idem-mismatch',
        request_body_hash: hashRequestBody('{"a":1}'),
        response: { status: 201, body_json: '{}', headers: {} },
      },
      db,
    );

    const r = lookupIdempotency(
      {
        actor_id: 7,
        idempotency_key: 'idem-mismatch',
        request_body_hash: hashRequestBody('{"a":2}'),
      },
      db,
    );
    expect(r.kind).toBe('body_mismatch');
  });

  it('different actor with the same key is independent', async () => {
    const { lookupIdempotency, recordIdempotency, hashRequestBody } =
      await import('@/lib/governance-idempotency-cache');

    const hash = hashRequestBody('{"a":1}');
    recordIdempotency(
      {
        actor_id: 1,
        idempotency_key: 'shared-key',
        request_body_hash: hash,
        response: { status: 201, body_json: '{}', headers: {} },
      },
      db,
    );
    const other = lookupIdempotency(
      { actor_id: 2, idempotency_key: 'shared-key', request_body_hash: hash },
      db,
    );
    expect(other.kind).toBe('miss');
  });

  it('expired rows surface as miss (sweep)', async () => {
    const { lookupIdempotency, hashRequestBody } = await import(
      '@/lib/governance-idempotency-cache'
    );

    // Insert a manually expired row (expires_at well in the past).
    db.prepare(
      `INSERT INTO governance_idempotency_keys
         (actor_id, idempotency_key, request_body_hash,
          response_body_json, response_status, response_headers_json,
          created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      'idem-expired',
      hashRequestBody('{}'),
      '{}',
      201,
      '{}',
      new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    );

    const r = lookupIdempotency(
      { actor_id: 1, idempotency_key: 'idem-expired', request_body_hash: hashRequestBody('{}') },
      db,
    );
    expect(r.kind).toBe('miss');

    // Row was deleted by the sweep.
    const remaining = db
      .prepare(
        `SELECT 1 FROM governance_idempotency_keys WHERE idempotency_key='idem-expired'`,
      )
      .all();
    expect(remaining).toHaveLength(0);
  });
});
