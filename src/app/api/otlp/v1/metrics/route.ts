/**
 * SPEC-008 — OTLP/HTTP metrics endpoint (T109).
 *
 * Per FR-079a (auth contract), FR-079c (wire schema v1.3.0).
 *
 * Thin POST handler — delegates to the receiver module
 * (`@/lib/observability/otlp-receiver`) which owns the full
 * order-of-operations contract.
 *
 * @see specs/008-resource-governance/spec.md FR-079a, FR-079c
 * @see specs/008-resource-governance/tasks.md T109
 * @see Constitution Convention J — strict-scope module
 */

import { handleOtlpRequest } from '@/lib/observability/otlp-receiver';
import type { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleOtlpRequest(request, 'metrics');
}
