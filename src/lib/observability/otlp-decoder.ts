/**
 * SPEC-008 — OTLP wire decoder (T106).
 *
 * Per FR-079c (OTLP/HTTP wire decoding pinned to opentelemetry-proto
 * v1.3.0).
 *
 * STATUS: STUB. The runtime dependency `@opentelemetry/otlp-transformer`
 * is not present in `package.json`. This module exposes the decoder
 * surface the receiver (T107) needs but returns
 * `{ ok: false, reason: 'decoder_unavailable' }` for every call. The
 * receiver maps that result to HTTP 503.
 *
 * To swap in the real decoder:
 *   1. `pnpm add @opentelemetry/otlp-transformer@^0.55.0`
 *      (the version matrix that targets opentelemetry-proto v1.3.0).
 *   2. Replace the body of `decodeOtlpTraces` / `decodeOtlpMetrics` to
 *      delegate to:
 *        `import { ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer'`
 *        `ProtobufTraceSerializer.deserializeRequest(buffer)`
 *      (and the matching `ProtobufMetricsSerializer`).
 *   3. Drop the `OTLP_DECODER_AVAILABLE = false` flag.
 *
 * The wire-schema constant `OPENTELEMETRY_PROTO_VERSION = '1.3.0'` is
 * exported so the receiver can include it in error responses for
 * troubleshooting visibility.
 *
 * @see specs/008-resource-governance/spec.md FR-079c
 * @see specs/008-resource-governance/tasks.md T106
 * @see Constitution Convention J — strict-scope module
 */

/** Pinned OTLP wire schema version (FR-079c). */
export const OPENTELEMETRY_PROTO_VERSION = '1.3.0' as const;

/**
 * Whether the runtime decoder dependency is wired in. The `as boolean`
 * cast widens the literal so consumer branches don't get narrowed away
 * by TS literal inference; flip to `true` at the same time you swap
 * the stub bodies for the real `@opentelemetry/otlp-transformer` calls.
 */
export const OTLP_DECODER_AVAILABLE = false as boolean;

/**
 * Decode result shape. Either a parsed message or a typed failure.
 * The narrow `unknown` typing on success preserves caller flexibility
 * once the real decoder lands — the receiver currently doesn't
 * inspect the parsed shape because the real ingest path lives
 * downstream of T107.
 */
export type DecodeResult<T = unknown> =
  | { ok: true; message: T }
  | { ok: false; reason: 'decoder_unavailable' | 'invalid_payload'; detail?: string };

/**
 * Decode an OTLP/HTTP traces export request body.
 *
 * STUB: returns `{ ok: false, reason: 'decoder_unavailable' }` until
 * `@opentelemetry/otlp-transformer` is in package.json.
 */
export function decodeOtlpTraces(buffer: Buffer): DecodeResult {
  if (!OTLP_DECODER_AVAILABLE) {
    return {
      ok: false,
      reason: 'decoder_unavailable',
      detail: `@opentelemetry/otlp-transformer not installed; pinned wire schema is opentelemetry-proto v${OPENTELEMETRY_PROTO_VERSION}`,
    };
  }
  // Unreachable once OTLP_DECODER_AVAILABLE is flipped to true.
  void buffer;
  return { ok: false, reason: 'invalid_payload', detail: 'unreachable' };
}

/**
 * Decode an OTLP/HTTP metrics export request body.
 *
 * STUB: returns `{ ok: false, reason: 'decoder_unavailable' }` until
 * `@opentelemetry/otlp-transformer` is in package.json.
 */
export function decodeOtlpMetrics(buffer: Buffer): DecodeResult {
  if (!OTLP_DECODER_AVAILABLE) {
    return {
      ok: false,
      reason: 'decoder_unavailable',
      detail: `@opentelemetry/otlp-transformer not installed; pinned wire schema is opentelemetry-proto v${OPENTELEMETRY_PROTO_VERSION}`,
    };
  }
  void buffer;
  return { ok: false, reason: 'invalid_payload', detail: 'unreachable' };
}
