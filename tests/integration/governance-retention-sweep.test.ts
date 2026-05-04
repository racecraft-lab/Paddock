/**
 * SPEC-008 — Retention sweep (T267). Per FR-250 + FR-384 FK guard + dry-run.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 retention sweep (T267)', () => {
  it.todo('partition checksum stable across rerun');
  it.todo('FK-referenced rows are skipped (FR-384)');
  it.todo('dry-run does not delete source rows');
});
