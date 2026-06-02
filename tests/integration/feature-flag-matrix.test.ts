/**
 * SPEC-008 — T321..T330 + T349..T352 — feature-flag matrix integration.
 *
 * Single test file orchestrates ALL matrix scenarios for ALL 9 flags.
 * Each `describe.each` row corresponds to one of the per-flag tasks
 * T322..T330 (unit-level resolveFlag semantics) and T331..T339
 * (integration-level ON behavior).
 *
 * Per Constitution V the matrix is non-negotiable: 9 unit × 9 integration
 * × 9 e2e + 1 all-on baseline + 1 all-off legacy parity baseline +
 * dependency chain handling + invalid-config error.
 *
 * @see specs/008-resource-governance/spec.md FR-316..325, FR-376
 * @see specs/008-resource-governance/tasks.md T320..T353
 */

import { describe, it, expect } from 'vitest'
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  expandFeatureFlagCascade,
  getFeatureFlagCascadePrerequisites,
  evaluateFeatureFlagCore,
  resolveFlag,
  type FeatureFlagKey,
} from '../../src/lib/feature-flags'
import {
  runFeatureFlagMatrix,
  buildScenarioFlags,
  assertEnableRequires,
  InvalidFeatureFlagConfigurationError,
} from '../../src/lib/feature-flag-matrix'

const SPEC_008_FLAGS: readonly FeatureFlagKey[] = [
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

describe('SPEC-008 T320..T353 — feature-flag matrix coverage', () => {
  describe.each(SPEC_008_FLAGS)('flag %s', (flag) => {
    // T322..T330 — UNIT — resolveFlag + env-override semantics.
    it(`OFF/ON via workspace_flags + env overrides (T${322 + SPEC_008_FLAGS.indexOf(flag)})`, () => {
      // OFF when no workspace_flags and no env entry.
      expect(
        resolveFlag(flag, { workspaceFlags: '{}', env: {} }),
      ).toBe(false)

      // ON via additive workspace_flags cascade.
      expect(
        resolveFlag(flag, { workspaceFlags: JSON.stringify(expandFeatureFlagCascade(flag, true)), env: {} }),
      ).toBe(true)

      // env='0' forces OFF even when workspace_flags says ON.
      expect(
        resolveFlag(flag, {
          workspaceFlags: JSON.stringify(expandFeatureFlagCascade(flag, true)),
          env: { [flag]: '0' },
        }),
      ).toBe(false)

      if (getFeatureFlagCascadePrerequisites(flag).length > 0) {
        const additiveCascade = evaluateFeatureFlagCore(flag, {
          workspaceFlags: JSON.stringify({ [flag]: true }),
          env: {},
        })
        expect(additiveCascade.value).toBe(true)
        expect(additiveCascade.reason).toBe('workspace_override')

        const blockedCascade = evaluateFeatureFlagCore(flag, {
          workspaceFlags: JSON.stringify({
            [flag]: true,
            [getFeatureFlagCascadePrerequisites(flag)[0]]: false,
          }),
          env: {},
        })
        expect(blockedCascade.value).toBe(false)
        expect(blockedCascade.reason).toBe('cascade_dependency_off')
      }

      // env='1' does NOT force ON for SPEC-008 flags (only the
      // pilot escape hatch is permitted to opt in via env).
      const envForceOnResolution = evaluateFeatureFlagCore(flag, {
        workspaceFlags: '{}',
        env: { [flag]: '1' },
      })
      expect(envForceOnResolution.value).toBe(false)
      expect(envForceOnResolution.reason).toBe('default_off')
    })

    // T331..T339 — INTEGRATION — ON behavior with full enable chain.
    it(`ON-isolation auto-satisfies enableRequires chain (T${331 + SPEC_008_FLAGS.indexOf(flag)})`, () => {
      const { flags, prerequisitesSatisfied } = buildScenarioFlags(flag, 'on-isolation')
      expect(prerequisitesSatisfied).toBe(true)
      expect(flags[flag]).toBe(true)
      // Every prerequisite in the registry chain is also ON.
      for (const prereq of getFeatureFlagCascadePrerequisites(flag)) {
        expect(flags[prereq]).toBe(true)
      }
      // The flag resolves to true under the chain.
      expect(
        resolveFlag(flag, { workspaceFlags: JSON.stringify(flags), env: {} }),
      ).toBe(true)
    })
  })

  // T349 — all-flags-ON baseline.
  it('T349 all-flags-ON baseline: every flag resolves true', () => {
    const allOn = Object.fromEntries(FEATURE_FLAG_KEYS.map((k) => [k, true]))
    for (const flag of SPEC_008_FLAGS) {
      expect(
        resolveFlag(flag, { workspaceFlags: JSON.stringify(allOn), env: {} }),
      ).toBe(true)
    }
  })

  // T350 — all-flags-OFF legacy parity baseline.
  it('T350 all-flags-OFF legacy parity: every flag resolves false', () => {
    const allOff = Object.fromEntries(FEATURE_FLAG_KEYS.map((k) => [k, false]))
    for (const flag of SPEC_008_FLAGS) {
      expect(
        resolveFlag(flag, { workspaceFlags: JSON.stringify(allOff), env: {} }),
      ).toBe(false)
    }
  })

  // T351 — invalid-config error: enabling a flag whose enableRequires
  // are not satisfied throws InvalidFeatureFlagConfigurationError.
  it('T351 invalid-config: ON without satisfied prerequisite throws', () => {
    expect(() =>
      assertEnableRequires('FEATURE_GLOBAL_AEGIS', {
        FEATURE_GLOBAL_AEGIS: true,
        FEATURE_WORKSPACE_SWITCHER: false,
      }),
    ).toThrow(InvalidFeatureFlagConfigurationError)
    expect(() =>
      assertEnableRequires('FEATURE_TASK_PIPELINES', {
        FEATURE_TASK_PIPELINES: true,
        FEATURE_GLOBAL_AEGIS: false,
        FEATURE_WORKSPACE_SWITCHER: true,
      }),
    ).toThrow(InvalidFeatureFlagConfigurationError)
  })

  // T352 — Deprecated-flag handling: a flag with status='deprecated'
  // continues to be exercised by the matrix (FR-377).
  it('T352 deprecated flags continue to be exercised', () => {
    const deprecated = SPEC_008_FLAGS.filter(
      (k) => FEATURE_FLAG_REGISTRY[k].implementationStatus === 'deprecated',
    )
    // The matrix must still run them; the assertion ensures matrix
    // does not silently skip a deprecated flag.
    for (const flag of deprecated) {
      const { flags } = buildScenarioFlags(flag, 'on-isolation')
      expect(flags[flag]).toBe(true)
    }
  })

  // T353 — Coverage assertion: matrix exercises every flag × scenario.
  it('T353 matrix coverage: 9 flags × 4 scenarios + every cell observed', () => {
    const results = runFeatureFlagMatrix()
    const cells = new Set(results.map((r) => `${r.flag}:${r.scenario}`))
    for (const flag of SPEC_008_FLAGS) {
      for (const scenario of ['off-isolation', 'on-isolation', 'all-on', 'all-off']) {
        expect(cells.has(`${flag}:${scenario}`)).toBe(true)
      }
    }
    // At least 9 flags × 4 scenarios = 36 cells (plus the
    // PILOT_PADDOCK_E2E flag's 4 cells = 40 total; both are
    // acceptable, but we assert ≥36 to lock SPEC-008 coverage).
    expect(results.length).toBeGreaterThanOrEqual(36)
  })

  // FR-323 env=='1' tigthtening: the env=='1' code-path covers ONLY
  // the explicit force-on exception list. SPEC-008 flags must not
  // appear there.
  it('FR-323 SPEC-008 flags are NOT in the env-force-on exception list', () => {
    for (const flag of SPEC_008_FLAGS) {
      const resolution = evaluateFeatureFlagCore(flag, {
        workspaceFlags: '{}',
        env: { [flag]: '1' },
      })
      // Reason must be 'default_off', NOT 'env_force_on_exception'.
      expect(resolution.reason).not.toBe('env_force_on_exception')
      expect(resolution.value).toBe(false)
    }
  })
})
