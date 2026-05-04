/**
 * SPEC-008 — Quarantined raw_usage_events listing (T114).
 *
 * Per FR-219h (operator quarantine surface), FR-219i (typed-confirm
 * discard).
 *
 * `GET /api/governance/quarantine` — list raw_usage_events rows whose
 * `reconcile_status` is `'quarantined'` (or `'schema_broken'` /
 * `'schema_malicious'`). Default page size 50, cursor pagination.
 * Auth: viewer.
 *
 * Response:
 *   { items: RawUsageEvent[], next_cursor: string | null }
 *
 * @see specs/008-resource-governance/spec.md FR-219h, FR-219i
 * @see specs/008-resource-governance/tasks.md T114
 * @see Constitution Convention J — strict-scope module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import { logRouteError, requireRole } from '@/lib/governance-route-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SELECT_COLUMNS = `id, source_id, workspace_id, agent_id, task_id,
  provider, provider_request_id, provider_timestamp_ms, session_id,
  raw_attributes_json, parser_version, schema_version_observed,
  reconcile_status, dedupe_confidence, enforcement_eligibility,
  partition_month, ingested_at`;

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
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

// Next.js App Router signature requires `async` for route handlers; the
// body has no awaitable IO but this contract is non-negotiable.
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
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const params: unknown[] = [];
    let where = `reconcile_status IN ('quarantined','schema_broken','schema_malicious')`;
    if (cursor !== null) {
      where += ` AND id > ?`;
      params.push(cursor);
    }
    const sql = `SELECT ${SELECT_COLUMNS} FROM raw_usage_events
                 WHERE ${where}
                 ORDER BY id ASC
                 LIMIT ?`;
    params.push(limit + 1);
    const rows = db.prepare(sql).all(...params) as { id: number; [k: string]: unknown }[];

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = hasMore ? slice[slice.length - 1] : null;
    const nextCursor = lastRow !== undefined && lastRow !== null ? String(lastRow.id) : null;

    return NextResponse.json({
      items: slice,
      next_cursor: nextCursor,
    });
  } catch (err) {
    logRouteError('GET /api/governance/quarantine error', err);
    return jsonError(500, 'internal_error', 'failed to list quarantined rows');
  }
}
