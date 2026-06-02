/**
 * SPEC-008 — AC-Race-1 race-test for override-grant idempotency (T145).
 *
 * Per FR-055 / FR-231 / AC-Race-1: ≥ 5 concurrent override-grant attempts
 * for the same (idempotency_key, actor) MUST resolve to exactly one
 * inserted override row plus N-1 deterministic
 * `code='duplicate_idempotency_key'` failures. The first-writer-wins
 * contract is enforced by the SQLite UNIQUE(idempotency_key, actor)
 * constraint on `resource_overrides` (M65h) executed under the
 * BEGIN IMMEDIATE → INSERT path inside `grantOverride`.
 *
 * Concurrency model:
 *   - better-sqlite3 is synchronous and per-thread; we cannot use Workers
 *     against the same connection. The "concurrency" exercised here is
 *     the BEGIN IMMEDIATE serialization invariant: every contender
 *     enters its own `db.transaction(fn).immediate(args)` body; the SQLite
 *     RESERVED lock makes them serial. Only the first to commit wins;
 *     the others observe the UNIQUE-constraint violation and return a
 *     typed `duplicate_idempotency_key` envelope (NOT a thrown SQLite
 *     error).
 *   - Production-equivalent SQLite config (WAL + 50ms busy_timeout) is
 *     applied per FR-060 / Q29 so the test exercises the same RESERVED-
 *     lock semantics as production.
 *
 * Stable error body shape (FR-231): every loser returns
 *   { ok: false, code: 'duplicate_idempotency_key', detail?: string }
 *
 * @see specs/008-resource-governance/spec.md FR-055, FR-231, AC-Race-1
 * @see specs/008-resource-governance/tasks.md T145
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-override-race-'));
  process.env.PADDOCK_DATA_DIR = tempDir;
  process.env.PADDOCK_DB_PATH = join(tempDir, 'paddock.db');
  db = new Database(process.env.PADDOCK_DB_PATH);
  // Production-equivalent SQLite config (FR-060 / Q29).
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
  delete process.env.PADDOCK_DATA_DIR;
  delete process.env.PADDOCK_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('SPEC-008 grantOverride — AC-Race-1 (FR-055 / FR-231)', () => {
  it('5 concurrent grantOverride() calls with the same idempotency key + actor commit exactly one row and return N-1 duplicate_idempotency_key envelopes', async () => {
    const { grantOverride } = await import('@/lib/resource-override-grant');

    const baseInput = {
      scope_kind: 'workspace' as const,
      scope_id: 1,
      policy_id: null,
      granted_amount: 100,
      granted_unit: 'usd' as const,
      reservation_id: null,
      reason: 'race-test override grant',
      ttl_ms: 60_000, // 60s — minimum allowed (FR-219b)
      idempotency_key: 'idem-race-001',
      actor: 'operator:42',
    };

    const contenders = Array.from({ length: 5 }).map(() => ({ ...baseInput }));

    // Run all five in tight succession against the same SQLite connection.
    // BEGIN IMMEDIATE serialises them; the UNIQUE(idempotency_key, actor)
    // constraint on resource_overrides (M65h) makes the loser insert hit
    // SQLITE_CONSTRAINT, which grantOverride MUST translate into the
    // typed duplicate envelope (NOT throw).
    const results = contenders.map((input) => grantOverride(input, db));

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    // FR-231 (a): exactly one commit.
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(4);

    // FR-231 (b): all four failed grants share an identical envelope shape.
    for (const r of failed) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('duplicate_idempotency_key');
      }
    }

    // Exactly one resource_overrides row inserted with that idempotency key.
    const rows = db
      .prepare(
        `SELECT id, idempotency_key, actor FROM resource_overrides
           WHERE idempotency_key = ? AND actor = ?`,
      )
      .all(baseInput.idempotency_key, baseInput.actor) as Array<{
      id: number;
      idempotency_key: string;
      actor: string;
    }>;
    expect(rows).toHaveLength(1);
  });

  it('rejects ttl_ms below the 60_000 floor with code=invalid_ttl (FR-219b)', async () => {
    const { grantOverride } = await import('@/lib/resource-override-grant');
    const r = grantOverride(
      {
        scope_kind: 'workspace',
        scope_id: 1,
        policy_id: null,
        granted_amount: 100,
        granted_unit: 'usd',
        reservation_id: null,
        reason: 'too-short',
        ttl_ms: 30_000, // 30s — below 60s floor
        idempotency_key: 'idem-ttl-low',
        actor: 'operator:1',
      },
      db,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_ttl');
  });

  it('rejects ttl_ms above the 24h ceiling with code=invalid_ttl (FR-219b)', async () => {
    const { grantOverride } = await import('@/lib/resource-override-grant');
    const r = grantOverride(
      {
        scope_kind: 'workspace',
        scope_id: 1,
        policy_id: null,
        granted_amount: 100,
        granted_unit: 'usd',
        reservation_id: null,
        reason: 'too-long',
        ttl_ms: 25 * 3600 * 1000, // 25h — above 24h ceiling
        idempotency_key: 'idem-ttl-high',
        actor: 'operator:1',
      },
      db,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_ttl');
  });

  it('grants successfully with TTL exactly at 60_000 (lower bound)', async () => {
    const { grantOverride } = await import('@/lib/resource-override-grant');
    const r = grantOverride(
      {
        scope_kind: 'workspace',
        scope_id: 1,
        policy_id: null,
        granted_amount: 100,
        granted_unit: 'usd',
        reservation_id: null,
        reason: 'lower-bound',
        ttl_ms: 60_000,
        idempotency_key: 'idem-bound-low',
        actor: 'operator:1',
      },
      db,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.override_id).toBeGreaterThan(0);
      expect(r.expires_at).toMatch(/T.*Z$/);
    }
  });

  it('grants successfully with TTL exactly at 24h (upper bound)', async () => {
    const { grantOverride } = await import('@/lib/resource-override-grant');
    const r = grantOverride(
      {
        scope_kind: 'workspace',
        scope_id: 1,
        policy_id: null,
        granted_amount: 100,
        granted_unit: 'usd',
        reservation_id: null,
        reason: 'upper-bound',
        ttl_ms: 24 * 3600 * 1000,
        idempotency_key: 'idem-bound-high',
        actor: 'operator:1',
      },
      db,
    );
    expect(r.ok).toBe(true);
  });
});
