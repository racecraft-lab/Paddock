'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { getLocalOsStatus, getProviderHealth, getMcHealth } from './widget-primitives'
import { OnboardingChecklistWidget } from './widgets/onboarding-checklist-widget'
import { EmptyStateLaunchpad } from './empty-state-launchpad'
import { WidgetGrid } from './widget-grid'
import type { DbStats, ClaudeStats, LogLike, DashboardData } from './widget-primitives'

// SPEC-007 US4 — "Last 7d triage totals" widget. Per FR-070/FR-071/FR-072/FR-139.
// Renders inline (no new component file — strict scope keeps the widget local
// to dashboard.tsx). Reads /api/dispositions/rollup every 30s; treats any
// non-2xx response (including 503 when FEATURE_DISPOSITION_LOGGING is OFF) as
// the empty / zero-state — no error noise in the dashboard.
interface DispositionRollupDay {
  date: string
  total: number
  by_disposition: Record<string, number>
}
interface DispositionRollup {
  days: DispositionRollupDay[]
  total: number
}

// Stable color mapping per disposition value. 'unknown' renders as its own
// segment with the FR-139 legend label 'validation_failed'.
const DISPOSITION_COLORS: Record<string, string> = {
  merged:     '#10b981', // emerald-500
  closed:     '#3b82f6', // blue-500
  rejected:   '#ef4444', // red-500
  rerouted:   '#f59e0b', // amber-500
  duplicate:  '#a855f7', // purple-500
  spam:       '#64748b', // slate-500
  completed:  '#22c55e', // green-500
  abandoned:  '#94a3b8', // slate-400
  unknown:    '#fbbf24', // amber-400 — flagged distinct, FR-139
}
// Stable order for legend + segment stacking (oldest → newest).
const DISPOSITION_ORDER = [
  'merged', 'closed', 'completed', 'rejected', 'rerouted', 'duplicate', 'spam', 'abandoned', 'unknown',
] as const

function dispositionLabel(name: string): string {
  // FR-139: 'unknown' is rendered as 'validation_failed' for operator clarity.
  return name === 'unknown' ? 'validation_failed' : name
}

function dispositionColor(name: string): string {
  return DISPOSITION_COLORS[name] ?? '#6b7280' // gray-500 fallback
}

function shortDate(iso: string): string {
  // YYYY-MM-DD → "Mon", best-effort.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

export function Last7dTriageTotalsWidget({
  workspaceIdHint,
  rollupOverride,
}: {
  workspaceIdHint: number | null
  rollupOverride?: DispositionRollup
}): React.ReactElement {
  const [rollup, setRollup] = useState<DispositionRollup | null>(rollupOverride ?? null)

  const fetchRollup = useCallback(async () => {
    try {
      const qs = workspaceIdHint !== null
        ? `?workspace_id=${String(workspaceIdHint)}`
        : ''
      const res = await fetch(`/api/dispositions/rollup${qs}`)
      if (!res.ok) {
        // 503 (flag OFF) and any other error collapse to the empty state.
        setRollup(null)
        return
      }
      const data = await res.json() as DispositionRollup
      setRollup(data)
    } catch {
      setRollup(null)
    }
  }, [workspaceIdHint])

  useEffect(() => {
    if (rollupOverride) {
      setRollup(rollupOverride)
      return
    }
    void fetchRollup()
    const id = setInterval(() => { void fetchRollup() }, 30_000)
    return () => { clearInterval(id) }
  }, [fetchRollup, rollupOverride])

  const total = rollup?.total ?? 0
  const days = useMemo<DispositionRollupDay[]>(() => rollup?.days ?? [], [rollup])
  const isEmpty = total === 0

  // Compute the maximum daily total so the bars share a vertical scale.
  const maxDailyTotal = useMemo(() => {
    let max = 0
    for (const d of days) {
      if (d.total > max) max = d.total
    }
    return max
  }, [days])

  // Active legend: only dispositions that have at least one row in the window.
  const activeLegend = useMemo(() => {
    const present = new Set<string>()
    for (const d of days) {
      for (const k of Object.keys(d.by_disposition)) present.add(k)
    }
    const ordered: string[] = []
    for (const name of DISPOSITION_ORDER) {
      if (present.has(name)) ordered.push(name)
    }
    // Surface any disposition values we did not anticipate at the end so the
    // operator still sees them.
    for (const name of present) {
      if (!ordered.includes(name)) ordered.push(name)
    }
    return ordered
  }, [days])

  return (
    <div
      className="rounded-md border border-neutral-700 bg-neutral-900 p-4"
      data-testid="last-7d-triage-totals-widget"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-neutral-200">
          Last 7d triage totals
        </h3>
        <span
          className="text-2xl font-semibold text-neutral-100 tabular-nums"
          data-testid="last-7d-triage-totals-total"
        >
          {total}
        </span>
      </div>

      {isEmpty ? (
        <div
          className="flex h-24 items-center justify-center text-sm text-neutral-500"
          data-testid="last-7d-triage-totals-empty"
        >
          No dispositions in last 7 days
        </div>
      ) : (
        <>
          <div
            className="flex h-24 items-end gap-1"
            role="img"
            aria-label="Stacked daily disposition totals for the last 7 days"
          >
            {days.map((day) => {
              const heightPct = maxDailyTotal > 0
                ? Math.max(2, Math.round((day.total / maxDailyTotal) * 100))
                : 0
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  data-testid="last-7d-triage-totals-day"
                  data-date={day.date}
                  data-total={day.total}
                  title={`${day.date}: ${String(day.total)} dispositions`}
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                      style={{ height: `${String(heightPct)}%` }}
                    >
                      {/* Stack segments from largest disposition first using
                          DISPOSITION_ORDER for visual stability. */}
                      {DISPOSITION_ORDER.flatMap((name) => {
                        const count = day.by_disposition[name] ?? 0
                        if (count === 0) return []
                        const segHeight = day.total > 0
                          ? Math.round((count / day.total) * 100)
                          : 0
                        return [(
                          <div
                            key={name}
                            data-testid="last-7d-triage-totals-segment"
                            data-disposition={name}
                            data-count={count}
                            style={{
                              backgroundColor: dispositionColor(name),
                              height: `${String(segHeight)}%`,
                              minHeight: count > 0 ? 2 : 0,
                            }}
                          />
                        )]
                      })}
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500 tabular-nums">
                    {shortDate(day.date)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {activeLegend.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1 text-[11px] text-neutral-400"
                data-testid="last-7d-triage-totals-legend-item"
                data-disposition={name}
              >
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: dispositionColor(name) }}
                />
                <span>{dispositionLabel(name)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Dashboard() {
  const {
    sessions,
    setSessions,
    connection,
    dashboardMode,
    subscription,
    logs,
    agents,
    tasks,
    setActiveConversation,
    activeProductLineScope,
  } = useMissionControl()

  // SPEC-007 US4: pass workspace_id only when scope is a Product Line. Facility
  // scope intentionally omits the param so the rollup route fans out across
  // the user's authorized workspaces.
  const triageWorkspaceIdHint =
    activeProductLineScope?.kind === 'productLine'
      ? activeProductLineScope.productLineId
      : null

  const navigateToPanel = useNavigateToPanel()
  const isLocal = dashboardMode === 'local'

  const subscriptionLabel = subscription?.type
    ? subscription.type.charAt(0).toUpperCase() + subscription.type.slice(1)
    : null

  const SUBSCRIPTION_PRICES: Record<string, Record<string, number>> = {
    anthropic: { pro: 20, max: 100, max_5x: 200, team: 30, enterprise: 30 },
    openai: { plus: 20, chatgpt: 20, pro: 200, team: 30, enterprise: 0 },
  }

  const subscriptionPrice = subscription?.provider && subscription?.type
    ? SUBSCRIPTION_PRICES[subscription.provider]?.[subscription.type] ?? null
    : null

  const [systemStats, setSystemStats] = useState<any>(null)
  const [dbStats, setDbStats] = useState<DbStats | null>(null)
  const [claudeStats, setClaudeStats] = useState<ClaudeStats | null>(null)
  const [githubStats, setGithubStats] = useState<any>(null)
  const [hermesCronJobCount, setHermesCronJobCount] = useState(0)
  const [loading, setLoading] = useState({
    system: true,
    sessions: true,
    claude: true,
    github: true,
  })

  const loadDashboard = useCallback(async () => {
    const requests: Promise<void>[] = []

    requests.push(
      fetch('/api/status?action=dashboard')
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          if (data && !data.error) {
            setSystemStats(data)
            if (data.db) setDbStats(data.db)
          }
        })
        .catch(() => {})
        .finally(() => setLoading(prev => ({ ...prev, system: false })))
    )

    requests.push(
      fetch('/api/sessions')
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          if (data && !data.error) setSessions(data.sessions || data)
        })
        .catch(() => {})
        .finally(() => setLoading(prev => ({ ...prev, sessions: false })))
    )

    if (isLocal) {
      requests.push(
        fetch('/api/claude/sessions')
          .then(async (res) => {
            if (!res.ok) return
            const data = await res.json()
            if (data?.stats) setClaudeStats(data.stats)
          })
          .catch(() => {})
          .finally(() => setLoading(prev => ({ ...prev, claude: false })))
      )

      requests.push(
        fetch('/api/github?action=stats')
          .then(async (res) => {
            if (!res.ok) return
            const data = await res.json()
            if (data && !data.error) setGithubStats(data)
          })
          .catch(() => {})
          .finally(() => setLoading(prev => ({ ...prev, github: false })))
      )

      requests.push(
        fetch('/api/hermes')
          .then(async (res) => {
            if (!res.ok) return
            const data = await res.json()
            if (data?.cronJobCount != null) setHermesCronJobCount(data.cronJobCount)
          })
          .catch(() => {})
      )
    } else {
      setLoading(prev => ({ ...prev, claude: false, github: false }))
    }

    await Promise.allSettled(requests)
  }, [isLocal, setSessions])

  useSmartPoll(loadDashboard, isLocal ? 15000 : 60000, { pauseWhenConnected: true })

  // Computed values
  const isSystemLoading = loading.system && !systemStats
  const isSessionsLoading = loading.sessions && sessions.length === 0
  const isClaudeLoading = isLocal && loading.claude && !claudeStats
  const isGithubLoading = isLocal && loading.github && !githubStats

  const memPct = systemStats?.memory?.total
    ? Math.round((systemStats.memory.used / systemStats.memory.total) * 100)
    : null

  const diskPct = parseInt(systemStats?.disk?.usage || '', 10)
  const systemLoad = Math.max(memPct ?? 0, Number.isFinite(diskPct) ? diskPct : 0)

  const activeSessions = sessions.filter((s) => s.active).length
  const errorCount = logs.filter((l) => l.level === 'error').length
  const onlineAgents = dbStats
    ? dbStats.agents.total - (dbStats.agents.byStatus?.offline ?? 0)
    : agents.filter((a) => a.status !== 'offline').length

  const claudeLocalSessions = sessions.filter((s) => s.kind === 'claude-code')
  const codexLocalSessions = sessions.filter((s) => s.kind === 'codex-cli')
  const hermesLocalSessions = sessions.filter((s) => s.kind === 'hermes')
  const claudeActive = claudeLocalSessions.filter((s) => s.active).length
  const codexActive = codexLocalSessions.filter((s) => s.active).length
  const hermesActive = hermesLocalSessions.filter((s) => s.active).length

  const runningTasks = dbStats?.tasks.byStatus?.in_progress ?? tasks.filter((t) => t.status === 'in_progress').length
  const inboxCount = dbStats?.tasks.byStatus?.inbox ?? 0
  const assignedCount = dbStats?.tasks.byStatus?.assigned ?? 0
  const reviewCount = (dbStats?.tasks.byStatus?.review ?? 0) + (dbStats?.tasks.byStatus?.quality_review ?? 0)
  const doneCount = dbStats?.tasks.byStatus?.done ?? 0
  const backlogCount = inboxCount + assignedCount + reviewCount

  const localOsStatus = isSystemLoading
    ? { value: 'Loading...', status: 'warn' as const }
    : getLocalOsStatus(memPct, Number.isFinite(diskPct) ? diskPct : null)

  const claudeHealth = isClaudeLoading
    ? { value: 'Loading...', status: 'warn' as const }
    : getProviderHealth(claudeStats?.active_sessions ?? claudeActive, claudeStats?.total_sessions ?? claudeLocalSessions.length)

  const codexHealth = isSessionsLoading
    ? { value: 'Loading...', status: 'warn' as const }
    : getProviderHealth(codexActive, codexLocalSessions.length)

  const hermesHealth = isSessionsLoading
    ? { value: 'Loading...', status: 'warn' as const }
    : getProviderHealth(hermesActive, hermesLocalSessions.length)

  const mcHealth = isSystemLoading
    ? { value: 'Loading...', status: 'warn' as const }
    : getMcHealth(systemStats, dbStats, errorCount)

  const localSessionLogs: LogLike[] = isLocal
    ? sessions.reduce<LogLike[]>((acc, session) => {
        const ts = session.lastActivity || session.startTime || 0
        if (!ts) return acc

        const lastPrompt = typeof (session as any).lastUserPrompt === 'string'
          ? (session as any).lastUserPrompt.trim()
          : ''

        acc.push({
          id: `local-session-${session.id}-${ts}`,
          timestamp: ts,
          level: 'info',
          source: session.kind === 'codex-cli' ? 'codex-local' : session.kind === 'hermes' ? 'hermes-local' : 'claude-local',
          message: lastPrompt
            ? `Prompt: ${lastPrompt}`
            : `${session.active ? 'Active' : 'Idle'} session: ${session.key || session.id}`,
        })
        return acc
      }, [])
    : []

  const mergedRecentLogs: LogLike[] = (isLocal ? [...logs, ...localSessionLogs] : logs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((entry, index, arr) => arr.findIndex((x) => x.id === entry.id) === index)
    .slice(0, 10)

  const recentErrorLogs = mergedRecentLogs.filter((log) => log.level === 'error').length
  const gatewayHealthStatus = connection.isConnected ? 'good' as const : 'bad' as const

  const openSession = useCallback((session: any) => {
    const kind = String(session?.kind || '')
    const sid = String(session?.id || '')
    if (!sid) return
    setActiveConversation(`session:${kind}:${sid}`)
    navigateToPanel('chat')
  }, [setActiveConversation, navigateToPanel])

  const dashboardData: DashboardData = {
    isLocal,
    systemStats,
    dbStats,
    claudeStats,
    githubStats,
    loading,
    sessions,
    logs,
    agents,
    tasks,
    connection,
    subscription,
    navigateToPanel,
    openSession,
    memPct,
    diskPct,
    systemLoad,
    activeSessions,
    errorCount,
    onlineAgents,
    claudeActive,
    codexActive,
    hermesActive,
    claudeLocalSessions,
    codexLocalSessions,
    hermesLocalSessions,
    runningTasks,
    inboxCount,
    assignedCount,
    reviewCount,
    doneCount,
    backlogCount,
    mergedRecentLogs,
    recentErrorLogs,
    localOsStatus,
    claudeHealth,
    codexHealth,
    hermesHealth,
    mcHealth,
    gatewayHealthStatus,
    isSystemLoading,
    isSessionsLoading,
    isClaudeLoading,
    isGithubLoading,
    hermesCronJobCount,
    subscriptionLabel,
    subscriptionPrice,
  }

  return (
    <div className="p-5 space-y-4">
      <OnboardingChecklistWidget />
      <EmptyStateLaunchpad
        agentCount={dbStats?.agents.total ?? agents.length}
        taskCount={dbStats?.tasks.total ?? tasks.length}
        onNavigate={navigateToPanel}
      />
      <Last7dTriageTotalsWidget workspaceIdHint={triageWorkspaceIdHint} />
      <WidgetGrid data={dashboardData} />
    </div>
  )
}
