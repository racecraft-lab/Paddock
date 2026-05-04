/**
 * SPEC-008 — Diagnostic SSE stream (T193 — stream).
 *
 * Per FR-189a. SSE multiplex of decision + recovery + breaker
 * events. The full multiplex implementation (long-running
 * EventSource + replay window) is deferred to a follow-up; this
 * scaffold returns a one-shot `event: hello` and closes so existing
 * clients can connect without erroring.
 *
 * @see specs/008-resource-governance/tasks.md T193 (stream)
 */

import { type NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/governance-route-context';

function unauthorized(): NextResponse {
  return NextResponse.json({ code: 'unauthorized', detail: 'auth required' }, { status: 401 });
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function GET(request: NextRequest): Promise<Response> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return unauthorized();
  // Minimal scaffold: emit a single hello event and close. Production
  // will replace this with a streaming Response that fans out
  // decision / recovery / breaker SSE messages from a multiplexer.
  const body =
    `event: hello\n` +
    `data: ${JSON.stringify({ ok: true, schema: 'spec-008.diagnostic.v1' })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
