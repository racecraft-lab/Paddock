/**
 * SPEC-008 — Tests for `src/lib/resource-validation.ts` (T068).
 *
 * Validates the FR-039 / FR-045 / FR-179 / FR-206 / FR-210 / FR-219e /
 * FR-219f / FR-219t / FR-219u contract: every CRUD parser exposes a
 * `.strict()` schema (no extra keys), rejects prototype-pollution keys,
 * rejects NaN / Infinity, rejects ReDoS-prone regex strings, and throws
 * a typed `ValidationError` with structured `{ field_path, message,
 * code }[]` issues.
 *
 * @see specs/008-resource-governance/spec.md FR-039, FR-045, FR-046,
 *   FR-179, FR-206, FR-210, FR-219e, FR-219f, FR-219t, FR-219u
 * @see specs/008-resource-governance/tasks.md T068
 */

import { describe, expect, it } from 'vitest';

describe('SPEC-008 resource-validation — Zod schemas + parsers', () => {
  it('parsePolicyRequest accepts a well-formed policy', async () => {
    const { parsePolicyRequest } = await import('@/lib/resource-validation');
    const parsed = parsePolicyRequest({
      policy_type: 'wip_limit',
      limit_kind: 'wip',
      limit_value: 10,
      enforcement: 'defer',
    });
    expect(parsed.policy_type).toBe('wip_limit');
    expect(parsed.limit_value).toBe(10);
  });

  it('parsePolicyRequest rejects extra keys via .strict() (FR-210)', async () => {
    const { parsePolicyRequest, ValidationError } = await import(
      '@/lib/resource-validation'
    );
    expect(() =>
      parsePolicyRequest({
        policy_type: 'wip_limit',
        limit_kind: 'wip',
        limit_value: 10,
        enforcement: 'defer',
        extraneous_field: 'nope',
      }),
    ).toThrowError(ValidationError);
  });

  it('parsePolicyRequest rejects __proto__ / constructor / prototype keys (FR-219f)', async () => {
    const { parsePolicyRequest, ValidationError } = await import(
      '@/lib/resource-validation'
    );
    // Use JSON.parse so __proto__ is an OWN property (not the syntactic
    // setPrototypeOf shorthand). This is the realistic untrusted-input
    // shape: HTTP body parsed via `await req.json()`.
    const polluted = JSON.parse(
      '{"policy_type":"wip_limit","limit_kind":"wip","limit_value":5,"enforcement":"defer","schedule_json":{"__proto__":{"polluted":true}}}',
    ) as object;
    expect(() => parsePolicyRequest(polluted)).toThrowError(ValidationError);
  });

  it('parsePolicyRequest rejects top-level __proto__ via JSON.parse (FR-219f)', async () => {
    const { parsePolicyRequest, ValidationError } = await import(
      '@/lib/resource-validation'
    );
    const polluted = JSON.parse(
      '{"policy_type":"wip_limit","limit_kind":"wip","limit_value":5,"enforcement":"defer","__proto__":{"polluted":true}}',
    ) as object;
    expect(() => parsePolicyRequest(polluted)).toThrowError(ValidationError);
  });

  it('parsePolicyRequest rejects out-of-bound WIP cap (FR-045)', async () => {
    const { parsePolicyRequest } = await import('@/lib/resource-validation');
    expect(() =>
      parsePolicyRequest({
        policy_type: 'wip_limit',
        limit_kind: 'wip',
        limit_value: 99999,
        enforcement: 'defer',
      }),
    ).toThrow(/cap_max|10000|range/i);
  });

  it('parseBudgetRequest rejects NaN / Infinity (FR-219e)', async () => {
    const { parseBudgetRequest } = await import('@/lib/resource-validation');
    expect(() =>
      parseBudgetRequest({
        policy_type: 'budget',
        limit_kind: 'usd',
        limit_value: Number.POSITIVE_INFINITY,
        enforcement: 'block_dispatch',
      }),
    ).toThrow();
    expect(() =>
      parseBudgetRequest({
        policy_type: 'budget',
        limit_kind: 'usd',
        limit_value: Number.NaN,
        enforcement: 'block_dispatch',
      }),
    ).toThrow();
  });

  it('parseBudgetRequest rejects amount > 1e15 (FR-179)', async () => {
    const { parseBudgetRequest } = await import('@/lib/resource-validation');
    expect(() =>
      parseBudgetRequest({
        policy_type: 'budget',
        limit_kind: 'usd',
        limit_value: 2e15,
        enforcement: 'block_dispatch',
      }),
    ).toThrow();
  });

  it('parseBudgetRequest accepts a well-formed budget', async () => {
    const { parseBudgetRequest } = await import('@/lib/resource-validation');
    const out = parseBudgetRequest({
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 250.5,
      enforcement: 'block_dispatch',
    });
    expect(out.limit_value).toBe(250.5);
  });

  it('parseOverrideGrantRequest rejects ttl_ms beyond 30 days (FR-179)', async () => {
    const { parseOverrideGrantRequest } = await import(
      '@/lib/resource-validation'
    );
    expect(() =>
      parseOverrideGrantRequest({
        scope_kind: 'workspace',
        scope_id: 1,
        reason: 'test',
        ttl_ms: 31 * 86400 * 1000,
        idempotency_key: 'k1',
      }),
    ).toThrow();
  });

  it('parseOverrideGrantRequest rejects negative ttl', async () => {
    const { parseOverrideGrantRequest } = await import(
      '@/lib/resource-validation'
    );
    expect(() =>
      parseOverrideGrantRequest({
        scope_kind: 'workspace',
        scope_id: 1,
        reason: 'test',
        ttl_ms: -1,
        idempotency_key: 'k1',
      }),
    ).toThrow();
  });

  it('parseBlackoutWindowRequest rejects ReDoS-prone regex (FR-219t)', async () => {
    const { parseBlackoutWindowRequest } = await import(
      '@/lib/resource-validation'
    );
    expect(() =>
      parseBlackoutWindowRequest({
        policy_type: 'blackout',
        limit_kind: 'window',
        enforcement: 'block_dispatch',
        match_pattern: '(a+)+b',
      }),
    ).toThrow(/regex|redos/i);
  });

  it('parseBlackoutWindowRequest rejects cron > 64 chars (FR-179)', async () => {
    const { parseBlackoutWindowRequest } = await import(
      '@/lib/resource-validation'
    );
    expect(() =>
      parseBlackoutWindowRequest({
        policy_type: 'blackout',
        limit_kind: 'window',
        enforcement: 'block_dispatch',
        cron: 'x'.repeat(65),
      }),
    ).toThrow();
  });

  it('parseDegradedWindowRequest accepts a valid degraded window', async () => {
    const { parseDegradedWindowRequest } = await import(
      '@/lib/resource-validation'
    );
    const out = parseDegradedWindowRequest({
      policy_type: 'degraded_window',
      limit_kind: 'window',
      enforcement: 'defer',
      cron: '0 9 * * 1-5',
    });
    expect(out.policy_type).toBe('degraded_window');
  });

  it('ValidationError carries structured field_path / code issues (FR-219u)', async () => {
    const { parsePolicyRequest, ValidationError } = await import(
      '@/lib/resource-validation'
    );
    try {
      parsePolicyRequest({
        policy_type: 'invalid_kind',
        limit_kind: 'wip',
        limit_value: 1,
        enforcement: 'defer',
      });
      throw new Error('expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as InstanceType<typeof ValidationError>;
      expect(Array.isArray(ve.issues)).toBe(true);
      expect(ve.issues.length).toBeGreaterThan(0);
      const first = ve.issues[0]!;
      expect(typeof first.field_path).toBe('string');
      expect(typeof first.message).toBe('string');
      expect(typeof first.code).toBe('string');
    }
  });
});
