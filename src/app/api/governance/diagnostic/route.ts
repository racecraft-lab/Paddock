/**
 * SPEC-008 — Diagnostic UI aggregator (T193).
 *
 * Per FR-189 / FR-189a / FR-196a. Aggregates the most recent
 * decision-audit + recovery-action rows + breaker state into a single
 * payload the diagnostics subview can render with one fetch. SSE
 * multiplex lives at `stream/route.ts` (deferred).
 *
 * @see specs/008-resource-governance/tasks.md T193
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAuditDb, getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

interface DecisionRow {
  id: number;
  decision: string;
  reason: string | null;
  actor: string | null;
  captured_at: string;
}
interface RecoveryRow {
  id: number;
  kind: string;
  actor: string;
  taken_at: string;
}
interface BreakerStateRow {
  state: string;
  consecutive_errors: number;
  opened_at: string | null;
  reset_at: string | null;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  try {
    const audit = getAuditDb();
    const fg = getForegroundDb();
    const decisions = audit
      .prepare(
        `SELECT id, decision, reason, actor, captured_at
           FROM resource_decision_audit
          ORDER BY id DESC
          LIMIT 50`,
      )
      .all() as DecisionRow[];
    const recovery = audit
      .prepare(
        `SELECT id, kind, actor, taken_at
           FROM recovery_action
          ORDER BY id DESC
          LIMIT 25`,
      )
      .all() as RecoveryRow[];
    const breaker = fg
      .prepare(
        `SELECT state, consecutive_errors, opened_at, reset_at
           FROM resource_governance_breaker
          WHERE scope_kind = 'evaluator' AND scope_id IS NULL`,
      )
      .get() as BreakerStateRow | undefined;
    return NextResponse.json({
      decisions,
      recovery_actions: recovery,
      breaker: breaker ?? {
        state: 'closed',
        consecutive_errors: 0,
        opened_at: null,
        reset_at: null,
      },
    });
  } catch (err) {
    logRouteError('GET /api/governance/diagnostic error', err);
    return jsonError(500, 'internal_error', 'failed to aggregate diagnostic');
  }
}
