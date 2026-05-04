/**
 * SPEC-008 — Read-only audit log feed (T198).
 *
 * Per FR-201. Returns paginated audit-chain rows for forensic review.
 * Read-only.
 *
 * @see specs/008-resource-governance/tasks.md T198
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface AuditRow {
  id: number;
  decision_id: string;
  actor: string | null;
  decision: string;
  reason: string | null;
  captured_at: string;
  row_hash: string;
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
        `SELECT id, decision_id, actor, decision, reason, captured_at, row_hash
           FROM resource_decision_audit
          WHERE id < ?
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(
        Number.isFinite(cursorId) ? cursorId : Number.MAX_SAFE_INTEGER,
        limit + 1,
      ) as AuditRow[];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      audit: slice,
      next_cursor: hasMore && slice.length > 0
        ? String(slice[slice.length - 1]?.id ?? '')
        : null,
    });
  } catch (err) {
    logRouteError('GET /api/governance/audit error', err);
    return jsonError(500, 'internal_error', 'failed to list audit rows');
  }
}
