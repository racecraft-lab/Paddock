/**
 * SPEC-008 — System health REST (T194).
 *
 * Per FR-191 / FR-191a. Returns System Health summary including
 * runbook_links and recovery_affordances.
 *
 * @see specs/008-resource-governance/tasks.md T194
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

interface BreakerStateRow {
  state: string;
  opened_at: string | null;
  reset_at: string | null;
  manually_reset_at: string | null;
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
    const db = getForegroundDb();
    const breaker = db
      .prepare(
        `SELECT state, opened_at, reset_at, manually_reset_at
           FROM resource_governance_breaker
          WHERE scope_kind = 'evaluator' AND scope_id IS NULL
          ORDER BY updated_at DESC, id DESC
          LIMIT 1`,
      )
      .get() as BreakerStateRow | undefined;
    const cards = [
      {
        title: 'Evaluator',
        severity: breaker?.state === 'open' ? 'red' : breaker?.state === 'half_open' ? 'amber' : 'green',
        summary: breaker?.state ?? 'closed',
        runbook_link: '/runbook/breaker-stuck-open',
      },
      {
        title: 'Reconciler',
        severity: 'green',
        summary: 'within budget',
      },
      {
        title: 'Backup',
        severity: 'green',
        summary: 'last backup pending',
      },
    ];
    return NextResponse.json({
      cards,
      runbook_links: [
        { id: 'breaker', href: '/runbook/breaker-stuck-open.md' },
        { id: 'counter', href: '/runbook/counter-drift.md' },
        { id: 'backup', href: '/runbook/retention-sweep-failure.md' },
      ],
      recovery_affordances: [
        { id: 'breaker_reset', label: 'Reset breaker', endpoint: '/api/governance/breaker/reset' },
        { id: 'counter_rebuild', label: 'Rebuild counters', endpoint: '/api/governance/system-health/rebuild' },
      ],
    });
  } catch (err) {
    logRouteError('GET /api/governance/system-health error', err);
    return jsonError(500, 'internal_error', 'failed to load system health');
  }
}
