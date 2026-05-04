/**
 * SPEC-008 — Correction ledger same-tx (T263). Per FR-103.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 correction ledger same-tx (T263)', () => {
  it.todo('correction row + corrected row written in one transaction');
  it.todo('rollback on correction failure leaves ledger consistent');
});
