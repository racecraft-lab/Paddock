/**
 * SPEC-008 — Override reason sanitization (T255). Per FR-219c.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 override reason sanitization (T255)', () => {
  it.todo('control characters rejected with validation_failed');
  it.todo('non-UTF-8 byte sequences rejected');
  it.todo('reason length > 2048 rejected');
  it.todo('clean reason accepted');
});
