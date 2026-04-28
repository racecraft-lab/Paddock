export type FeatureFlagValue = boolean | number | string | null | undefined

export type FeatureFlagKey =
  | 'FEATURE_WORKSPACE_SWITCHER'
  | 'FEATURE_GLOBAL_AEGIS'
  | 'FEATURE_TASK_PIPELINES'
  | 'FEATURE_TWO_STEP_TERMINAL'
  | 'FEATURE_AREA_LABEL_ROUTING'
  | 'FEATURE_DISPOSITION_LOGGING'
  | 'FEATURE_TASK_ARTIFACTS'
  | 'FEATURE_RESOURCE_GOVERNANCE'
  | 'FEATURE_OPENCLAW_HEALTH_COSTS'
  | 'PILOT_PRODUCT_LINE_A_E2E'

export type FeatureFlagActivationScope =
  | 'authWorkspace'
  | 'productLineWorkspace'
  | 'forkOnlyAdapter'
  | 'pilotWorkspace'

export type FeatureFlagImplementationStatus =
  | 'not_implemented'
  | 'implemented_unverified'
  | 'ready_for_canary'
  | 'deprecated'

export type FeatureFlagRiskTier = 'low' | 'medium' | 'high' | 'critical'

export type FeatureFlagUpstreamImpact =
  | 'upstream-safe'
  | 'upstream-divergent'
  | 'fork-only optional'
  | 'fork rollout only'

export interface FeatureFlagDefinition {
  key: FeatureFlagKey
  label: string
  description: string
  spec: string
  phase: number
  upstreamImpact: FeatureFlagUpstreamImpact
  activationScope: FeatureFlagActivationScope
  riskTier: FeatureFlagRiskTier
  defaultValue: false
  adminManageable: boolean
  requiresHuman: boolean
  requiresReason: boolean
  requiresPreflight: boolean
  implementationStatus: FeatureFlagImplementationStatus
  enableRequires: FeatureFlagKey[]
  implementedAfter: string[]
  preflightRequires: string[]
  rollbackBehavior: string
  evidence: {
    playwright?: string[]
    argos?: string[]
    storybook?: string[]
  }
}

export interface FeatureFlagContext {
  workspaceFlags?: string | Record<string, unknown> | null
  env?: Record<string, string | undefined>
}

export interface FeatureFlagResolution {
  key: string
  value: boolean
  reason: 'env_force_off' | 'env_force_on_exception' | 'workspace_override' | 'default_off' | 'error_default_off'
  envLocked: boolean
  envValue: string | null
  storedValue: boolean | null
}

export const FEATURE_FLAG_KEYS = [
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
] as const satisfies readonly FeatureFlagKey[]

const ENV_FORCE_ON_EXCEPTIONS = new Set(['PILOT_PRODUCT_LINE_A_E2E'])

export const FEATURE_FLAG_REGISTRY: Record<FeatureFlagKey, FeatureFlagDefinition> = {
  FEATURE_WORKSPACE_SWITCHER: {
    key: 'FEATURE_WORKSPACE_SWITCHER',
    label: 'Product Line switcher',
    description: 'Header Product Line selector, activeWorkspace scope, REST/SSE scoping, and filtered panel behavior.',
    spec: 'SPEC-002',
    phase: 1,
    upstreamImpact: 'upstream-safe',
    activationScope: 'authWorkspace',
    riskTier: 'medium',
    defaultValue: false,
    adminManageable: true,
    requiresHuman: true,
    requiresReason: false,
    requiresPreflight: false,
    implementationStatus: 'ready_for_canary',
    enableRequires: [],
    implementedAfter: ['SPEC-002'],
    preflightRequires: [],
    rollbackBehavior: 'Disable to hide the switcher and return API/UI behavior to legacy authenticated-workspace scoping.',
    evidence: {
      playwright: [
        'tests/product-line-switcher-ui.spec.ts',
        'tests/feature-flags-admin-ui.spec.ts',
        'tests/workspace-switcher-flag-off.spec.ts',
        'tests/product-line-scope-api.spec.ts',
        'tests/product-line-events.spec.ts',
      ],
      storybook: [
        'src/components/layout/spec-002-visual.stories.tsx',
        'src/components/settings/feature-flags-section.stories.tsx',
      ],
      argos: ['spec-002-storybook', 'spec-002-playwright'],
    },
  },
  FEATURE_GLOBAL_AEGIS: {
    key: 'FEATURE_GLOBAL_AEGIS',
    label: 'Global Aegis',
    description: 'Facility-wide Aegis resolution with legacy workspace-scoped fallback.',
    spec: 'SPEC-003',
    phase: 2,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'high',
    defaultValue: false,
    adminManageable: true,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'ready_for_canary',
    enableRequires: ['FEATURE_WORKSPACE_SWITCHER'],
    implementedAfter: ['SPEC-003'],
    preflightRequires: ['Global Aegis row exists and legacy local Aegis fallback is verified.'],
    rollbackBehavior: 'Disable to make Aegis lookup prefer workspace-scoped records again.',
    evidence: {
      playwright: ['tests/e2e/spec-003-global-aegis.spec.ts'],
    },
  },
  FEATURE_TASK_PIPELINES: {
    key: 'FEATURE_TASK_PIPELINES',
    label: 'Task pipeline engine',
    description: 'Declarative workflow-template routing and successor task creation.',
    spec: 'SPEC-004',
    phase: 3,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'critical',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_GLOBAL_AEGIS'],
    implementedAfter: ['SPEC-004'],
    preflightRequires: ['Workflow-template slugs, routing schema validation, and shared createTask side-effect parity are verified.'],
    rollbackBehavior: 'Disable to make task-chain advancement a no-op while preserving workflow-template fields.',
    evidence: {},
  },
  FEATURE_TWO_STEP_TERMINAL: {
    key: 'FEATURE_TWO_STEP_TERMINAL',
    label: 'Two-step terminal state',
    description: 'ready_for_owner state and PR-merge transition for PR-producing templates.',
    spec: 'SPEC-005',
    phase: 4,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'high',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_TASK_PIPELINES'],
    implementedAfter: ['SPEC-005'],
    preflightRequires: ['Task status vocabulary, GitHub label sync, and produces_pr template behavior are verified.'],
    rollbackBehavior: 'Disable to return Aegis approval to direct done transitions while preserving existing rows.',
    evidence: {},
  },
  FEATURE_AREA_LABEL_ROUTING: {
    key: 'FEATURE_AREA_LABEL_ROUTING',
    label: 'Area-label GitHub sync',
    description: 'area:* label routing and shared-repo dedupe for product-line monorepos.',
    spec: 'SPEC-006',
    phase: 5,
    upstreamImpact: 'upstream-safe',
    activationScope: 'productLineWorkspace',
    riskTier: 'high',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_WORKSPACE_SWITCHER'],
    implementedAfter: ['SPEC-006'],
    preflightRequires: ['Area label map, label provisioning, and repo-level sync ownership are verified.'],
    rollbackBehavior: 'Disable to ignore area:* labels on ingest and stop emitting them on outbound sync.',
    evidence: {},
  },
  FEATURE_DISPOSITION_LOGGING: {
    key: 'FEATURE_DISPOSITION_LOGGING',
    label: 'Disposition logging',
    description: 'Triage disposition rows and disposition audit/dashboard views.',
    spec: 'SPEC-007',
    phase: 6,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'medium',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_TASK_PIPELINES'],
    implementedAfter: ['SPEC-007'],
    preflightRequires: ['Disposition table writes, failure isolation, and dashboard/audit views are verified.'],
    rollbackBehavior: 'Disable to stop new disposition inserts while existing rows remain queryable for audit.',
    evidence: {},
  },
  FEATURE_TASK_ARTIFACTS: {
    key: 'FEATURE_TASK_ARTIFACTS',
    label: 'Task artifact store',
    description: 'Mission Control-owned artifact publish/consume paths and artifact admin health views.',
    spec: 'SPEC-007',
    phase: 6,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'critical',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_TASK_PIPELINES'],
    implementedAfter: ['SPEC-007'],
    preflightRequires: ['Secret detector, storage health, artifact API, and admin maintenance flows are verified.'],
    rollbackBehavior: 'Disable to stop new publishes while preserving existing artifacts for audit unless retention policy removes them.',
    evidence: {},
  },
  FEATURE_RESOURCE_GOVERNANCE: {
    key: 'FEATURE_RESOURCE_GOVERNANCE',
    label: 'Resource governance',
    description: 'Scheduler WIP, blackout/degraded window, budget, and override policy enforcement.',
    spec: 'SPEC-008',
    phase: 7,
    upstreamImpact: 'upstream-divergent',
    activationScope: 'productLineWorkspace',
    riskTier: 'critical',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_TASK_PIPELINES'],
    implementedAfter: ['SPEC-008'],
    preflightRequires: ['Default policy rows, fail-safe evaluator behavior, and scheduler gates are verified.'],
    rollbackBehavior: 'Disable to return scheduler behavior to legacy dispatch while preserving policy/event rows.',
    evidence: {},
  },
  FEATURE_OPENCLAW_HEALTH_COSTS: {
    key: 'FEATURE_OPENCLAW_HEALTH_COSTS',
    label: 'OpenClaw health costs',
    description: 'Fork-only electricity and infrastructure cost adapter for OpenClaw health artifacts.',
    spec: 'SPEC-008',
    phase: 7,
    upstreamImpact: 'fork-only optional',
    activationScope: 'forkOnlyAdapter',
    riskTier: 'high',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: ['FEATURE_RESOURCE_GOVERNANCE'],
    implementedAfter: ['SPEC-008'],
    preflightRequires: ['Explicit OpenClaw health config path exists, is readable, and absence/malformed telemetry behavior is verified.'],
    rollbackBehavior: 'Disable to remove OpenClaw infra/electricity data from Cost Tracker without affecting governance core.',
    evidence: {},
  },
  PILOT_PRODUCT_LINE_A_E2E: {
    key: 'PILOT_PRODUCT_LINE_A_E2E',
    label: 'Product Line A pilot',
    description: 'End-to-end Product Line A smoke through triage, plan, dev, review, Aegis, ready_for_owner, and merge.',
    spec: 'SPEC-009',
    phase: 8,
    upstreamImpact: 'fork rollout only',
    activationScope: 'pilotWorkspace',
    riskTier: 'critical',
    defaultValue: false,
    adminManageable: false,
    requiresHuman: true,
    requiresReason: true,
    requiresPreflight: true,
    implementationStatus: 'not_implemented',
    enableRequires: [
      'FEATURE_WORKSPACE_SWITCHER',
      'FEATURE_GLOBAL_AEGIS',
      'FEATURE_TASK_PIPELINES',
      'FEATURE_TWO_STEP_TERMINAL',
      'FEATURE_AREA_LABEL_ROUTING',
      'FEATURE_DISPOSITION_LOGGING',
      'FEATURE_TASK_ARTIFACTS',
      'FEATURE_RESOURCE_GOVERNANCE',
      'FEATURE_OPENCLAW_HEALTH_COSTS',
    ],
    implementedAfter: ['SPEC-009'],
    preflightRequires: ['Product Line A seed data, workflow templates, GitHub issue trigger, and pilot smoke checklist are ready.'],
    rollbackBehavior: 'Disable pilot automation and fall back to explicit operator task assignment.',
    evidence: {},
  },
}

function normalizeBoolean(value: FeatureFlagValue): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  }
  return null
}

function parseWorkspaceFlags(
  workspaceFlags: FeatureFlagContext['workspaceFlags']
): Record<string, FeatureFlagValue> {
  if (!workspaceFlags) return {}
  if (typeof workspaceFlags === 'string') {
    try {
      const parsed: unknown = JSON.parse(workspaceFlags)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, FeatureFlagValue>
        : {}
    } catch {
      return {}
    }
  }
  return workspaceFlags as Record<string, FeatureFlagValue>
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAG_REGISTRY, value)
}

export function getFeatureFlagDefinition(key: FeatureFlagKey): FeatureFlagDefinition {
  return FEATURE_FLAG_REGISTRY[key]
}

export function getAllFeatureFlagDefinitions(): FeatureFlagDefinition[] {
  return FEATURE_FLAG_KEYS.map((key) => FEATURE_FLAG_REGISTRY[key])
}

export function readWorkspaceFlagValue(
  name: string,
  workspaceFlags: FeatureFlagContext['workspaceFlags']
): boolean | null {
  const flags = parseWorkspaceFlags(workspaceFlags)
  return normalizeBoolean(flags[name])
}

export function evaluateFeatureFlagCore(name: string, ctx: FeatureFlagContext = {}): FeatureFlagResolution {
  try {
    const env = ctx.env ?? (
      typeof process !== 'undefined'
        ? process.env
        : {}
    )
    const envValue = env[name] ?? null
    const storedValue = readWorkspaceFlagValue(name, ctx.workspaceFlags)

    if (envValue === '0') {
      return { key: name, value: false, reason: 'env_force_off', envLocked: true, envValue, storedValue }
    }
    if (envValue === '1' && ENV_FORCE_ON_EXCEPTIONS.has(name)) {
      return { key: name, value: true, reason: 'env_force_on_exception', envLocked: false, envValue, storedValue }
    }
    if (storedValue !== null) {
      return { key: name, value: storedValue, reason: 'workspace_override', envLocked: false, envValue, storedValue }
    }
    return { key: name, value: false, reason: 'default_off', envLocked: false, envValue, storedValue }
  } catch {
    return { key: name, value: false, reason: 'error_default_off', envLocked: false, envValue: null, storedValue: null }
  }
}

export function resolveFlag(name: string, ctx: FeatureFlagContext = {}): boolean {
  return evaluateFeatureFlagCore(name, ctx).value
}
