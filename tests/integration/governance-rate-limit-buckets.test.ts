/**
 * SPEC-008 — Rate limit buckets (T261). Per FR-203, FR-203a, FR-219k.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 rate limit buckets (T261)', () => {
  it.todo('mutation bucket caps at 60/min/actor');
  it.todo('override-grant bucket caps at 10/min/actor');
  it.todo('breaches emit governance.api.rate_limited{bucket=...} metric');
  it.todo('429 envelope includes retry-after header');
});
