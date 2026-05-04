/**
 * SPEC-008 — DELETE /api/admin/spec-008/seed-fixture/{id}
 *
 * Tears down a per-test workspace seeded by POST `/seed-fixture`.
 * Idempotent: if the workspace was already deleted, returns 204.
 *
 * Gated behind `MISSION_CONTROL_TEST_MODE=1` AND admin auth.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { adminTestModeGate } from '../../_shared/auth-gate';
import { teardownSpec008Fixture } from '../../_shared/fixture-seeder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = adminTestModeGate(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const workspaceId = Number.parseInt(id, 10);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    return NextResponse.json(
      { code: 'invalid_id', detail: 'workspace id must be a positive integer' },
      { status: 400 },
    );
  }
  try {
    teardownSpec008Fixture(workspaceId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      {
        code: 'teardown_failed',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
