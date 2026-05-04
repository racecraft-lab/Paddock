/**
 * SPEC-008 — Governance resource resolver with 404-vs-403 split (T150).
 *
 * Per FR-219g, FR-211, FR-219l. The disambiguation rule:
 *
 *   - Cross-workspace resource access (record exists, actor not
 *     authorized for the row's workspace) → 404. NEVER 403, to prevent
 *     enumeration of cross-workspace resources.
 *   - In-workspace access denied (record exists, actor authenticated
 *     and same workspace, but lacks role) → 403.
 *   - Truly absent records → 404.
 *
 * `resolveResourceOrError(...)` reads one row by id and applies the
 * three-way decision matrix. Routes call this BEFORE any state-mutation
 * logic so the response is uniform. The activity-row middleware (T152)
 * distinguishes the cases for operator forensics via the FR-217 row.
 *
 * Workspace derivation:
 *   - For tables with a `workspace_id` column (resource_policies,
 *     resource_reservations, etc.): use that column directly.
 *   - For `resource_overrides` (M65h has scope_kind/scope_id, not
 *     workspace_id): derive workspace from the policy_id JOIN when
 *     scope_kind='workspace' the scope_id IS the workspace_id;
 *     otherwise NULL → treated as facility-scope, accessible to
 *     facility-scoped callers only.
 *
 * @see specs/008-resource-governance/spec.md FR-219g, FR-211, FR-219l
 * @see specs/008-resource-governance/tasks.md T150
 */

import type Database from 'better-sqlite3';

/** Result envelope for the disambiguation. */
export type ResourceResolveResult<TRow> =
  | { found: true; row: TRow; workspace_id: number | null }
  | { found: false; code: 404 | 403 };

/** Caller-supplied workspace context. */
export interface ResolverScope {
  /** Workspace ids the caller is authorized to read. Empty = facility-only. */
  workspaceIds: readonly number[];
  /** True if the caller's scope is a Facility (sees facility-only rows). */
  isFacility: boolean;
}

/**
 * Generic resolver for tables with a direct `workspace_id` column. Returns
 * `{found:true, row, workspace_id}` when the row exists AND is
 * accessible, or a typed error envelope otherwise.
 *
 * Decision matrix:
 *   - row absent          → {found:false, code:404}
 *   - row.workspace_id IS NULL (facility row):
 *       - caller is facility-scoped → {found:true,...}
 *       - caller is product-line     → {found:false, code:404} (no leak)
 *   - row.workspace_id matches caller's workspaceIds → {found:true,...}
 *   - row.workspace_id mismatched (cross-workspace)  → {found:false, code:404}
 */
export function resolveResourceOrError<TRow extends { workspace_id: number | null }>(
  db: Database.Database,
  table: string,
  id: number,
  scope: ResolverScope,
  selectColumns = '*',
): ResourceResolveResult<TRow> {
  // Whitelist the table name — this is interpolated into the SQL
  // verbatim; only known governance tables are accepted to prevent
  // injection from a buggy caller.
  if (!isWhitelistedGovernanceTable(table)) {
    return { found: false, code: 404 };
  }
  const row = db
    .prepare(`SELECT ${selectColumns} FROM ${table} WHERE id = ?`)
    .get(id) as TRow | undefined;
  if (row === undefined) return { found: false, code: 404 };

  const wsId = row.workspace_id;
  if (wsId === null) {
    // Facility-scoped row.
    if (scope.isFacility) return { found: true, row, workspace_id: null };
    return { found: false, code: 404 };
  }

  if (scope.workspaceIds.includes(wsId)) {
    return { found: true, row, workspace_id: wsId };
  }
  // Cross-workspace — return 404 per FR-219g (never 403, to prevent enumeration).
  return { found: false, code: 404 };
}

/**
 * Specialized resolver for `resource_overrides` (M65h). The table has
 * no direct `workspace_id`; we derive the effective workspace from
 * scope_kind / scope_id (when scope_kind='workspace', scope_id IS the
 * workspace id) or fall back to NULL (facility-scoped).
 */
export function resolveOverrideRowOrError<
  TRow extends { scope_kind: string; scope_id: number | null }
>(
  db: Database.Database,
  id: number,
  scope: ResolverScope,
  selectColumns = '*',
): ResourceResolveResult<TRow> {
  const row = db
    .prepare(`SELECT ${selectColumns} FROM resource_overrides WHERE id = ?`)
    .get(id) as TRow | undefined;
  if (row === undefined) return { found: false, code: 404 };

  const wsId =
    row.scope_kind === 'workspace' ? row.scope_id : null;
  if (wsId === null) {
    if (scope.isFacility) return { found: true, row, workspace_id: null };
    return { found: false, code: 404 };
  }
  if (scope.workspaceIds.includes(wsId)) {
    return { found: true, row, workspace_id: wsId };
  }
  return { found: false, code: 404 };
}

/** Whitelist of governance tables this resolver accepts. */
const GOVERNANCE_TABLES = new Set<string>([
  'resource_policies',
  'resource_budget_counters',
  'resource_reservations',
  'resource_overrides',
  'resource_window_instances',
  'aegis_emergency_reserves',
  'quarantined_raw_events',
]);

function isWhitelistedGovernanceTable(name: string): boolean {
  return GOVERNANCE_TABLES.has(name);
}
