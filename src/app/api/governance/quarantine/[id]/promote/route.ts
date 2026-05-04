/**
 * SPEC-008 — Promote a quarantined raw_usage_events row (T114).
 *
 * Per FR-219h. POST flips `reconcile_status` from
 * `quarantined`/`schema_broken`/`schema_malicious` back to `ok` so
 * the reconciler picks the row up on its next pass.
 *
 * Auth: requireRole admin|operator. Mutation rate-limited.
 *
 * 200 response:
 *   { ok: true, id, prior_status, health_event_id }
 *
 * 4xx contract:
 *   400 invalid_id     — id is not a positive integer
 *   401 unauthorized
 *   403 forbidden
 *   404 not_found      — no row with that id
 *   409 not_quarantined — row's reconcile_status is already 'ok'
 *   429 rate_limited
 *   500 internal_error
 *
 * @see specs/008-resource-governance/spec.md FR-219h
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
  const auth = requireRole(request, 'operator');
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

  try {
    const db = getForegroundDb();

    const row = db
      .prepare(`SELECT id, reconcile_status FROM raw_usage_events WHERE id = ?`)
      .get(id) as { id: number; reconcile_status: string } | undefined;
    if (row === undefined) {
      return jsonError(404, 'not_found', `no raw_usage_events row with id=${String(id)}`);
    }
    if (row.reconcile_status === 'ok') {
      return jsonError(409, 'not_quarantined', `row id=${String(id)} already has reconcile_status='ok'`);
    }

    let healthEventId = 0;
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE raw_usage_events
            SET reconcile_status = 'ok'
          WHERE id = ?`,
      ).run(id);
      const auditResult = db
        .prepare(
          `INSERT INTO governance_health_events (component, state, metric_json)
           VALUES (?, ?, ?)`,
        )
        .run(
          'quarantine',
          'promoted',
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
      { ok: true, id, prior_status: row.reconcile_status, health_event_id: healthEventId },
      { status: 200 },
    );
  } catch (err) {
    logRouteError('POST /api/governance/quarantine/[id]/promote error', err);
    return jsonError(500, 'internal_error', 'failed to promote quarantined row');
  }
}
