/**
 * SPEC-008 — 404-vs-403 disambiguation (T257). Per FR-219g.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 404 vs 403 (T257)', () => {
  it.todo('non-existent resource returns 404 not_found (not 403)');
  it.todo('existing resource without permission returns 403 forbidden');
});
