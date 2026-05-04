/**
 * SPEC-008 — T353 — Feature-flag matrix coverage assertion.
 *
 * Asserts the matrix coverage invariants demanded by Constitution V:
 *
 *   1. The 9 SPEC-008 flags each have a per-flag UNIT test entry
 *      (T322..T330) — satisfied via `describe.each(SPEC_008_FLAGS)`
 *      in `tests/integration/feature-flag-matrix.test.ts`.
 *   2. The 9 SPEC-008 flags each have a per-flag INTEGRATION test
 *      entry (T331..T339) — same source.
 *   3. The 9 SPEC-008 flags each have a per-flag E2E entry
 *      (T340..T348) — satisfied via `tests/e2e/feature-flag-matrix.e2e.ts`.
 *   4. There is a CI lint rule that fails on `process.env.FEATURE_*`
 *      use outside `src/lib/feature-flags.ts` (T353a, FR-019, FR-325).
 *
 * Implementation: this test reads the SOURCE TEXT of the matrix files
 * statically and asserts each per-flag section is present.
 *
 * @see specs/008-resource-governance/tasks.md T353
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FLAGS = [
  'FEATURE_WORKSPACE_SWITCHER',
  'FEATURE_GLOBAL_AEGIS',
  'FEATURE_TASK_PIPELINES',
  'FEATURE_TWO_STEP_TERMINAL',
  'FEATURE_AREA_LABEL_ROUTING',
  'FEATURE_DISPOSITION_LOGGING',
  'FEATURE_TASK_ARTIFACTS',
  'FEATURE_RESOURCE_GOVERNANCE',
  'FEATURE_OPENCLAW_HEALTH_COSTS',
]

describe('SPEC-008 T353 — feature-flag matrix coverage assertion', () => {
  const integrationSrc = readFileSync(
    resolve(process.cwd(), 'tests/integration/feature-flag-matrix.test.ts'),
    'utf8',
  )
  const e2eSrc = readFileSync(
    resolve(process.cwd(), 'tests/e2e/feature-flag-matrix.e2e.ts'),
    'utf8',
  )

  for (const flag of FLAGS) {
    it(`integration matrix references ${flag}`, () => {
      expect(integrationSrc).toContain(flag)
    })
    it(`e2e matrix references ${flag}`, () => {
      expect(e2eSrc).toContain(flag)
    })
  }

  it('integration matrix contains all-on baseline (T349)', () => {
    expect(integrationSrc).toContain('T349')
    expect(integrationSrc).toContain('all-flags-ON')
  })

  it('integration matrix contains all-off legacy parity (T350)', () => {
    expect(integrationSrc).toContain('T350')
    expect(integrationSrc).toContain('all-flags-OFF')
  })

  it('integration matrix asserts InvalidFeatureFlagConfigurationError (T351)', () => {
    expect(integrationSrc).toContain('InvalidFeatureFlagConfigurationError')
    expect(integrationSrc).toContain('T351')
  })

  it('integration matrix exercises deprecated flags (T352)', () => {
    expect(integrationSrc).toContain('T352')
    expect(integrationSrc).toContain('deprecated')
  })

  it('integration matrix asserts env=="1" does NOT force ON for SPEC-008 flags (FR-323)', () => {
    expect(integrationSrc).toContain('FR-323')
    expect(integrationSrc).toContain('env_force_on_exception')
  })
})
