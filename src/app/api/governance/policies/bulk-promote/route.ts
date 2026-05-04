/**
 * SPEC-008 — Bulk policy promotion (T197).
 *
 * Per FR-090h / FR-090h-i / FR-090h-ii / FR-267 / FR-268. Typed-
 * confirmation phrase + Idempotency-Key + maxItems=500 + cross-
 * workspace reject.
 *
 * @see specs/008-resource-governance/tasks.md T197
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

const MAX_ITEMS = 500;
const PHRASE_PATTERN = /^PROMOTE \d+ POLICIES$/;

interface RequestBody {
  policy_ids?: unknown;
  target_workspace_id?: unknown;
  confirmation_phrase?: unknown;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

interface PolicyOwnerRow {
  id: number;
  workspace_id: number | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  const idemKey = request.headers.get('idempotency-key');
  if (idemKey === null || idemKey.trim() === '') {
    return jsonError(400, 'idempotency_key_required', 'Idempotency-Key header required');
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  const ids = Array.isArray(body.policy_ids) ? (body.policy_ids as unknown[]) : null;
  if (ids === null || ids.length === 0) {
    return jsonError(422, 'validation_failed', 'policy_ids must be a non-empty array');
  }
  if (ids.length > MAX_ITEMS) {
    return jsonError(422, 'too_many_items', `policy_ids exceeds maxItems=${String(MAX_ITEMS)}`);
  }
  if (!ids.every((v): v is number => typeof v === 'number' && Number.isInteger(v))) {
    return jsonError(422, 'validation_failed', 'policy_ids must be integers');
  }
  const target = body.target_workspace_id;
  if (typeof target !== 'number' || !Number.isInteger(target)) {
    return jsonError(422, 'validation_failed', 'target_workspace_id required');
  }
  if (typeof body.confirmation_phrase !== 'string' || !PHRASE_PATTERN.test(body.confirmation_phrase)) {
    return jsonError(422, 'gesture_mismatch', 'confirmation_phrase must match "PROMOTE N POLICIES"');
  }
  const expected = `PROMOTE ${String(ids.length)} POLICIES`;
  if (body.confirmation_phrase !== expected) {
    return jsonError(422, 'gesture_mismatch', `confirmation_phrase must equal "${expected}"`);
  }

  try {
    const db = getForegroundDb();
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT id, workspace_id FROM resource_policies WHERE id IN (${placeholders})`)
      .all(...ids) as PolicyOwnerRow[];
    if (rows.length !== ids.length) {
      return jsonError(404, 'policy_not_found', 'one or more policy ids not found');
    }
    const sourceWorkspaces = new Set(rows.map((r) => r.workspace_id));
    if (sourceWorkspaces.size > 1) {
      return jsonError(422, 'cross_workspace_promotion', 'all policies must share a source workspace');
    }
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      const update = db.prepare(
        `UPDATE resource_policies
            SET workspace_id = ?,
                version = version + 1,
                updated_at = ?,
                updated_by = ?
          WHERE id = ?`,
      );
      let changed = 0;
      for (const id of ids) {
        const r = update.run(target, now, auth.user.username, id);
        changed += r.changes;
      }
      return changed;
    });
    const promoted = tx.immediate();
    return NextResponse.json({
      ok: true,
      promoted,
      target_workspace_id: target,
      idempotency_key: idemKey,
    });
  } catch (err) {
    logRouteError('POST /api/governance/policies/bulk-promote error', err);
    return jsonError(500, 'internal_error', 'failed to promote policies');
  }
}
