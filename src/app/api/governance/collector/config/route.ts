/**
 * SPEC-008 — Audited collector-config endpoint (T111).
 *
 * Per FR-090f (audited config edit). POST accepts a YAML body, hands
 * it to `writeCollectorConfig`, and returns the audit row id.
 *
 * Auth: requireRole admin. Mutation rate-limited via mutationLimiter.
 *
 * Body shape (JSON):
 *   { yaml_body: string }
 *
 * 200 response:
 *   { ok: true, config_path, backup_path, restart_ok,
 *     restart_detail?, health_event_id }
 *
 * 4xx contract:
 *   400 invalid_json — body wasn't valid JSON
 *   400 invalid_body — `yaml_body` missing or not a string
 *   401 unauthorized — missing/invalid auth
 *   403 forbidden    — wrong role
 *   429 rate_limited — mutationLimiter cap
 *   500 internal_error
 *
 * @see specs/008-resource-governance/spec.md FR-090f
 * @see specs/008-resource-governance/tasks.md T111
 * @see Constitution Convention J — strict-scope module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { writeCollectorConfig } from '@/lib/observability/collector-config-writer';

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }

  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  if (typeof payload !== 'object' || payload === null) {
    return jsonError(400, 'invalid_body', 'request body must be an object');
  }
  const body = payload as Record<string, unknown>;
  const yaml_body = body['yaml_body'];
  if (typeof yaml_body !== 'string' || yaml_body === '') {
    return jsonError(400, 'invalid_body', '`yaml_body` must be a non-empty string');
  }

  try {
    const db = getForegroundDb();
    const result = await writeCollectorConfig(db, {
      yaml_body,
      actor: auth.user.username,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logRouteError('POST /api/governance/collector/config error', err);
    return jsonError(500, 'internal_error', 'failed to write collector config');
  }
}
