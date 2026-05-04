import type Database from 'better-sqlite3'
import { hasGlobalAegisCandidate } from '@/lib/aegis'
import {
  evaluateFeatureFlagCore,
  expandFeatureFlagCascade,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  getFeatureFlagCascadeDependents,
  getFeatureFlagCascadePrerequisites,
  getFeatureFlagDefinition,
  isFeatureFlagKey,
  readWorkspaceFlagValue,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  type FeatureFlagResolution,
  type FeatureFlagValue,
} from '@/lib/feature-flags'
import { ensureTenantWorkspaceAccess, listWorkspacesForTenant, type WorkspaceRecord } from '@/lib/workspaces'
import { isFacilityWorkspace } from '@/types/product-line'

export interface FeatureFlagWorkspaceOption {
  id: number
  slug: string
  name: string
  tenant_id: number
  is_facility: boolean
  is_auth_workspace: boolean
}

export interface FeatureFlagLastChange {
  actor: string
  actor_id: number | null
  updated_at: number
  reason: string | null
}

export interface FeatureFlagAdminState {
  definition: FeatureFlagDefinition
  stored_value: boolean | null
  evaluated_value: boolean
  evaluation_reason: FeatureFlagResolution['reason']
  env_locked: boolean
  env_value: string | null
  can_update: boolean
  enable_blockers: string[]
  cascade_requires: FeatureFlagKey[]
  cascade_disables: FeatureFlagKey[]
  warnings: string[]
  last_change: FeatureFlagLastChange | null
}

export interface FeatureFlagPreflightCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'not_applicable'
  detail: string
}

export interface FeatureFlagPreflightResult {
  key: FeatureFlagKey
  can_enable: boolean
  blockers: string[]
  checks: FeatureFlagPreflightCheck[]
}

interface AuditRow {
  actor: string
  actor_id: number | null
  detail: string | null
  created_at: number
}

function parseWorkspaceFeatureFlags(raw: WorkspaceRecord['feature_flags']): Record<string, FeatureFlagValue> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, FeatureFlagValue>
      : {}
  } catch {
    return {}
  }
}

function lastFeatureFlagChange(
  db: Database.Database,
  workspaceId: number,
  key: FeatureFlagKey
): FeatureFlagLastChange | null {
  const rows = db.prepare(`
    SELECT actor, actor_id, detail, created_at
    FROM audit_log
    WHERE action = 'feature_flag_update'
      AND target_type = 'workspace'
      AND target_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(workspaceId) as AuditRow[]

  for (const row of rows) {
    if (!row.detail) continue
    try {
      const detail = JSON.parse(row.detail) as { flag_key?: string; reason?: string }
      if (detail.flag_key === key) {
        return {
          actor: row.actor,
          actor_id: row.actor_id,
          updated_at: row.created_at,
          reason: detail.reason || null,
        }
      }
    } catch {
      // Ignore malformed legacy audit detail.
    }
  }
  return null
}

function dependencyBlockers(workspace: WorkspaceRecord, definition: FeatureFlagDefinition): string[] {
  return getFeatureFlagCascadePrerequisites(definition.key)
    .filter((dependencyKey) => {
      const resolution = evaluateFeatureFlagCore(dependencyKey, {
        workspaceFlags: workspace.feature_flags ?? null,
      })
      return resolution.envLocked
    })
    .map((dependencyKey) => `${dependencyKey} is forced OFF by deployment configuration`)
}

function scopeBlockers(workspace: WorkspaceRecord, definition: FeatureFlagDefinition): string[] {
  if (definition.activationScope === 'productLineWorkspace' && isFacilityWorkspace(workspace)) {
    return ['This flag must target a concrete Product Line workspace, not the facility workspace row']
  }
  return []
}

// Mutation blockers apply to ANY change (enable or disable). They cover
// manageability, env locks, and the activation-scope guard that protects the
// real facility workspace row from being used as a Product Line scope target.
function mutationBlockers(
  workspace: WorkspaceRecord,
  definition: FeatureFlagDefinition,
  evaluation: FeatureFlagResolution
): string[] {
  const blockers: string[] = []
  if (!definition.adminManageable) blockers.push('This flag is not admin-manageable yet')
  if (definition.implementationStatus === 'not_implemented') blockers.push('The owning spec has not implemented this flag yet')
  if (definition.implementationStatus === 'deprecated') blockers.push('This flag is deprecated and cannot be changed from the UI')
  if (evaluation.envLocked) blockers.push('Deployment configuration forces this flag OFF')
  blockers.push(...scopeBlockers(workspace, definition))
  return blockers
}

function featureFlagBlockers(
  workspace: WorkspaceRecord,
  definition: FeatureFlagDefinition,
  evaluation: FeatureFlagResolution
): string[] {
  return [
    ...mutationBlockers(workspace, definition, evaluation),
    ...dependencyBlockers(workspace, definition),
  ]
}

function featureFlagWarnings(
  workspace: WorkspaceRecord,
  authWorkspaceId: number,
  definition: FeatureFlagDefinition
): string[] {
  const warnings: string[] = []
  if (definition.activationScope === 'authWorkspace' && workspace.id !== authWorkspaceId) {
    warnings.push('This flag controls shell bootstrap for users authenticated to the selected workspace, not the currently selected Product Line')
  }
  if (definition.upstreamImpact === 'fork-only optional') {
    warnings.push('Fork-only optional adapter; disabled and absent-safe by default')
  }
  if (isFacilityWorkspace(workspace)) {
    warnings.push('This is the real facility workspace row, not the synthetic Facility aggregate switcher option')
  }
  return warnings
}

export function listFeatureFlagWorkspaces(
  db: Database.Database,
  tenantId: number,
  authWorkspaceId: number
): FeatureFlagWorkspaceOption[] {
  return listWorkspacesForTenant(db, tenantId).map((workspace) => ({
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    tenant_id: workspace.tenant_id,
    is_facility: isFacilityWorkspace(workspace),
    is_auth_workspace: workspace.id === authWorkspaceId,
  }))
}

export function getFeatureFlagAdminStates(
  db: Database.Database,
  tenantId: number,
  workspaceId: number,
  authWorkspaceId: number
): { workspace: FeatureFlagWorkspaceOption; flags: FeatureFlagAdminState[] } {
  const workspace = ensureTenantWorkspaceAccess(db, tenantId, workspaceId)
  const workspaceOption: FeatureFlagWorkspaceOption = {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    tenant_id: workspace.tenant_id,
    is_facility: isFacilityWorkspace(workspace),
    is_auth_workspace: workspace.id === authWorkspaceId,
  }

  const flags = FEATURE_FLAG_KEYS.map((key) => {
    const definition = getFeatureFlagDefinition(key)
    const evaluation = evaluateFeatureFlagCore(key, { workspaceFlags: workspace.feature_flags ?? null })
    const enableBlockers = featureFlagBlockers(workspace, definition, evaluation)
    const cascadeRequires = getFeatureFlagCascadePrerequisites(key)
    const cascadeDisables = getFeatureFlagCascadeDependents(key)
    return {
      definition,
      stored_value: readWorkspaceFlagValue(key, workspace.feature_flags ?? null),
      evaluated_value: evaluation.value,
      evaluation_reason: evaluation.reason,
      env_locked: evaluation.envLocked,
      env_value: evaluation.envValue,
      can_update: enableBlockers.length === 0,
      enable_blockers: enableBlockers,
      cascade_requires: cascadeRequires,
      cascade_disables: cascadeDisables,
      warnings: featureFlagWarnings(workspace, authWorkspaceId, definition),
      last_change: lastFeatureFlagChange(db, workspace.id, key),
    }
  })

  return { workspace: workspaceOption, flags }
}

export function getFeatureFlagPreflight(
  db: Database.Database,
  tenantId: number,
  workspaceId: number,
  key: FeatureFlagKey
): FeatureFlagPreflightResult {
  const workspace = ensureTenantWorkspaceAccess(db, tenantId, workspaceId)
  const definition = FEATURE_FLAG_REGISTRY[key]
  const evaluation = evaluateFeatureFlagCore(key, { workspaceFlags: workspace.feature_flags ?? null })
  const blockers = featureFlagBlockers(workspace, definition, evaluation)
  const checks: FeatureFlagPreflightCheck[] = []

  checks.push({
    id: 'implementation',
    label: 'Implementation status',
    status: definition.implementationStatus === 'ready_for_canary' ? 'pass' : 'fail',
    detail: definition.implementationStatus === 'ready_for_canary'
      ? `${definition.spec} is implemented and ready for canary`
      : `${definition.spec} status is ${definition.implementationStatus}`,
  })

  checks.push({
    id: 'dependencies',
    label: 'Cascade dependencies',
    status: dependencyBlockers(workspace, definition).length === 0 ? 'pass' : 'fail',
    detail: getFeatureFlagCascadePrerequisites(key).length === 0
      ? 'No earlier roadmap flags are required'
      : `Enabling ${key} also enables ${getFeatureFlagCascadePrerequisites(key).join(', ')}`,
  })

  checks.push({
    id: 'scope',
    label: 'Activation scope',
    status: scopeBlockers(workspace, definition).length === 0 ? 'pass' : 'fail',
    detail: definition.activationScope,
  })

  if (definition.requiresPreflight && definition.preflightRequires.length > 0) {
    const runtimeCheck = runtimeReadinessCheck(db, definition, workspaceId)
    checks.push(runtimeCheck)
    if (runtimeCheck.status === 'fail') {
      blockers.push(runtimeCheck.detail)
    }
  }

  return {
    key,
    can_enable: blockers.length === 0 && checks.every((check) => check.status !== 'fail'),
    blockers,
    checks,
  }
}

// Runtime readiness probe. Defaults to a pass when implementation status is
// ready_for_canary, but applies key-specific runtime probes for flags whose
// preflight requires concrete state (Finding F3 — FEATURE_GLOBAL_AEGIS must
// have a usable global Aegis row before enable is allowed).
function runtimeReadinessCheck(
  db: Database.Database,
  definition: FeatureFlagDefinition,
  workspaceId: number
): FeatureFlagPreflightCheck {
  if (definition.implementationStatus !== 'ready_for_canary') {
    return {
      id: 'runtime-readiness',
      label: 'Runtime readiness',
      status: 'fail',
      detail: `${definition.spec} status is ${definition.implementationStatus}`,
    }
  }

  if (definition.key === 'FEATURE_GLOBAL_AEGIS') {
    const ready = hasGlobalAegisCandidate(db, workspaceId)
    return {
      id: 'runtime-readiness',
      label: 'Runtime readiness',
      status: ready ? 'pass' : 'fail',
      detail: ready
        ? 'Global Aegis row exists and legacy local Aegis fallback is verified.'
        : 'No global Aegis row is reachable from this workspace tenant; create or backfill one before enabling.',
    }
  }

  return {
    id: 'runtime-readiness',
    label: 'Runtime readiness',
    status: 'pass',
    detail: definition.preflightRequires.join(' '),
  }
}

export function getFeatureFlagMutationBlockers(
  db: Database.Database,
  tenantId: number,
  workspaceId: number,
  key: FeatureFlagKey
): string[] {
  const workspace = ensureTenantWorkspaceAccess(db, tenantId, workspaceId)
  const definition = FEATURE_FLAG_REGISTRY[key]
  const evaluation = evaluateFeatureFlagCore(key, { workspaceFlags: workspace.feature_flags ?? null })
  return mutationBlockers(workspace, definition, evaluation)
}

export function updateWorkspaceFeatureFlag(
  db: Database.Database,
  workspaceId: number,
  key: FeatureFlagKey,
  value: boolean
): {
  oldValue: boolean | null
  newValue: boolean
  flagsJson: string
  cascadeEnabled: FeatureFlagKey[]
  cascadeDisabled: FeatureFlagKey[]
} {
  const row = db.prepare('SELECT id, feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as {
    id: number
    feature_flags: string | null
  } | undefined
  if (!row) throw new Error('Workspace not found')

  const flags = parseWorkspaceFeatureFlags(row.feature_flags)
  const oldValue = readWorkspaceFlagValue(key, row.feature_flags)
  const cascade = expandFeatureFlagCascade(key, value)
  for (const [cascadeKey, cascadeValue] of Object.entries(cascade)) {
    flags[cascadeKey] = cascadeValue
  }
  const flagsJson = JSON.stringify(flags)

  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = unixepoch() WHERE id = ?')
    .run(flagsJson, workspaceId)

  return {
    oldValue,
    newValue: value,
    flagsJson,
    cascadeEnabled: value ? getFeatureFlagCascadePrerequisites(key) : [],
    cascadeDisabled: value ? [] : getFeatureFlagCascadeDependents(key),
  }
}

export function assertFeatureFlagKey(raw: string): FeatureFlagKey | null {
  return isFeatureFlagKey(raw) ? raw : null
}
