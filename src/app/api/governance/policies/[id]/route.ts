/**
 * SPEC-008 - REST per-id routes for /api/governance/policies/[id] (T074).
 *
 * Per FR-201, FR-205 (If-Match required on PUT), FR-205a (412 body shape),
 * FR-206, FR-208a, FR-219g, FR-219l. DELETE is a soft-delete: it sets
 * `disabled_at = now()` and bumps `version` (FR-027 window predicate
 * treats `disabled_at <= now` as inactive).
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-205, FR-205a,
 *   FR-206, FR-208a, FR-219g, FR-219l
 * @see specs/008-resource-governance/tasks.md T074
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
  parsePolicyRequest,
  ValidationError,
} from '@/lib/resource-validation';

interface PolicyRow {
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
  notes: string | null;
}

const SELECT_COLUMNS = `id, workspace_id, project_id, agent_id,
        policy_type, limit_kind, limit_value, enforcement,
        enforce_mode, window_spec_json, enabled, enabled_at,
        disabled_at, version, notes`;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function policyEtag(row: PolicyRow): string {
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

function loadRow(db: ReturnType<typeof getForegroundDb>, id: number): PolicyRow | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_policies WHERE id = ?`)
    .get(id) as PolicyRow | undefined;
  return row ?? null;
}

/**
 * GET /api/governance/policies/[id]
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
    const row = loadRow(db, id);
    if (row === null) return jsonError(404, 'not_found', 'policy not found');
    return NextResponse.json({ policy: row }, { headers: { etag: policyEtag(row) } });
  } catch (err) {
    logRouteError('GET /api/governance/policies/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to read policy');
  }
}

/**
 * PUT /api/governance/policies/[id] - update with If-Match
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
    parsed = parsePolicyRequest(payload);
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
    const current = loadRow(db, id);
    if (current === null) return jsonError(404, 'not_found', 'policy not found');

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
          policy_type = ?,
          limit_kind = ?,
          limit_value = ?,
          enforcement = ?,
          enforce_mode = ?,
          window_spec_json = ?,
          notes = ?,
          updated_by = ?,
          updated_at = ?,
          version = version + 1
      WHERE id = ?
    `);
    const tx = db.transaction(() => {
      update.run(
        parsed.workspace_id ?? current.workspace_id,
        parsed.project_id ?? current.project_id,
        parsed.agent_id ?? current.agent_id,
        parsed.policy_type,
        parsed.limit_kind,
        parsed.limit_value ?? current.limit_value,
        parsed.enforcement,
        parsed.enforce_mode ?? current.enforce_mode ?? 'shadow',
        parsed.window_spec_json ?? current.window_spec_json,
        parsed.notes ?? null,
        auth.user.username,
        now,
        id,
      );
      logGovernanceActivity(db, {
        type: 'policy_edited',
        entity_id: id,
        actor: auth.user.username,
        description: `Edited policy ${id.toString()}`,
        data: {
          before_version: current.version,
          after_version: current.version + 1,
        },
        workspace_id: current.workspace_id ?? 0,
      });
    });
    tx.immediate();

    const updated = loadRow(db, id);
    if (updated === null) return jsonError(500, 'internal_error', 'policy disappeared after update');
    return NextResponse.json({ policy: updated }, { headers: { etag: policyEtag(updated) } });
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(scopeErr.status, scopeErr.status === 400 ? 'bad_request' : 'forbidden', scopeErr.error);
    }
    logRouteError('PUT /api/governance/policies/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to update policy');
  }
}

/**
 * DELETE /api/governance/policies/[id] - soft delete (admin-only)
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
    const current = loadRow(db, id);
    if (current === null) return jsonError(404, 'not_found', 'policy not found');

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE resource_policies
         SET disabled_at = ?, version = version + 1, updated_at = ?, updated_by = ?
         WHERE id = ?`,
      ).run(now, now, auth.user.username, id);
      logGovernanceActivity(db, {
        type: 'policy_disabled',
        entity_id: id,
        actor: auth.user.username,
        description: `Soft-deleted policy ${id.toString()}`,
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
    logRouteError('DELETE /api/governance/policies/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to delete policy');
  }
}
