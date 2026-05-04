/**
 * SPEC-008 — Tests for shared audit-chain primitives (T146).
 *
 * Two protections:
 *   1. Byte-equivalence with the pre-extraction surface in
 *      `resource-decision-writer.ts`. The re-exported names MUST behave
 *      identically (so the M64 genesis row remains valid).
 *   2. Verifier round-trip: `chainHash(prev, content)` followed by
 *      `verifyChainEntry({prev, content, stored})` returns ok=true with
 *      matching expected hash.
 *
 * @see specs/008-resource-governance/spec.md FR-176, FR-176a, FR-184,
 *      FR-219m, FR-368
 * @see specs/008-resource-governance/tasks.md T146
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalAuditForm,
  canonicalizeJcs,
  chainHash,
  GENESIS_PREV_HASH,
  hashAuditRow,
  verifyChainEntry,
} from '@/lib/resource-audit-chain';
import * as decisionWriter from '@/lib/resource-decision-writer';

describe('SPEC-008 resource-audit-chain primitives (T146)', () => {
  it('GENESIS_PREV_HASH is 64 hex zeros', () => {
    expect(GENESIS_PREV_HASH).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(GENESIS_PREV_HASH).toHaveLength(64);
  });

  it('canonicalAuditForm is byte-equivalent across the audit-chain and decision-writer modules', () => {
    const args = {
      prev_hash: 'abc',
      decision_id: 'dec_001',
      actor: 'system',
      decision: 'allow',
      reason: 'allow:clear',
      payload_json: '{"k":1}',
    } as const;
    expect(canonicalAuditForm(args)).toBe(decisionWriter.canonicalAuditForm(args));
    // And matches the documented pipe-form exactly.
    expect(canonicalAuditForm(args)).toBe('abc|dec_001|system|allow|allow:clear|{"k":1}');
  });

  it('hashAuditRow is byte-equivalent across modules', () => {
    const canonical = 'abc|dec_001|system|allow|allow:clear|{"k":1}';
    expect(hashAuditRow(canonical)).toBe(decisionWriter.hashAuditRow(canonical));
    // Stable sample.
    expect(hashAuditRow(canonical)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('canonicalizeJcs is byte-equivalent across modules and sorts keys', () => {
    const v = { b: 2, a: { z: 9, y: 8 }, c: [1, 2, { d: 3 }] };
    expect(canonicalizeJcs(v)).toBe(decisionWriter.canonicalizeJcs(v));
    expect(canonicalizeJcs(v)).toBe('{"a":{"y":8,"z":9},"b":2,"c":[1,2,{"d":3}]}');
  });

  it('canonicalizeJcs rejects non-finite numbers and functions', () => {
    expect(() => canonicalizeJcs(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalizeJcs(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => canonicalizeJcs(() => 1)).toThrow(/function/);
  });

  it('chainHash composes prev_hash + canonical content bytes', () => {
    const prev = GENESIS_PREV_HASH;
    const content = { a: 1, b: 2 };
    const h = chainHash(prev, content);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    // Manual recomputation: sha256('0...0' + '|' + '{"a":1,"b":2}')
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const expected = createHash('sha256')
      .update(prev)
      .update('|')
      .update('{"a":1,"b":2}')
      .digest('hex');
    expect(h).toBe(expected);
  });

  it('verifyChainEntry round-trips for matching inputs', () => {
    const prev = GENESIS_PREV_HASH;
    const content = { kind: 'override', actor: 'op:1' };
    const stored = chainHash(prev, content);
    const r = verifyChainEntry({ prev_hash: prev, content, stored_row_hash: stored });
    expect(r.ok).toBe(true);
    expect(r.expected_row_hash).toBe(stored);
  });

  it('verifyChainEntry rejects a tampered content payload', () => {
    const prev = GENESIS_PREV_HASH;
    const content = { kind: 'override', actor: 'op:1' };
    const stored = chainHash(prev, content);
    const r = verifyChainEntry({
      prev_hash: prev,
      content: { kind: 'override', actor: 'op:2' },
      stored_row_hash: stored,
    });
    expect(r.ok).toBe(false);
  });
});
