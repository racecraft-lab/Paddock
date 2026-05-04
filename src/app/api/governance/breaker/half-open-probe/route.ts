/**
 * SPEC-008 — Half-open probe admission endpoint (T162).
 *
 * Per FR-028 (half-open probe admission) / FR-356 (probe budget cap).
 *
 *   POST /api/governance/breaker/half-open-probe
 *   Auth: viewer+ (operator + admin allowed via role hierarchy). The
 *   endpoint is a discriminated trigger — operators investigating an
 *   open-then-half-open breaker need to test traffic admission before a
 *   full reset.
 *
 * Behavior:
 *   - Reads breaker state via `currentState()` (which auto-advances
 *     `open -> half_open` once the cooldown window has elapsed).
 *   - When the breaker is in `half_open`, decrements the probe budget
 *     via `tryProbe()`. Returns `{admitted: true, probe_budget_remaining}`
 *     until the budget is exhausted; subsequent calls return
 *     `{admitted: false, probe_budget_remaining: 0}`.
 *   - When the breaker is NOT in `half_open` (closed / open) the
 *     endpoint returns 409 — the probe operation is undefined for those
 *     states.
 *
 * Responses:
 *   - 200 — `{admitted, probe_budget_remaining, state}`
 *   - 401 / 403 — auth failure
 *   - 409 — breaker not in half_open state
 *
 * @see specs/008-resource-governance/spec.md FR-028, FR-356
 * @see specs/008-resource-governance/tasks.md T162 (orchestrator plan)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logGovernanceActivity,
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { CircuitBreaker } from '@/lib/resource-circuit-breaker';

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }

  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  try {
    const db = getForegroundDb();
    const breaker = new CircuitBreaker({ db });
    const state = breaker.currentState();
    if (state !== 'half_open') {
      return jsonError(
        409,
        'breaker_not_half_open',
        `breaker is in '${state}' — probe is only valid in 'half_open'`,
      );
    }

    const result = breaker.tryProbe();

    logGovernanceActivity(db, {
      type: 'governance_breaker_half_open_probe',
      entity_id: 0,
      actor: auth.user.username,
      description: `half-open probe by ${auth.user.username} — admitted=${String(
        result.admitted,
      )}`,
      data: {
        admitted: result.admitted,
        probe_budget_remaining: result.remaining,
        state,
      },
      workspace_id: 0,
    });

    return NextResponse.json({
      admitted: result.admitted,
      probe_budget_remaining: result.remaining,
      state,
    });
  } catch (err) {
    logRouteError('POST /api/governance/breaker/half-open-probe error', err);
    return jsonError(500, 'internal_error', 'failed to admit probe');
  }
}
