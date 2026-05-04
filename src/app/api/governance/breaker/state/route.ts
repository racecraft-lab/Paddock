/**
 * SPEC-008 — Circuit-breaker state read endpoint (T160).
 *
 * Per FR-006 (state survives restart) / FR-022 (chronic-alert telemetry).
 *
 *   GET /api/governance/breaker/state
 *   Auth: viewer+ (role hierarchy admits operator + admin). The breaker
 *   state is a system-health surface, not an admin-only signal — operators
 *   monitoring the dashboard need to read it.
 *
 * Response (200):
 *   {
 *     state: 'closed' | 'half_open' | 'open',
 *     opened_at: ISO8601 | null,
 *     reset_at: ISO8601 | null,
 *     consecutive_errors: number,
 *     half_open_probe_budget_remaining: number,
 *     last_chronic_alert_at: ISO8601 | null,
 *     manually_reset_at: ISO8601 | null,
 *     manually_reset_by: string | null,
 *     scope_kind: string,
 *     updated_at: ISO8601
 *   }
 *
 * Implementation note: routes through the strict-clean adapter
 * (`governance-route-context`) for `requireRole` / `logRouteError` per
 * Convention J. Skips activity-row write — GET is too noisy.
 *
 * @see specs/008-resource-governance/spec.md FR-006, FR-022, FR-356
 * @see specs/008-resource-governance/tasks.md T160 (orchestrator plan)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context';

const HALF_OPEN_PROBE_BUDGET_DEFAULT = 3;

interface BreakerRow {
  state: 'closed' | 'half_open' | 'open';
  consecutive_errors: number;
  opened_at: string | null;
  reset_at: string | null;
  notes_json: string | null;
  scope_kind: string;
  updated_at: string;
  manually_reset_at: string | null;
  manually_reset_by: string | null;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

function readNotesNumber(notesJson: string | null, key: string): number {
  if (notesJson === null) return 0;
  try {
    const parsed = JSON.parse(notesJson) as Record<string, unknown>;
    const raw = parsed[key];
    return typeof raw === 'number' ? raw : 0;
  } catch {
    return 0;
  }
}

function readNotesString(notesJson: string | null, key: string): string | null {
  if (notesJson === null) return null;
  try {
    const parsed = JSON.parse(notesJson) as Record<string, unknown>;
    const raw = parsed[key];
    return typeof raw === 'string' ? raw : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }

  try {
    const db = getForegroundDb();
    const row = db
      .prepare(
        `SELECT state, consecutive_errors, opened_at, reset_at,
                notes_json, scope_kind, updated_at,
                manually_reset_at, manually_reset_by
           FROM resource_governance_breaker
          WHERE scope_kind = 'evaluator' AND scope_id IS NULL
          LIMIT 1`,
      )
      .get() as BreakerRow | undefined;

    if (row === undefined) {
      // No row yet — breaker has never been touched. Return default
      // closed state so dashboards don't have to special-case the
      // pre-first-tick window.
      return NextResponse.json({
        state: 'closed',
        opened_at: null,
        reset_at: null,
        consecutive_errors: 0,
        half_open_probe_budget_remaining: HALF_OPEN_PROBE_BUDGET_DEFAULT,
        last_chronic_alert_at: null,
        manually_reset_at: null,
        manually_reset_by: null,
        scope_kind: 'evaluator',
        updated_at: null,
      });
    }

    const inFlight = readNotesNumber(
      row.notes_json,
      'half_open_probes_in_flight',
    );
    const remaining = Math.max(0, HALF_OPEN_PROBE_BUDGET_DEFAULT - inFlight);
    const lastChronic = readNotesString(row.notes_json, 'last_chronic_alert_at');

    return NextResponse.json({
      state: row.state,
      opened_at: row.opened_at,
      reset_at: row.reset_at,
      consecutive_errors: row.consecutive_errors,
      half_open_probe_budget_remaining: remaining,
      last_chronic_alert_at: lastChronic,
      manually_reset_at: row.manually_reset_at,
      manually_reset_by: row.manually_reset_by,
      scope_kind: row.scope_kind,
      updated_at: row.updated_at,
    });
  } catch (err) {
    logRouteError('GET /api/governance/breaker/state error', err);
    return jsonError(500, 'internal_error', 'failed to read breaker state');
  }
}
