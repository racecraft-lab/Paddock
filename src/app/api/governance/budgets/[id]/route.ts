/**
 * SPEC-008 - REST per-id routes for /api/governance/budgets/[id] (T076).
 *
 * Per FR-201, FR-205 (If-Match required on PUT), FR-205a (412 body shape),
 * FR-206, FR-208a. Budgets live in the unified `resource_policies` table
 * with `policy_type='budget'`; routes that target a non-budget id return
 * 404 (the surface MUST NOT cross-update non-budget rows).
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
  workspaceScopeError,
} from '@/lib/governance-route-context';
import { computeETag, validateIfMatch } from '@/lib/resource-etag';
import {
  parseBudgetRequest,
  ValidationError,
} from '@/lib/resource-validation';

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

function budgetEtag(row: BudgetRow): string {
  return computeETag(row as unknown as { version: number; [k: string]: unknown });
}

function jsonError(status: number, code: string, detail: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ code, detail, ...extra }, { status });
}

async function readId(ctx: RouteParams): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number.parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function loadBudget(db: ReturnType<typeof getForegroundDb>, id: number): BudgetRow | null {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM resource_policies
       WHERE id = ? AND policy_type = 'budget'`,
    )
    .get(id) as BudgetRow | undefined;
  return row ?? null;
}

/**
 * GET /api/governance/budgets/[id]
 */
export async function GET(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const id = await readId(ctx);
  if (id === null) return jsonError(400, 'invalid_id', 'id must be a positive integer');
  try {
    const db = getForegroundDb();
    const row = loadBudget(db, id);
    if (row === null) return jsonError(404, 'not_found', 'budget not found');
    return NextResponse.json({ budget: row }, { headers: { etag: budgetEtag(row) } });
  } catch (err) {
    logRouteError('GET /api/governance/budgets/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to read budget');
  }
}

/**
 * PUT /api/governance/budgets/[id] - update with If-Match
 */
export async function PUT(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const id = await readId(ctx);
  if (id === null) return jsonError(400, 'invalid_id', 'id must be a positive integer');

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
    const current = loadBudget(db, id);
    if (current === null) return jsonError(404, 'not_found', 'budget not found');

    const ifMatch = request.headers.get('if-match');
    const guard = validateIfMatch(ifMatch, current as unknown as { version: number; [k: string]: unknown });
    if (!guard.ok) {
      return NextResponse.json(guard.body, { status: guard.code });
    }

    const now = new Date().toISOString();
    const update = db.prepare(`
      UPDATE resource_policies
      SET workspace_id = ?,
          project_id = ?,
          agent_id = ?,
          limit_kind = ?,
          limit_value = ?,
          enforcement = ?,
          enforce_mode = ?,
          window_spec_json = ?,
          notes = ?,
          updated_by = ?,
          updated_at = ?,
          version = version + 1
      WHERE id = ? AND policy_type = 'budget'
    `);
    const tx = db.transaction(() => {
      update.run(
        parsed.workspace_id ?? current.workspace_id,
        parsed.project_id ?? current.project_id,
        parsed.agent_id ?? current.agent_id,
        parsed.limit_kind,
        parsed.limit_value,
        parsed.enforcement,
        parsed.enforce_mode ?? current.enforce_mode ?? 'shadow',
        parsed.window_spec_json ?? current.window_spec_json,
        parsed.notes ?? null,
        auth.user.username,
        now,
        id,
      );
      logGovernanceActivity(db, {
        type: 'budget_edited',
        entity_id: id,
        actor: auth.user.username,
        description: `Edited budget ${id.toString()}`,
        data: {
          before_version: current.version,
          after_version: current.version + 1,
        },
        workspace_id: current.workspace_id ?? 0,
      });
    });
    tx.immediate();

    const updated = loadBudget(db, id);
    if (updated === null) return jsonError(500, 'internal_error', 'budget disappeared after update');
    return NextResponse.json({ budget: updated }, { headers: { etag: budgetEtag(updated) } });
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(scopeErr.status, scopeErr.status === 400 ? 'bad_request' : 'forbidden', scopeErr.error);
    }
    logRouteError('PUT /api/governance/budgets/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to update budget');
  }
}

/**
 * DELETE /api/governance/budgets/[id] - soft delete (admin-only)
 */
export async function DELETE(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const id = await readId(ctx);
  if (id === null) return jsonError(400, 'invalid_id', 'id must be a positive integer');

  try {
    const db = getForegroundDb();
    const current = loadBudget(db, id);
    if (current === null) return jsonError(404, 'not_found', 'budget not found');

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE resource_policies
         SET disabled_at = ?, version = version + 1, updated_at = ?, updated_by = ?
         WHERE id = ? AND policy_type = 'budget'`,
      ).run(now, now, auth.user.username, id);
      logGovernanceActivity(db, {
        type: 'budget_disabled',
        entity_id: id,
        actor: auth.user.username,
        description: `Soft-deleted budget ${id.toString()}`,
        data: {
          before_version: current.version,
          after_version: current.version + 1,
          disabled_at: now,
        },
        workspace_id: current.workspace_id ?? 0,
      });
    });
    tx.immediate();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logRouteError('DELETE /api/governance/budgets/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to delete budget');
  }
}
