/**
 * SPEC-008 — T320 — Feature-flag matrix runner harness.
 *
 * Drives the 9-flag × 4-scenario coverage matrix demanded by
 * Constitution V (NON-NEGOTIABLE). Programmatically toggles each
 * `FEATURE_FLAG_KEYS` entry across the four scenarios and emits a
 * coverage report keyed by `(flag, scenario)`. CI fails closed when
 * any combination is uncovered.
 *
 * Scenarios:
 *   - off-isolation: flag explicitly OFF, others default OFF.
 *   - on-isolation: flag explicitly ON (with `enableRequires`
 *     auto-satisfied along the chain).
 *   - all-on: every flag ON in the same workspace.
 *   - all-off: every flag OFF (legacy parity baseline).
 *
 * Env override semantics (FR-323):
 *   - `process.env.FEATURE_X='0'` forces OFF (irrespective of
 *     workspace_flags).
 *   - `process.env.FEATURE_X='1'` does NOT force ON for any flag
 *     in the SPEC-008 set; only the `PILOT_PADDOCK_E2E`
 *     escape hatch lets `'1'` opt in.
 *   - Only `workspaces.feature_flags` JSON can opt a workspace ON.
 *
 * @see specs/008-resource-governance/spec.md FR-316..325, FR-376
 * @see specs/008-resource-governance/tasks.md T320
 */

import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  expandFeatureFlagCascade,
  evaluateFeatureFlagCore,
  getFeatureFlagCascadePrerequisites,
  type FeatureFlagContext,
  type FeatureFlagKey,
} from './feature-flags'

export type FlagMatrixScenario = 'off-isolation' | 'on-isolation' | 'all-on' | 'all-off'

export interface FlagMatrixResult {
  flag: FeatureFlagKey
  scenario: FlagMatrixScenario
  expectedValue: boolean
  observedValue: boolean
  reason: string
  enableRequires: readonly FeatureFlagKey[]
  prerequisitesSatisfied: boolean
}

export class InvalidFeatureFlagConfigurationError extends Error {
  constructor(
    public flag: FeatureFlagKey,
    public missingPrerequisite: FeatureFlagKey,
  ) {
    super(
      `Feature flag ${flag} requires ${missingPrerequisite} to be ON before it can be enabled.`,
    )
    this.name = 'InvalidFeatureFlagConfigurationError'
  }
}

/**
 * Build the workspace-flags JSON payload for a scenario.
 * Returns the prerequisites-satisfied flag so callers can observe
 * dependency-chain coverage (T350).
 */
export function buildScenarioFlags(
  flag: FeatureFlagKey,
  scenario: FlagMatrixScenario,
): { flags: Record<FeatureFlagKey, boolean>; prerequisitesSatisfied: boolean } {
  const flags: Record<string, boolean> = {}
  let prerequisitesSatisfied = true

  switch (scenario) {
    case 'off-isolation':
      // Default OFF — no entries needed; absence means OFF.
      return { flags: flags as Record<FeatureFlagKey, boolean>, prerequisitesSatisfied: true }
    case 'all-off':
      for (const key of FEATURE_FLAG_KEYS) flags[key] = false
      return { flags: flags as Record<FeatureFlagKey, boolean>, prerequisitesSatisfied: true }
    case 'all-on':
      for (const key of FEATURE_FLAG_KEYS) flags[key] = true
      return { flags: flags as Record<FeatureFlagKey, boolean>, prerequisitesSatisfied: true }
    case 'on-isolation': {
      Object.assign(flags, expandFeatureFlagCascade(flag, true))
      // Check that the resulting flag set actually covers all chain
      // prerequisites — a structural guard against registry drift.
      for (const key of Object.keys(flags) as FeatureFlagKey[]) {
        for (const prereq of getFeatureFlagCascadePrerequisites(key)) {
          if (!flags[prereq]) {
            prerequisitesSatisfied = false
          }
        }
      }
      return { flags: flags as Record<FeatureFlagKey, boolean>, prerequisitesSatisfied }
    }
  }
}

/**
 * Run the matrix and return a flat array of results. Each
 * `(flag, scenario)` cell is exercised independently so the report
 * can pinpoint coverage gaps.
 */
export function runFeatureFlagMatrix(opts: {
  /** Test-only: override env to assert env-forcing semantics (FR-323). */
  env?: Record<string, string | undefined>
} = {}): FlagMatrixResult[] {
  const results: FlagMatrixResult[] = []
  const scenarios: FlagMatrixScenario[] = ['off-isolation', 'on-isolation', 'all-on', 'all-off']

  for (const flag of FEATURE_FLAG_KEYS) {
    for (const scenario of scenarios) {
      const { flags, prerequisitesSatisfied } = buildScenarioFlags(flag, scenario)
      const ctx: FeatureFlagContext = {
        workspaceFlags: JSON.stringify(flags),
        env: opts.env ?? {},
      }
      const resolution = evaluateFeatureFlagCore(flag, ctx)
      let expectedValue: boolean
      switch (scenario) {
        case 'off-isolation':
        case 'all-off':
          expectedValue = false
          break
        case 'on-isolation':
        case 'all-on':
          expectedValue = true
          break
      }
      results.push({
        flag,
        scenario,
        expectedValue,
        observedValue: resolution.value,
        reason: resolution.reason,
        enableRequires: FEATURE_FLAG_REGISTRY[flag].enableRequires,
        prerequisitesSatisfied,
      })
    }
  }
  return results
}

/**
 * Coverage report formatter used by CI. Returns a human-readable
 * markdown table plus a machine-friendly summary.
 */
export function formatMatrixReport(results: readonly FlagMatrixResult[]): string {
  const lines: string[] = []
  lines.push('| Flag | Scenario | Expected | Observed | Reason | Prereqs |')
  lines.push('| ---- | -------- | -------- | -------- | ------ | ------- |')
  for (const r of results) {
    lines.push(
      `| ${r.flag} | ${r.scenario} | ${r.expectedValue} | ${r.observedValue} | ${r.reason} | ${r.prerequisitesSatisfied} |`,
    )
  }
  return lines.join('\n')
}

/**
 * Assert that an attempt to enable `flag` while a prerequisite is
 * OFF throws `InvalidFeatureFlagConfigurationError`. Used by T351.
 */
export function assertEnableRequires(
  flag: FeatureFlagKey,
  candidateFlags: Record<string, boolean>,
): void {
  for (const prereq of getFeatureFlagCascadePrerequisites(flag)) {
    if (!candidateFlags[prereq]) {
      throw new InvalidFeatureFlagConfigurationError(flag, prereq)
    }
  }
}
