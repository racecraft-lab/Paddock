/**
 * SPEC-008 — Constant-time comparison helper (T149).
 *
 * Per FR-219z: constant-time comparison MUST be used for:
 *   (a) MC API-key validation (extends `extractApiKeyFromHeaders`)
 *   (b) CSRF-token comparison
 *   (c) Idempotency-Key cache lookup hash compare
 *   (d) `row_hash` chain-walk equality
 *
 * Implementation uses `crypto.timingSafeEqual` with a length pre-check;
 * length mismatch is the only short-circuit allowed (see FR-219z).
 *
 * Both inputs are coerced to UTF-8 buffers; numeric inputs are not
 * supported (would require additional canonicalisation that's out of
 * scope for this helper).
 *
 * @see specs/008-resource-governance/spec.md FR-219z
 * @see specs/008-resource-governance/tasks.md T149
 * @see Constitution Convention J (strict-scope)
 */

import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string compare. Returns false on length mismatch
 * without consulting the buffers; otherwise compares byte-by-byte
 * via `crypto.timingSafeEqual` so the short-circuit cost on a
 * mismatch is constant w.r.t. content (NOT w.r.t. length, per
 * FR-219z's explicit exception).
 *
 * Behaviour matrix:
 *   - same length, same bytes → true
 *   - same length, different bytes → false (constant time)
 *   - different lengths → false (immediate; FR-219z permits this)
 *   - empty inputs → both must be '' to be equal
 */
export function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  if (ab.length === 0) return true;
  return timingSafeEqual(ab, bb);
}

/**
 * Buffer-input variant. Useful for hash-chain walks where the inputs
 * are already byte buffers (e.g., `row_hash` SHA-256 outputs decoded
 * from hex once).
 */
export function safeEqualsBuffer(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return timingSafeEqual(a, b);
}
