/**
 * SPEC-008 — Tests for `reason` sanitization (T143, FR-219c).
 *
 * Covers:
 *   - Allow horizontal tab (\t) + line feed (\n).
 *   - Reject CR (\r) — header-injection vector.
 *   - Reject NUL (\x00) and other C0 controls.
 *   - Reject DEL (\x7f) and C1 controls (\x80..\x9f).
 *   - Reject lone-surrogate UTF-16 input.
 *   - Accept ordinary UTF-8 (including emoji).
 *
 * @see specs/008-resource-governance/spec.md FR-219c
 * @see specs/008-resource-governance/tasks.md T143
 */

import { describe, expect, it } from 'vitest';
import {
  isReasonClean,
  parseOverrideGrantRequest,
  ValidationError,
} from '@/lib/resource-validation';

describe('SPEC-008 reason sanitization (T143, FR-219c)', () => {
  it('allows ordinary ASCII + UTF-8', () => {
    expect(isReasonClean('budget override for incident #42')).toBe(true);
    expect(isReasonClean('emoji ok 🚀')).toBe(true);
    expect(isReasonClean('café résumé naïve')).toBe(true);
  });

  it('allows horizontal tab and line feed', () => {
    expect(isReasonClean('line1\nline2')).toBe(true);
    expect(isReasonClean('col1\tcol2')).toBe(true);
  });

  it('rejects carriage return (header-injection vector)', () => {
    expect(isReasonClean('foo\r\nbar')).toBe(false);
  });

  it('rejects NUL bytes', () => {
    expect(isReasonClean('foo\x00bar')).toBe(false);
  });

  it('rejects DEL (0x7F)', () => {
    expect(isReasonClean('foo\x7fbar')).toBe(false);
  });

  it('rejects C0 controls except tab/LF', () => {
    for (let code = 0; code < 0x20; code++) {
      if (code === 0x09 || code === 0x0a) continue;
      expect(isReasonClean(`x${String.fromCharCode(code)}y`)).toBe(false);
    }
  });

  it('rejects C1 controls 0x80..0x9F', () => {
    for (let code = 0x80; code <= 0x9f; code++) {
      expect(isReasonClean(`x${String.fromCharCode(code)}y`)).toBe(false);
    }
  });

  it('rejects lone high surrogate (invalid UTF-16)', () => {
    expect(isReasonClean('foo\uD800bar')).toBe(false);
  });

  it('rejects lone low surrogate (invalid UTF-16)', () => {
    expect(isReasonClean('foo\uDC00bar')).toBe(false);
  });

  it('parseOverrideGrantRequest threads the refinement through', () => {
    expect(() =>
      parseOverrideGrantRequest({
        scope_kind: 'workspace',
        scope_id: 1,
        reason: 'foo\r\nbar',
        ttl_ms: 60_000,
        idempotency_key: 'idem-001',
      }),
    ).toThrow(ValidationError);
  });

  it('parseOverrideGrantRequest accepts a clean reason', () => {
    const result = parseOverrideGrantRequest({
      scope_kind: 'workspace',
      scope_id: 1,
      reason: 'standard override\nwith\ttabs',
      ttl_ms: 60_000,
      idempotency_key: 'idem-002',
    });
    expect(result.reason).toBe('standard override\nwith\ttabs');
  });
});
