/**
 * SPEC-008 — Audit chain walk (T262). Per FR-176, FR-177, FR-177a, FR-219n.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 audit chain walk (T262)', () => {
  it.todo('verifier walks resource_decision_audit clean chain ok=true');
  it.todo('tamper detected (row_hash mismatch)');
  it.todo('resumable cursor advances last_verified_id');
  it.todo('archive cross-check returns no_archives until partition writer ships');
});
