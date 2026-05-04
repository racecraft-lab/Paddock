/**
 * SPEC-008 — Discard a quarantined raw_usage_events row (T114).
 *
 * Per FR-219i (typed-confirm discard contract).
 *
 * Operator MUST send `X-Confirm-Discard: <id>` matching the path id —
 * mismatch returns 412 Precondition Failed. Header missing returns 400.
 *
 * On success, the row is DELETEd from raw_usage_events and an audit
 * row is appended to `governance_health_events`.
 *
 * Auth: requireRole admin (discard is destructive). Mutation rate-limited.
 *
 * 200 response:
 *   { ok: true, id, deleted_status, health_event_id }
 *
 * 4xx contract:
 *   400 invalid_id              — id is not a positive integer
 *   400 missing_confirm_header  — X-Confirm-Discard header missing
 *   401 unauthorized
 *   403 forbidden
 *   404 not_found               — no row with that id
 *   412 confirm_mismatch        — header value != path id
 *   429 rate_limited
 *   500 internal_error
 *
 * @see specs/008-resource-governance/spec.md FR-219i
 * @see specs/008-resource-governance/tasks.md T114
 * @see Constitution Convention J — strict-scope module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }

  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const { id: rawId } = await ctx.params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, 'invalid_id', '`id` must be a positive integer');
  }

  const confirmHeader = request.headers.get('x-confirm-discard');
  if (confirmHeader === null || confirmHeader.trim() === '') {
    return jsonError(400, 'missing_confirm_header', 'X-Confirm-Discard header is required');
  }
  if (confirmHeader.trim() !== String(id)) {
    return jsonError(412, 'confirm_mismatch', `X-Confirm-Discard must equal '${String(id)}', got '${confirmHeader.trim()}'`);
  }

  try {
    const db = getForegroundDb();

    const row = db
      .prepare(`SELECT id, reconcile_status FROM raw_usage_events WHERE id = ?`)
      .get(id) as { id: number; reconcile_status: string } | undefined;
    if (row === undefined) {
      return jsonError(404, 'not_found', `no raw_usage_events row with id=${String(id)}`);
    }

    let healthEventId = 0;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM raw_usage_events WHERE id = ?`).run(id);
      const auditResult = db
        .prepare(
          `INSERT INTO governance_health_events (component, state, metric_json)
           VALUES (?, ?, ?)`,
        )
        .run(
          'quarantine',
          'discarded',
          JSON.stringify({
            raw_event_id: id,
            actor: auth.user.username,
            prior_status: row.reconcile_status,
          }),
        );
      healthEventId = Number(auditResult.lastInsertRowid);
    });
    tx.immediate();

    return NextResponse.json(
      {
        ok: true,
        id,
        deleted_status: row.reconcile_status,
        health_event_id: healthEventId,
      },
      { status: 200 },
    );
  } catch (err) {
    logRouteError('POST /api/governance/quarantine/[id]/discard error', err);
    return jsonError(500, 'internal_error', 'failed to discard quarantined row');
  }
}
