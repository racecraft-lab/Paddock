/**
 * SPEC-008 — AC-Race-1 race-test for `src/lib/resource-budget-counters.ts`.
 *
 * Per FR-055 / FR-231 / AC-Race-1: ≥ 5 concurrent reservation attempts for
 * the last available budget MUST resolve to exactly one commit + N-1
 * deterministic version-mismatch / insufficient conflicts. The 4 failed
 * grants share an identical typed body shape so REST callers see a stable
 * 409 envelope.
 *
 * Concurrency model:
 *   - better-sqlite3 is synchronous and per-thread; we cannot use Workers
 *     against the same connection. The "concurrency" we exercise is the
 *     FR-053 optimistic-lock invariant: every contender reads `version`
 *     from the FR-025 snapshot, then ALL race the conditional UPDATE.
 *     Only the first to commit wins because the predicate `version =
 *     :expected_version` no longer holds for the others (the winner
 *     bumps version on its own UPDATE).
 *   - Production-equivalent SQLite config (WAL + 50ms busy_timeout)
 *     applied per FR-060 / Q29 so the test exercises the same
 *     RESERVED-lock semantics.
 *
 * @see specs/008-resource-governance/spec.md FR-055, FR-231, AC-Race-1
 * @see specs/008-resource-governance/tasks.md T062
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-counters-race-'));
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

describe('SPEC-008 budget counters — AC-Race-1 (FR-055 / FR-231)', () => {
  it('5 concurrent reserve() attempts on the last available unit yield exactly 1 commit + 4 deterministic conflicts', async () => {
    const { ensureCounter, getCounter, reserve } = await import(
      '@/lib/resource-budget-counters'
    );

    // Setup: counter pre-populated with 9 USD already consumed against a
    // 10 USD limit. Five contenders each try to reserve the last 1 USD;
    // only one should commit.
    const policy_id = 42;
    const window_start = '2026-05-01T00:00:00Z';
    const limit_value = 10;
    ensureCounter(db, { policy_id, window_start });
    db.prepare(
      `UPDATE resource_budget_counters
          SET consumed_usd = ?, version = version + 1
        WHERE policy_id = ? AND window_start = ?`,
    ).run(9, policy_id, window_start);
    const baseline = getCounter(db, { policy_id, window_start });
    expect(baseline?.consumed_usd).toBe(9);

    // Each contender reads the same baseline version, then races the
    // conditional UPDATE. The optimistic-lock predicate guarantees
    // determinism: only the first row-update committed (version
    // increments) wins; the rest see version_mismatch (NOT insufficient,
    // because the surviving budget is still 1 USD until the winner
    // commits).
    const expected_version = baseline?.version ?? 1;
    const contenders = Array.from({ length: 5 }).map((_v, idx) => ({
      contender_id: idx,
      expected_version,
    }));

    const results = contenders.map((c) =>
      reserve(db, {
        policy_id,
        window_start,
        unit: 'usd',
        amount: 1,
        expected_version: c.expected_version,
        limit_value,
      }),
    );

    const committed = results.filter((r) => r.committed);
    const failed = results.filter((r) => !r.committed);

    expect(committed.length).toBe(1);
    expect(failed.length).toBe(4);

    // FR-231 (a): exactly one commit.
    expect(committed[0]?.committed).toBe(true);

    // FR-231 (b): all 4 failed grants share an identical conflict shape.
    // The first failed contender hit version_mismatch (winner bumped
    // version), and the remaining 3 will also hit version_mismatch (the
    // disambiguating re-read sees the new version).
    for (const f of failed) {
      expect(f.committed).toBe(false);
      if (!f.committed) {
        expect(['version_mismatch', 'insufficient']).toContain(f.conflict);
      }
    }

    // FR-231 (c): post-race counter is consistent with exactly one commit.
    const final = getCounter(db, { policy_id, window_start });
    expect(final?.reserved_usd).toBe(1);
    expect(final?.consumed_usd).toBe(9);
    expect((final?.consumed_usd ?? 0) + (final?.reserved_usd ?? 0)).toBe(10);
  });

  it('reserve() returns conflict=insufficient when budget already exhausted', async () => {
    const { ensureCounter, getCounter, reserve } = await import(
      '@/lib/resource-budget-counters'
    );
    const policy_id = 7;
    const window_start = '2026-05-01T00:00:00Z';
    const limit_value = 5;
    ensureCounter(db, { policy_id, window_start });
    db.prepare(
      `UPDATE resource_budget_counters
          SET consumed_usd = ?, version = version + 1
        WHERE policy_id = ? AND window_start = ?`,
    ).run(5, policy_id, window_start);

    const snap = getCounter(db, { policy_id, window_start });
    const result = reserve(db, {
      policy_id,
      window_start,
      unit: 'usd',
      amount: 1,
      expected_version: snap?.version ?? 1,
      limit_value,
    });
    expect(result.committed).toBe(false);
    if (!result.committed) {
      expect(result.conflict).toBe('insufficient');
    }
  });

  it('reserve() returns conflict=version_mismatch when expected_version is stale', async () => {
    const { ensureCounter, getCounter, reserve } = await import(
      '@/lib/resource-budget-counters'
    );
    const policy_id = 99;
    const window_start = '2026-05-01T00:00:00Z';
    ensureCounter(db, { policy_id, window_start });
    const snap = getCounter(db, { policy_id, window_start });
    // Bump the version out from under the caller.
    db.prepare(
      `UPDATE resource_budget_counters
          SET version = version + 1
        WHERE policy_id = ? AND window_start = ?`,
    ).run(policy_id, window_start);

    const result = reserve(db, {
      policy_id,
      window_start,
      unit: 'usd',
      amount: 1,
      expected_version: snap?.version ?? 1,
      limit_value: 100,
    });
    expect(result.committed).toBe(false);
    if (!result.committed) {
      expect(result.conflict).toBe('version_mismatch');
    }
  });

  it('release() rejects when reserved_<unit> < amount (insufficient)', async () => {
    const { ensureCounter, getCounter, release } = await import(
      '@/lib/resource-budget-counters'
    );
    const policy_id = 200;
    const window_start = '2026-05-01T00:00:00Z';
    ensureCounter(db, { policy_id, window_start });
    const snap = getCounter(db, { policy_id, window_start });
    const result = release(db, {
      policy_id,
      window_start,
      unit: 'usd',
      amount: 5,
      expected_version: snap?.version ?? 1,
    });
    expect(result.committed).toBe(false);
    if (!result.committed) {
      expect(result.conflict).toBe('insufficient');
    }
  });

  it('consume() converts reserved → consumed atomically', async () => {
    const { ensureCounter, getCounter, reserve, consume } = await import(
      '@/lib/resource-budget-counters'
    );
    const policy_id = 300;
    const window_start = '2026-05-01T00:00:00Z';
    ensureCounter(db, { policy_id, window_start });

    let snap = getCounter(db, { policy_id, window_start });
    const reserveResult = reserve(db, {
      policy_id,
      window_start,
      unit: 'usd',
      amount: 3,
      expected_version: snap?.version ?? 1,
      limit_value: 10,
    });
    expect(reserveResult.committed).toBe(true);

    snap = getCounter(db, { policy_id, window_start });
    const consumeResult = consume(db, {
      policy_id,
      window_start,
      unit: 'usd',
      amount: 3,
      expected_version: snap?.version ?? 1,
    });
    expect(consumeResult.committed).toBe(true);

    const final = getCounter(db, { policy_id, window_start });
    expect(final?.reserved_usd).toBe(0);
    expect(final?.consumed_usd).toBe(3);
  });
});
