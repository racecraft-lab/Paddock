'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useSmartPoll } from '@/lib/use-smart-poll'

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

const actionLabels: Record<string, string> = {
  login: 'Logged in',
  login_failed: 'Failed login',
  logout: 'Logged out',
  password_change: 'Changed password',
  profile_update: 'Updated profile',
  user_create: 'Created user',
  user_update: 'Updated user',
  user_delete: 'Deleted user',
  role_denied: 'Access denied',
  backup_create: 'Created backup',
  backup_delete: 'Deleted backup',
  settings_update: 'Updated settings',
  auto_backup: 'Auto backup',
  heartbeat_check: 'Heartbeat check',
  agent_config_sync: 'Agent config synced',
  local_agent_sync: 'Local agents synced',
  integration_test: 'Integration test',
  agent_register: 'Agent registered',
  agent_update: 'Agent updated',
  agent_create: 'Agent created',
  agent_delete: 'Agent deleted',
  token_rotate: 'Token rotated',
  gateway_config_update: 'Gateway config updated',
  login_google: 'Google login',
  google_disconnect: 'Google disconnected',
  workspace_create: 'Workspace created',
  workspace_update: 'Workspace updated',
  workspace_delete: 'Workspace deleted',
  cleanup: 'Cleanup ran',
  export: 'Data exported',
  access_request: 'Access requested',
  access_approve: 'Access approved',
  access_deny: 'Access denied',
}

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

export function AuditTrailPanel() {
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
          setError('Admin access required to view audit logs')
          return
        }
        throw new Error('Failed to fetch audit log')
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
    if (event.action === 'user_create') return `username: ${event.detail.username}, role: ${event.detail.role}`
    if (event.action === 'user_update') {
      const parts: string[] = []
      if (event.detail.role) parts.push(`role: ${event.detail.role}`)
      if (event.detail.display_name) parts.push(`name: ${event.detail.display_name}`)
      if (event.detail.password_changed) parts.push('password reset')
      return parts.join(', ')
    }
    if (event.action === 'profile_update') return `name: ${event.detail.display_name}`
    if (event.action === 'settings_update' && event.detail.updated_keys) {
      const keys = Array.isArray(event.detail.updated_keys) ? event.detail.updated_keys.join(', ') : event.detail.updated_keys
      return `changed: ${keys}`
    }
    if (event.action === 'auto_backup' && event.detail.size) return `size: ${event.detail.size}`
    if (event.action === 'heartbeat_check' && event.detail.marked_offline) {
      return `marked offline: ${event.detail.marked_offline}`
    }
    if ((event.action === 'agent_register' || event.action === 'agent_create') && event.detail.name) {
      return `agent: ${event.detail.name}`
    }
    if (event.action === 'cleanup') {
      const parts: string[] = []
      if (event.detail.sessions_removed) parts.push(`sessions: ${event.detail.sessions_removed}`)
      if (event.detail.events_removed) parts.push(`events: ${event.detail.events_removed}`)
      return parts.length ? `removed ${parts.join(', ')}` : null
    }
    if (event.action === 'export' && event.detail.type) return `type: ${event.detail.type}`
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
          <h2 className="text-base font-semibold text-foreground">Audit Trail</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{total} event{total !== 1 ? 's' : ''} logged</p>
        </div>
        <Button
          onClick={() => { setPage(0); fetchEvents() }}
          variant="ghost"
          size="xs"
        >
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={filter.action}
          onChange={e => { setFilter(f => ({ ...f, action: e.target.value })); setPage(0) }}
          className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All actions</option>
          <optgroup label="Auth">
            <option value="login">Login</option>
            <option value="login_failed">Failed login</option>
            <option value="logout">Logout</option>
            <option value="login_google">Google login</option>
            <option value="google_disconnect">Google disconnected</option>
            <option value="password_change">Password change</option>
            <option value="profile_update">Profile update</option>
          </optgroup>
          <optgroup label="Users">
            <option value="user_create">User created</option>
            <option value="user_update">User updated</option>
            <option value="user_delete">User deleted</option>
            <option value="role_denied">Access denied</option>
            <option value="access_request">Access requested</option>
            <option value="access_approve">Access approved</option>
            <option value="access_deny">Access denied</option>
          </optgroup>
          <optgroup label="Agents">
            <option value="agent_register">Agent registered</option>
            <option value="agent_create">Agent created</option>
            <option value="agent_update">Agent updated</option>
            <option value="agent_delete">Agent deleted</option>
            <option value="agent_config_sync">Config synced</option>
            <option value="local_agent_sync">Local agents synced</option>
          </optgroup>
          <optgroup label="System">
            <option value="settings_update">Settings updated</option>
            <option value="auto_backup">Auto backup</option>
            <option value="backup_create">Backup created</option>
            <option value="backup_delete">Backup deleted</option>
            <option value="heartbeat_check">Heartbeat check</option>
            <option value="integration_test">Integration test</option>
            <option value="cleanup">Cleanup</option>
            <option value="export">Export</option>
          </optgroup>
          <optgroup label="Config">
            <option value="token_rotate">Token rotated</option>
            <option value="gateway_config_update">Gateway config updated</option>
          </optgroup>
          <optgroup label="Workspaces">
            <option value="workspace_create">Workspace created</option>
            <option value="workspace_update">Workspace updated</option>
            <option value="workspace_delete">Workspace deleted</option>
          </optgroup>
        </select>
        <input
          type="text"
          value={filter.actor}
          onChange={e => { setFilter(f => ({ ...f, actor: e.target.value })); setPage(0) }}
          placeholder="Filter by actor..."
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
          <p className="text-xs text-muted-foreground">No audit events found</p>
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
                        user #{event.target_id}
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
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            variant="ghost"
            size="xs"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
