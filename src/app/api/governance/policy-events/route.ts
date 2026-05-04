/**
 * SPEC-008 — Policy events feed (T199).
 *
 * Per FR-040 / FR-201a. Read-only paginated feed of `resource_policy_events`
 * (state-change ledger).
 *
 * @see specs/008-resource-governance/tasks.md T199
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface PolicyEventRow {
  id: number;
  policy_id: number;
  workspace_id: number | null;
  event_kind: string;
  actor: string | null;
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
    const db = getForegroundDb();
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor');
    const cursorId = cursor === null ? Number.MAX_SAFE_INTEGER : Number.parseInt(cursor, 10);
    const rows = db
      .prepare(
        `SELECT id, policy_id, workspace_id, event_kind, actor, payload_json, captured_at
           FROM resource_policy_events
          WHERE id < ?
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(
        Number.isFinite(cursorId) ? cursorId : Number.MAX_SAFE_INTEGER,
        limit + 1,
      ) as PolicyEventRow[];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      events: slice,
      next_cursor: hasMore && slice.length > 0
        ? String(slice[slice.length - 1]?.id ?? '')
        : null,
    });
  } catch (err) {
    logRouteError('GET /api/governance/policy-events error', err);
    return jsonError(500, 'internal_error', 'failed to list policy events');
  }
}
