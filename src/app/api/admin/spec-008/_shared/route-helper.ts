/**
 * SPEC-008 — thin POST shim used by every per-test state route.
 *
 * Each route file calls `routePost(request, handler)` which:
 *   1. Runs the test-mode + admin-auth gate.
 *   2. Parses JSON.
 *   3. Delegates to the supplied handler from `test-state-handlers.ts`.
 *   4. Maps the handler result to a `NextResponse`.
 *
 * Keeping this in one place avoids 9 near-identical 25-line files.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { adminTestModeGate } from './auth-gate';
import type { HandlerResult } from './test-state-handlers';

export async function routePost(
  request: NextRequest,
  handler: (payload: unknown) => HandlerResult,
): Promise<NextResponse> {
  const gate = adminTestModeGate(request);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'invalid_body', detail: 'POST body must be JSON' },
      { status: 400 },
    );
  }
  let result: HandlerResult;
  try {
    result = handler(body);
  } catch (err) {
    return NextResponse.json(
      {
        code: 'handler_error',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, detail: result.detail },
      { status: result.status },
    );
  }
  return NextResponse.json(result.body ?? {}, { status: result.status });
}
