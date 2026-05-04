/**
 * SPEC-008 — POST /api/admin/spec-008/emit-decision
 * Body: { workspaceId, reason? }
 * Used by tests/e2e/governance-diagnostic-feed.e2e.ts
 */
import { routePost } from '../_shared/route-helper';
import { handleEmitDecision } from '../_shared/test-state-handlers';
import type { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return routePost(request, handleEmitDecision);
}
