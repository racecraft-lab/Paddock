/**
 * SPEC-008 — Idempotency-Key cache (T256). Per FR-219a + FR-391.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 Idempotency-Key cache (T256)', () => {
  it.todo('same key + same body within 24h returns cached response');
  it.todo('same key + different body returns 422 idempotency_body_mismatch (FR-391)');
  it.todo('cache expires after 24h replay window');
});
