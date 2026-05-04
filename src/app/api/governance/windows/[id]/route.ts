/**
 * SPEC-008 — Single-window REST routes (T190 — [id]).
 *
 * GET /api/governance/windows/:id  (viewer+)
 * PUT /api/governance/windows/:id  (operator+, If-Match required)
 * DELETE /api/governance/windows/:id (operator+)
 *
 * @see specs/008-resource-governance/tasks.md T190
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { computeETag } from '@/lib/resource-etag';

interface WindowRow {
  id: number;
  workspace_id: number | null;
  policy_type: string;
  enforcement: string;
  enforce_mode: string | null;
  window_spec_json: string | null;
  enabled: number;
  version: number;
}

const SELECT_COLUMNS = `id, workspace_id, policy_type,
       enforcement, enforce_mode, window_spec_json, enabled, version`;

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

function loadWindow(id: number): WindowRow | undefined {
  return getForegroundDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_policies WHERE id = ?`)
    .get(id) as WindowRow | undefined;
}

export async function GET(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const { id: idParam } = await ctx.params;
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }
  try {
    const row = loadWindow(id);
    if (row === undefined) return jsonError(404, 'not_found', 'window not found');
    const etag = computeETag(row as unknown as { version: number; [k: string]: unknown });
    return NextResponse.json(
      { window: row },
      { headers: { etag } },
    );
  } catch (err) {
    logRouteError('GET /api/governance/windows/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to load window');
  }
}

interface WindowPutBody {
  enforcement?: string;
  window_spec_json?: string | null;
  enabled?: boolean;
}

export async function PUT(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;
  const { id: idParam } = await ctx.params;
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }
  const ifMatch = request.headers.get('if-match');
  if (ifMatch === null || ifMatch.trim() === '') {
    return jsonError(428, 'precondition_required', 'If-Match header required');
  }
  let body: WindowPutBody;
  try {
    body = (await request.json()) as WindowPutBody;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }
  try {
    const db = getForegroundDb();
    const before = loadWindow(id);
    if (before === undefined) return jsonError(404, 'not_found', 'window not found');
    const expectedEtag = computeETag(before as unknown as { version: number; [k: string]: unknown });
    if (expectedEtag !== ifMatch) {
      return jsonError(412, 'precondition_failed', 'If-Match did not match current ETag');
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE resource_policies
          SET enforcement = COALESCE(?, enforcement),
              window_spec_json = COALESCE(?, window_spec_json),
              enabled = COALESCE(?, enabled),
              version = version + 1,
              updated_at = ?,
              updated_by = ?
        WHERE id = ?`,
    ).run(
      body.enforcement ?? null,
      body.window_spec_json === undefined ? null : body.window_spec_json,
      body.enabled === undefined ? null : body.enabled ? 1 : 0,
      now,
      auth.user.username,
      id,
    );
    const updatedMaybe = loadWindow(id);
    if (updatedMaybe === undefined) {
      return jsonError(500, 'internal_error', 'window vanished after update');
    }
    const updated = updatedMaybe;
    const newEtag = computeETag(updated as unknown as { version: number; [k: string]: unknown });
    return NextResponse.json({ window: updated }, { headers: { etag: newEtag } });
  } catch (err) {
    logRouteError('PUT /api/governance/windows/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to update window');
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;
  const { id: idParam } = await ctx.params;
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }
  try {
    const db = getForegroundDb();
    const result = db
      .prepare(`DELETE FROM resource_policies WHERE id = ? AND policy_type IN ('blackout','degraded_window')`)
      .run(id);
    if (result.changes === 0) {
      return jsonError(404, 'not_found', 'window not found');
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logRouteError('DELETE /api/governance/windows/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to delete window');
  }
}
