/**
 * SPEC-008 — POST /api/admin/spec-008/calibration-state
 * Body: { workspaceId, tier }
 * Used by tests/e2e/governance-calibration-progress.e2e.ts
 */
import { routePost } from '../_shared/route-helper';
import { handleCalibrationState } from '../_shared/test-state-handlers';
import type { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return routePost(request, handleCalibrationState);
}
