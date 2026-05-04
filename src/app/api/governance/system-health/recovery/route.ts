/**
 * SPEC-008 — Recovery gesture endpoint (T195).
 *
 * Per FR-090i / FR-199. Accepts the typed gesture matrix and writes
 * a recovery_action audit row. Admin-only.
 *
 * @see specs/008-resource-governance/tasks.md T195
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb } from '@/lib/db/connection-pool';
import { appendChainEntry } from '@/lib/governance-audit-chain';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

const ALLOWED_ACTIONS = new Set([
  'breaker_reset',
  'reservation_reaper_force_run',
  'counter_rebuild_restart',
  'reconciler_retry',
  'audit_chain_verify',
  'collector_rotate_key',
]);

const ACTION_PHRASE: Record<string, string> = {
  breaker_reset: 'CONFIRM RESET BREAKER',
  reservation_reaper_force_run: 'CONFIRM FORCE RUN REAPER',
  counter_rebuild_restart: 'CONFIRM RESTART REBUILD',
  reconciler_retry: 'CONFIRM RETRY RECONCILER',
  audit_chain_verify: 'CONFIRM VERIFY AUDIT CHAIN',
  collector_rotate_key: 'CONFIRM ROTATE COLLECTOR KEY',
};

interface RequestBody {
  action?: unknown;
  typed?: unknown;
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
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }
  const action = typeof body.action === 'string' ? body.action : '';
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonError(422, 'validation_failed', 'action must be one of the FR-090i gesture matrix');
  }
  const expectedPhrase = ACTION_PHRASE[action];
  if (typeof body.typed !== 'string' || body.typed !== expectedPhrase) {
    return jsonError(422, 'gesture_mismatch', `typed phrase must equal ${expectedPhrase ?? ''}`);
  }
  if (typeof body.reason !== 'string' || body.reason.trim() === '') {
    return jsonError(422, 'validation_failed', 'reason is required');
  }
  try {
    const db = getAuditDb();
    const content = {
      action,
      actor: auth.user.username,
      reason: body.reason,
      captured_at: new Date().toISOString(),
    };
    const tx = db.transaction(() => {
      const hashes = appendChainEntry('recovery_action', content, db);
      db.prepare(
        `INSERT INTO recovery_action
           (kind, actor, scope_kind, scope_id, payload_json, prev_hash, row_hash)
         VALUES (?, ?, 'evaluator', NULL, ?, ?, ?)`,
      ).run(
        action,
        auth.user.username,
        JSON.stringify(content),
        hashes.prev_hash,
        hashes.row_hash,
      );
      return hashes;
    });
    const result = tx.immediate();
    return NextResponse.json({ ok: true, action, audit_row_hash: result.row_hash });
  } catch (err) {
    logRouteError('POST /api/governance/system-health/recovery error', err);
    return jsonError(500, 'internal_error', 'failed to record recovery action');
  }
}
