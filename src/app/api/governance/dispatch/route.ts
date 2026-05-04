/**
 * SPEC-008 — Dispatch decisions feed + SSE (T192).
 *
 * Per FR-090j / FR-189 / FR-208a. Read-only paginated GET that
 * returns recent dispatch decisions; SSE wiring lands in `stream`
 * route (deferred). The two surfaces share schema: each row carries
 * decision / reason_code / scope discriminators.
 *
 * @see specs/008-resource-governance/tasks.md T192
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface DispatchRow {
  id: number;
  decision_id: string;
  decision: string;
  reason: string | null;
  actor: string | null;
  workspace_id: number | null;
  captured_at: string;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  try {
    const db = getAuditDb();
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor');
    const cursorId = cursor === null ? Number.MAX_SAFE_INTEGER : Number.parseInt(cursor, 10);
    const rows = db
      .prepare(
        `SELECT id, decision_id, decision, reason, actor, workspace_id, captured_at
           FROM resource_decision_audit
          WHERE id < ?
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(
        Number.isFinite(cursorId) ? cursorId : Number.MAX_SAFE_INTEGER,
        limit + 1,
      ) as DispatchRow[];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      dispatch: slice.map((r) => ({
        id: r.id,
        decision_id: r.decision_id,
        decision: r.decision,
        reason_code: r.reason ?? 'unknown',
        actor: r.actor,
        workspace_id: r.workspace_id,
        captured_at: r.captured_at,
      })),
      next_cursor: hasMore && slice.length > 0
        ? String(slice[slice.length - 1]?.id ?? '')
        : null,
    });
  } catch (err) {
    logRouteError('GET /api/governance/dispatch error', err);
    return jsonError(500, 'internal_error', 'failed to list dispatch decisions');
  }
}
