/**
 * SPEC-008 — Counter rebuild trigger (T196).
 *
 * Per FR-058 / FR-066. Admin-triggered rebuild of resource counters
 * from the audit chain. Writes a recovery_action audit row with kind
 * 'counter_rebuild'. The actual rebuild engine lands in a follow-up
 * task — this endpoint is the trigger surface.
 *
 * @see specs/008-resource-governance/tasks.md T196
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb } from '@/lib/db/connection-pool';
import { appendChainEntry } from '@/lib/governance-audit-chain';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

interface RequestBody {
  reason?: unknown;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;
  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }
  const reason = typeof body.reason === 'string' ? body.reason : 'admin-triggered rebuild';
  try {
    const db = getAuditDb();
    const content = {
      action: 'counter_rebuild',
      actor: auth.user.username,
      reason,
      captured_at: new Date().toISOString(),
    };
    const tx = db.transaction(() => {
      const hashes = appendChainEntry('recovery_action', content, db);
      db.prepare(
        `INSERT INTO recovery_action
           (kind, actor, scope_kind, scope_id, payload_json, prev_hash, row_hash)
         VALUES ('counter_rebuild', ?, 'evaluator', NULL, ?, ?, ?)`,
      ).run(
        auth.user.username,
        JSON.stringify(content),
        hashes.prev_hash,
        hashes.row_hash,
      );
      return hashes;
    });
    const result = tx.immediate();
    return NextResponse.json({
      ok: true,
      status: 'enqueued',
      audit_row_hash: result.row_hash,
    });
  } catch (err) {
    logRouteError('POST /api/governance/system-health/rebuild error', err);
    return jsonError(500, 'internal_error', 'failed to enqueue rebuild');
  }
}
