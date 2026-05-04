/**
 * SPEC-008 — Ingest disk hysteresis (T266). Per FR-090e1.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 ingest disk hysteresis (T266)', () => {
  it.todo('disk falling below low-water mark pauses all sources');
  it.todo('disk rising above high-water mark resumes all sources');
});
