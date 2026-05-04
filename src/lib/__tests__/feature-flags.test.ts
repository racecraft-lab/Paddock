import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateFeatureFlagCore,
  expandFeatureFlagCascade,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  getFeatureFlagCascadeDependents,
  getFeatureFlagCascadePrerequisites,
  resolveFlag,
} from '@/lib/feature-flags'
import { evaluateFeatureFlagWithOpenFeature } from '@/lib/feature-flags-openfeature'

describe('resolveFlag', () => {
  it('defaults FEATURE flags off when workspace flags are absent', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', { env: {} })).toBe(false)
  })

  it('honors workspace JSON opt-in', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: {},
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    })).toBe(true)
  })

  it('lets env 0 force a workspace flag off', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: { FEATURE_WORKSPACE_SWITCHER: '0' },
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    })).toBe(false)
  })

  it('does not let env 1 force normal FEATURE flags on', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: { FEATURE_WORKSPACE_SWITCHER: '1' },
      workspaceFlags: null,
    })).toBe(false)
  })

  it('evaluates FEATURE_GLOBAL_AEGIS from workspace context only when earlier phases are enabled', () => {
    expect(resolveFlag('FEATURE_GLOBAL_AEGIS', {
      env: {},
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true, FEATURE_GLOBAL_AEGIS: true },
    })).toBe(true)
    expect(resolveFlag('FEATURE_GLOBAL_AEGIS', {
      env: { FEATURE_GLOBAL_AEGIS: '1' },
      workspaceFlags: null,
    })).toBe(false)
  })

  it('implies earlier cascade phases when only a later flag is stored on', () => {
    const resolution = evaluateFeatureFlagCore('FEATURE_RESOURCE_GOVERNANCE', {
      env: {},
      workspaceFlags: { FEATURE_RESOURCE_GOVERNANCE: true },
    })

    expect(resolution.value).toBe(true)
    expect(resolution.reason).toBe('workspace_override')
    expect(resolution.storedValue).toBe(true)

    const implied = evaluateFeatureFlagCore('FEATURE_TASK_ARTIFACTS', {
      env: {},
      workspaceFlags: { FEATURE_RESOURCE_GOVERNANCE: true },
    })
    expect(implied.value).toBe(true)
    expect(implied.reason).toBe('cascade_implied_on')
    expect(implied.storedValue).toBeNull()
  })

  it('keeps later flags effectively off when an earlier cascade phase is explicitly disabled', () => {
    const resolution = evaluateFeatureFlagCore('FEATURE_RESOURCE_GOVERNANCE', {
      env: {},
      workspaceFlags: {
        FEATURE_RESOURCE_GOVERNANCE: true,
        FEATURE_TASK_ARTIFACTS: false,
      },
    })

    expect(resolution.value).toBe(false)
    expect(resolution.reason).toBe('cascade_dependency_off')
    expect(resolution.storedValue).toBe(true)
  })

  it('resolves SPEC-008 flags on when the full prior cascade is enabled', () => {
    const workspaceFlags = expandFeatureFlagCascade('FEATURE_RESOURCE_GOVERNANCE', true)

    expect(resolveFlag('FEATURE_RESOURCE_GOVERNANCE', {
      env: {},
      workspaceFlags,
    })).toBe(true)
    expect(workspaceFlags.FEATURE_WORKSPACE_SWITCHER).toBe(true)
    expect(workspaceFlags.FEATURE_TASK_ARTIFACTS).toBe(true)
  })

  it('turns dependent later phases off when disabling a cascade prerequisite', () => {
    const workspaceFlags = expandFeatureFlagCascade('FEATURE_WORKSPACE_SWITCHER', false)

    expect(workspaceFlags.FEATURE_WORKSPACE_SWITCHER).toBe(false)
    expect(workspaceFlags.FEATURE_GLOBAL_AEGIS).toBe(false)
    expect(workspaceFlags.FEATURE_RESOURCE_GOVERNANCE).toBe(false)
    expect(workspaceFlags.PILOT_PRODUCT_LINE_A_E2E).toBe(false)
  })

  it('lets env 0 kill-switch FEATURE_GLOBAL_AEGIS even when workspace flags enable it', () => {
    expect(resolveFlag('FEATURE_GLOBAL_AEGIS', {
      env: { FEATURE_GLOBAL_AEGIS: '0' },
      workspaceFlags: { FEATURE_GLOBAL_AEGIS: true },
    })).toBe(false)
  })

  it('defaults malformed FEATURE_GLOBAL_AEGIS workspace JSON off', () => {
    const resolution = evaluateFeatureFlagCore('FEATURE_GLOBAL_AEGIS', {
      env: {},
      workspaceFlags: '{not json',
    })

    expect(resolution.value).toBe(false)
    expect(resolution.reason).toBe('default_off')
    expect(resolution.storedValue).toBeNull()
  })

  it('preserves the pilot env-force-on exception', () => {
    expect(resolveFlag('PILOT_PRODUCT_LINE_A_E2E', {
      env: { PILOT_PRODUCT_LINE_A_E2E: '1' },
      workspaceFlags: null,
    })).toBe(true)
  })

  it('returns reason metadata from the pure evaluator', () => {
    const resolution = evaluateFeatureFlagCore('FEATURE_WORKSPACE_SWITCHER', {
      env: { FEATURE_WORKSPACE_SWITCHER: '0' },
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    })
    expect(resolution.value).toBe(false)
    expect(resolution.envLocked).toBe(true)
    expect(resolution.reason).toBe('env_force_off')
    expect(resolution.storedValue).toBe(true)
  })
})

describe('feature flag registry', () => {
  it('registers every RC Factory roadmap flag exactly once', () => {
    expect(FEATURE_FLAG_KEYS).toEqual([
      'FEATURE_WORKSPACE_SWITCHER',
      'FEATURE_GLOBAL_AEGIS',
      'FEATURE_TASK_PIPELINES',
      'FEATURE_TWO_STEP_TERMINAL',
      'FEATURE_AREA_LABEL_ROUTING',
      'FEATURE_DISPOSITION_LOGGING',
      'FEATURE_TASK_ARTIFACTS',
      'FEATURE_RESOURCE_GOVERNANCE',
      'FEATURE_OPENCLAW_HEALTH_COSTS',
      'PILOT_PRODUCT_LINE_A_E2E',
    ])
    expect(Object.keys(FEATURE_FLAG_REGISTRY).sort()).toEqual([...FEATURE_FLAG_KEYS].sort())
  })

  it('keeps dependency graph explicit for downstream and pilot flags', () => {
    expect(FEATURE_FLAG_REGISTRY.FEATURE_GLOBAL_AEGIS.enableRequires).toEqual(['FEATURE_WORKSPACE_SWITCHER'])
    expect(FEATURE_FLAG_REGISTRY.FEATURE_TASK_PIPELINES.enableRequires).toEqual(['FEATURE_GLOBAL_AEGIS'])
    expect(FEATURE_FLAG_REGISTRY.FEATURE_TWO_STEP_TERMINAL.enableRequires).toEqual(['FEATURE_TASK_PIPELINES'])
    expect(FEATURE_FLAG_REGISTRY.FEATURE_AREA_LABEL_ROUTING.enableRequires).toEqual(['FEATURE_WORKSPACE_SWITCHER'])
    expect(FEATURE_FLAG_REGISTRY.PILOT_PRODUCT_LINE_A_E2E.enableRequires).toContain('FEATURE_OPENCLAW_HEALTH_COSTS')
    expect(FEATURE_FLAG_REGISTRY.PILOT_PRODUCT_LINE_A_E2E.enableRequires).toHaveLength(9)
  })

  it('derives additive cascade prerequisites from roadmap phase order', () => {
    expect(getFeatureFlagCascadePrerequisites('FEATURE_GLOBAL_AEGIS')).toEqual([
      'FEATURE_WORKSPACE_SWITCHER',
    ])
    expect(getFeatureFlagCascadePrerequisites('FEATURE_RESOURCE_GOVERNANCE')).toEqual([
      'FEATURE_WORKSPACE_SWITCHER',
      'FEATURE_GLOBAL_AEGIS',
      'FEATURE_TASK_PIPELINES',
      'FEATURE_TWO_STEP_TERMINAL',
      'FEATURE_AREA_LABEL_ROUTING',
      'FEATURE_DISPOSITION_LOGGING',
      'FEATURE_TASK_ARTIFACTS',
    ])
    expect(getFeatureFlagCascadePrerequisites('FEATURE_OPENCLAW_HEALTH_COSTS')).toContain(
      'FEATURE_RESOURCE_GOVERNANCE',
    )
  })

  it('derives additive cascade dependents for disabling earlier phases', () => {
    expect(getFeatureFlagCascadeDependents('FEATURE_WORKSPACE_SWITCHER')).toEqual([
      'FEATURE_GLOBAL_AEGIS',
      'FEATURE_TASK_PIPELINES',
      'FEATURE_TWO_STEP_TERMINAL',
      'FEATURE_AREA_LABEL_ROUTING',
      'FEATURE_DISPOSITION_LOGGING',
      'FEATURE_TASK_ARTIFACTS',
      'FEATURE_RESOURCE_GOVERNANCE',
      'FEATURE_OPENCLAW_HEALTH_COSTS',
      'PILOT_PRODUCT_LINE_A_E2E',
    ])
    expect(getFeatureFlagCascadeDependents('FEATURE_RESOURCE_GOVERNANCE')).toEqual([
      'FEATURE_OPENCLAW_HEALTH_COSTS',
      'PILOT_PRODUCT_LINE_A_E2E',
    ])
  })

  it('marks FEATURE_GLOBAL_AEGIS implemented but gated by workspace switcher preflight', () => {
    expect(FEATURE_FLAG_REGISTRY.FEATURE_GLOBAL_AEGIS.implementationStatus).toBe('ready_for_canary')
    expect(FEATURE_FLAG_REGISTRY.FEATURE_GLOBAL_AEGIS.adminManageable).toBe(true)
    expect(FEATURE_FLAG_REGISTRY.FEATURE_GLOBAL_AEGIS.enableRequires).toEqual(['FEATURE_WORKSPACE_SWITCHER'])
    expect(FEATURE_FLAG_REGISTRY.FEATURE_GLOBAL_AEGIS.requiresPreflight).toBe(true)
  })

  it('pins OpenFeature server-side only', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(packageJson.dependencies?.['@openfeature/server-sdk']).toBe('1.21.0')
    expect(packageJson.dependencies?.['@openfeature/web-sdk']).toBeUndefined()
    expect(packageJson.devDependencies?.['@openfeature/web-sdk']).toBeUndefined()
  })
})

describe('OpenFeature provider parity', () => {
  it('delegates boolean evaluation to the same core resolver', async () => {
    const context = {
      env: {},
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    }
    expect(await evaluateFeatureFlagWithOpenFeature('FEATURE_WORKSPACE_SWITCHER', context))
      .toBe(resolveFlag('FEATURE_WORKSPACE_SWITCHER', context))
  })
})
