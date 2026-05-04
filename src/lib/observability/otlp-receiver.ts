/**
 * SPEC-008 — OTLP/HTTP receiver (T107).
 *
 * Per FR-079a (auth contract), FR-079b (1 MiB decompressed cap),
 * FR-079c (wire schema v1.3.0), FR-219j (error contract:
 * 401/403/413/415/429/503), FR-392 (256 KiB compressed-body cap).
 *
 * Order of operations (matters — tests in T115 verify this):
 *   1. Content-Type validation                       → 415
 *   2. Compressed-body cap (FR-392, 256 KiB)         → 413
 *   3. Decompression bounded by 1 MiB cap (FR-079b)  → 413
 *   4. Auth (extractApiKeyFromHeaders + requireRole) → 401 / 403
 *   5. Per-IP 401 burst rate limit (10 401s / 60s)   → 429
 *   6. Decode (T106; currently stubbed)              → 503
 *   7. (Future) ingest with partial_success body      → 200
 *
 * Per-IP 401 rate limit:
 *   - Counter is incremented ONLY when step 4 returns 401.
 *   - Counter is keyed on `x-forwarded-for` (first hop) or the
 *     X-Real-IP header, falling back to `'unknown'`.
 *   - When the counter exceeds 10 within the 60s window, subsequent
 *     401-eligible requests from that IP get 429 instead of 401.
 *
 * @see specs/008-resource-governance/spec.md FR-079a, FR-079b, FR-079c,
 *      FR-219j, FR-392
 * @see specs/008-resource-governance/tasks.md T107
 * @see Constitution Convention J — strict-scope module
 */

import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/governance-route-context';
import {
  decodeOtlpMetrics,
  decodeOtlpTraces,
  OPENTELEMETRY_PROTO_VERSION,
} from './otlp-decoder';

/** Compressed-body cap (FR-392). */
export const COMPRESSED_BODY_CAP_BYTES = 256 * 1024;

/** Decompressed-body cap (FR-079b). */
export const DECOMPRESSED_BODY_CAP_BYTES = 1024 * 1024;

/** Per-IP 401 rate-limit window (ms). */
const FOUR_OH_ONE_WINDOW_MS = 60_000;

/** Per-IP 401 rate-limit threshold. */
const FOUR_OH_ONE_THRESHOLD = 10;

/** Process-local 401 buckets, keyed on resolved IP. */
const fourOhOneBuckets = new Map<string, { count: number; reset_at_ms: number }>();

/** Test helper — clear the 401 rate-limit buckets. */
export function _resetReceiverBuckets(): void {
  fourOhOneBuckets.clear();
}

/** Acceptable OTLP/HTTP content types. */
const ALLOWED_CONTENT_TYPES = new Set<string>([
  'application/x-protobuf',
  'application/protobuf',
  'application/json', // OTLP/HTTP also accepts JSON; we still pin protobuf v1.3.0
]);

/**
 * Resolve the client IP from common reverse-proxy headers.
 * Falls back to `'unknown'` so the bucket key is always non-empty.
 */
function resolveClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff !== null) {
    const first = xff.split(',')[0];
    if (first !== undefined) {
      const trimmed = first.trim();
      if (trimmed !== '') return trimmed;
    }
  }
  const real = request.headers.get('x-real-ip');
  if (real !== null) {
    const trimmed = real.trim();
    if (trimmed !== '') return trimmed;
  }
  return 'unknown';
}

/**
 * Check + maybe-increment the per-IP 401 counter. Caller invokes
 * `record401(ip)` when an auth check returns 401. Returns true when
 * the IP is already over the threshold (caller should respond 429
 * instead of 401).
 */
function isOver401Threshold(ip: string): boolean {
  const now = Date.now();
  const b = fourOhOneBuckets.get(ip);
  if (b === undefined) return false;
  if (now > b.reset_at_ms) {
    fourOhOneBuckets.delete(ip);
    return false;
  }
  return b.count >= FOUR_OH_ONE_THRESHOLD;
}

function record401(ip: string): void {
  const now = Date.now();
  const b = fourOhOneBuckets.get(ip);
  if (b === undefined || now > b.reset_at_ms) {
    fourOhOneBuckets.set(ip, { count: 1, reset_at_ms: now + FOUR_OH_ONE_WINDOW_MS });
    return;
  }
  b.count += 1;
}

/** Standard error body shape. */
function errorBody(code: string, detail: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { code, detail, ...extra };
}

/** Stream-bounded gunzip. Throws when decompressed exceeds the cap. */
function decompressBounded(input: Buffer, cap: number): Buffer {
  // `gunzipSync` decompresses the whole buffer in memory. We post-check
  // the result against the cap; the `maxOutputLength` zlib option
  // enforces this lazily during inflation, throwing if exceeded.
  const out = gunzipSync(input, { maxOutputLength: cap });
  if (out.length > cap) {
    // Defense in depth — gunzipSync should already have thrown.
    throw new RangeError('decompressed_too_large');
  }
  return out;
}

/** What the receiver decodes — traces or metrics. */
export type OtlpKind = 'traces' | 'metrics';

/**
 * The single entry point used by the route handlers (T108/T109).
 * Returns a NextResponse — either an error response or a 200
 * with the partial_success body.
 */
export async function handleOtlpRequest(
  request: NextRequest,
  kind: OtlpKind,
): Promise<NextResponse> {
  // 0) Auth-header conflict (FR-219j / T151). Presence of BOTH
  //    `x-api-key` and `Authorization` headers is ambiguous — reject
  //    with 400 `auth_header_conflict` BEFORE reading the body so an
  //    attacker cannot trade off a payload-too-large 413 against a
  //    misconfigured-credential 400.
  const apiKeyHeader = request.headers.get('x-api-key');
  const authzHeader = request.headers.get('authorization');
  if (apiKeyHeader !== null && authzHeader !== null) {
    return NextResponse.json(
      errorBody(
        'auth_header_conflict',
        'request carries both x-api-key and Authorization headers; supply exactly one',
      ),
      { status: 400 },
    );
  }

  // 1) Content-Type
  const ct = (request.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!ALLOWED_CONTENT_TYPES.has(ct)) {
    return NextResponse.json(
      errorBody('unsupported_media_type', `expected one of ${[...ALLOWED_CONTENT_TYPES].join(', ')}, got ${ct}`),
      { status: 415 },
    );
  }

  // 2) Compressed-body cap (FR-392) — enforce when Content-Length is present.
  const cl = request.headers.get('content-length');
  if (cl !== null) {
    const len = Number.parseInt(cl, 10);
    if (Number.isFinite(len) && len > COMPRESSED_BODY_CAP_BYTES) {
      return NextResponse.json(
        errorBody('payload_too_large', `compressed body exceeds ${String(COMPRESSED_BODY_CAP_BYTES)} bytes`),
        { status: 413 },
      );
    }
  }

  // 3) Read body + bounded decompression.
  let body: Buffer;
  try {
    const arrayBuf = await request.arrayBuffer();
    if (arrayBuf.byteLength > COMPRESSED_BODY_CAP_BYTES) {
      return NextResponse.json(
        errorBody('payload_too_large', `compressed body exceeds ${String(COMPRESSED_BODY_CAP_BYTES)} bytes`),
        { status: 413 },
      );
    }
    body = Buffer.from(arrayBuf);
  } catch {
    return NextResponse.json(errorBody('invalid_request', 'unable to read request body'), { status: 400 });
  }

  const enc = (request.headers.get('content-encoding') ?? '').trim().toLowerCase();
  if (enc === 'gzip') {
    try {
      body = decompressBounded(body, DECOMPRESSED_BODY_CAP_BYTES);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'decompression failed';
      return NextResponse.json(
        errorBody('payload_too_large', `decompressed body exceeds ${String(DECOMPRESSED_BODY_CAP_BYTES)} bytes (${detail})`),
        { status: 413 },
      );
    }
  } else if (enc !== '' && enc !== 'identity') {
    return NextResponse.json(
      errorBody('unsupported_media_type', `unsupported content-encoding: ${enc}`),
      { status: 415 },
    );
  } else if (body.length > DECOMPRESSED_BODY_CAP_BYTES) {
    return NextResponse.json(
      errorBody('payload_too_large', `body exceeds ${String(DECOMPRESSED_BODY_CAP_BYTES)} bytes`),
      { status: 413 },
    );
  }

  // 4) Auth — operator role required.
  const ip = resolveClientIp(request);
  if (isOver401Threshold(ip)) {
    return NextResponse.json(
      errorBody('rate_limited', `too many failed auth attempts; retry after ${String(FOUR_OH_ONE_WINDOW_MS / 1000)}s`),
      { status: 429 },
    );
  }
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    if (auth.status === 401) {
      record401(ip);
    }
    return NextResponse.json(
      errorBody(auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error),
      { status: auth.status },
    );
  }

  // 5) Decode (currently stubbed → 503).
  const decoded = kind === 'traces' ? decodeOtlpTraces(body) : decodeOtlpMetrics(body);
  if (!decoded.ok) {
    if (decoded.reason === 'decoder_unavailable') {
      return NextResponse.json(
        errorBody('decoder_unavailable', decoded.detail ?? 'OTLP decoder is not installed', {
          retry_after_seconds: null,
          opentelemetry_proto_version: OPENTELEMETRY_PROTO_VERSION,
        }),
        { status: 503 },
      );
    }
    return NextResponse.json(
      errorBody('invalid_payload', decoded.detail ?? 'unable to decode OTLP body'),
      { status: 400 },
    );
  }

  // 6) (Future ingest path lands here — partial_success body shape.)
  return NextResponse.json(
    {
      partial_success: {
        rejected_data_points: 0,
        error_message: '',
      },
    },
    { status: 200 },
  );
}
