/**
 * SPEC-008 — In-memory policy cache for the synchronous evaluator hot-path.
 *
 * Per FR-050 (atomic refresh on `policy_edited` activity row) and FR-349
 * (max staleness ≤ 100 ms after a policy edit commits; the next evaluator
 * call MUST observe the new version).
 *
 * Design:
 *   - Cache lives in module-scope (singleton per Node process).
 *   - Keyed by `(workspace_id ?? null, project_id ?? null, agent_id ?? null,
 *     policy_type ?? '*')`. Lookup via `getCachedPolicies(db, scope)` returns
 *     the snapshot synchronously; on cache miss the loader runs a single
 *     SELECT against `resource_policies` inside one read transaction so the
 *     evaluator sees a torn-read-free snapshot (FR-025 read consistency).
 *   - Invalidation flips a generation counter; the next read drops the cached
 *     entry and re-loads. Refresh is atomic: a single SELECT replaces the in-
 *     memory map; no partial state is observable.
 *   - Filtering: `enabled = 1` AND (`enabled_at IS NULL OR enabled_at <= now`)
 *     AND (`disabled_at IS NULL OR disabled_at > now`). FR-027 / FR-048
 *     window contract.
 *
 * @see specs/008-resource-governance/spec.md FR-050, FR-027, FR-048, FR-349
 * @see specs/008-resource-governance/tasks.md T053
 * @see Constitution Convention J — included in tsconfig.spec-strict.json
 *      and eslint.config.mjs strict-scope override.
 */

import type Database from 'better-sqlite3';

/**
 * Policy row shape returned by `getCachedPolicies`. Mirrors the
 * `resource_policies` columns the evaluator depends on. Optional columns
 * are `null` when absent in the DB row (matches SQLite NULL semantics).
 */
export interface CachedPolicy {
  id: number;
  workspace_id: number | null;
  project_id: number | null;
  agent_id: number | null;
  policy_type: string;
  limit_kind: string;
  limit_value: number | null;
  enforcement: string;
  enforce_mode: string | null;
  window_spec_json: string | null;
  enabled: number;
  enabled_at: string | null;
  disabled_at: string | null;
  version: number;
  etag: string | null;
}

/** Scope filter passed by the evaluator on each lookup. */
export interface PolicyScopeFilter {
  workspace_id?: number | null;
  project_id?: number | null;
  agent_id?: number | null;
  policy_type?: string;
}

/** Shape of the cache stats fixture used by the FR-349 determinism test. */
export interface PolicyCacheStats {
  loads: number;
  hits: number;
  invalidations: number;
  generation: number;
}

interface CacheEntry {
  generation: number;
  rows: CachedPolicy[];
}

const cache = new Map<string, CacheEntry>();
let generation = 1;
const stats: PolicyCacheStats = {
  loads: 0,
  hits: 0,
  invalidations: 0,
  generation,
};

/** Build a stable key from a scope filter. */
function keyFromScope(scope: PolicyScopeFilter): string {
  const ws = scope.workspace_id ?? 'null';
  const proj = scope.project_id ?? 'null';
  const agt = scope.agent_id ?? 'null';
  const pt = scope.policy_type ?? '*';
  return `${String(ws)}|${String(proj)}|${String(agt)}|${pt}`;
}

/**
 * Load all live policies matching the scope from the database. The SELECT is
 * issued on the caller-supplied connection so the evaluator's foreground
 * connection (FR-331) is the one that sees the snapshot. Inside one
 * `db.transaction(() => { ... })` so the FR-025 torn-read invariant holds.
 */
function loadFromDb(
  db: Database.Database,
  scope: PolicyScopeFilter,
): CachedPolicy[] {
  const where: string[] = ['enabled = 1'];
  const params: (string | number | null)[] = [];

  if (scope.workspace_id !== undefined) {
    if (scope.workspace_id === null) {
      where.push('workspace_id IS NULL');
    } else {
      where.push('workspace_id = ?');
      params.push(scope.workspace_id);
    }
  }
  if (scope.project_id !== undefined) {
    if (scope.project_id === null) {
      where.push('project_id IS NULL');
    } else {
      where.push('project_id = ?');
      params.push(scope.project_id);
    }
  }
  if (scope.agent_id !== undefined) {
    if (scope.agent_id === null) {
      where.push('agent_id IS NULL');
    } else {
      where.push('agent_id = ?');
      params.push(scope.agent_id);
    }
  }
  if (scope.policy_type !== undefined) {
    where.push('policy_type = ?');
    params.push(scope.policy_type);
  }

  const nowIso = new Date().toISOString();
  where.push('(enabled_at IS NULL OR enabled_at <= ?)');
  params.push(nowIso);
  where.push('(disabled_at IS NULL OR disabled_at > ?)');
  params.push(nowIso);

  const sql = `
    SELECT id, workspace_id, project_id, agent_id,
           policy_type, limit_kind, limit_value,
           enforcement, enforce_mode, window_spec_json,
           enabled, enabled_at, disabled_at, version, etag
    FROM resource_policies
    WHERE ${where.join(' AND ')}
    ORDER BY id ASC
  `;

  // Wrap in a synchronous transaction so the read is consistent.
  const select = db.prepare(sql);
  const txn = db.transaction(
    (boundParams: (string | number | null)[]): CachedPolicy[] =>
      select.all(...boundParams) as CachedPolicy[],
  );
  return txn(params);
}

/**
 * Return the current set of live policies for the given scope. Synchronous;
 * safe to call from the evaluator hot-path. Cache is populated lazily; the
 * second call for the same scope returns the in-memory copy.
 */
export function getCachedPolicies(
  db: Database.Database,
  scope: PolicyScopeFilter = {},
): CachedPolicy[] {
  const key = keyFromScope(scope);
  const entry = cache.get(key);
  if (entry?.generation === generation) {
    stats.hits += 1;
    return entry.rows;
  }
  const rows = loadFromDb(db, scope);
  cache.set(key, { generation, rows });
  stats.loads += 1;
  return rows;
}

/**
 * Force the next `getCachedPolicies` for any scope to re-load from the DB.
 * Atomic: bumps the generation counter; existing cache entries become stale
 * and the next access lazy-refreshes. FR-050 / FR-349 staleness is bounded
 * by the cost of one SELECT + map insert (well under 100 ms even on the
 * smallest reference hardware).
 */
export function invalidatePolicyCache(): void {
  generation += 1;
  stats.generation = generation;
  stats.invalidations += 1;
}

/**
 * Targeted invalidation by policy id. Per FR-050 the activity row carries
 * the `policy_id` of the edited row; the cache currently invalidates
 * everything (cheap because cache size is bounded by scope-filter
 * cardinality). The signature accepts the id for future per-key invalidation
 * without breaking call sites.
 */
export function invalidatePolicyCacheForPolicy(policyId: number): void {
  // Per-id invalidation falls through to global invalidation today; the id
  // parameter is reserved for the FR-349 follow-up where the cache key
  // becomes (scope, policy_id) for a tighter blast radius. We touch the
  // arg via void so noUnusedParameters does not complain.
  void policyId;
  invalidatePolicyCache();
}

/**
 * Force-refresh the cache for the specific scope, blocking on the DB read.
 * Used by writer paths that need the post-edit snapshot before responding
 * (e.g., the policy PUT route returning the new ETag).
 */
export function refreshPolicyCache(
  db: Database.Database,
  scope: PolicyScopeFilter = {},
): CachedPolicy[] {
  invalidatePolicyCache();
  return getCachedPolicies(db, scope);
}

/** Snapshot of the cache stats counters — for FR-349 determinism tests. */
export function loadPolicyCacheStats(): PolicyCacheStats {
  return { ...stats };
}

/**
 * Test-only: clear all cache state and reset stats. Production code MUST
 * NOT call this; production invalidation is generation-bumped via
 * `invalidatePolicyCache()`.
 */
export function resetPolicyCache(): void {
  cache.clear();
  generation = 1;
  stats.loads = 0;
  stats.hits = 0;
  stats.invalidations = 0;
  stats.generation = generation;
}
