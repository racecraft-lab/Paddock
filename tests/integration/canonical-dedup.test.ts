/**
 * SPEC-008 — Canonical event dedup (T251) — AC-Dedup-1 / FR-386.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 canonical dedup (T251)', () => {
  it.todo('same canonical (source, signature) emitted twice yields one ledger row');
  it.todo('different signatures with same source produce two rows (FR-091/FR-092)');
});
