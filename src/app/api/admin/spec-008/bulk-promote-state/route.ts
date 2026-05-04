/**
 * SPEC-008 — POST /api/admin/spec-008/bulk-promote-state
 * Body: { workspaceId, variant }
 * Used by tests/e2e/governance-bulk-promote.e2e.ts
 */
import { routePost } from '../_shared/route-helper';
import { handleBulkPromoteState } from '../_shared/test-state-handlers';
import type { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return routePost(request, handleBulkPromoteState);
}
