/**
 * SPEC-008 — Tests for `src/lib/resource-etag.ts` (T069).
 *
 * Validates FR-038 / FR-048 / FR-205 / FR-205a / FR-286 / FR-287 ETag
 * weak-validator generation, If-Match handling (matching, mismatched,
 * wildcard, missing, malformed), and the 412 vs 428 disambiguation.
 *
 * @see specs/008-resource-governance/spec.md FR-038, FR-048, FR-205,
 *   FR-205a, FR-286, FR-287
 * @see specs/008-resource-governance/tasks.md T069
 */

import { describe, expect, it } from 'vitest';

describe('SPEC-008 resource-etag — weak ETag + If-Match precondition', () => {
  it('computeETag returns W/"<version>-<sha256-12>"', async () => {
    const { computeETag } = await import('@/lib/resource-etag');
    const etag = computeETag({ version: 7, name: 'budget-1', limit: 100 });
    expect(etag).toMatch(/^W\/"7-[0-9a-f]{12}"$/);
  });

  it('computeETag is deterministic over key order', async () => {
    const { computeETag } = await import('@/lib/resource-etag');
    const a = computeETag({ version: 1, foo: 'a', bar: 2 });
    const b = computeETag({ bar: 2, version: 1, foo: 'a' });
    expect(a).toBe(b);
  });

  it('computeETag changes when content changes', async () => {
    const { computeETag } = await import('@/lib/resource-etag');
    const a = computeETag({ version: 1, name: 'a' });
    const b = computeETag({ version: 1, name: 'b' });
    expect(a).not.toBe(b);
  });

  it('validateIfMatch ok=true on exact ETag match', async () => {
    const { computeETag, validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 3, x: 'y' };
    const etag = computeETag(row);
    const result = validateIfMatch(etag, row);
    expect(result.ok).toBe(true);
  });

  it('validateIfMatch ok=false / 412 on mismatch with FR-205a body shape', async () => {
    const { validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 5, x: 'y' };
    const result = validateIfMatch('W/"5-deadbeefdead"', row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(412);
      expect(result.body.code).toBe('precondition_failed');
      expect(typeof result.body.expected).toBe('string');
      expect(result.body.observed).toBe('W/"5-deadbeefdead"');
    }
  });

  it('validateIfMatch wildcard "*" returns ok=true', async () => {
    const { validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 1, x: 'y' };
    const result = validateIfMatch('*', row);
    expect(result.ok).toBe(true);
  });

  it('validateIfMatch missing header returns 428 (precondition required)', async () => {
    const { validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 1, x: 'y' };
    const result = validateIfMatch(null, row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(428);
      expect(result.body.code).toBe('precondition_required');
      expect(result.body.observed).toBeNull();
    }
  });

  it('validateIfMatch handles weak validator with W/ prefix', async () => {
    const { computeETag, validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 9, foo: 'bar' };
    const etag = computeETag(row);
    // The weak prefix is part of the generated etag; verify it round-trips.
    expect(etag.startsWith('W/"')).toBe(true);
    const result = validateIfMatch(etag, row);
    expect(result.ok).toBe(true);
  });

  it('validateIfMatch malformed header returns 412 (cannot match)', async () => {
    const { validateIfMatch } = await import('@/lib/resource-etag');
    const row = { version: 1 };
    const result = validateIfMatch('not-a-valid-etag', row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(412);
    }
  });

  it('computeETag rejects NaN / Infinity inputs (FR-219e)', async () => {
    const { computeETag } = await import('@/lib/resource-etag');
    expect(() => computeETag({ version: 1, x: Number.NaN })).toThrow();
    expect(() =>
      computeETag({ version: 1, x: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });
});
