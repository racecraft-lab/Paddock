/**
 * SPEC-008 — POST /api/admin/spec-008/override-grant-state
 * Body: { workspaceId, variant }
 * Used by tests/e2e/governance-override-grant.e2e.ts
 */
import { routePost } from '../_shared/route-helper';
import { handleOverrideGrantState } from '../_shared/test-state-handlers';
import type { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return routePost(request, handleOverrideGrantState);
}
