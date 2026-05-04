/**
 * SPEC-008 — CSRF + cross-origin guards (T258). Per FR-204 + FR-219j.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 CSRF + cross-origin (T258)', () => {
  it.todo('CSRF token mismatch rejected with 403');
  it.todo('cross-origin mutation rejected with 403');
  it.todo('OTLP receiver rejects x-api-key + Authorization simultaneously (FR-219j)');
});
