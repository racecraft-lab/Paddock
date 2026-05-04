/**
 * SPEC-008 — Shared audit-chain primitives (T146).
 *
 * Per FR-176, FR-176a, FR-184, FR-219m, FR-368. This module is the single
 * home for the byte-stable hashing primitives used by every governance
 * audit chain (`resource_decision_audit`, `resource_budget_ledger`,
 * `recovery_action`, override-grant audit, Aegis fallback activity).
 *
 * IMPORTANT — frozen byte-form:
 *   - `canonicalAuditForm` and `hashAuditRow` mirror the M64 genesis
 *     migration EXACTLY. The M64 genesis row's `row_hash` was computed
 *     against the byte-output of these functions; changing them would
 *     invalidate the entire `resource_decision_audit` chain.
 *   - `canonicalizeJcs` is the generic RFC-8785-style canonicalizer
 *     used by NEW chains (override-grant audit, recovery-action chain).
 *     The decision-row pipe form is intentionally NOT JSON — that chain
 *     is frozen.
 *
 * `resource-decision-writer.ts` re-exports these symbols so existing
 * imports (`import { canonicalizeJcs } from '@/lib/resource-decision-writer'`)
 * continue to work. T148 builds `appendChainEntry` atop these primitives
 * with per-table canonical-row callbacks.
 *
 * @see specs/008-resource-governance/spec.md FR-176, FR-176a, FR-184,
 *      FR-219m, FR-368
 * @see specs/008-resource-governance/tasks.md T146
 * @see Constitution Convention J (strict-scope)
 */

import { createHash } from 'node:crypto';

/**
 * Genesis-row prev_hash for NEW audit chains (FR-219m). 64 zero hex
 * characters. Existing chains keep their own genesis values; this
 * constant is for chains created from Phase 7.7 forward.
 */
export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Build the canonical pipe-delimited form for a `resource_decision_audit`
 * row. Mirrors the M64 genesis migration exactly so chain walks reconcile.
 * Frozen for chain-of-custody reasons — DO NOT CHANGE.
 */
export function canonicalAuditForm(args: {
  prev_hash: string;
  decision_id: string;
  actor: string;
  decision: string;
  reason: string;
  payload_json: string;
}): string {
  return [
    args.prev_hash,
    args.decision_id,
    args.actor,
    args.decision,
    args.reason,
    args.payload_json,
  ].join('|');
}

/** SHA-256 hex digest of an audit canonical form. */
export function hashAuditRow(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * RFC 8785 JCS-style canonical JSON serializer. Used by surfaces (etag,
 * resource-etag, future verifiers) that need a deterministic, byte-stable
 * representation of an arbitrary JSON-compatible value.
 *
 * Rules:
 *   - Object keys sorted lexicographically (UTF-16 code units, JS default).
 *   - Arrays preserve order (semantically meaningful).
 *   - undefined values omitted (object keys) or rendered as null (arrays).
 *   - Function / symbol values rejected — they are not JSON-compatible and
 *     leaking them through silently would produce invalid output.
 *   - Numbers: NaN / +-Infinity rejected (matches FR-219e). Finite numbers
 *     render via `JSON.stringify` (the standard 64-bit IEEE-754 form).
 *   - Strings escape per `JSON.stringify` defaults.
 *
 * NOTE: This canonicalizer is GENERIC. The decision-row audit chain uses a
 * fixed `auditPayload` shape with hardcoded sort order — that function is
 * frozen for chain-of-custody reasons (the M64 genesis row hash was
 * computed against its exact byte output) and must NOT be changed. Use
 * `canonicalizeJcs` for new surfaces only.
 */
export function canonicalizeJcs(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `canonicalizeJcs: non-finite number is not JSON-compatible: ${String(value)}`,
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(
      `canonicalizeJcs: ${typeof value} value is not JSON-compatible`,
    );
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) =>
      item === undefined ? 'null' : canonicalizeJcs(item),
    );
    return `[${parts.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonicalizeJcs(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  // bigint / etc.
  throw new Error(
    `canonicalizeJcs: unsupported value type ${typeof value}`,
  );
}

/**
 * Compute `row_hash = sha256(prev_hash + canonicalizeJcs(content))` for a
 * NEW chain (override-grant audit, recovery-action chain, etc.). The
 * `prev_hash` value comes from the most recently appended row, or
 * `GENESIS_PREV_HASH` for the very first row.
 *
 * Does NOT include `prev_hash` inside the JCS object — it is concatenated
 * outside the JSON envelope so a verifier can re-hash without rebuilding
 * the prev_hash field. This matches the FR-368 unified algorithm spec.
 */
export function chainHash(prevHash: string, content: unknown): string {
  const body = canonicalizeJcs(content);
  return createHash('sha256')
    .update(prevHash, 'utf8')
    .update('|', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
}

/**
 * Verifier helper — given a previous row's `row_hash` and the current
 * row's content, recompute the expected `row_hash` and compare against
 * the stored value.
 */
export function verifyChainEntry(args: {
  prev_hash: string;
  content: unknown;
  stored_row_hash: string;
}): { ok: boolean; expected_row_hash: string } {
  const expected = chainHash(args.prev_hash, args.content);
  return { ok: expected === args.stored_row_hash, expected_row_hash: expected };
}
