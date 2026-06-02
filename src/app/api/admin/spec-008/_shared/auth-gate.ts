/**
 * SPEC-008 — Test-mode admin auth gate for the per-test fixture
 * mutation endpoints under `/api/admin/spec-008/*` and the
 * feature-flag override surface at
 * `/api/admin/workspaces/{id}/feature-flags`.
 *
 * Constraint per Constitution Convention J + the SPEC-008 hardening
 * note (T362): every endpoint exposed below this gate MUST be
 * unreachable in a production deployment. We achieve that by
 * requiring BOTH:
 *
 *   1. `PADDOCK_TEST_MODE=1` — only set in the e2e
 *      Docker container. Refused otherwise.
 *   2. A valid admin `x-api-key` (or session) — the existing
 *      `requireRole(req, 'admin')` helper covers every shape.
 *
 * Failure on either check → HTTP 403 with a deliberately terse
 * body so the operator can not enumerate the surface from prod.
 *
 * The intent is "fewer thinner endpoints": every test-state route
 * delegates to this single guard before doing any work.
 *
 * @see scripts/seed-e2e-spec-008.cjs
 * @see tests/e2e/spec-008/governance-fixtures.ts
 */

import { NextResponse } from 'next/server';
// Delegate to the spec-strict-clean wrapper around `@/lib/auth#requireRole`
// so this strict-scope file does not transitively import the wider auth
// module graph (Constitution Convention J).
import { requireRole } from '@/lib/governance-route-context';

export interface AdminGateOk {
  ok: true;
}

export interface AdminGateDenied {
  ok: false;
  response: NextResponse;
}

export type AdminGateResult = AdminGateOk | AdminGateDenied;

/**
 * Gate: refuses unless PADDOCK_TEST_MODE=1 AND the caller
 * passes admin auth. Returns either `{ ok: true }` (caller proceeds)
 * or `{ ok: false, response }` (caller returns the response verbatim).
 */
export function adminTestModeGate(request: Request): AdminGateResult {
  if (process.env['PADDOCK_TEST_MODE'] !== '1') {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'forbidden', detail: 'spec-008 admin endpoints require PADDOCK_TEST_MODE=1' },
        { status: 403 },
      ),
    };
  }
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'forbidden', detail: 'admin authentication required' },
        { status: 403 },
      ),
    };
  }
  return { ok: true };
}
