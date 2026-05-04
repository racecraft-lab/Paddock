/**
 * SPEC-008 — Integration tests for OTLP receiver (T115).
 *
 * Per FR-079a (auth contract), FR-079b (1 MiB decompressed cap),
 * FR-079c (wire schema v1.3.0), FR-219j (error contract:
 * 401/403/413/415/429/503), FR-392 (256 KiB compressed-body cap).
 *
 * Covers:
 *   - 415 wrong content-type
 *   - 413 compressed cap (256 KiB / FR-392)
 *   - 413 decompressed gzip cap (1 MiB / FR-079b)
 *   - 401 missing/invalid auth
 *   - 403 viewer role (operator required)
 *   - 429 per-IP 401 burst rate limit
 *   - 503 decoder unavailable (T106 stub state)
 *
 * partial_success: SKIPPED — gated on the real
 * `@opentelemetry/otlp-transformer` decoder being installed (T106
 * stub returns 503 universally for now). When the decoder lands,
 * un-skip the partial_success block and assert the OTLP/HTTP 1.10.0
 * body shape `{partial_success: {rejected_data_points, error_message}}`.
 *
 * Mocks the strict-clean adapter (`@/lib/governance-route-context`)
 * because the route-context shim's runtime-require is opaque to
 * `vi.mock('@/lib/auth')`. Same pattern as
 * `src/app/api/governance/policies/__tests__/route.test.ts`.
 *
 * @see specs/008-resource-governance/spec.md FR-079a, FR-079b, FR-079c,
 *      FR-219j, FR-392
 * @see specs/008-resource-governance/tasks.md T115
 */

import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: mocks.requireRole,
}));

const OPERATOR_USER = {
  id: 12,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator' as const,
  workspace_id: 1,
  tenant_id: 10,
};

const VIEWER_USER = {
  id: 13,
  username: 'viewer',
  display_name: 'Viewer',
  role: 'viewer' as const,
  workspace_id: 1,
  tenant_id: 10,
};

interface ReceiverModule {
  handleOtlpRequest: (
    request: Request,
    kind: 'traces' | 'metrics',
  ) => Promise<Response>;
  _resetReceiverBuckets: () => void;
}

let receiver: ReceiverModule;

beforeEach(async () => {
  mocks.requireRole.mockReset();
  // Default: succeeds as operator. Each test overrides as needed.
  mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
  // Re-import so the receiver picks up our governance-route-context mock.
  vi.resetModules();
  receiver = (await import('@/lib/observability/otlp-receiver')) as unknown as ReceiverModule;
  receiver._resetReceiverBuckets();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(opts: {
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
  contentLength?: number;
  apiKey?: string;
  ip?: string;
}): Request {
  const headers = new Headers();
  headers.set('content-type', opts.contentType);
  if (opts.contentEncoding !== undefined) {
    headers.set('content-encoding', opts.contentEncoding);
  }
  if (opts.contentLength !== undefined) {
    headers.set('content-length', String(opts.contentLength));
  }
  if (opts.apiKey !== undefined) {
    headers.set('x-api-key', opts.apiKey);
  }
  headers.set('x-forwarded-for', opts.ip ?? '203.0.113.10');
  // Convert Buffer → Uint8Array for `BodyInit` compatibility.
  const bodyView = new Uint8Array(opts.body);
  return new Request('http://localhost/api/otlp/v1/traces', {
    method: 'POST',
    headers,
    body: bodyView,
  });
}

describe('OTLP receiver — auth, payload caps, error contract', () => {
  describe('415 unsupported_media_type', () => {
    it('rejects text/plain', async () => {
      const res = await receiver.handleOtlpRequest(
        makeRequest({ body: Buffer.from('hello'), contentType: 'text/plain' }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(415);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('unsupported_media_type');
    });

    it('rejects unsupported content-encoding', async () => {
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('hello'),
          contentType: 'application/x-protobuf',
          contentEncoding: 'br',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(415);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('unsupported_media_type');
    });
  });

  describe('413 payload_too_large', () => {
    it('rejects compressed Content-Length > 256 KiB (FR-392)', async () => {
      // Trip the cap via the Content-Length header alone — no need to
      // actually allocate 257 KiB.
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('not-the-real-body'),
          contentType: 'application/x-protobuf',
          contentLength: 257 * 1024,
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(413);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('payload_too_large');
    });

    it('rejects gzip body that decompresses past 1 MiB (FR-079b)', async () => {
      // 2 MiB of zeros compresses to ~2 KiB → fits the 256 KiB
      // compressed cap but blows the 1 MiB decompressed cap.
      const huge = Buffer.alloc(2 * 1024 * 1024, 0);
      const compressed = gzipSync(huge);
      expect(compressed.length).toBeLessThan(256 * 1024);
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: compressed,
          contentType: 'application/x-protobuf',
          contentEncoding: 'gzip',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(413);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('payload_too_large');
    });

    it('rejects identity-encoded body > 1 MiB', async () => {
      // 1.5 MiB body, identity encoding — busts the decompressed cap.
      const huge = Buffer.alloc(1.5 * 1024 * 1024, 0);
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: huge,
          contentType: 'application/x-protobuf',
          // No content-length header so the inline check kicks in.
        }) as Request as never,
        'traces',
      );
      // Either the compressed cap (~257K Content-Length absent →
      // arrayBuffer length > 256K so the inline check fires) or the
      // decompressed cap. Both produce 413; assert status only.
      expect(res.status).toBe(413);
    });
  });

  describe('401 unauthorized', () => {
    it('returns 401 when auth fails', async () => {
      mocks.requireRole.mockReturnValueOnce({
        error: 'API key missing',
        status: 401,
      });
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('payload'),
          contentType: 'application/x-protobuf',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('unauthorized');
    });
  });

  describe('403 forbidden — viewer role', () => {
    it('returns 403 when role is below operator', async () => {
      mocks.requireRole.mockReturnValueOnce({
        error: 'requires operator',
        status: 403,
      });
      void VIEWER_USER; // documentation; the mock fakes the outcome
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('payload'),
          contentType: 'application/x-protobuf',
          apiKey: 'viewer-api-key',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('forbidden');
    });
  });

  describe('429 per-IP 401 burst limit', () => {
    it('returns 429 after 10 401s within 60s from the same IP', async () => {
      // First 10 attempts → 401. The 11th → 429.
      mocks.requireRole.mockReturnValue({ error: 'bad key', status: 401 });
      const ip = '198.51.100.42';
      for (let i = 0; i < 10; i++) {
        const res = await receiver.handleOtlpRequest(
          makeRequest({
            body: Buffer.from('p'),
            contentType: 'application/x-protobuf',
            ip,
          }) as Request as never,
          'traces',
        );
        expect(res.status).toBe(401);
      }
      const res11 = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('p'),
          contentType: 'application/x-protobuf',
          ip,
        }) as Request as never,
        'traces',
      );
      expect(res11.status).toBe(429);
      const body = (await res11.json()) as { code: string };
      expect(body.code).toBe('rate_limited');
    });

    it('does not affect a different IP', async () => {
      mocks.requireRole.mockReturnValue({ error: 'bad key', status: 401 });
      // Burn the first IP.
      for (let i = 0; i < 10; i++) {
        await receiver.handleOtlpRequest(
          makeRequest({
            body: Buffer.from('p'),
            contentType: 'application/x-protobuf',
            ip: '198.51.100.50',
          }) as Request as never,
          'traces',
        );
      }
      // Different IP — still 401, not 429.
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('p'),
          contentType: 'application/x-protobuf',
          ip: '203.0.113.99',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('503 decoder_unavailable (T106 stub)', () => {
    it('returns 503 with opentelemetry_proto_version detail', async () => {
      mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
      const res = await receiver.handleOtlpRequest(
        makeRequest({
          body: Buffer.from('valid-payload-shape'),
          contentType: 'application/x-protobuf',
        }) as Request as never,
        'traces',
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as {
        code: string;
        opentelemetry_proto_version?: string;
      };
      expect(body.code).toBe('decoder_unavailable');
      expect(body.opentelemetry_proto_version).toBe('1.3.0');
    });
  });

  describe('FR-079c partial_success', () => {
    it.skip('returns 200 with partial_success body once T106 decoder is installed', () => {
      // Gated on `pnpm add @opentelemetry/otlp-transformer@^0.55.0`.
      // T106 currently stubs the decoder so the receiver short-circuits
      // to 503. Un-skip this test alongside the swap-in.
    });
  });
});
