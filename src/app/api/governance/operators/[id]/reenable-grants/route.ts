/**
 * SPEC-008 — Admin re-enable of override-grant capability (T144).
 *
 * Per FR-219d. Endpoint:
 *
 *   POST /api/governance/operators/:id/reenable-grants
 *   Body: { reason: string }
 *
 * Auth: admin role required (the FR-219d "SUPER-actor" maps to the
 * existing admin role in the project's auth model). Operators cannot
 * re-enable themselves; only admin-class users can.
 *
 * Responses:
 *   - 200 — `{ok:true, before, after, audit_row_hash}`
 *   - 401 / 403 — auth failure
 *   - 404 — operator not found
 *   - 409 — operator was not disabled (idempotency: cannot re-enable an
 *     already-enabled actor)
 *   - 422 — validation failure (missing reason, sanitization failure)
 *
 * Uses `governance-route-context` adapter for `requireRole` /
 * `mutationLimiter` per Convention J.
 *
 * @see specs/008-resource-governance/spec.md FR-219d, FR-219c, FR-219u
 * @see specs/008-resource-governance/tasks.md T144
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { reEnableGrants } from '@/lib/resource-override-anomaly-guard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function jsonError(
  status: number,
  code: string,
  detail: string,
): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

/**
 * Reject control characters and enforce length cap on the supplied
 * reason. The full FR-219c sanitizer (UTF-8 round-trip, C0/C1) lives in
 * `resource-validation.ts`; we inline a minimal copy here so the route
 * does not depend on the policy schema's wider Zod surface.
 */
function isReasonClean(input: string): boolean {
  if (input.length === 0 || input.length > 2048) return false;
  if (Buffer.from(input, 'utf8').toString('utf8') !== input) return false;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x09 || code === 0x0a) continue;
    if (code < 0x20) return false;
    if (code >= 0x7f && code <= 0x9f) return false;
  }
  return true;
}

interface RequestBody {
  reason?: unknown;
}

export async function POST(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }

  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  const { id: idParam } = await ctx.params;
  const operatorId = Number.parseInt(idParam, 10);
  if (!Number.isInteger(operatorId) || operatorId <= 0) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  const reasonRaw = body.reason;
  if (typeof reasonRaw !== 'string') {
    return NextResponse.json(
      {
        code: 'validation_failed',
        detail: 'reason is required',
        issues: [
          {
            field_path: 'reason',
            message: 'reason must be a non-empty string',
            code: 'required',
          },
        ],
      },
      { status: 422 },
    );
  }
  if (!isReasonClean(reasonRaw)) {
    return NextResponse.json(
      {
        code: 'validation_failed',
        detail:
          'reason contains invalid control characters or is not valid UTF-8',
        issues: [
          {
            field_path: 'reason',
            message: 'reason must be sanitized UTF-8 (FR-219c)',
            code: 'invalid_string',
          },
        ],
      },
      { status: 422 },
    );
  }

  try {
    const db = getForegroundDb();
    const result = reEnableGrants(operatorId, auth.user.id, reasonRaw, db);
    if (!result.ok) {
      if (result.code === 'operator_not_found') {
        return jsonError(404, 'operator_not_found', 'operator not found');
      }
      // 'not_disabled' — actor never had grant capability disabled.
      return jsonError(
        409,
        'not_disabled',
        'operator grant capability is not currently disabled',
      );
    }
    return NextResponse.json({
      ok: true,
      before: result.before,
      after: result.after,
      audit_row_hash: result.audit_row_hash,
    });
  } catch (err) {
    logRouteError(
      'POST /api/governance/operators/[id]/reenable-grants error',
      err,
    );
    return jsonError(500, 'internal_error', 'failed to re-enable grants');
  }
}
