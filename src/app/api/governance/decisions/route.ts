/**
 * SPEC-008 — Read-only decisions feed (T191).
 *
 * Per FR-215 / FR-208a. Paginated GET for the
 * `resource_decision_audit` chain. Cursor-based pagination via
 * `?cursor=<id>&limit=<n>`. Read-only — no POST/PUT/DELETE.
 *
 * @see specs/008-resource-governance/tasks.md T191
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface DecisionRow {
  id: number;
  decision_id: string;
  workspace_id: number | null;
  actor: string | null;
  decision: string;
  reason: string | null;
  payload_json: string | null;
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
    const decisionFilter = url.searchParams.get('decision');

    const where: string[] = ['id < ?'];
    const params: unknown[] = [Number.isFinite(cursorId) ? cursorId : Number.MAX_SAFE_INTEGER];
    if (decisionFilter !== null && /^[a-z_]+$/.test(decisionFilter)) {
      where.push('decision = ?');
      params.push(decisionFilter);
    }
    const rows = db
      .prepare(
        `SELECT id, decision_id, workspace_id, actor, decision, reason,
                payload_json, captured_at
           FROM resource_decision_audit
          WHERE ${where.join(' AND ')}
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(...params, limit + 1) as DecisionRow[];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && slice.length > 0
      ? String(slice[slice.length - 1]?.id ?? '')
      : null;
    return NextResponse.json({ decisions: slice, next_cursor: nextCursor });
  } catch (err) {
    logRouteError('GET /api/governance/decisions error', err);
    return jsonError(500, 'internal_error', 'failed to list decisions');
  }
}
