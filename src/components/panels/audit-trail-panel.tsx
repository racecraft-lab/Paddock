'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { useMissionControl } from '@/store'

interface AuditEvent {
  id: number
  action: string
  actor: string
  actor_id?: number
  target_type?: string
  target_id?: number
  detail?: any
  ip_address?: string
  user_agent?: string
  created_at: number
}

// SPEC-007 (US3): Dispositions tab types and constants. Strings are hardcoded
// (not in messages JSON) because the i18n message files are outside SPEC-007's
// strict-scope allowlist. See tsconfig.spec-strict.json + task-artifacts.enums
// allowlist test for the file boundary.
interface DispositionRow {
  id: number
  task_id: number
  disposition: string
  reason: string | null
  triaged_by_agent_id: number | null
  triaged_at: number
  workspace_id: number
}

interface AgentLite {
  id: number
  name: string
}

// FR-010 closed enum (8 values) + 'unknown' (FR-139 validation_failed label).
const DISPOSITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'rerouted', label: 'Rerouted' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'spam', label: 'Spam' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
  { value: 'unknown', label: 'validation_failed' },
]

const DATE_PRESETS: ReadonlyArray<{ value: string; label: string; days: number | null }> = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'custom', label: 'Custom range', days: null },
]

const DISPOSITIONS_DEFAULT_LIMIT = 50
const DISPOSITIONS_MAX_LIMIT = 200

// actionLabels are now provided via translations (auditTrail namespace)

const actionColors: Record<string, string> = {
  login: 'text-green-400',
  login_failed: 'text-red-400',
  logout: 'text-muted-foreground',
  password_change: 'text-amber-400',
  profile_update: 'text-blue-400',
  user_create: 'text-cyan-400',
  user_update: 'text-indigo-400',
  user_delete: 'text-red-400',
  role_denied: 'text-red-500',
  backup_create: 'text-green-400',
  backup_delete: 'text-amber-400',
  settings_update: 'text-indigo-400',
  auto_backup: 'text-green-400',
  heartbeat_check: 'text-muted-foreground',
  agent_config_sync: 'text-cyan-400',
  local_agent_sync: 'text-cyan-400',
  integration_test: 'text-amber-400',
  agent_register: 'text-green-400',
  agent_update: 'text-blue-400',
  agent_create: 'text-green-400',
  agent_delete: 'text-red-400',
  token_rotate: 'text-amber-400',
  gateway_config_update: 'text-indigo-400',
  login_google: 'text-green-400',
  google_disconnect: 'text-amber-400',
  workspace_create: 'text-green-400',
  workspace_update: 'text-blue-400',
  workspace_delete: 'text-red-400',
  cleanup: 'text-muted-foreground',
  export: 'text-blue-400',
  access_request: 'text-amber-400',
  access_approve: 'text-green-400',
  access_deny: 'text-red-400',
}

const actionIcons: Record<string, string> = {
  login: '>',
  login_failed: 'x',
  logout: '<',
  password_change: '*',
  profile_update: '~',
  user_create: '+',
  user_update: '~',
  user_delete: '-',
  role_denied: '!',
  backup_create: 'B',
  backup_delete: 'B',
  settings_update: 'S',
  auto_backup: 'A',
  heartbeat_check: '.',
  agent_config_sync: 'c',
  local_agent_sync: 'c',
  integration_test: 'T',
  agent_register: '+',
  agent_update: '~',
  agent_create: '+',
  agent_delete: '-',
  token_rotate: 'R',
  gateway_config_update: 'G',
  login_google: '>',
  google_disconnect: '<',
  workspace_create: '+',
  workspace_update: '~',
  workspace_delete: '-',
  cleanup: 'C',
  export: 'E',
  access_request: '?',
  access_approve: 'v',
  access_deny: 'x',
}

type AuditTabKey = 'events' | 'dispositions'

export function AuditTrailPanel() {
  const [activeTab, setActiveTab] = useState<AuditTabKey>('events')

  return (
    <div className="flex flex-col h-full">
      {/* Tab navigation — SPEC-007 US3 added "Dispositions" alongside the
          existing audit-events view. */}
      <div
        role="tablist"
        aria-label="Audit views"
        className="flex gap-1 border-b border-border px-5 pt-4"
        data-testid="audit-tab-nav"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'events'}
          onClick={() => setActiveTab('events')}
          data-testid="audit-tab-events"
          className={`px-3 py-2 text-xs font-medium rounded-t-md transition-smooth ${
            activeTab === 'events'
              ? 'bg-secondary text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          Events
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'dispositions'}
          onClick={() => setActiveTab('dispositions')}
          data-testid="audit-tab-dispositions"
          className={`px-3 py-2 text-xs font-medium rounded-t-md transition-smooth ${
            activeTab === 'dispositions'
              ? 'bg-secondary text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          Dispositions
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'events' ? <AuditEventsTab /> : <DispositionsTab />}
      </div>
    </div>
  )
}

function AuditEventsTab() {
  const t = useTranslations('auditTrail')

  const actionLabels: Record<string, string> = {
    login: t('actionLogin'), login_failed: t('actionLoginFailed'), logout: t('actionLogout'),
    password_change: t('actionPasswordChange'), profile_update: t('actionProfileUpdate'),
    user_create: t('actionUserCreate'), user_update: t('actionUserUpdate'), user_delete: t('actionUserDelete'),
    role_denied: t('actionRoleDenied'), backup_create: t('actionBackupCreate'), backup_delete: t('actionBackupDelete'),
    settings_update: t('actionSettingsUpdate'), auto_backup: t('actionAutoBackup'),
    heartbeat_check: t('actionHeartbeatCheck'), agent_config_sync: t('actionAgentConfigSync'),
    local_agent_sync: t('actionLocalAgentSync'), integration_test: t('actionIntegrationTest'),
    agent_register: t('actionAgentRegister'), agent_update: t('actionAgentUpdate'),
    agent_create: t('actionAgentCreate'), agent_delete: t('actionAgentDelete'),
    token_rotate: t('actionTokenRotate'), gateway_config_update: t('actionGatewayConfigUpdate'),
    login_google: t('actionLoginGoogle'), google_disconnect: t('actionGoogleDisconnect'),
    workspace_create: t('actionWorkspaceCreate'), workspace_update: t('actionWorkspaceUpdate'),
    workspace_delete: t('actionWorkspaceDelete'), cleanup: t('actionCleanup'),
    export: t('actionExport'), access_request: t('actionAccessRequest'),
    access_approve: t('actionAccessApprove'), access_deny: t('actionAccessDeny'),
  }

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState({ action: '', actor: '' })
  const [page, setPage] = useState(0)
  const limit = 50

  const fetchEvents = useCallback(async () => {
    try {
      setError(null)
      const params = new URLSearchParams()
      if (filter.action) params.append('action', filter.action)
      if (filter.actor) params.append('actor', filter.actor)
      params.append('limit', limit.toString())
      params.append('offset', (page * limit).toString())

      const res = await fetch(`/api/audit?${params}`)
      if (!res.ok) {
        if (res.status === 403) {
          setError(t('adminRequired'))
          return
        }
        throw new Error(t('failedFetch'))
      }
      const data = await res.json()
      setEvents(data.events)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useSmartPoll(fetchEvents, 30000, { pauseWhenDisconnected: true })

  const totalPages = Math.ceil(total / limit)

  function formatTime(ts: number) {
    const d = new Date(ts * 1000)
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  function formatDetail(event: AuditEvent): string | null {
    if (!event.detail) return null
    if (event.action === 'user_create') return `${t('detailUsername')}: ${event.detail.username}, ${t('detailRole')}: ${event.detail.role}`
    if (event.action === 'user_update') {
      const parts: string[] = []
      if (event.detail.role) parts.push(`${t('detailRole')}: ${event.detail.role}`)
      if (event.detail.display_name) parts.push(`${t('detailName')}: ${event.detail.display_name}`)
      if (event.detail.password_changed) parts.push(t('detailPasswordReset'))
      return parts.join(', ')
    }
    if (event.action === 'profile_update') return `${t('detailName')}: ${event.detail.display_name}`
    if (event.action === 'settings_update' && event.detail.updated_keys) {
      const keys = Array.isArray(event.detail.updated_keys) ? event.detail.updated_keys.join(', ') : event.detail.updated_keys
      return `${t('detailChanged')}: ${keys}`
    }
    if (event.action === 'auto_backup' && event.detail.size) return `${t('detailSize')}: ${event.detail.size}`
    if (event.action === 'heartbeat_check' && event.detail.marked_offline) {
      return `${t('detailMarkedOffline')}: ${event.detail.marked_offline}`
    }
    if ((event.action === 'agent_register' || event.action === 'agent_create') && event.detail.name) {
      return `${t('detailAgent')}: ${event.detail.name}`
    }
    if (event.action === 'cleanup') {
      const parts: string[] = []
      if (event.detail.sessions_removed) parts.push(`${t('detailSessions')}: ${event.detail.sessions_removed}`)
      if (event.detail.events_removed) parts.push(`${t('detailEvents')}: ${event.detail.events_removed}`)
      return parts.length ? `${t('detailRemoved')} ${parts.join(', ')}` : null
    }
    if (event.action === 'export' && event.detail.type) return `${t('detailType')}: ${event.detail.type}`
    return null
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('eventsLogged', { count: total })}</p>
        </div>
        <Button
          onClick={() => { setPage(0); fetchEvents() }}
          variant="ghost"
          size="xs"
        >
          {t('refresh')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={filter.action}
          onChange={e => { setFilter(f => ({ ...f, action: e.target.value })); setPage(0) }}
          className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t('allActions')}</option>
          <optgroup label={t('groupAuth')}>
            <option value="login">{t('actionLogin')}</option>
            <option value="login_failed">{t('actionLoginFailed')}</option>
            <option value="logout">{t('actionLogout')}</option>
            <option value="login_google">{t('actionLoginGoogle')}</option>
            <option value="google_disconnect">{t('actionGoogleDisconnect')}</option>
            <option value="password_change">{t('actionPasswordChange')}</option>
            <option value="profile_update">{t('actionProfileUpdate')}</option>
          </optgroup>
          <optgroup label={t('groupUsers')}>
            <option value="user_create">{t('actionUserCreate')}</option>
            <option value="user_update">{t('actionUserUpdate')}</option>
            <option value="user_delete">{t('actionUserDelete')}</option>
            <option value="role_denied">{t('actionRoleDenied')}</option>
            <option value="access_request">{t('actionAccessRequest')}</option>
            <option value="access_approve">{t('actionAccessApprove')}</option>
            <option value="access_deny">{t('actionAccessDeny')}</option>
          </optgroup>
          <optgroup label={t('groupAgents')}>
            <option value="agent_register">{t('actionAgentRegister')}</option>
            <option value="agent_create">{t('actionAgentCreate')}</option>
            <option value="agent_update">{t('actionAgentUpdate')}</option>
            <option value="agent_delete">{t('actionAgentDelete')}</option>
            <option value="agent_config_sync">{t('actionAgentConfigSync')}</option>
            <option value="local_agent_sync">{t('actionLocalAgentSync')}</option>
          </optgroup>
          <optgroup label={t('groupSystem')}>
            <option value="settings_update">{t('actionSettingsUpdate')}</option>
            <option value="auto_backup">{t('actionAutoBackup')}</option>
            <option value="backup_create">{t('actionBackupCreate')}</option>
            <option value="backup_delete">{t('actionBackupDelete')}</option>
            <option value="heartbeat_check">{t('actionHeartbeatCheck')}</option>
            <option value="integration_test">{t('actionIntegrationTest')}</option>
            <option value="cleanup">{t('actionCleanup')}</option>
            <option value="export">{t('actionExport')}</option>
          </optgroup>
          <optgroup label={t('groupConfig')}>
            <option value="token_rotate">{t('actionTokenRotate')}</option>
            <option value="gateway_config_update">{t('actionGatewayConfigUpdate')}</option>
          </optgroup>
          <optgroup label={t('groupWorkspaces')}>
            <option value="workspace_create">{t('actionWorkspaceCreate')}</option>
            <option value="workspace_update">{t('actionWorkspaceUpdate')}</option>
            <option value="workspace_delete">{t('actionWorkspaceDelete')}</option>
          </optgroup>
        </select>
        <input
          type="text"
          value={filter.actor}
          onChange={e => { setFilter(f => ({ ...f, actor: e.target.value })); setPage(0) }}
          placeholder={t('filterByActor')}
          className="h-8 px-2.5 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
        />
      </div>

      {/* Event List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg shimmer" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-2xl text-muted-foreground/30 mb-2">
            <svg className="w-10 h-10 mx-auto" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <rect x="2" y="1" width="12" height="14" rx="1.5" />
              <path d="M5 4h6M5 7h6M5 10h3" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground">{t('noEvents')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {events.map(event => {
            const detail = formatDetail(event)
            return (
              <div key={event.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-smooth group">
                {/* Icon */}
                <span className={`w-6 h-6 rounded-md bg-secondary flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 ${actionColors[event.action] || 'text-muted-foreground'}`}>
                  {actionIcons[event.action] || '?'}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">{event.actor}</span>
                    <span className={`text-xs ${actionColors[event.action] || 'text-muted-foreground'}`}>
                      {actionLabels[event.action] || event.action}
                    </span>
                    {event.target_id && event.target_type === 'user' && (
                      <span className="text-xs text-muted-foreground">
                        {t('userRef', { id: event.target_id })}
                      </span>
                    )}
                  </div>
                  {detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono-tight">{detail}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="text-right shrink-0">
                  <p className="text-2xs text-muted-foreground font-mono-tight">{formatTime(event.created_at)}</p>
                  {event.ip_address && (
                    <p className="text-2xs text-muted-foreground/60 font-mono-tight opacity-0 group-hover:opacity-100 transition-opacity">{event.ip_address}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            variant="ghost"
            size="xs"
          >
            {t('previous')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('pageOf', { page: page + 1, total: totalPages })}
          </span>
          <Button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            variant="ghost"
            size="xs"
          >
            {t('next')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-007 US3 — Dispositions tab.
// FR-050: filter UI (workspace, disposition multi-select, date range preset
//         + custom, agent dropdown, task_id input).
// FR-051: cursor pagination, default 50/page, max 200, stable order.
// FR-052: banner "Logging began on YYYY-MM-DD" derived from earliest row;
//         hide if no rows exist.
// FR-139: 'unknown' filter option labeled "validation_failed".
// ─────────────────────────────────────────────────────────────────────────────

interface DispositionFilters {
  disposition: string[]
  datePreset: string // '7d' | '30d' | '90d' | 'custom'
  customFrom: string // YYYY-MM-DD
  customTo: string // YYYY-MM-DD
  triagedByAgentId: string // empty string = unset; otherwise numeric
  taskId: string // empty string = unset; otherwise numeric
  workspaceIdOverride: string // Facility-only manual override; numeric or empty
}

const INITIAL_DISPOSITION_FILTERS: DispositionFilters = {
  disposition: [],
  datePreset: '30d',
  customFrom: '',
  customTo: '',
  triagedByAgentId: '',
  taskId: '',
  workspaceIdOverride: '',
}

function formatDateForBanner(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${String(yyyy)}-${mm}-${dd}`
}

function formatTriagedAt(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function dispositionLabel(value: string): string {
  const found = DISPOSITION_OPTIONS.find(o => o.value === value)
  return found ? found.label : value
}

function DispositionsTab() {
  // SPEC-002 boundary: the audit-trail-panel intentionally does NOT auto-scope
  // by Product Line state. Operators filter workspace_id explicitly via the
  // panel's input. The /api/dispositions route enforces non-Facility callers
  // server-side (returning 400 workspace_id_required if needed).
  const { currentUser } = useMissionControl()

  const [filters, setFilters] = useState<DispositionFilters>(INITIAL_DISPOSITION_FILTERS)
  const [rows, setRows] = useState<DispositionRow[]>([])
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [pages, setPages] = useState<Array<string | null>>([null]) // cursor stack; pages[i] is the cursor used to fetch page i (null = first page)
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(DISPOSITIONS_DEFAULT_LIMIT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bannerDate, setBannerDate] = useState<string | null>(null)
  const [hasAnyRows, setHasAnyRows] = useState<boolean | null>(null)

  // Effective workspace_id from the explicit filter input only. Defaults to
  // currentUser's workspace_id when the input is empty (non-Facility users
  // are constrained server-side to their workspace anyway).
  const effectiveWorkspaceId = useMemo<number | null>(() => {
    const override = filters.workspaceIdOverride.trim()
    if (override !== '' && /^\d+$/.test(override)) return Number(override)
    if (currentUser?.workspace_id) return currentUser.workspace_id
    return null
  }, [filters.workspaceIdOverride, currentUser])

  // Resolve since/until from the date preset.
  const { sinceIso, untilIso } = useMemo(() => {
    const preset = DATE_PRESETS.find(p => p.value === filters.datePreset)
    if (!preset) return { sinceIso: '', untilIso: '' }
    if (preset.days !== null) {
      const now = Date.now()
      const since = new Date(now - preset.days * 24 * 60 * 60 * 1000).toISOString()
      const until = new Date(now).toISOString()
      return { sinceIso: since, untilIso: until }
    }
    // custom
    return {
      sinceIso: filters.customFrom ? `${filters.customFrom}T00:00:00.000Z` : '',
      untilIso: filters.customTo ? `${filters.customTo}T23:59:59.999Z` : '',
    }
  }, [filters.datePreset, filters.customFrom, filters.customTo])

  // Build /api/dispositions URL from filters + an explicit cursor argument.
  const buildDispositionsUrl = useCallback((cursor: string | null, limitOverride?: number): string => {
    const params = new URLSearchParams()
    if (effectiveWorkspaceId !== null) {
      params.set('workspace_id', String(effectiveWorkspaceId))
    }
    if (filters.disposition.length > 0) {
      params.set('disposition', filters.disposition.join(','))
    }
    if (sinceIso) params.set('since', sinceIso)
    if (untilIso) params.set('until', untilIso)
    if (filters.triagedByAgentId !== '' && /^\d+$/.test(filters.triagedByAgentId)) {
      params.set('triaged_by_agent_id', filters.triagedByAgentId)
    }
    if (filters.taskId !== '' && /^\d+$/.test(filters.taskId)) {
      params.set('task_id', filters.taskId)
    }
    params.set('limit', String(limitOverride ?? limit))
    if (cursor) params.set('cursor', cursor)
    return `/api/dispositions?${params.toString()}`
  }, [effectiveWorkspaceId, filters.disposition, filters.triagedByAgentId, filters.taskId, sinceIso, untilIso, limit])

  // Fetch agents for the filter dropdown (best-effort; tab still works on failure).
  useEffect(() => {
    let cancelled = false
    async function loadAgents() {
      try {
        const res = await fetch('/api/agents')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const list: AgentLite[] = Array.isArray(data?.agents)
          ? data.agents.map((a: any) => ({ id: Number(a.id), name: String(a.name ?? '') }))
              .filter((a: AgentLite) => Number.isFinite(a.id) && a.name !== '')
          : []
        setAgents(list)
      } catch {
        // Non-fatal — leave dropdown empty.
      }
    }
    loadAgents()
    return () => { cancelled = true }
  }, [])

  // Fetch a single page (cursor === null fetches the first page).
  const fetchPage = useCallback(async (cursor: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(buildDispositionsUrl(cursor))
      if (!res.ok) {
        if (res.status === 503) {
          setError('Disposition logging is disabled for this workspace.')
        } else if (res.status === 403) {
          setError('You do not have permission to view dispositions for this workspace.')
        } else if (res.status === 400) {
          let body: { error?: string } = {}
          try { body = await res.json() } catch { /* ignore */ }
          if (body.error === 'invalid_cursor') {
            setError('Pagination cursor is invalid. Resetting to first page.')
            setPages([null])
            setPageIndex(0)
          } else if (body.error === 'workspace_id_required') {
            setError('Select a workspace to view dispositions.')
          } else {
            setError('Invalid request.')
          }
        } else {
          setError('Failed to load dispositions.')
        }
        setRows([])
        setNextCursor(null)
        setHasMore(false)
        return
      }
      const data = await res.json()
      const fetched: DispositionRow[] = Array.isArray(data?.dispositions) ? data.dispositions : []
      setRows(fetched)
      setNextCursor(typeof data?.next_cursor === 'string' ? data.next_cursor : null)
      setHasMore(Boolean(data?.has_more))
    } catch {
      setError('Failed to load dispositions.')
      setRows([])
      setNextCursor(null)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [buildDispositionsUrl])

  // Compute the banner: walk forward to the last page once per filter change
  // and read the final row (oldest, since order is triaged_at DESC, id DESC).
  // The route hard-codes DESC sort; the strict scope forbids changes there, so
  // we cursor-walk. With max 200 per page and seed sizes around 250×workspace
  // this is at most ~3 fetches per filter change.
  const computeBanner = useCallback(async () => {
    setBannerDate(null)
    setHasAnyRows(null)
    try {
      let cursor: string | null = null
      let lastRow: DispositionRow | null = null
      let totalSeen = 0
      // Hard cap to keep this bounded if a workspace logs millions of rows.
      const MAX_WALK_PAGES = 50
      const WALK_LIMIT = DISPOSITIONS_MAX_LIMIT
      for (let i = 0; i < MAX_WALK_PAGES; i++) {
        const res: Response = await fetch(buildDispositionsUrl(cursor, WALK_LIMIT))
        if (!res.ok) return
        const data: { dispositions?: DispositionRow[]; next_cursor?: string | null; has_more?: boolean } = await res.json()
        const list: DispositionRow[] = Array.isArray(data.dispositions) ? data.dispositions : []
        if (list.length === 0) break
        totalSeen += list.length
        lastRow = list[list.length - 1] ?? lastRow
        if (!data.has_more || typeof data.next_cursor !== 'string') break
        cursor = data.next_cursor
      }
      setHasAnyRows(totalSeen > 0)
      if (lastRow) setBannerDate(formatDateForBanner(lastRow.triaged_at))
    } catch {
      // Banner is best-effort.
    }
  }, [buildDispositionsUrl])

  // Reset pagination when filters change, then fetch first page + banner.
  useEffect(() => {
    setPages([null])
    setPageIndex(0)
    fetchPage(null)
    computeBanner()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildDispositionsUrl])

  function toggleDisposition(value: string) {
    setFilters(f => {
      const has = f.disposition.includes(value)
      return { ...f, disposition: has ? f.disposition.filter(v => v !== value) : [...f.disposition, value] }
    })
  }

  function goNext() {
    if (!hasMore || !nextCursor) return
    const nextPages = [...pages, nextCursor]
    setPages(nextPages)
    setPageIndex(nextPages.length - 1)
    fetchPage(nextCursor)
  }

  function goPrev() {
    if (pageIndex === 0) return
    const prevIndex = pageIndex - 1
    setPageIndex(prevIndex)
    fetchPage(pages[prevIndex] ?? null)
  }

  return (
    <div className="p-5 space-y-4" data-testid="dispositions-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dispositions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Triage outcomes for tasks routed through pipeline templates.
          </p>
        </div>
        <Button
          onClick={() => { setPages([null]); setPageIndex(0); fetchPage(null); computeBanner() }}
          variant="ghost"
          size="xs"
        >
          Refresh
        </Button>
      </div>

      {/* Banner (FR-052) — hide entirely if no rows exist. */}
      {hasAnyRows === true && bannerDate && (
        <div
          className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="dispositions-banner"
        >
          Logging began on {bannerDate}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        {/* Workspace + agent + task_id */}
        <div className="flex flex-wrap gap-2 items-end">
          {/* Workspace input always visible — server enforces scope per FR-080. */}
          {true && (
            <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
              <span>Workspace ID</span>
              <input
                type="number"
                inputMode="numeric"
                value={filters.workspaceIdOverride}
                onChange={e => setFilters(f => ({ ...f, workspaceIdOverride: e.target.value }))}
                placeholder="(all)"
                className="h-8 px-2.5 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-32"
                data-testid="dispositions-filter-workspace"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
            <span>Triaged by agent</span>
            <select
              value={filters.triagedByAgentId}
              onChange={e => setFilters(f => ({ ...f, triagedByAgentId: e.target.value }))}
              className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="dispositions-filter-agent"
            >
              <option value="">All agents</option>
              {agents.map(a => (
                <option key={a.id} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
            <span>Task ID</span>
            <input
              type="number"
              inputMode="numeric"
              value={filters.taskId}
              onChange={e => setFilters(f => ({ ...f, taskId: e.target.value }))}
              placeholder="(any)"
              className="h-8 px-2.5 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-28"
              data-testid="dispositions-filter-task-id"
            />
          </label>

          <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
            <span>Page size</span>
            <select
              value={String(limit)}
              onChange={e => setLimit(Math.min(DISPOSITIONS_MAX_LIMIT, Math.max(1, Number(e.target.value) || DISPOSITIONS_DEFAULT_LIMIT)))}
              className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="dispositions-filter-limit"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
            <span>Date range</span>
            <select
              value={filters.datePreset}
              onChange={e => setFilters(f => ({ ...f, datePreset: e.target.value }))}
              className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="dispositions-filter-date-preset"
            >
              {DATE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          {filters.datePreset === 'custom' && (
            <>
              <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
                <span>From</span>
                <input
                  type="date"
                  value={filters.customFrom}
                  onChange={e => setFilters(f => ({ ...f, customFrom: e.target.value }))}
                  className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="dispositions-filter-date-from"
                />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
                <span>To</span>
                <input
                  type="date"
                  value={filters.customTo}
                  onChange={e => setFilters(f => ({ ...f, customTo: e.target.value }))}
                  className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="dispositions-filter-date-to"
                />
              </label>
            </>
          )}
        </div>

        {/* Disposition multi-select */}
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-muted-foreground">Dispositions</span>
          <div className="flex flex-wrap gap-1.5" data-testid="dispositions-filter-values">
            {DISPOSITION_OPTIONS.map(opt => {
              const selected = filters.disposition.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleDisposition(opt.value)}
                  aria-pressed={selected}
                  data-testid={`dispositions-filter-chip-${opt.value}`}
                  className={`h-7 px-2.5 text-2xs rounded-md border transition-smooth ${
                    selected
                      ? 'bg-primary/20 border-primary text-foreground'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* List / states */}
      {error ? (
        <div
          className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          data-testid="dispositions-error"
        >
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-2" data-testid="dispositions-loading">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center" data-testid="dispositions-empty">
          <p className="text-xs text-muted-foreground">No dispositions yet</p>
        </div>
      ) : (
        <div className="space-y-1" data-testid="dispositions-list">
          {rows.map(row => (
            <div
              key={row.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-smooth"
              data-testid={`dispositions-row-${String(row.id)}`}
            >
              <span
                className={`px-2 py-0.5 rounded-md text-2xs font-mono shrink-0 mt-0.5 border ${
                  row.disposition === 'unknown'
                    ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                    : 'border-border text-foreground bg-secondary'
                }`}
                data-testid="dispositions-row-disposition"
              >
                {dispositionLabel(row.disposition)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">Task #{String(row.task_id)}</span>
                  {row.triaged_by_agent_id !== null && (
                    <span className="text-xs text-muted-foreground">agent #{String(row.triaged_by_agent_id)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">workspace #{String(row.workspace_id)}</span>
                </div>
                {row.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono-tight truncate">{row.reason}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xs text-muted-foreground font-mono-tight">{formatTriagedAt(row.triaged_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination — cursor stack. Hide controls if there's only one page. */}
      {(pageIndex > 0 || hasMore) && (
        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={goPrev}
            disabled={pageIndex === 0}
            variant="ghost"
            size="xs"
            data-testid="dispositions-prev"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground" data-testid="dispositions-page-indicator">
            Page {String(pageIndex + 1)}
          </span>
          <Button
            onClick={goNext}
            disabled={!hasMore}
            variant="ghost"
            size="xs"
            data-testid="dispositions-next"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
