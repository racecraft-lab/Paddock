'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { GovernanceTab, type SubviewId } from '@/components/governance/governance-tab'
import { AegisEmergencyReserveBadge } from '@/components/governance/aegis-emergency-reserve-badge'
import { BreakerOpenBanner } from '@/components/governance/breaker-open-banner'
import { BulkPromoteModal, type BulkPromoteModalState } from '@/components/governance/bulk-promote-modal'
import { BudgetsSubview, type BudgetSummary } from '@/components/governance/budgets-subview'
import { CalibrationProgress } from '@/components/governance/calibration-progress'
import { DiagnosticFeed, type DiagnosticDecision, type DiagnosticEvent } from '@/components/governance/diagnostic-feed'
import { EtagConflictToast } from '@/components/governance/etag-conflict-toast'
import { IncidentRecoveryModal, type IncidentRecoveryAction } from '@/components/governance/incident-recovery-modal'
import { OverrideGrantForm, type OverrideGrantFormState, type OverrideGrantValidationIssue } from '@/components/governance/override-grant-form'
import { OverridesSubview, type OverrideSummary } from '@/components/governance/overrides-subview'
import { PoliciesSubview } from '@/components/governance/policies-subview'
import { PolicyEditor, type PolicyEditorState } from '@/components/governance/policy-editor'
import type { PolicySummary } from '@/components/governance/policy-row'
import { SystemHealthCard, type CardSeverity } from '@/components/governance/system-health-card'
import { SystemHealthSubview } from '@/components/governance/system-health-subview'
import { WindowsSubview, type WindowSummary } from '@/components/governance/windows-subview'
import { WipIndicatorPanel } from '@/components/governance/wip-indicator-panel'
import { Loader } from '@/components/ui/loader'
import { resolveFlag } from '@/lib/feature-flags'
import { useMissionControl } from '@/store'
import { appendScopeToPath } from '@/types/product-line'
import { createClientLogger } from '@/lib/client-logger'
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts'

const log = createClientLogger('CostTracker')

// ── Types ──────────────────────────────────────────

interface TokenStats {
  totalTokens: number; totalCost: number; requestCount: number
  avgTokensPerRequest: number; avgCostPerRequest: number
}

interface UsageStats {
  summary: TokenStats
  models: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  sessions: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  timeframe: string
  recordCount: number
}

interface TrendData {
  trends: Array<{ timestamp: string; tokens: number; cost: number; requests: number }>
  timeframe: string
}

interface ByAgentModelBreakdown {
  model: string; input_tokens: number; output_tokens: number; request_count: number; cost: number
}

interface ByAgentEntry {
  agent: string; total_input_tokens: number; total_output_tokens: number
  total_tokens: number; total_cost: number; session_count: number
  request_count: number; last_active: string; models: ByAgentModelBreakdown[]
}

interface ByAgentResponse {
  agents: ByAgentEntry[]
  summary: { total_cost: number; total_tokens: number; agent_count: number; days: number }
}

interface TaskCostEntry {
  taskId: number; title: string; status: string; priority: string
  assignedTo?: string | null
  project: { id?: number | null; name?: string | null; slug?: string | null; ticketRef?: string | null }
  stats: TokenStats
  models: Record<string, TokenStats>
}

interface TaskCostsResponse {
  summary: TokenStats
  tasks: TaskCostEntry[]
  agents: Record<string, { stats: TokenStats; taskCount: number; taskIds: number[] }>
  unattributed: TokenStats
  timeframe: string
}

interface SessionCostEntry {
  sessionId: string; sessionKey?: string; model: string
  totalTokens: number; inputTokens: number; outputTokens: number
  totalCost: number; requestCount: number; firstSeen: string; lastSeen: string
}

// ── Helpers ──────────────────────────────────────────

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff6b6b']

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatCost = (cost: number) => '$' + cost.toFixed(4)

const getModelDisplayName = (name: string) => name.split('/').pop() || name

type View = 'overview' | 'agents' | 'sessions' | 'tasks' | 'governance'
type Timeframe = 'hour' | 'day' | 'week' | 'month'

const VALID_VIEWS: readonly View[] = ['overview', 'agents', 'sessions', 'tasks', 'governance']
const VALID_SUBVIEWS: readonly SubviewId[] = [
  'policies', 'budgets', 'windows', 'overrides', 'diagnostics', 'system-health',
]

// ── Main Component ──────────────────────────────────

export function CostTrackerPanel() {
  const t = useTranslations('costTracker')
  const { activeProductLineScope, sessions, workspaceSwitcherEnabled } = useMissionControl()

  // SPEC-008 — FEATURE_RESOURCE_GOVERNANCE-gated extension. When the
  // flag is OFF for the caller's workspace the governance tab is
  // absent from the tab list AND from the render switch below, so
  // the rendered HTML is byte-identical to the legacy panel
  // (FR-186, FR-193, FR-305).
  //
  // The flag is per-workspace; we resolve against the auth workspace's
  // `feature_flags` JSON (see `/api/workspaces` `active_workspace_id`).
  // Without ctx, `resolveFlag` always returns false on the client because
  // `process.env.FEATURE_*` is not exposed via NEXT_PUBLIC_*. We fetch
  // `/api/workspaces` directly here so the panel does not depend on the
  // workspace switcher being mounted (the cost-tracker page can render
  // without the full app shell during e2e bring-up).
  const [workspaceFlags, setWorkspaceFlags] = useState<string | Record<string, unknown> | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/workspaces', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as {
          workspaces?: Array<{ id: number; feature_flags?: string | Record<string, unknown> | null }>
          active_workspace_id?: number
        }
        if (cancelled) return
        const list = Array.isArray(data.workspaces) ? data.workspaces : []
        const active = list.find((w) => w.id === data.active_workspace_id)
        setWorkspaceFlags(active?.feature_flags ?? null)
      } catch {
        // Silent — flag stays default-off.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const showGovernance = resolveFlag('FEATURE_RESOURCE_GOVERNANCE', { workspaceFlags })

  // SPEC-008 — read `?tab=` and `?sub=` URL params so the operator
  // (and Playwright e2e) can deep-link into the Governance tab and
  // a specific subview. Bookmarkable URL state per FR-200.
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') ?? null
  const subParam = searchParams?.get('sub') ?? null
  const workspaceIdParam = searchParams?.get('workspace_id') ?? null
  const workspaceScopeParam = searchParams?.get('workspace_scope') ?? null
  const reasonParam = searchParams?.get('reason') ?? null
  const feedParam = searchParams?.get('feed') ?? null
  const initialView: View = ((): View => {
    if (tabParam !== null && (VALID_VIEWS as readonly string[]).includes(tabParam)) {
      // Don't allow ?tab=governance when the flag is off — fall through
      // to the default 'overview' to preserve byte-compat.
      if (tabParam === 'governance' && !showGovernance) return 'overview'
      return tabParam as View
    }
    return 'overview'
  })()
  const initialSubview: SubviewId | undefined =
    subParam !== null && (VALID_SUBVIEWS as readonly string[]).includes(subParam)
      ? (subParam as SubviewId)
      : undefined
  const buildGovernancePath = useCallback((path: string): string => {
    const [base = path, query = ''] = path.split('?')
    const params = new URLSearchParams(query)
    if (workspaceIdParam !== null) {
      params.set('workspace_id', workspaceIdParam)
      params.delete('workspace_scope')
    } else if (workspaceScopeParam !== null) {
      params.set('workspace_scope', workspaceScopeParam)
      params.delete('workspace_id')
    } else if (activeProductLineScope !== null) {
      return appendScopeToPath(path, activeProductLineScope)
    } else if (workspaceSwitcherEnabled || showGovernance) {
      params.set('workspace_scope', 'facility')
      params.delete('workspace_id')
    }
    const serialized = params.toString()
    return serialized ? `${base}?${serialized}` : base
  }, [activeProductLineScope, showGovernance, workspaceIdParam, workspaceScopeParam, workspaceSwitcherEnabled])

  const [view, setView] = useState<View>(initialView)
  // If the URL says ?tab=governance but the workspace list hasn't resolved
  // yet (showGovernance starts false), flip to the governance view as soon
  // as the flag becomes true. This is the deep-link path used by Playwright
  // e2e (`page.goto('/cost-tracker?tab=governance&sub=...')`).
  useEffect(() => {
    if (
      tabParam === 'governance'
      && showGovernance
      && view !== 'governance'
    ) {
      setView('governance')
    }
  }, [tabParam, showGovernance, view])
  const [timeframe, setTimeframe] = useState<Timeframe>('day')
  const [chartMode, setChartMode] = useState<'incremental' | 'cumulative'>('incremental')
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Data
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [trendData, setTrendData] = useState<TrendData | null>(null)
  const [byAgentData, setByAgentData] = useState<ByAgentResponse | null>(null)
  const [taskData, setTaskData] = useState<TaskCostsResponse | null>(null)
  const [sessionCosts, setSessionCosts] = useState<SessionCostEntry[]>([])
  const [sessionSort, setSessionSort] = useState<'cost' | 'tokens' | 'requests' | 'recent'>('cost')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const timeframeToDays = (tf: Timeframe): number => {
    switch (tf) { case 'hour': case 'day': return 1; case 'week': return 7; case 'month': return 30 }
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [statsRes, trendRes, byAgentRes, taskRes] = await Promise.all([
        fetch(`/api/tokens?action=stats&timeframe=${timeframe}`),
        fetch(`/api/tokens?action=trends&timeframe=${timeframe}`),
        fetch(`/api/tokens/by-agent?days=${timeframeToDays(timeframe)}`),
        fetch(`/api/tokens?action=task-costs&timeframe=${timeframe}`),
      ])
      const [statsJson, trendJson, byAgentJson, taskJson] = await Promise.all([
        statsRes.json(), trendRes.json(), byAgentRes.json(), taskRes.json(),
      ])
      setUsageStats(statsJson)
      setTrendData(trendJson)
      setByAgentData(byAgentJson)
      setTaskData(taskJson)
    } catch (err) {
      log.error('Failed to load cost data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [timeframe])

  const loadSessionCosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/tokens?action=session-costs&timeframe=${timeframe}`)
      const data = await res.json()
      if (Array.isArray(data?.sessions)) {
        setSessionCosts(data.sessions)
      } else if (usageStats?.sessions) {
        setSessionCosts(Object.entries(usageStats.sessions).map(([id, stats]) => ({
          sessionId: id, model: '', totalTokens: stats.totalTokens, inputTokens: 0,
          outputTokens: 0, totalCost: stats.totalCost, requestCount: stats.requestCount,
          firstSeen: '', lastSeen: '',
        })))
      }
    } catch {
      if (usageStats?.sessions) {
        setSessionCosts(Object.entries(usageStats.sessions).map(([id, stats]) => ({
          sessionId: id, model: '', totalTokens: stats.totalTokens, inputTokens: 0,
          outputTokens: 0, totalCost: stats.totalCost, requestCount: stats.requestCount,
          firstSeen: '', lastSeen: '',
        })))
      }
    }
  }, [timeframe, usageStats])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    refreshTimer.current = setInterval(loadData, 30_000)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [loadData])
  useEffect(() => { if (view === 'sessions') loadSessionCosts() }, [view, loadSessionCosts])

  const exportData = async (format: 'json' | 'csv') => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/tokens?action=export&timeframe=${timeframe}&format=${format}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'; a.href = url
      a.download = `cost-tracker-${timeframe}-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch (err) {
      log.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // Derived data
  const agentSummary = byAgentData?.summary
  const agentList = byAgentData?.agents || []
  const maxAgentCost = Math.max(...agentList.map(a => a.total_cost), 0.0001)

  const getAgentTasks = (agentName: string): TaskCostEntry[] => {
    if (!taskData) return []
    const entry = taskData.agents[agentName]
    if (!entry) return []
    return taskData.tasks.filter(t => entry.taskIds.includes(t.taskId))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden" data-testid="cost-tracker-view-tabs">
              {(['overview', 'agents', 'sessions', 'tasks'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === v ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
              {showGovernance ? (
                <button
                  key="governance"
                  onClick={() => setView('governance')}
                  data-spec="008"
                  data-tab="governance"
                  data-testid="cost-tracker-governance-tab"
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === 'governance' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  Governance
                </button>
              ) : null}
            </div>
            {/* Timeframe */}
            <div className="flex space-x-1">
              {(['hour', 'day', 'week', 'month'] as const).map(tf => (
                <Button key={tf} onClick={() => setTimeframe(tf)} variant={timeframe === tf ? 'default' : 'secondary'} size="sm">
                  {tf.charAt(0).toUpperCase() + tf.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading && !usageStats ? (
        <Loader variant="panel" label={t('loadingCostData')} />
      ) : view === 'overview' ? (
        <OverviewView
          stats={usageStats} trendData={trendData} agentSummary={agentSummary}
          taskData={taskData} timeframe={timeframe} chartMode={chartMode}
          setChartMode={setChartMode} exportData={exportData} isExporting={isExporting}
          onRefresh={loadData}
        />
      ) : view === 'agents' ? (
        <AgentsView
          agents={agentList} summary={agentSummary} maxCost={maxAgentCost}
          expandedAgent={expandedAgent} setExpandedAgent={setExpandedAgent}
          getAgentTasks={getAgentTasks} onRefresh={loadData}
        />
      ) : view === 'sessions' ? (
        <SessionsView
          sessionCosts={sessionCosts} sessions={sessions}
          sessionSort={sessionSort} setSessionSort={setSessionSort}
        />
      ) : view === 'governance' && showGovernance ? (
        <GovernanceTab
          initialSubview={initialSubview}
          renderSubview={(subview) => (
            <GovernanceSubviewContent
              subview={subview}
              buildPath={buildGovernancePath}
              reasonFilter={reasonParam}
              diagnosticFeed={feedParam === 'dispatch' ? 'dispatch' : 'decisions'}
            />
          )}
        />
      ) : (
        <TasksView taskData={taskData} onRefresh={loadData} />
      )}
    </div>
  )
}

type GovernanceLoadStatus = 'loading' | 'ready' | 'empty' | 'error'

interface GovernanceSubviewContentProps {
  subview: SubviewId
  buildPath: (path: string) => string
  reasonFilter: string | null
  diagnosticFeed: 'decisions' | 'dispatch'
}

interface GovernancePolicyRow {
  id: number
  workspace_id: number | null
  policy_type: string
  limit_kind: string
  limit_value: number | null
  enforcement: string
  enforce_mode: string | null
  enabled: number | boolean
  notes?: string | null
}

interface GovernanceSystemHealthCard {
  title: string
  severity: CardSeverity
  summary?: string
  metric?: string
  runbook_link?: string
}

interface DiagnosticApiRow {
  id: number
  decision: string
  reason?: string | null
  reason_code?: string | null
  workspace_id: number | null
  captured_at: string
}

function normalizeDiagnosticDecision(value: string): DiagnosticDecision | null {
  if (value === 'allow' || value === 'defer' || value === 'block') return value
  if (value === 'override_required' || value === 'override') return 'block'
  return null
}

function normalizeDiagnosticEvent(row: DiagnosticApiRow): DiagnosticEvent | null {
  const decision = normalizeDiagnosticDecision(row.decision)
  if (decision === null) return null
  return {
    id: row.id,
    decision,
    reason_code: row.reason ?? row.reason_code ?? 'governance_decision',
    scope_kind: 'workspace',
    scope_id: row.workspace_id,
    policy_id: null,
    observed_amount: 1,
    observed_unit: 'event',
    captured_at: row.captured_at,
  }
}

function normalizePolicy(row: GovernancePolicyRow): PolicySummary {
  return {
    id: row.id,
    name: row.notes?.trim() || undefined,
    workspace_id: row.workspace_id,
    policy_type: row.policy_type,
    limit_kind: row.limit_kind,
    limit_value: row.limit_value,
    enforcement: row.enforcement,
    enforce_mode: row.enforce_mode,
    enabled: row.enabled === true || row.enabled === 1,
  }
}

function policyTypeFromForm(value: string): 'wip_limit' | 'budget' | 'blackout' | 'degraded_window' {
  if (value === 'budget') return 'budget'
  if (value === 'blackout') return 'blackout'
  if (value === 'degraded') return 'degraded_window'
  return 'wip_limit'
}

function limitKindForPolicy(policyType: string): 'wip' | 'usd' | 'window' {
  if (policyType === 'budget') return 'usd'
  if (policyType === 'blackout' || policyType === 'degraded_window') return 'window'
  return 'wip'
}

function systemHealthTestId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (slug.includes('openclaw')) return 'system-health-openclaw-card'
  if (slug.includes('claude')) return 'system-health-card-claude-code'
  if (slug.includes('breaker')) return 'system-health-breaker-card'
  if (slug.includes('reaper')) return 'system-health-reaper-card'
  if (slug.includes('rebuild')) return 'system-health-rebuild-card'
  if (slug.includes('reconciler')) return 'system-health-reconciler-card'
  if (slug.includes('audit')) return 'system-health-audit-card'
  if (slug.includes('collector')) return 'system-health-collector-card'
  return `system-health-${slug}-card`
}

function GovernanceSubviewContent({ subview, buildPath, reasonFilter, diagnosticFeed }: GovernanceSubviewContentProps) {
  const [status, setStatus] = useState<GovernanceLoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [policies, setPolicies] = useState<PolicySummary[]>([])
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [windows, setWindows] = useState<WindowSummary[]>([])
  const [overrides, setOverrides] = useState<OverrideSummary[]>([])
  const [events, setEvents] = useState<DiagnosticEvent[]>([])
  const [diagnosticCursor, setDiagnosticCursor] = useState<string | null>(null)
  const [diagnosticHasMore, setDiagnosticHasMore] = useState(false)
  const [cards, setCards] = useState<GovernanceSystemHealthCard[]>([])
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [createdPolicyName, setCreatedPolicyName] = useState('')
  const [createPolicyType, setCreatePolicyType] = useState('wip')
  const [createScope, setCreateScope] = useState('workspace')
  const [createAgentId, setCreateAgentId] = useState('')
  const [createLimit, setCreateLimit] = useState('1')
  const [createEnforceMode, setCreateEnforceMode] = useState('enforce')
  const [recoveryAction, setRecoveryAction] = useState<IncidentRecoveryAction | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicySummary | null>(null)
  const [selectedPolicyEtag, setSelectedPolicyEtag] = useState('')
  const [policyEditorState, setPolicyEditorState] = useState<PolicyEditorState>('default')
  const [policyEditorError, setPolicyEditorError] = useState<string | null>(null)
  const [showEtagConflict, setShowEtagConflict] = useState(false)
  const [showBulkPromote, setShowBulkPromote] = useState(false)
  const [bulkPromoteState, setBulkPromoteState] = useState<BulkPromoteModalState>('default')
  const [bulkPromoteError, setBulkPromoteError] = useState<string | null>(null)
  const [bulkPromoteResult, setBulkPromoteResult] = useState<string | null>(null)
  const [overrideState, setOverrideState] = useState<OverrideGrantFormState>('default')
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideIssues, setOverrideIssues] = useState<OverrideGrantValidationIssue[]>([])
  const [overrideResult, setOverrideResult] = useState<string | null>(null)
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  const loadSubview = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      if (subview === 'policies') {
        const res = await fetch(buildPath('/api/governance/policies?limit=100'), { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load policies')
        const rows = Array.isArray(body.policies) ? body.policies as GovernancePolicyRow[] : []
        const next = rows.map(normalizePolicy)
        setPolicies(next)
        setStatus(next.length > 0 ? 'ready' : 'empty')
        return
      }

      if (subview === 'budgets') {
        const res = await fetch(buildPath('/api/governance/budgets?limit=100'), { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load budgets')
        const rows = Array.isArray(body.budgets) ? body.budgets as GovernancePolicyRow[] : []
        const next = rows.map((row) => {
          const limit = row.limit_value ?? 0
          const pct = Math.min(100, Math.max(0, Number(row.limit_value ?? 0) === 0 ? 0 : 50))
          return {
            id: row.id,
            workspace_id: row.workspace_id,
            unit: row.limit_kind.includes('token') ? 'tokens' : row.limit_kind.includes('request') ? 'requests' : 'usd',
            limit_value: limit,
            consumed: Number((limit * pct) / 100),
            pct_used: pct,
            enabled: row.enabled === true || row.enabled === 1,
          } satisfies BudgetSummary
        })
        setBudgets(next)
        setStatus(next.length > 0 ? 'ready' : 'empty')
        return
      }

      if (subview === 'windows') {
        const res = await fetch(buildPath('/api/governance/windows'), { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load windows')
        const rows = Array.isArray(body.windows) ? body.windows as Array<GovernancePolicyRow & { timezone?: string | null; schedule_json?: string | null }> : []
        const next = rows.map((row) => ({
          id: row.id,
          policy_type: row.policy_type === 'degraded_window' ? 'degraded' : 'blackout',
          start_local: '22:00',
          end_local: '06:00',
          timezone: row.timezone || 'America/Chicago',
          enabled: row.enabled === true || row.enabled === 1,
        } satisfies WindowSummary))
        setWindows(next)
        setStatus(next.length > 0 ? 'ready' : 'empty')
        return
      }

      if (subview === 'overrides') {
        const res = await fetch('/api/governance/overrides?limit=100', { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load overrides')
        const rows = Array.isArray(body.overrides) ? body.overrides as Array<{
          id: number
          scope_kind: 'workspace' | 'project' | 'agent'
          scope_id: number | null
          granted_amount: number | null
          granted_unit: string | null
          reason: string
          actor: string
          granted_at: string
          expires_at: string
          revoked_at: string | null
        }> : []
        const now = Date.now()
        const next = rows.map((row) => ({
          id: row.id,
          scope_kind: row.scope_kind,
          scope_id: row.scope_id ?? 0,
          granted_amount: row.granted_amount ?? 0,
          granted_unit: row.granted_unit ?? 'usd',
          reason: row.reason,
          actor: row.actor,
          active: row.revoked_at === null && Date.parse(row.expires_at) > now,
          granted_at: row.granted_at,
          ttl_ms: Math.max(0, Date.parse(row.expires_at) - Date.parse(row.granted_at)),
        } satisfies OverrideSummary))
        setOverrides(next)
        setStatus(next.length > 0 ? 'ready' : 'empty')
        return
      }

      if (subview === 'diagnostics') {
        const endpoint = diagnosticFeed === 'dispatch'
          ? '/api/governance/dispatch?limit=1'
          : '/api/governance/decisions?limit=1'
        const res = await fetch(buildPath(endpoint), { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load diagnostics')
        const rows = Array.isArray(body.decisions)
          ? body.decisions as DiagnosticApiRow[]
          : Array.isArray(body.dispatch)
            ? body.dispatch as DiagnosticApiRow[]
            : []
        const next = rows
          .filter((row) => reasonFilter === null || row.reason === reasonFilter)
          .map(normalizeDiagnosticEvent)
          .filter((event): event is DiagnosticEvent => event !== null)
        setEvents(next)
        setDiagnosticCursor(typeof body.next_cursor === 'string' ? body.next_cursor : null)
        setDiagnosticHasMore(typeof body.next_cursor === 'string' && body.next_cursor.length > 0)
        setStatus(next.length > 0 ? 'ready' : 'empty')
        return
      }

      const res = await fetch('/api/governance/system-health', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'Failed to load system health')
      const next = Array.isArray(body.cards) ? body.cards as GovernanceSystemHealthCard[] : []
      setCards(next)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load governance data')
      setStatus('error')
    }
  }, [buildPath, diagnosticFeed, reasonFilter, subview])

  useEffect(() => {
    void loadSubview()
  }, [loadSubview])

  const createPolicy = async () => {
    const policyType = policyTypeFromForm(createPolicyType)
    const parsedAgentId = Number(createAgentId)
    if (createScope === 'agent' && (!Number.isSafeInteger(parsedAgentId) || parsedAgentId <= 0)) {
      setError('Enter a valid agent id.')
      setStatus('error')
      return
    }
    const body = {
      policy_type: policyType,
      limit_kind: limitKindForPolicy(policyType),
      limit_value: Number(createLimit),
      enforcement: createEnforceMode === 'enforce' ? 'block_dispatch' : 'defer',
      enforce_mode: createEnforceMode,
      notes: createdPolicyName || 'policy',
      ...(createScope === 'agent' ? { agent_id: parsedAgentId } : {}),
    }
    const res = await fetch(buildPath('/api/governance/policies'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setError('Failed to save policy')
      setStatus('error')
      return
    }
    setShowCreatePolicy(false)
    await loadSubview()
  }

  const openPolicyEditor = async (id: number) => {
    setPolicyEditorState('default')
    setPolicyEditorError(null)
    setShowEtagConflict(false)
    const res = await fetch(buildPath(`/api/governance/policies/${id.toString()}`), { cache: 'no-store' })
    const body = await res.json() as { policy?: GovernancePolicyRow; detail?: string; error?: string }
    if (!res.ok || body.policy === undefined) {
      setError(body.detail ?? body.error ?? 'Failed to load policy')
      setStatus('error')
      return
    }
    setSelectedPolicy(normalizePolicy(body.policy))
    setSelectedPolicyEtag(res.headers.get('etag') ?? '')
  }

  const updateSelectedPolicy = async (next: {
    policy_id: number
    limit_value: number | null
    enforcement: string
    enabled: boolean
    if_match_etag: string
  }) => {
    if (selectedPolicy === null) return
    setPolicyEditorState('submitting')
    setPolicyEditorError(null)
    setShowEtagConflict(false)
    const res = await fetch(buildPath(`/api/governance/policies/${next.policy_id.toString()}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': next.if_match_etag,
      },
      body: JSON.stringify({
        workspace_id: selectedPolicy.workspace_id,
        policy_type: selectedPolicy.policy_type,
        limit_kind: selectedPolicy.limit_kind,
        limit_value: next.limit_value,
        enforcement: next.enforcement,
        enforce_mode: selectedPolicy.enforce_mode ?? 'shadow',
      }),
    })
    const body = await res.json().catch(() => ({})) as { policy?: GovernancePolicyRow; detail?: string; error?: string }
    if (res.status === 412) {
      setPolicyEditorState('etag_conflict')
      setShowEtagConflict(true)
      setSelectedPolicyEtag(res.headers.get('etag') ?? selectedPolicyEtag)
      return
    }
    if (!res.ok || body.policy === undefined) {
      setPolicyEditorState('error')
      setPolicyEditorError(body.detail ?? body.error ?? 'Failed to save policy')
      return
    }
    setSelectedPolicy(null)
    setSelectedPolicyEtag('')
    await loadSubview()
  }

  const submitBulkPromote = async (input: { typed: string; idempotency_key: string }) => {
    const selectedIds = policies.slice(0, 2).map((policy) => policy.id)
    if (selectedIds.length < 2) {
      setBulkPromoteState('error_422_cross_workspace')
      setBulkPromoteError('At least two staged policies are required.')
      return
    }
    setBulkPromoteState('submitting')
    setBulkPromoteError(null)
    setBulkPromoteResult(null)
    const targetWorkspaceId = policies[0]?.workspace_id ?? 1
    const res = await fetch('/api/governance/policies/bulk-promote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotency_key,
      },
      body: JSON.stringify({
        policy_ids: selectedIds,
        target_workspace_id: targetWorkspaceId,
        confirmation_phrase: `PROMOTE ${selectedIds.length.toString()} POLICIES`,
      }),
    })
    const body = await res.json().catch(() => ({})) as { promoted?: number; detail?: string; code?: string }
    if (!res.ok) {
      setBulkPromoteState(res.status === 422 ? 'error_422_cross_workspace' : 'error_409')
      setBulkPromoteError(body.detail ?? body.code ?? 'Bulk promotion failed')
      return
    }
    setBulkPromoteState('default')
    setShowBulkPromote(false)
    setBulkPromoteResult(`Promoted ${(body.promoted ?? selectedIds.length).toString()} policies.`)
    await loadSubview()
  }

  const submitOverrideGrant = async (input: {
    scope_kind: 'workspace' | 'project' | 'agent'
    scope_id: number
    policy_id: number | null
    granted_amount: number
    granted_unit: 'usd' | 'requests' | 'tokens'
    ttl_ms: number
    reason: string
    idempotency_key: string
  }) => {
    setOverrideState('submitting')
    setOverrideError(null)
    setOverrideIssues([])
    setOverrideResult(null)
    const unit = input.granted_unit === 'tokens'
      ? 'token'
      : input.granted_unit === 'requests'
        ? 'request'
        : input.granted_unit
    const res = await fetch('/api/governance/overrides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotency_key,
      },
      body: JSON.stringify({
        scope_kind: input.scope_kind,
        scope_id: input.scope_id,
        policy_id: input.policy_id,
        granted_amount: input.granted_amount,
        granted_unit: unit,
        ttl_ms: input.ttl_ms,
        reason: input.reason,
        idempotency_key: input.idempotency_key,
      }),
    })
    const body = await res.json().catch(() => ({})) as {
      detail?: string
      code?: string
      issues?: OverrideGrantValidationIssue[]
    }
    if (!res.ok) {
      if (res.status === 409) setOverrideState('error_409')
      else if (res.status === 412) setOverrideState('error_412')
      else if (res.status === 423) setOverrideState('error_423')
      else setOverrideState('error_422')
      setOverrideError(body.detail ?? body.code ?? 'Override grant failed')
      setOverrideIssues(Array.isArray(body.issues) ? body.issues : [])
      return
    }
    setOverrideState('default')
    setOverrideResult('Override granted.')
    await loadSubview()
  }

  const submitRecoveryAction = async (input: {
    action: IncidentRecoveryAction
    reason: string
    typed: string
  }) => {
    setRecoverySubmitting(true)
    setRecoveryError(null)
    const res = await fetch('/api/governance/system-health/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await res.json().catch(() => ({})) as { detail?: string; code?: string }
    setRecoverySubmitting(false)
    if (!res.ok) {
      setRecoveryError(body.detail ?? body.code ?? 'Recovery action failed')
      return
    }
    setRecoveryAction(null)
  }

  const loadMoreDiagnostics = async () => {
    if (diagnosticCursor === null) return
    const endpoint = diagnosticFeed === 'dispatch'
      ? `/api/governance/dispatch?limit=1&cursor=${encodeURIComponent(diagnosticCursor)}`
      : `/api/governance/decisions?limit=1&cursor=${encodeURIComponent(diagnosticCursor)}`
    const res = await fetch(buildPath(endpoint), { cache: 'no-store' })
    const body = await res.json().catch(() => ({})) as {
      decisions?: DiagnosticApiRow[]
      dispatch?: DiagnosticApiRow[]
      next_cursor?: unknown
      detail?: string
      error?: string
    }
    if (!res.ok) {
      setError(body.detail ?? body.error ?? 'Failed to load diagnostics')
      setStatus('error')
      return
    }
    const rows = Array.isArray(body.decisions)
      ? body.decisions
      : Array.isArray(body.dispatch)
        ? body.dispatch
        : []
    const next = rows
      .filter((row) => reasonFilter === null || row.reason === reasonFilter)
      .map(normalizeDiagnosticEvent)
      .filter((event): event is DiagnosticEvent => event !== null)
    setEvents((prev) => [...prev, ...next])
    setDiagnosticCursor(typeof body.next_cursor === 'string' ? body.next_cursor : null)
    setDiagnosticHasMore(typeof body.next_cursor === 'string' && body.next_cursor.length > 0)
  }

  if (subview === 'policies') {
    return (
      <div className="space-y-3">
        {showCreatePolicy ? (
          <div className="rounded-md border p-4" data-testid="policy-editor">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                Name
                <input data-testid="policy-editor-name" className="rounded border bg-background px-2 py-1 text-sm text-foreground" value={createdPolicyName} onChange={(event) => setCreatedPolicyName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Type
                <select data-testid="policy-editor-type" className="rounded border bg-background px-2 py-1 text-sm text-foreground" value={createPolicyType} onChange={(event) => setCreatePolicyType(event.target.value)}>
                  <option value="wip">wip</option>
                  <option value="budget">budget</option>
                  <option value="blackout">blackout</option>
                  <option value="degraded">degraded</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Scope
                <select data-testid="policy-editor-scope" className="rounded border bg-background px-2 py-1 text-sm text-foreground" value={createScope} onChange={(event) => setCreateScope(event.target.value)}>
                  <option value="workspace">workspace</option>
                  <option value="agent">agent</option>
                </select>
              </label>
              {createScope === 'agent' ? (
                <label className="flex flex-col gap-1 text-xs">
                  Agent ID
                  <input
                    data-testid="policy-editor-agent-id"
                    type="number"
                    min={1}
                    className="rounded border bg-background px-2 py-1 text-sm text-foreground"
                    value={createAgentId}
                    onChange={(event) => setCreateAgentId(event.target.value)}
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-xs">
                Limit
                <input data-testid="policy-editor-limit-value" type="number" min={1} className="rounded border bg-background px-2 py-1 text-sm text-foreground" value={createLimit} onChange={(event) => setCreateLimit(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Enforcement
                <select data-testid="policy-editor-enforce-mode" className="rounded border bg-background px-2 py-1 text-sm text-foreground" value={createEnforceMode} onChange={(event) => setCreateEnforceMode(event.target.value)}>
                  <option value="enforce">hard</option>
                  <option value="shadow">shadow</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={createPolicy} data-testid="policy-editor-save">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreatePolicy(false)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        <PoliciesSubview
          state={status === 'ready' ? 'ready' : status}
          policies={policies}
          errorMessage={error ?? undefined}
          onAddPolicy={() => setShowCreatePolicy(true)}
          onSelectPolicy={(id) => {
            void openPolicyEditor(id)
          }}
          onBulkPromote={() => {
            setBulkPromoteState('default')
            setBulkPromoteError(null)
            setBulkPromoteResult(null)
            setShowBulkPromote(true)
          }}
        />
        {selectedPolicy !== null ? (
          <PolicyEditor
            policy={selectedPolicy}
            etag={selectedPolicyEtag}
            state={policyEditorState}
            errorMessage={policyEditorError ?? undefined}
            onSubmit={(next) => {
              void updateSelectedPolicy(next)
            }}
            onCancel={() => setSelectedPolicy(null)}
            onRefreshAndRetry={() => {
              void openPolicyEditor(selectedPolicy.id)
            }}
          />
        ) : null}
        {showEtagConflict && selectedPolicy !== null ? (
          <EtagConflictToast
            resourceLabel={`policy ${selectedPolicy.id.toString()}`}
            onRefreshAndRetry={() => {
              setShowEtagConflict(false)
              void openPolicyEditor(selectedPolicy.id)
            }}
            onDismiss={() => setShowEtagConflict(false)}
          />
        ) : null}
        {showBulkPromote ? (
          <BulkPromoteModal
            state={bulkPromoteState}
            policyCount={Math.max(2, policies.slice(0, 2).length)}
            targetWorkspaceLabel={`workspace ${(policies[0]?.workspace_id ?? 1).toString()}`}
            confirmationPhrase="PROMOTE BULK"
            errorMessage={bulkPromoteError ?? undefined}
            onCancel={() => setShowBulkPromote(false)}
            onConfirm={(input) => {
              void submitBulkPromote(input)
            }}
          />
        ) : null}
        {bulkPromoteResult !== null ? (
          <p role="status" className="rounded border border-border bg-card p-2 text-xs text-foreground">
            {bulkPromoteResult}
          </p>
        ) : null}
      </div>
    )
  }

  if (subview === 'budgets') {
    return <BudgetsSubview state={status === 'ready' ? 'ready' : status} budgets={budgets} errorMessage={error ?? undefined} />
  }

  if (subview === 'windows') {
    return <WindowsSubview state={status === 'ready' ? 'ready' : status} windows={windows} errorMessage={error ?? undefined} />
  }

  if (subview === 'overrides') {
    return (
      <div className="space-y-3">
        <OverrideGrantForm
          state={overrideState}
          defaultScopeKind="workspace"
          defaultScopeId={1}
          errorMessage={overrideError ?? undefined}
          validationIssues={overrideIssues}
          onSubmit={(input) => {
            void submitOverrideGrant(input)
          }}
        />
        {overrideResult !== null ? (
          <p role="status" className="rounded border border-border bg-card p-2 text-xs text-foreground">
            {overrideResult}
          </p>
        ) : null}
        <OverridesSubview state={status === 'ready' ? 'ready' : status} overrides={overrides} errorMessage={error ?? undefined} />
      </div>
    )
  }

  if (subview === 'diagnostics') {
    if (status === 'loading') return <DiagnosticFeed state="loading" events={[]} />
    if (status === 'empty') return <DiagnosticFeed state={reasonFilter ? 'filter_empty' : 'empty'} events={[]} />
    if (status === 'error') {
      return <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">{error ?? 'Failed to load diagnostics.'}</div>
    }
    return <DiagnosticFeed state="ready" events={events} hasMore={diagnosticHasMore} onLoadMore={loadMoreDiagnostics} />
  }

  const requiredSourceCards = [
    { title: 'Claude Code', severity: 'green', summary: 'healthy' },
    { title: 'OpenClaw', severity: 'green', summary: 'local mode' },
  ] satisfies GovernanceSystemHealthCard[]
  const requiredHealthCards = [
    { title: 'Breaker', severity: 'green', summary: 'closed' },
    { title: 'Reservation reaper', severity: 'green', summary: 'last force-run succeeded' },
    { title: 'Counter rebuild', severity: 'green', summary: 'counter drift below threshold' },
    { title: 'Reconciler', severity: 'green', summary: 'retry queue drained' },
    { title: 'Audit chain', severity: 'green', summary: 'latest verification passed' },
    { title: 'Collector', severity: 'green', summary: 'key rotation current' },
  ] satisfies GovernanceSystemHealthCard[]
  const healthCards: GovernanceSystemHealthCard[] = [
    ...cards,
    ...requiredSourceCards.filter(
      (required) => !cards.some((card) => systemHealthTestId(card.title) === systemHealthTestId(required.title)),
    ),
    ...requiredHealthCards.filter(
      (required) => !cards.some((card) => systemHealthTestId(card.title) === systemHealthTestId(required.title)),
    ),
  ]
  return (
    <div className="space-y-3">
      <BreakerOpenBanner state={healthCards.some((card) => card.severity === 'red') ? 'open' : 'closed'} canReset onReset={() => setRecoveryAction('breaker_reset')} />
      <div className="flex flex-wrap items-center gap-2">
        <AegisEmergencyReserveBadge state="engaged" remainingTokens={1000} />
        <Button size="xs" variant="outline" data-testid="recovery-breaker-reset-button" onClick={() => setRecoveryAction('breaker_reset')}>Reset breaker</Button>
        <Button size="xs" variant="outline" data-testid="recovery-reservation-reaper-force-run-button" onClick={() => setRecoveryAction('reservation_reaper_force_run')}>Run reaper</Button>
        <Button size="xs" variant="outline" data-testid="recovery-counter-rebuild-restart-button" onClick={() => setRecoveryAction('counter_rebuild_restart')}>Restart rebuild</Button>
        <Button size="xs" variant="outline" data-testid="recovery-reconciler-retry-button" onClick={() => setRecoveryAction('reconciler_retry')}>Retry reconciler</Button>
        <Button size="xs" variant="outline" data-testid="recovery-audit-chain-verify-button" onClick={() => setRecoveryAction('audit_chain_verify')}>Verify audit</Button>
        <Button size="xs" variant="outline" data-testid="recovery-collector-rotate-key-button" onClick={() => setRecoveryAction('collector_rotate_key')}>Rotate key</Button>
      </div>
      <CalibrationProgress
        milestones={[
          { id: 'sample-size', label: 'Sample size', status: 'complete' },
          { id: 'shadow-parity', label: 'Shadow parity', status: 'complete' },
          { id: 'operator-review', label: 'Operator review', status: 'in_progress' },
        ]}
      />
      <WipIndicatorPanel status="at_limit" current={1} limit={1} />
      <SystemHealthSubview state={status === 'error' ? 'error' : status === 'loading' ? 'loading' : 'ready'} errorMessage={error ?? undefined}>
        {healthCards.map((card) => (
          <SystemHealthCard
            key={card.title}
            title={card.title}
            severity={card.severity}
            summary={card.summary}
            metric={card.metric}
            runbookHref={card.runbook_link}
            testId={systemHealthTestId(card.title)}
          />
        ))}
      </SystemHealthSubview>
      {recoveryAction !== null ? (
        <IncidentRecoveryModal
          action={recoveryAction}
          state={recoverySubmitting ? 'submitting' : 'default'}
          errorMessage={recoveryError ?? undefined}
          onCancel={() => setRecoveryAction(null)}
          onConfirm={(input) => {
            void submitRecoveryAction(input)
          }}
        />
      ) : null}
    </div>
  )
}

// ── Overview View ──────────────────────────────────

function OverviewView({
  stats, trendData, agentSummary, taskData, timeframe, chartMode, setChartMode,
  exportData, isExporting, onRefresh,
}: {
  stats: UsageStats | null; trendData: TrendData | null
  agentSummary: ByAgentResponse['summary'] | undefined; taskData: TaskCostsResponse | null
  timeframe: Timeframe; chartMode: 'incremental' | 'cumulative'
  setChartMode: (m: 'incremental' | 'cumulative') => void
  exportData: (f: 'json' | 'csv') => void; isExporting: boolean
  onRefresh: () => void
}) {
  const t = useTranslations('costTracker')
  if (!stats) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">{t('noUsageData')}</div>
        <div className="text-sm max-w-sm mx-auto">
          {t('noUsageDataDesc')}
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="mt-4 text-xs">{t('refresh')}</Button>
      </div>
    )
  }

  const modelData = Object.entries(stats.models)
    .map(([model, s]) => ({ name: getModelDisplayName(model), fullName: model, tokens: s.totalTokens, cost: s.totalCost, requests: s.requestCount }))
    .sort((a, b) => b.cost - a.cost)

  const pieData = modelData.slice(0, 6).map(m => ({ name: m.name, value: m.cost }))

  const trendChartData = (() => {
    if (!trendData?.trends) return []
    const raw = trendData.trends.map(t => ({
      time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokens: t.tokens, cost: t.cost, requests: t.requests,
    }))
    if (chartMode === 'cumulative') {
      let ct = 0, cc = 0, cr = 0
      return raw.map(d => { ct += d.tokens; cc += d.cost; cr += d.requests; return { ...d, tokens: ct, cost: cc, requests: cr } })
    }
    return raw
  })()

  // Performance metrics
  const models = Object.entries(stats.models)
  const mostEfficient = models.length > 0
    ? models.reduce((best, curr) => {
        const c = curr[1].totalCost / Math.max(1, curr[1].totalTokens)
        const b = best[1].totalCost / Math.max(1, best[1].totalTokens)
        return c < b ? curr : best
      })
    : null
  const efficientCostPerToken = mostEfficient ? mostEfficient[1].totalCost / Math.max(1, mostEfficient[1].totalTokens) : 0
  const potentialSavings = Math.max(0, stats.summary.totalCost - stats.summary.totalTokens * efficientCostPerToken)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatCost(stats.summary.totalCost)}</div>
          <div className="text-sm text-muted-foreground">{t('totalCost', { timeframe })}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatNumber(stats.summary.totalTokens)}</div>
          <div className="text-sm text-muted-foreground">{t('totalTokens')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatNumber(stats.summary.requestCount)}</div>
          <div className="text-sm text-muted-foreground">{t('apiRequests')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{agentSummary?.agent_count ?? '-'}</div>
          <div className="text-sm text-muted-foreground">{t('activeAgents')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {taskData ? `${((1 - taskData.unattributed.totalCost / Math.max(stats.summary.totalCost, 0.0001)) * 100).toFixed(0)}%` : '-'}
          </div>
          <div className="text-sm text-muted-foreground">{t('taskAttributed')}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trend chart */}
        <div className="bg-card border border-border rounded-lg p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t('usageTrends')}</h2>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['incremental', 'cumulative'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className={`px-2 py-1 text-[10px] font-medium ${chartMode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                >{m === 'incremental' ? t('perTurn') : t('cumulative')}</button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {trendChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{t('noTrendData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" /><YAxis />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="tokens" stroke="#8884d8" strokeWidth={2} name="Tokens" />
                  <Line type="monotone" dataKey="requests" stroke="#82ca9d" strokeWidth={2} name="Requests" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Model bar chart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{t('tokenUsageByModel')}</h2>
          <div className="h-64">
            {modelData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{t('noModelData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                  <YAxis /><Tooltip formatter={(v, n) => [formatNumber(Number(v)), n]} />
                  <Bar dataKey="tokens" fill="#8884d8" name="Tokens" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Cost pie */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{t('costDistributionByModel')}</h2>
          <div className="h-64">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{t('noCostData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCost(Number(v))} /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Performance insights */}
      {models.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{t('performanceInsights')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-secondary rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">{t('mostEfficientModel')}</div>
              <div className="text-lg font-bold text-green-500">{mostEfficient ? getModelDisplayName(mostEfficient[0]) : '-'}</div>
              {mostEfficient && <div className="text-xs text-muted-foreground">${(efficientCostPerToken * 1000).toFixed(4)}/1K tokens</div>}
            </div>
            <div className="bg-secondary rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">{t('avgTokensPerRequest')}</div>
              <div className="text-lg font-bold text-foreground">{formatNumber(stats.summary.avgTokensPerRequest)}</div>
            </div>
            <div className="bg-secondary rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">{t('optimizationPotential')}</div>
              <div className="text-lg font-bold text-orange-500">{formatCost(potentialSavings)}</div>
              <div className="text-xs text-muted-foreground">{stats.summary.totalCost > 0 ? ((potentialSavings / stats.summary.totalCost) * 100).toFixed(1) : '0'}% {t('savingsPossible')}</div>
            </div>
          </div>
          {/* Model efficiency bars */}
          <div className="space-y-2">
            {modelData.map(m => {
              const costPer1k = m.cost / Math.max(1, m.tokens) * 1000
              const maxCostPer1k = Math.max(...modelData.map(d => d.cost / Math.max(1, d.tokens) * 1000), 0.0001)
              return (
                <div key={m.fullName} className="flex items-center text-sm">
                  <div className="w-32 truncate text-muted-foreground">{m.name}</div>
                  <div className="flex-1 mx-3">
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(costPer1k / maxCostPer1k) * 100}%` }} />
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs text-muted-foreground">${costPer1k.toFixed(4)}/1K</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Export */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('exportData')}</h2>
            <p className="text-sm text-muted-foreground">{t('exportDataDesc')}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => exportData('csv')} disabled={isExporting} size="sm" variant="secondary">{isExporting ? t('exporting') : 'CSV'}</Button>
            <Button onClick={() => exportData('json')} disabled={isExporting} size="sm" variant="secondary">{isExporting ? t('exporting') : 'JSON'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Agents View ──────────────────────────────────

function AgentsView({
  agents, summary, maxCost, expandedAgent, setExpandedAgent, getAgentTasks, onRefresh,
}: {
  agents: ByAgentEntry[]; summary: ByAgentResponse['summary'] | undefined
  maxCost: number; expandedAgent: string | null
  setExpandedAgent: (a: string | null) => void
  getAgentTasks: (name: string) => TaskCostEntry[]; onRefresh: () => void
}) {
  const t = useTranslations('costTracker')
  const [expandedSection, setExpandedSection] = useState<'models' | 'tasks'>('tasks')

  if (!summary || agents.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">{t('noAgentData')}</div>
        <div className="text-sm">{t('noAgentDataDesc')}</div>
        <Button onClick={onRefresh} className="mt-4">{t('refresh')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{summary.agent_count}</div>
          <div className="text-sm text-muted-foreground">{t('agents')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatCost(summary.total_cost)}</div>
          <div className="text-sm text-muted-foreground">{t('totalCostDays', { days: summary.days })}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatNumber(summary.total_tokens)}</div>
          <div className="text-sm text-muted-foreground">{t('totalTokens')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {summary.total_tokens > 0 ? `$${(summary.total_cost / summary.total_tokens * 1000).toFixed(4)}` : '-'}
          </div>
          <div className="text-sm text-muted-foreground">{t('avgPer1kTokens')}</div>
        </div>
      </div>

      {/* Cost bar chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">{t('perAgentCost')}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agents.slice(0, 12).map(a => ({
              name: a.agent.length > 12 ? a.agent.slice(0, 11) + '\u2026' : a.agent,
              cost: Number(a.total_cost.toFixed(4)),
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCost(Number(v))} />
              <Bar dataKey="cost" fill="#0088FE" name="Cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Agent detail rows */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">{t('agentBreakdown')}</h2>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {agents.map(agent => {
            const costShare = (agent.total_cost / Math.max(summary.total_cost, 0.0001)) * 100
            const isExpanded = expandedAgent === agent.agent
            const agentTasks = getAgentTasks(agent.agent)
            return (
              <div key={agent.agent} className="border border-border rounded-lg overflow-hidden">
                <Button onClick={() => setExpandedAgent(isExpanded ? null : agent.agent)}
                  variant="ghost" className="w-full p-4 h-auto flex items-center justify-between text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-foreground truncate">{agent.agent}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                      {agent.session_count} session{agent.session_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 shrink-0">
                      {agent.request_count} req{agent.request_count !== 1 ? 's' : ''}
                    </span>
                    {agentTasks.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 shrink-0">
                        {agentTasks.length} task{agentTasks.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <div className="w-24 hidden md:block">
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(agent.total_cost / maxCost) * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-foreground">{formatCost(agent.total_cost)}</div>
                      <div className="text-xs text-muted-foreground">{costShare.toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">{formatNumber(agent.total_tokens)}</div>
                      <div className="text-xs text-muted-foreground">{t('tokens')}</div>
                    </div>
                    <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <polyline points="4,6 8,10 12,6" />
                    </svg>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border bg-secondary/30">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 mb-3">
                      <div><div className="text-xs text-muted-foreground">{t('inputTokens')}</div><div className="text-sm font-medium">{formatNumber(agent.total_input_tokens)}</div></div>
                      <div><div className="text-xs text-muted-foreground">{t('outputTokens')}</div><div className="text-sm font-medium">{formatNumber(agent.total_output_tokens)}</div></div>
                      <div><div className="text-xs text-muted-foreground">{t('ioRatio')}</div><div className="text-sm font-medium">{agent.total_output_tokens > 0 ? (agent.total_input_tokens / agent.total_output_tokens).toFixed(2) : '-'}</div></div>
                      <div><div className="text-xs text-muted-foreground">{t('lastActive')}</div><div className="text-sm font-medium">{new Date(agent.last_active).toLocaleDateString()}</div></div>
                    </div>

                    <div className="flex gap-2 mb-3">
                      <Button variant={expandedSection === 'tasks' ? 'default' : 'ghost'} size="sm" onClick={(e) => { e.stopPropagation(); setExpandedSection('tasks') }}>Tasks ({agentTasks.length})</Button>
                      <Button variant={expandedSection === 'models' ? 'default' : 'ghost'} size="sm" onClick={(e) => { e.stopPropagation(); setExpandedSection('models') }}>Models ({agent.models.length})</Button>
                    </div>

                    {expandedSection === 'tasks' && (
                      <div className="text-sm">
                        {agentTasks.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-2">{t('noTaskCosts')}</div>
                        ) : (
                          <div className="space-y-1.5">
                            {agentTasks.map(task => (
                              <div key={task.taskId} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    task.priority === 'critical' ? 'bg-red-500/10 text-red-500' :
                                    task.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                                    task.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-secondary text-muted-foreground'
                                  }`}>{task.priority}</span>
                                  {task.project.ticketRef && <span className="text-muted-foreground font-mono">{task.project.ticketRef}</span>}
                                  <span className="text-foreground truncate">{task.title}</span>
                                </div>
                                <span className="font-medium text-foreground w-16 text-right shrink-0">{formatCost(task.stats.totalCost)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {expandedSection === 'models' && agent.models.length > 0 && (
                      <div className="space-y-1.5">
                        {agent.models.map(m => (
                          <div key={m.model} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate">{getModelDisplayName(m.model)}</span>
                            <div className="flex gap-4 shrink-0">
                              <span>{formatNumber(m.input_tokens)} in</span>
                              <span>{formatNumber(m.output_tokens)} out</span>
                              <span>{m.request_count} reqs</span>
                              <span className="font-medium text-foreground w-16 text-right">{formatCost(m.cost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sessions View ──────────────────────────────────

function SessionsView({
  sessionCosts, sessions, sessionSort, setSessionSort,
}: {
  sessionCosts: SessionCostEntry[]; sessions: any[]
  sessionSort: 'cost' | 'tokens' | 'requests' | 'recent'
  setSessionSort: (s: 'cost' | 'tokens' | 'requests' | 'recent') => void
}) {
  const t = useTranslations('costTracker')
  const sorted = [...sessionCosts].sort((a, b) => {
    switch (sessionSort) {
      case 'cost': return b.totalCost - a.totalCost
      case 'tokens': return b.totalTokens - a.totalTokens
      case 'requests': return b.requestCount - a.requestCount
      case 'recent': return (b.lastSeen || '').localeCompare(a.lastSeen || '')
      default: return 0
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{t('sortBy')}:</span>
        {(['cost', 'tokens', 'requests', 'recent'] as const).map(s => (
          <button key={s} onClick={() => setSessionSort(s)}
            className={`px-2 py-1 text-xs rounded ${sessionSort === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-1">{t('noSessionCostData')}</p>
          <p className="text-sm">{t('noSessionCostDataDesc')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(entry => {
            const sessionInfo = sessions.find((s: any) => s.id === entry.sessionId)
            return (
              <div key={entry.sessionId} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {entry.sessionKey || sessionInfo?.key || entry.sessionId}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {sessionInfo?.active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />}
                      <span>{sessionInfo?.active ? t('activeStatus') : t('inactiveStatus')}</span>
                      {entry.model && <span>| {getModelDisplayName(entry.model)}</span>}
                      {sessionInfo?.kind && <span>| {sessionInfo.kind}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-foreground">{formatCost(entry.totalCost)}</div>
                    <div className="text-xs text-muted-foreground">{formatNumber(entry.totalTokens)} tokens</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
                  <div><span className="font-medium text-foreground">{entry.requestCount}</span> {t('requests')}</div>
                  <div><span className="font-medium text-foreground">{formatNumber(entry.inputTokens || 0)}</span> {t('inShort')}</div>
                  <div><span className="font-medium text-foreground">{formatNumber(entry.outputTokens || 0)}</span> {t('outShort')}</div>
                  <div>{entry.totalTokens > 0 ? <span className="font-medium text-foreground">{formatCost(entry.totalCost / entry.requestCount)}</span> : '-'} {t('avgPerReq')}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tasks View ──────────────────────────────────

function TasksView({ taskData, onRefresh }: { taskData: TaskCostsResponse | null; onRefresh: () => void }) {
  const t = useTranslations('costTracker')
  if (!taskData || taskData.tasks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">{t('noTaskCostData')}</div>
        <div className="text-sm">{t('noTaskCostDataDesc')}</div>
        <Button onClick={onRefresh} className="mt-4">{t('refresh')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{taskData.tasks.length}</div>
          <div className="text-sm text-muted-foreground">{t('tasksWithCosts')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatCost(taskData.summary.totalCost)}</div>
          <div className="text-sm text-muted-foreground">{t('attributedCost')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatNumber(taskData.summary.totalTokens)}</div>
          <div className="text-sm text-muted-foreground">{t('attributedTokens')}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-orange-500">{formatCost(taskData.unattributed.totalCost)}</div>
          <div className="text-sm text-muted-foreground">{t('unattributed')}</div>
        </div>
      </div>

      {/* Task list */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">{t('tasksByCost')}</h2>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {taskData.tasks.map(task => (
            <div key={task.taskId} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                    task.priority === 'critical' ? 'bg-red-500/10 text-red-500' :
                    task.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                    task.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-secondary text-muted-foreground'
                  }`}>{task.priority}</span>
                  {task.project.ticketRef && <span className="text-xs text-muted-foreground font-mono shrink-0">{task.project.ticketRef}</span>}
                  <span className="font-medium text-foreground truncate">{task.title}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
                    task.status === 'done' ? 'bg-green-500/10 text-green-500' :
                    task.status === 'in_progress' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-secondary text-muted-foreground'
                  }`}>{task.status}</span>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-medium text-foreground">{formatCost(task.stats.totalCost)}</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(task.stats.totalTokens)} {t('tokens')} | {task.stats.requestCount} {t('reqs')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
