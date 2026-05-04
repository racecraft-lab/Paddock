'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'

interface FeatureFlagWorkspaceOption {
  id: number
  slug: string
  name: string
  tenant_id: number
  is_facility: boolean
  is_auth_workspace: boolean
}

interface FeatureFlagDefinition {
  key: string
  label: string
  description: string
  spec: string
  phase: number
  upstreamImpact: string
  activationScope: string
  riskTier: string
  adminManageable: boolean
  requiresReason: boolean
  implementationStatus: string
  enableRequires: string[]
  rollbackBehavior: string
  evidence: {
    playwright?: string[]
    argos?: string[]
    storybook?: string[]
  }
}

interface FeatureFlagState {
  definition: FeatureFlagDefinition
  stored_value: boolean | null
  evaluated_value: boolean
  evaluation_reason: string
  env_locked: boolean
  env_value: string | null
  can_update: boolean
  enable_blockers: string[]
  cascade_requires: string[]
  cascade_disables: string[]
  warnings: string[]
  last_change: {
    actor: string
    actor_id: number | null
    updated_at: number
    reason: string | null
  } | null
}

interface FeatureFlagResponse {
  workspace: FeatureFlagWorkspaceOption
  workspaces: FeatureFlagWorkspaceOption[]
  flags: FeatureFlagState[]
}

function statusLabel(status: string): string {
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function impactClass(impact: string): string {
  if (impact.includes('fork')) return 'bg-amber-500/15 text-amber-300'
  if (impact.includes('divergent')) return 'bg-red-500/15 text-red-300'
  return 'bg-green-500/15 text-green-300'
}

function riskClass(risk: string): string {
  if (risk === 'critical') return 'bg-red-500/15 text-red-300'
  if (risk === 'high') return 'bg-amber-500/15 text-amber-300'
  if (risk === 'medium') return 'bg-blue-500/15 text-blue-300'
  return 'bg-muted text-muted-foreground'
}

export function FeatureFlagsSection({ showFeedback }: { showFeedback: (ok: boolean, text: string) => void }) {
  const { fetchWorkspaces } = useMissionControl()
  const [data, setData] = useState<FeatureFlagResponse | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [reasonByKey, setReasonByKey] = useState<Record<string, string>>({})

  const loadFlags = useCallback(async (workspaceId?: number | null) => {
    setLoading(true)
    try {
      const suffix = workspaceId ? `?workspace_id=${encodeURIComponent(String(workspaceId))}` : ''
      const res = await fetch(`/api/feature-flags${suffix}`)
      const body = await res.json()
      if (!res.ok) {
        showFeedback(false, body.error || 'Failed to load feature flags')
        return
      }
      setData(body)
      setSelectedWorkspaceId(body.workspace?.id ?? null)
    } catch {
      showFeedback(false, 'Failed to load feature flags')
    } finally {
      setLoading(false)
    }
  }, [showFeedback])

  useEffect(() => {
    loadFlags(selectedWorkspaceId)
    // Initial load intentionally owns selectedWorkspaceId hydration from API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flagsByPhase = useMemo(() => {
    const groups = new Map<number, FeatureFlagState[]>()
    for (const flag of data?.flags || []) {
      const phase = flag.definition.phase
      groups.set(phase, [...(groups.get(phase) || []), flag])
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b)
  }, [data?.flags])

  const updateFlag = async (flag: FeatureFlagState, value: boolean) => {
    if (!selectedWorkspaceId) return
    const reason = reasonByKey[flag.definition.key] || ''
    setSavingKey(flag.definition.key)
    try {
      const res = await fetch(`/api/feature-flags/${encodeURIComponent(flag.definition.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: selectedWorkspaceId, value, reason }),
      })
      const body = await res.json()
      if (!res.ok) {
        const blockers = Array.isArray(body.blockers) && body.blockers.length > 0
          ? `: ${body.blockers.join('; ')}`
          : ''
        showFeedback(false, `${body.error || 'Feature flag update failed'}${blockers}`)
        return
      }
      showFeedback(true, `${flag.definition.label} ${value ? 'enabled' : 'disabled'}`)
      setReasonByKey(prev => ({ ...prev, [flag.definition.key]: '' }))
      await loadFlags(selectedWorkspaceId)
      if (flag.definition.key === 'FEATURE_WORKSPACE_SWITCHER') {
        await fetchWorkspaces()
      }
    } catch {
      showFeedback(false, 'Feature flag update failed')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 text-xs text-muted-foreground">
        Loading feature flags...
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-xs">
        Feature flags could not be loaded.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Feature Flags</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Roadmap-scoped release controls. Later phases are additive and enable all earlier phase flags.
            </p>
          </div>
          <label className="text-xs text-muted-foreground flex flex-col gap-1 sm:min-w-64">
            Target workspace
            <select
              value={selectedWorkspaceId ?? ''}
              onChange={(event) => {
                const value = Number(event.target.value)
                setSelectedWorkspaceId(value)
                loadFlags(value)
              }}
              className="px-2 py-1 text-sm bg-background border border-border rounded-md text-foreground"
            >
              {data.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                  {workspace.is_auth_workspace ? ' (auth)' : ''}
                  {workspace.is_facility ? ' (facility row)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md bg-secondary p-2">
            <p className="text-2xs text-muted-foreground">Selected</p>
            <p className="text-xs font-medium">{data.workspace.name}</p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-2xs text-muted-foreground">Storage</p>
            <p className="text-xs font-medium">workspaces.feature_flags</p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-2xs text-muted-foreground">Mutation policy</p>
            <p className="text-xs font-medium">Human admin session only</p>
          </div>
        </div>
      </div>

      {flagsByPhase.map(([phase, flags]) => (
        <div key={phase} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Phase {phase}
          </h4>
          {flags.map((flag) => {
            const blocked = flag.enable_blockers.length > 0
            const evidenceCount = [
              ...(flag.definition.evidence.playwright || []),
              ...(flag.definition.evidence.argos || []),
              ...(flag.definition.evidence.storybook || []),
            ].length
            const nextValue = !flag.evaluated_value
            const cascadeRequires = flag.cascade_requires || []
            const cascadeDisables = flag.cascade_disables || []

            return (
              <div
                key={flag.definition.key}
                data-testid={`feature-flag-card-${flag.definition.key}`}
                className="bg-card border border-border rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{flag.definition.label}</span>
                      <span className={`text-2xs px-1.5 py-0.5 rounded ${flag.evaluated_value ? 'bg-green-500/15 text-green-300' : 'bg-secondary text-foreground'}`}>
                        {flag.evaluated_value ? 'Evaluated ON' : 'Evaluated OFF'}
                      </span>
                      <span className={`text-2xs px-1.5 py-0.5 rounded ${impactClass(flag.definition.upstreamImpact)}`}>
                        {flag.definition.upstreamImpact}
                      </span>
                      <span className={`text-2xs px-1.5 py-0.5 rounded ${riskClass(flag.definition.riskTier)}`}>
                        {flag.definition.riskTier}
                      </span>
                      {flag.env_locked && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          env forced OFF
                        </span>
                      )}
                      {cascadeRequires.length > 0 && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                          cascade +{cascadeRequires.length}
                        </span>
                      )}
                      {flag.evaluated_value && cascadeDisables.length > 0 && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          disables +{cascadeDisables.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80 mt-1">{flag.definition.description}</p>
                    <p className="text-2xs text-foreground/70 mt-1 font-mono">{flag.definition.key}</p>
                  </div>

                  <div className="flex flex-col gap-2 lg:items-end">
                    <Button
                      onClick={() => updateFlag(flag, nextValue)}
                      disabled={savingKey === flag.definition.key || (nextValue && blocked) || flag.env_locked}
                      variant={flag.evaluated_value ? 'outline' : 'default'}
                      size="sm"
                      className={flag.evaluated_value ? 'bg-secondary text-foreground' : undefined}
                      aria-label={`${flag.evaluated_value ? 'Disable' : 'Enable'} ${flag.definition.label}`}
                    >
                      {savingKey === flag.definition.key
                        ? 'Saving...'
                        : flag.evaluated_value
                          ? cascadeDisables.length > 0
                            ? 'Disable cascade'
                            : 'Disable'
                          : cascadeRequires.length > 0
                            ? 'Enable cascade'
                            : 'Enable'}
                    </Button>
                    {flag.definition.requiresReason && (
                      <input
                        value={reasonByKey[flag.definition.key] || ''}
                        onChange={(event) => setReasonByKey(prev => ({ ...prev, [flag.definition.key]: event.target.value }))}
                        placeholder="Reason required"
                        className="w-full lg:w-64 px-2 py-1 text-xs bg-background border border-border rounded-md"
                      />
                    )}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-4">
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-2xs text-muted-foreground">Stored override</p>
                    <p className="text-xs font-medium">{flag.stored_value === null ? 'none' : String(flag.stored_value)}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-2xs text-muted-foreground">Status</p>
                    <p className="text-xs font-medium">{statusLabel(flag.definition.implementationStatus)}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-2xs text-muted-foreground">Scope</p>
                    <p className="text-xs font-medium">{flag.definition.activationScope}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-2xs text-muted-foreground">Evidence</p>
                    <p className="text-xs font-medium">{evidenceCount} linked item{evidenceCount === 1 ? '' : 's'}</p>
                  </div>
                </div>

                {cascadeRequires.length > 0 && (
                  <p className="text-2xs text-muted-foreground">
                    Cascade enables prior phases: {cascadeRequires.join(', ')}
                  </p>
                )}
                {flag.evaluated_value && cascadeDisables.length > 0 && (
                  <p className="text-2xs text-muted-foreground">
                    Disabling turns later dependent phases off: {cascadeDisables.join(', ')}
                  </p>
                )}

                {(flag.enable_blockers.length > 0 || flag.warnings.length > 0) && (
                  <div className="space-y-1">
                    {flag.enable_blockers.map((blocker) => (
                      <p key={blocker} className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1">
                        {blocker}
                      </p>
                    ))}
                    {flag.warnings.map((warning) => (
                      <p key={warning} className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-md px-2 py-1">
                        {warning}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-1 text-2xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
                  <span>{flag.definition.rollbackBehavior}</span>
                  {flag.last_change && (
                    <span>
                      Last changed by {flag.last_change.actor} on {new Date(flag.last_change.updated_at * 1000).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
