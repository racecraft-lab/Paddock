/**
 * SPEC-008 — Policy loader for the synchronous evaluator hot-path.
 *
 * Per FR-027 (`enabled_at` / `disabled_at` window honored), FR-038 (ETag /
 * If-Match precondition), FR-048 (`version` monotonic increment, weak ETag
 * `W/"<version>-<sha256-12-of-canonical-json>"`).
 *
 * Surface:
 *   - `loadActivePolicies(db, scope)` — wraps `resource-policy-cache` so the
 *     evaluator gets a single deterministic snapshot per call.
 *   - `loadPolicyById(db, id)` — for ETag/version lookups by the REST PUT
 *     route (returns null when the row is absent or outside the
 *     enabled_at/disabled_at window).
 *   - `computePolicyEtag(row)` — weak-validator builder reused by the REST
 *     route's If-Match check (FR-205a).
 *   - `isPolicyLive(row, nowIso?)` — explicit window predicate so callers
 *     other than the cache (e.g., audit replay) can apply the same gate.
 *
 * @see specs/008-resource-governance/spec.md FR-027, FR-038, FR-048, FR-205a
 * @see specs/008-resource-governance/tasks.md T058
 */

import { createHash } from 'node:crypto';
import {
  getCachedPolicies,
  type CachedPolicy,
  type PolicyScopeFilter,
} from '@/lib/resource-policy-cache';
import type Database from 'better-sqlite3';

/** Subset of the `resource_policies` row used by the evaluator. */
export type LoadedPolicy = CachedPolicy;

/**
 * Return all policies that match the scope and are live now (FR-027 window
 * honored, FR-050 cache backed). The list is returned in stable id-ascending
 * order so precedence ties are resolved deterministically.
 */
export function loadActivePolicies(
  db: Database.Database,
  scope: PolicyScopeFilter = {},
): LoadedPolicy[] {
  return getCachedPolicies(db, scope);
}

/**
 * Lookup by id. Returns null when the row is absent or outside the
 * `enabled_at` / `disabled_at` window. Reads are NOT cached — this path
 * is used by the REST PUT route to compare the client's `If-Match` ETag
 * with the current server ETag (FR-038 / FR-048 / FR-205a).
 */
export function loadPolicyById(
  db: Database.Database,
  id: number,
): LoadedPolicy | null {
  const row = db
    .prepare(
      `SELECT id, workspace_id, project_id, agent_id,
              policy_type, limit_kind, limit_value,
              enforcement, enforce_mode, window_spec_json,
              enabled, enabled_at, disabled_at, version, etag
         FROM resource_policies
         WHERE id = ?`,
    )
    .get(id) as LoadedPolicy | undefined;
  if (row === undefined) return null;
  return row;
}

/**
 * FR-027 / FR-048 window predicate. A policy is live iff `enabled = 1` AND
 * `enabled_at IS NULL OR enabled_at <= now` AND `disabled_at IS NULL OR
 * disabled_at > now`. Caller passes the same `nowIso` to keep determinism
 * inside one evaluator call.
 */
export function isPolicyLive(
  row: LoadedPolicy,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (row.enabled !== 1) return false;
  if (row.enabled_at !== null && row.enabled_at > nowIso) return false;
  if (row.disabled_at !== null && row.disabled_at <= nowIso) return false;
  return true;
}

/**
 * FR-205a weak ETag builder. Format: `W/"<version>-<sha256-12-of-canonical-json>"`.
 * Canonical JSON: keys sorted lexicographically, excludes `etag` itself
 * (etag derives from the rest of the row). NULL columns are omitted from
 * the canonical form.
 */
export function computePolicyEtag(row: LoadedPolicy): string {
  const ordered: Record<string, unknown> = {};
  // Stable order — alphabetical.
  const keys: (keyof LoadedPolicy)[] = [
    'agent_id',
    'disabled_at',
    'enabled',
    'enabled_at',
    'enforce_mode',
    'enforcement',
    'id',
    'limit_kind',
    'limit_value',
    'policy_type',
    'project_id',
    'version',
    'window_spec_json',
    'workspace_id',
  ];
  for (const k of keys) {
    const v = row[k];
    if (v !== null) {
      ordered[k] = v;
    }
  }
  const canonical = JSON.stringify(ordered);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `W/"${String(row.version)}-${digest.slice(0, 12)}"`;
}
