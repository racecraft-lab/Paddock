/**
 * SPEC-008 — Generic ETag / If-Match precondition for governance REST.
 *
 * Per FR-038, FR-048, FR-205, FR-205a, FR-286, FR-287. Produces a weak
 * validator `W/"<version>-<sha256-12-of-canonical-json>"` over a row's
 * stable shape and validates an `If-Match` header value against it.
 *
 * The canonical JSON form is built by `canonicalizeJcs` in
 * `resource-decision-writer.ts` (RFC 8785 JCS-style). Reusing that one
 * canonicalizer avoids drift between the etag surface and the audit
 * chain's underlying JSON discipline.
 *
 * NOTE: `resource-policy-loader.ts` ships an older `computePolicyEtag`
 * with a *frozen* canonical form (a hand-sorted column list) for chain
 * compatibility with older callers. New surfaces SHOULD prefer
 * `computeETag` from this module so future row-shape additions are
 * picked up automatically.
 *
 * If-Match contract (FR-205, FR-205a, FR-286, FR-287):
 *   - `If-Match: <etag>` matching → ok:true
 *   - `If-Match: <etag>` mismatched → 412 with body
 *     `{ code:'precondition_failed', expected, observed }`
 *   - `If-Match: *` → ok:true (wildcard always matches an existing row)
 *   - `If-Match` missing (null) → 428 with body
 *     `{ code:'precondition_required', expected, observed:null }`
 *   - `If-Match` malformed → 412 (treated as a normal mismatch so a
 *     malicious client cannot use a syntactic trick to bypass).
 *
 * Weak comparison: per RFC 7232 §2.3, weak ETag matching strips the
 * leading `W/` and compares the quoted opaque string. We accept either
 * form on the wire (`W/"x"` or `"x"`).
 *
 * @see specs/008-resource-governance/spec.md FR-038, FR-048, FR-205,
 *   FR-205a, FR-286, FR-287
 * @see specs/008-resource-governance/tasks.md T069
 */

import { createHash } from 'node:crypto';
import { canonicalizeJcs } from '@/lib/resource-decision-writer';

/** Body shape for the 412 precondition_failed error (FR-205a). */
export interface PreconditionFailedBody {
  code: 'precondition_failed';
  expected: string;
  observed: string | null;
}

/** Body shape for the 428 precondition_required error (FR-205a + RFC 6585). */
export interface PreconditionRequiredBody {
  code: 'precondition_required';
  expected: string;
  observed: null;
}

/** Result type returned by `validateIfMatch`. */
export type IfMatchResult =
  | { ok: true }
  | { ok: false; code: 412; body: PreconditionFailedBody }
  | { ok: false; code: 428; body: PreconditionRequiredBody };

/**
 * Compute the weak ETag for a row. The row MUST carry an integer
 * `version` field; all other fields contribute to the SHA-256 of the
 * canonical JSON form. NaN / Infinity values throw — the surface
 * upstream is expected to validate inputs first via
 * `resource-validation.ts`.
 */
export function computeETag(row: { version: number; [k: string]: unknown }): string {
  const canonical = canonicalizeJcs(row);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `W/"${row.version.toString()}-${digest.slice(0, 12)}"`;
}

/** Strip optional `W/` prefix and surrounding double quotes for compare. */
function normalizeEtagToken(value: string): string | null {
  let v = value.trim();
  if (v.startsWith('W/')) v = v.slice(2);
  if (!v.startsWith('"') || !v.endsWith('"') || v.length < 2) return null;
  return v.slice(1, -1);
}

/**
 * Validate the `If-Match` header value against the current row state.
 * Returns `{ ok: true }` on match, otherwise a typed 412 / 428 result
 * the route handler can translate into a JSON response.
 */
export function validateIfMatch(
  headerValue: string | null,
  currentRow: { version: number; [k: string]: unknown },
): IfMatchResult {
  const expected = computeETag(currentRow);

  if (headerValue === null) {
    return {
      ok: false,
      code: 428,
      body: {
        code: 'precondition_required',
        expected,
        observed: null,
      },
    };
  }

  const trimmed = headerValue.trim();
  if (trimmed === '*') {
    return { ok: true };
  }

  const expectedToken = normalizeEtagToken(expected);
  const observedToken = normalizeEtagToken(trimmed);

  if (expectedToken !== null && observedToken !== null && expectedToken === observedToken) {
    return { ok: true };
  }

  return {
    ok: false,
    code: 412,
    body: {
      code: 'precondition_failed',
      expected,
      observed: trimmed,
    },
  };
}
