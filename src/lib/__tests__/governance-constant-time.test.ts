/**
 * SPEC-008 — Tests for `safeEquals` constant-time compare (T149).
 *
 * Per FR-219z. Verifies functional equality plus the documented
 * length-mismatch short-circuit. Timing is not asserted here (vitest
 * cannot reliably do nanosecond-resolution timing without a dedicated
 * harness); the contract is that we use `crypto.timingSafeEqual` and
 * never short-circuit on content. Code review owns that property.
 *
 * @see specs/008-resource-governance/spec.md FR-219z
 * @see specs/008-resource-governance/tasks.md T149
 */

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  safeEquals,
  safeEqualsBuffer,
} from '@/lib/governance-constant-time';

describe('SPEC-008 governance-constant-time (T149)', () => {
  it('safeEquals returns true for byte-identical strings', () => {
    expect(safeEquals('abcd1234', 'abcd1234')).toBe(true);
  });

  it('safeEquals returns false for content mismatch (same length)', () => {
    expect(safeEquals('abcd1234', 'abcd1235')).toBe(false);
  });

  it('safeEquals returns false on length mismatch (FR-219z permits short-circuit)', () => {
    expect(safeEquals('short', 'shorter')).toBe(false);
    expect(safeEquals('shorter', 'short')).toBe(false);
  });

  it('safeEquals handles empty inputs', () => {
    expect(safeEquals('', '')).toBe(true);
    expect(safeEquals('', 'x')).toBe(false);
    expect(safeEquals('x', '')).toBe(false);
  });

  it('safeEquals correctly compares multibyte UTF-8 strings', () => {
    expect(safeEquals('café', 'café')).toBe(true);
    expect(safeEquals('café', 'cafe')).toBe(false);
  });

  it('safeEqualsBuffer handles raw byte buffers', () => {
    const a = Buffer.from([1, 2, 3, 4]);
    const b = Buffer.from([1, 2, 3, 4]);
    const c = Buffer.from([1, 2, 3, 5]);
    const d = Buffer.from([1, 2, 3]);
    expect(safeEqualsBuffer(a, b)).toBe(true);
    expect(safeEqualsBuffer(a, c)).toBe(false);
    expect(safeEqualsBuffer(a, d)).toBe(false);
  });

  it('safeEqualsBuffer handles empty buffers', () => {
    expect(safeEqualsBuffer(Buffer.alloc(0), Buffer.alloc(0))).toBe(true);
  });
});
