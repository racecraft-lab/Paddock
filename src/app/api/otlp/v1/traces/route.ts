/**
 * SPEC-008 — OTLP/HTTP traces endpoint (T108).
 *
 * Per FR-079a (auth contract), FR-079c (wire schema v1.3.0).
 *
 * Thin POST handler — every request is delegated to the receiver
 * module (`@/lib/observability/otlp-receiver`) which owns the order
 * of operations (Content-Type → size caps → decompression → auth →
 * 401 burst → decode → ingest).
 *
 * @see specs/008-resource-governance/spec.md FR-079a, FR-079c
 * @see specs/008-resource-governance/tasks.md T108
 * @see Constitution Convention J — strict-scope module
 */

import { handleOtlpRequest } from '@/lib/observability/otlp-receiver';
import type { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleOtlpRequest(request, 'traces');
}
