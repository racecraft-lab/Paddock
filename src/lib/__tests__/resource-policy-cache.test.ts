/**
 * SPEC-008 — Tests for `src/lib/resource-policy-cache.ts`.
 *
 * Per FR-050 (cache atomic refresh on `policy_edited` activity row) and
 * FR-349 (max staleness ≤ 100 ms after a `policy_edited` row commits;
 * next evaluator call MUST see the new version).
 *
 * Cache surface under test:
 *   - `getCachedPolicies(db, scope)` — synchronous, deterministic.
 *   - `invalidatePolicyCache()` / `invalidatePolicyCacheForPolicy(policyId)`.
 *   - `loadPolicyCacheStats()` — for the determinism fixture (FR-349).
 *
 * The cache is keyed by `(workspace_id, project_id, agent_id, policy_type)`
 * because that's the index `idx_resource_policies_scope` (M060). Refresh is
 * atomic: a single read transaction snapshot replaces the in-memory map; no
 * partial state is observable.
 *
 * @see specs/008-resource-governance/spec.md FR-050, FR-349
 * @see specs/008-resource-governance/tasks.md T053, T054
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-policy-cache-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');

  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');

  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);

  // PRAGMA foreign_keys is OFF by default for the test DB so the
  // resource_policies.workspace_id soft FK does not block fixture inserts.
  // (Production hot-path is FR-025 read-only — FK enforcement is not
  // required for the cache contract.)
  db.pragma('foreign_keys = OFF');
});

afterEach(async () => {
  try {
    const mod = await import('@/lib/resource-policy-cache');
    mod.resetPolicyCache();
  } catch {
    // module may not have loaded yet — that's OK
  }
  try {
    const pool = await import('@/lib/db/connection-pool');
    pool.closeAllConnections();
  } catch {
    // ignore
  }
  try {
    db.close();
  } catch {
    // ignore — already closed
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function insertPolicy(
  database: Database.Database,
  args: {
    workspace_id: number | null;
    policy_type: 'wip_limit' | 'budget' | 'blackout' | 'degraded_window';
    limit_kind: string;
    enforcement: 'alert' | 'defer' | 'pause_new_work' | 'block_dispatch' | 'require_override';
    enabled?: number;
    version?: number;
    enabled_at?: string | null;
    disabled_at?: string | null;
  },
): number {
  const stmt = database.prepare(`
    INSERT INTO resource_policies
      (workspace_id, policy_type, limit_kind, enforcement, enabled, version, enabled_at, disabled_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    args.workspace_id,
    args.policy_type,
    args.limit_kind,
    args.enforcement,
    args.enabled ?? 1,
    args.version ?? 1,
    args.enabled_at ?? null,
    args.disabled_at ?? null,
  );
  return Number(result.lastInsertRowid);
}

describe('SPEC-008 resource-policy-cache — module surface', () => {
  it('exports getCachedPolicies, invalidatePolicyCache, refreshPolicyCache, loadPolicyCacheStats', async () => {
    const mod = await import('@/lib/resource-policy-cache');
    expect(typeof mod.getCachedPolicies).toBe('function');
    expect(typeof mod.invalidatePolicyCache).toBe('function');
    expect(typeof mod.refreshPolicyCache).toBe('function');
    expect(typeof mod.loadPolicyCacheStats).toBe('function');
    expect(typeof mod.resetPolicyCache).toBe('function');
  });
});

describe('SPEC-008 resource-policy-cache — determinism (FR-050)', () => {
  it('returns the same set of rows on repeated calls (no DB hit)', async () => {
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
    });

    const { getCachedPolicies, loadPolicyCacheStats } = await import(
      '@/lib/resource-policy-cache'
    );
    const first = getCachedPolicies(db, { workspace_id: 7 });
    const statsAfterFirst = loadPolicyCacheStats();
    const second = getCachedPolicies(db, { workspace_id: 7 });
    const statsAfterSecond = loadPolicyCacheStats();

    expect(first.length).toBe(1);
    expect(second.length).toBe(1);
    expect(first[0]?.id).toBe(second[0]?.id);
    // Second call MUST be a cache hit (no DB load).
    expect(statsAfterSecond.loads).toBe(statsAfterFirst.loads);
    expect(statsAfterSecond.hits).toBeGreaterThan(statsAfterFirst.hits);
  });

  it('filters by enabled=1 and respects enabled_at/disabled_at windows', async () => {
    insertPolicy(db, {
      workspace_id: 1,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
      enabled: 1,
    });
    insertPolicy(db, {
      workspace_id: 1,
      policy_type: 'budget',
      limit_kind: 'usd',
      enforcement: 'defer',
      enabled: 0,
    });
    insertPolicy(db, {
      workspace_id: 1,
      policy_type: 'budget',
      limit_kind: 'token',
      enforcement: 'defer',
      enabled: 1,
      disabled_at: '2020-01-01T00:00:00Z', // disabled in the past
    });
    insertPolicy(db, {
      workspace_id: 1,
      policy_type: 'blackout',
      limit_kind: 'window',
      enforcement: 'defer',
      enabled: 1,
      enabled_at: '2099-01-01T00:00:00Z', // not yet effective
    });

    const { getCachedPolicies } = await import('@/lib/resource-policy-cache');
    const rows = getCachedPolicies(db, { workspace_id: 1 });

    // Only the first row (enabled=1, no window restrictions) should be live.
    expect(rows.map((r) => r.policy_type)).toEqual(['wip_limit']);
  });
});

describe('SPEC-008 resource-policy-cache — atomic refresh on invalidation (FR-050)', () => {
  it('reflects new rows on the very next call after invalidation', async () => {
    insertPolicy(db, {
      workspace_id: 11,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
    });

    const { getCachedPolicies, invalidatePolicyCache } = await import(
      '@/lib/resource-policy-cache'
    );

    const before = getCachedPolicies(db, { workspace_id: 11 });
    expect(before.length).toBe(1);

    insertPolicy(db, {
      workspace_id: 11,
      policy_type: 'budget',
      limit_kind: 'usd',
      enforcement: 'defer',
    });

    // Without invalidation, we still see the prior snapshot.
    expect(getCachedPolicies(db, { workspace_id: 11 }).length).toBe(1);

    invalidatePolicyCache();
    const after = getCachedPolicies(db, { workspace_id: 11 });
    expect(after.length).toBe(2);
  });
});

describe('SPEC-008 resource-policy-cache — staleness bound (FR-349 ≤100ms)', () => {
  it('refresh under concurrent load completes within ≤100 ms staleness window', async () => {
    insertPolicy(db, {
      workspace_id: 99,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
    });

    const { getCachedPolicies, invalidatePolicyCache } = await import(
      '@/lib/resource-policy-cache'
    );
    // Prime the cache.
    expect(getCachedPolicies(db, { workspace_id: 99 }).length).toBe(1);

    // Simulate a concurrent burst of reads while a writer commits a policy edit.
    insertPolicy(db, {
      workspace_id: 99,
      policy_type: 'budget',
      limit_kind: 'usd',
      enforcement: 'defer',
    });

    const startedAt = process.hrtime.bigint();
    invalidatePolicyCache();

    // Spam reads after invalidation; ALL must observe the new row.
    let observed = 0;
    for (let i = 0; i < 50; i++) {
      const rows = getCachedPolicies(db, { workspace_id: 99 });
      if (rows.length === 2) observed++;
    }

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    // FR-349: refresh observable within 100 ms (well within scheduling jitter).
    expect(elapsedMs).toBeLessThanOrEqual(100);
    expect(observed).toBe(50);
  });
});

describe('SPEC-008 resource-policy-cache — invalidatePolicyCacheForPolicy', () => {
  it('clears the cache so the next read pulls from DB', async () => {
    const id = insertPolicy(db, {
      workspace_id: 5,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
    });

    const {
      getCachedPolicies,
      invalidatePolicyCacheForPolicy,
      loadPolicyCacheStats,
    } = await import('@/lib/resource-policy-cache');
    expect(getCachedPolicies(db, { workspace_id: 5 }).length).toBe(1);

    invalidatePolicyCacheForPolicy(id);

    const stats = loadPolicyCacheStats();
    const refreshed = getCachedPolicies(db, { workspace_id: 5 });
    expect(refreshed.length).toBe(1);
    expect(loadPolicyCacheStats().loads).toBeGreaterThan(stats.loads);
  });
});
