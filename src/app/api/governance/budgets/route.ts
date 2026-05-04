/**
 * SPEC-008 - REST collection routes for /api/governance/budgets (T076).
 *
 * Per FR-201, FR-205, FR-205a, FR-206, FR-208a. Budgets are stored in the
 * unified `resource_policies` table with `policy_type='budget'` (M060
 * CHECK constraint includes 'budget'); these routes are a thin filter
 * atop policy CRUD using `parseBudgetRequest()` for tighter monetary-bound
 * validation.
 *
 * Auth model:
 *   - GET requires viewer
 *   - POST requires operator (admin allowed via role hierarchy)
 *   - PUT / DELETE live on `[id]/route.ts`
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-205, FR-205a,
 *   FR-206, FR-208a
 * @see specs/008-resource-governance/tasks.md T076
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logGovernanceActivity,
  logRouteError,
  mutationLimiter,
  requireRole,
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
} from '@/lib/governance-route-context';
import { computeETag } from '@/lib/resource-etag';
import {
  parseBudgetRequest,
  ValidationError,
} from '@/lib/resource-validation';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface BudgetRow {
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
}

const SELECT_COLUMNS = `id, workspace_id, project_id, agent_id,
        policy_type, limit_kind, limit_value, enforcement,
        enforce_mode, window_spec_json, enabled, enabled_at,
        disabled_at, version`;

function budgetEtag(row: BudgetRow): string {
  return computeETag(row as unknown as { version: number; [k: string]: unknown });
}

function jsonError(status: number, code: string, detail: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ code, detail, ...extra }, { status });
}

function decodeCursor(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * GET /api/governance/budgets - list budgets (policy_type='budget' rows)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }

  try {
    const db = getForegroundDb();
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const scopeFilter = url.searchParams.get('scope');

    const clauses: string[] = ["policy_type = 'budget'"];
    const params: unknown[] = [];

    if (scope.workspaceIds.length > 0) {
      const placeholders = scope.workspaceIds.map(() => '?').join(', ');
      clauses.push(`(workspace_id IN (${placeholders}) OR workspace_id IS NULL)`);
      params.push(...scope.workspaceIds);
    } else {
      clauses.push('workspace_id IS NULL');
    }

    if (scopeFilter === 'facility') {
      clauses.push('workspace_id IS NULL');
    } else if (scopeFilter === 'product_line') {
      clauses.push('workspace_id IS NOT NULL');
    }

    if (cursor !== null) {
      clauses.push('id > ?');
      params.push(cursor);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const fetchSql = `SELECT ${SELECT_COLUMNS} FROM resource_policies ${whereSql} ORDER BY id ASC LIMIT ?`;
    const rows = db.prepare(fetchSql).all(...params, limit + 1) as BudgetRow[];

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = hasMore ? slice[slice.length - 1] : null;
    const nextCursor = lastRow ? lastRow.id.toString() : null;

    return NextResponse.json({
      budgets: slice,
      next_cursor: nextCursor,
    });
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(scopeErr.status, scopeErr.status === 400 ? 'bad_request' : 'forbidden', scopeErr.error);
    }
    logRouteError('GET /api/governance/budgets error', err);
    return jsonError(500, 'internal_error', 'failed to list budgets');
  }
}

/**
 * POST /api/governance/budgets - create a new budget
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  let parsed;
  try {
    parsed = parseBudgetRequest(payload);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { code: 'validation_failed', detail: err.message, issues: err.issues },
        { status: 422 },
      );
    }
    throw err;
  }

  try {
    const db = getForegroundDb();
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    const ownerWorkspaceId = scope.workspaceId;
    const targetWorkspaceId = parsed.workspace_id ?? ownerWorkspaceId;

    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO resource_policies
        (workspace_id, project_id, agent_id, policy_type, limit_kind,
         limit_value, enforcement, enforce_mode, window_spec_json,
         enabled, version, owner_workspace_id, notes, updated_by,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const result = insert.run(
        targetWorkspaceId ?? null,
        parsed.project_id ?? null,
        parsed.agent_id ?? null,
        parsed.policy_type,
        parsed.limit_kind,
        parsed.limit_value,
        parsed.enforcement,
        parsed.enforce_mode ?? 'shadow',
        parsed.window_spec_json ?? null,
        ownerWorkspaceId ?? null,
        parsed.notes ?? null,
        auth.user.username,
        now,
        now,
      );
      const id = Number(result.lastInsertRowid);
      logGovernanceActivity(db, {
        type: 'budget_created',
        entity_id: id,
        actor: auth.user.username,
        description: `Created budget ${id.toString()} (${parsed.limit_kind} ${parsed.limit_value.toString()})`,
        data: {
          limit_kind: parsed.limit_kind,
          limit_value: parsed.limit_value,
          enforcement: parsed.enforcement,
          workspace_id: targetWorkspaceId ?? null,
        },
        workspace_id: targetWorkspaceId ?? 0,
      });
      return id;
    });
    const newId = tx.immediate();

    const row = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_policies WHERE id = ?`)
      .get(newId) as BudgetRow;
    const etag = budgetEtag(row);

    return NextResponse.json(
      { budget: row },
      {
        status: 201,
        headers: {
          location: `/api/governance/budgets/${newId.toString()}`,
          etag,
        },
      },
    );
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(scopeErr.status, scopeErr.status === 400 ? 'bad_request' : 'forbidden', scopeErr.error);
    }
    logRouteError('POST /api/governance/budgets error', err);
    return jsonError(500, 'internal_error', 'failed to create budget');
  }
}
