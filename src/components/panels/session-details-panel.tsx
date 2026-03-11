'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('SessionDetails')

type TimeWindow = '1h' | '6h' | '24h' | '7d' | 'all'
type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
type VerboseLevel = 'off' | 'on' | 'full'
type ReasoningLevel = 'off' | 'on' | 'stream'

const selectClass =
  'px-2 py-1 border border-border rounded bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50'

export function SessionDetailsPanel() {
  const {
    sessions,
    selectedSession,
    setSelectedSession,
    setSessions,
    availableModels
  } = useMissionControl()

  // Smart polling for sessions (60s, visibility-aware)
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions')
      const data = await response.json()
      setSessions(data.sessions || data)
    } catch (error) {
      log.error('Failed to load sessions:', error)
    }
  }, [setSessions])

  useSmartPoll(loadSessions, 60000, { pauseWhenConnected: true })

  const [controllingSession, setControllingSession] = useState<string | null>(null)
  const [sessionFilter, setSessionFilter] = useState<'all' | 'active' | 'idle'>('all')
  const [sortBy, setSortBy] = useState<'age' | 'tokens' | 'model'>('age')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  // Time window and toggle filters
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all')
  const [includeGlobal, setIncludeGlobal] = useState(true)
  const [includeUnknown, setIncludeUnknown] = useState(true)

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [labelValue, setLabelValue] = useState('')
  const labelInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  const getModelInfo = (modelName: string) => {
    const matchedAlias = availableModels
      .map(m => m.alias)
      .find(alias => modelName.toLowerCase().includes(alias.toLowerCase()))

    return availableModels.find(m =>
      m.name === modelName ||
      m.alias === modelName ||
      m.alias === matchedAlias
    ) || { alias: modelName, name: modelName, provider: 'unknown', description: 'Unknown model' }
  }

  const parseTokenUsage = (tokenString: string) => {
    const match = tokenString.match(/(\d+(?:\.\d+)?)(k|m)?\/(\d+(?:\.\d+)?)(k|m)?\s*\((\d+(?:\.\d+)?)%\)/)
    if (!match) return { used: 0, total: 0, percentage: 0 }

    const used = parseFloat(match[1]) * (match[2] === 'k' ? 1000 : match[2] === 'm' ? 1000000 : 1)
    const total = parseFloat(match[3]) * (match[4] === 'k' ? 1000 : match[4] === 'm' ? 1000000 : 1)
    const percentage = parseFloat(match[5])

    return { used, total, percentage }
  }

  const getSessionTypeIcon = (sessionKey: string) => {
    if (sessionKey.includes(':main:main')) return '👑'
    if (sessionKey.includes(':subagent:')) return '🤖'
    if (sessionKey.includes(':cron:')) return '⏰'
    if (sessionKey.includes(':group:')) return '👥'
    if (sessionKey.includes(':global:')) return '🌐'
    return '💬'
  }

  const getSessionType = (sessionKey: string) => {
    if (sessionKey.includes(':main:main')) return 'Main'
    if (sessionKey.includes(':subagent:')) return 'Sub-agent'
    if (sessionKey.includes(':cron:')) return 'Cron'
    if (sessionKey.includes(':group:')) return 'Group'
    if (sessionKey.includes(':global:')) return 'Global'
    return 'Unknown'
  }

  const getSessionStatus = (session: any) => {
    if (!session.active) return 'idle'
    const tokenUsage = parseTokenUsage(session.tokens)
    if (tokenUsage.percentage > 95) return 'critical'
    if (tokenUsage.percentage > 80) return 'warning'
    return 'active'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'critical': return 'text-red-400'
      case 'idle': return 'text-muted-foreground'
      default: return 'text-muted-foreground'
    }
  }

  // Time window filter
  const timeWindowMs: Record<TimeWindow, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    'all': Infinity,
  }

  const filteredSessions = sessions.filter(session => {
    // Status filter
    switch (sessionFilter) {
      case 'active': if (!session.active) return false; break
      case 'idle': if (session.active) return false; break
    }

    // Time window filter
    if (timeWindow !== 'all' && session.lastActivity) {
      const cutoff = Date.now() - timeWindowMs[timeWindow]
      if (session.lastActivity < cutoff) return false
    }

    // Global filter
    if (!includeGlobal && session.key?.includes(':global:')) return false

    // Unknown type filter
    if (!includeUnknown && getSessionType(session.key) === 'Unknown') return false

    return true
  })

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    switch (sortBy) {
      case 'tokens':
        return parseTokenUsage(b.tokens).percentage - parseTokenUsage(a.tokens).percentage
      case 'model':
        return a.model.localeCompare(b.model)
      case 'age':
      default:
        if (a.age === 'just now') return -1
        if (b.age === 'just now') return 1
        return a.age.localeCompare(b.age)
    }
  })

  const handleSessionSelect = (session: any) => {
    setSelectedSession(session.id)
    setExpandedSession(expandedSession === session.id ? null : session.id)
  }

  const sendSessionAction = async (
    action: string,
    sessionKey: string,
    payload: Record<string, any>,
    method: 'POST' | 'DELETE' = 'POST'
  ) => {
    const lockKey = `${action}-${sessionKey}`
    setControllingSession(lockKey)
    try {
      const url = method === 'DELETE'
        ? '/api/sessions'
        : `/api/sessions?action=${action}`
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || `Failed: ${action}`)
        return false
      }
      return true
    } catch {
      alert(`Failed: ${action}`)
      return false
    } finally {
      setControllingSession(null)
    }
  }

  const handleLabelSave = async (sessionKey: string) => {
    if (editingLabel !== sessionKey) return
    await sendSessionAction('set-label', sessionKey, { label: labelValue })
    setEditingLabel(null)
  }

  const handleDeleteSession = async (sessionKey: string) => {
    const ok = await sendSessionAction('delete', sessionKey, {}, 'DELETE')
    if (ok) {
      setConfirmingDelete(null)
      loadSessions()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-foreground">Session Management</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage active agent sessions
        </p>
      </div>

      {/* Filters and Controls */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Filter by Status */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Filter
            </label>
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value as any)}
              className={selectClass}
            >
              <option value="all">All Sessions</option>
              <option value="active">Active Only</option>
              <option value="idle">Idle Only</option>
            </select>
          </div>

          {/* Sort by */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Sort by
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={selectClass}
            >
              <option value="age">Age</option>
              <option value="tokens">Token Usage</option>
              <option value="model">Model</option>
            </select>
          </div>

          {/* Time Window */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Time Window
            </label>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
              className={selectClass}
            >
              <option value="1h">Last 1h</option>
              <option value="6h">Last 6h</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="all">All</option>
            </select>
          </div>

          {/* Toggles */}
          <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer pb-0.5">
            <input
              type="checkbox"
              checked={includeGlobal}
              onChange={(e) => setIncludeGlobal(e.target.checked)}
              className="accent-primary"
            />
            Global
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer pb-0.5">
            <input
              type="checkbox"
              checked={includeUnknown}
              onChange={(e) => setIncludeUnknown(e.target.checked)}
              className="accent-primary"
            />
            Unknown
          </label>

          {/* Session Stats (pushed right) */}
          <div className="ml-auto text-sm text-muted-foreground pb-0.5">
            {filteredSessions.length} of {sessions.length} sessions
            {' '}• {sessions.filter(s => s.active).length} active
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-2 space-y-4">
          {sortedSessions.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <div className="text-muted-foreground">
                No sessions match the current filter
              </div>
            </div>
          ) : (
            sortedSessions.map((session) => {
              const modelInfo = getModelInfo(session.model)
              const tokenUsage = parseTokenUsage(session.tokens)
              const status = getSessionStatus(session)
              const isExpanded = expandedSession === session.id

              return (
                <div
                  key={session.id}
                  className={`bg-card border border-border rounded-lg p-6 cursor-pointer transition-all ${
                    selectedSession === session.id
                      ? 'ring-2 ring-primary/50 border-primary/30'
                      : 'hover:border-primary/20'
                  }`}
                  onClick={() => handleSessionSelect(session)}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <span className="text-xl">{getSessionTypeIcon(session.key)}</span>
                          <div>
                            <h3 className="font-medium text-foreground truncate">
                              {session.key}
                            </h3>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              <span>{getSessionType(session.key)}</span>
                              <span>•</span>
                              <span className={getStatusColor(status)}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                              <span>•</span>
                              <span>{session.age}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {session.flags.map((flag: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded"
                          >
                            {flag}
                          </span>
                        ))}
                        <div className={`w-3 h-3 rounded-full ${
                          session.active ? 'bg-green-500' : 'bg-gray-500'
                        }`}></div>
                      </div>
                    </div>

                    {/* Model and Token Usage */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Model</div>
                        <div className="font-medium text-foreground">{modelInfo.alias}</div>
                        <div className="text-xs text-muted-foreground">{modelInfo.provider}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Token Usage</div>
                        <div className="font-medium text-foreground">{session.tokens}</div>
                        <div className="w-full bg-secondary rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              tokenUsage.percentage > 95 ? 'bg-red-500' :
                              tokenUsage.percentage > 80 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(tokenUsage.percentage, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="pt-4 border-t border-border space-y-4">
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Session Details</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Kind:</span>
                              <span className="ml-2 text-foreground">{session.kind}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">ID:</span>
                              <span className="ml-2 text-foreground font-mono text-xs">{session.id}</span>
                            </div>
                            {session.lastActivity && (
                              <div>
                                <span className="text-muted-foreground">Last Activity:</span>
                                <span className="ml-2 text-foreground">
                                  {new Date(session.lastActivity).toLocaleTimeString()}
                                </span>
                              </div>
                            )}
                            {session.messageCount && (
                              <div>
                                <span className="text-muted-foreground">Messages:</span>
                                <span className="ml-2 text-foreground">{session.messageCount}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Editable Label */}
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Label</h4>
                          {editingLabel === session.key ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={labelInputRef}
                                type="text"
                                value={labelValue}
                                onChange={(e) => setLabelValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleLabelSave(session.key)
                                  if (e.key === 'Escape') setEditingLabel(null)
                                }}
                                onBlur={() => handleLabelSave(session.key)}
                                maxLength={100}
                                className="flex-1 px-2 py-1 border border-border rounded bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <button
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingLabel(session.key)
                                setLabelValue(session.label || '')
                              }}
                            >
                              {session.label || 'Click to add label...'}
                            </button>
                          )}
                        </div>

                        {/* Session Controls */}
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Session Controls</h4>
                          <div className="grid grid-cols-3 gap-3" onClick={(e) => e.stopPropagation()}>
                            {/* Thinking Level */}
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Thinking</label>
                              <select
                                className={selectClass + ' w-full'}
                                defaultValue="off"
                                disabled={controllingSession !== null}
                                onChange={async (e) => {
                                  const level = e.target.value as ThinkingLevel
                                  await sendSessionAction('set-thinking', session.key, { level })
                                }}
                              >
                                <option value="off">Off</option>
                                <option value="minimal">Minimal</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="xhigh">X-High</option>
                              </select>
                            </div>

                            {/* Verbose Level */}
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Verbose</label>
                              <select
                                className={selectClass + ' w-full'}
                                defaultValue="off"
                                disabled={controllingSession !== null}
                                onChange={async (e) => {
                                  const level = e.target.value as VerboseLevel
                                  await sendSessionAction('set-verbose', session.key, { level })
                                }}
                              >
                                <option value="off">Off</option>
                                <option value="on">On</option>
                                <option value="full">Full</option>
                              </select>
                            </div>

                            {/* Reasoning Level */}
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Reasoning</label>
                              <select
                                className={selectClass + ' w-full'}
                                defaultValue="off"
                                disabled={controllingSession !== null}
                                onChange={async (e) => {
                                  const level = e.target.value as ReasoningLevel
                                  await sendSessionAction('set-reasoning', session.key, { level })
                                }}
                              >
                                <option value="off">Off</option>
                                <option value="on">On</option>
                                <option value="stream">Stream</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Model Information */}
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Model Information</h4>
                          <div className="bg-secondary rounded p-3 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-muted-foreground">Full Name:</span>
                                <div className="font-mono text-xs text-foreground mt-1">{modelInfo.name}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Provider:</span>
                                <div className="text-foreground mt-1">{modelInfo.provider}</div>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Description:</span>
                                <div className="text-foreground mt-1">{modelInfo.description}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex space-x-2">
                          <Button
                            size="xs"
                            className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                            disabled={controllingSession !== null}
                            onClick={async (e) => {
                              e.stopPropagation()
                              setControllingSession(`monitor-${session.id}`)
                              try {
                                const res = await fetch(`/api/sessions/${session.id}/control`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'monitor' }),
                                })
                                if (!res.ok) {
                                  const data = await res.json()
                                  alert(data.error || 'Failed to monitor session')
                                }
                              } catch {
                                alert('Failed to monitor session')
                              } finally {
                                setControllingSession(null)
                              }
                            }}
                          >
                            {controllingSession === `monitor-${session.id}` ? 'Working...' : 'Monitor'}
                          </Button>
                          <Button
                            size="xs"
                            className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
                            disabled={controllingSession !== null}
                            onClick={async (e) => {
                              e.stopPropagation()
                              setControllingSession(`pause-${session.id}`)
                              try {
                                const res = await fetch(`/api/sessions/${session.id}/control`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'pause' }),
                                })
                                if (!res.ok) {
                                  const data = await res.json()
                                  alert(data.error || 'Failed to pause session')
                                }
                              } catch {
                                alert('Failed to pause session')
                              } finally {
                                setControllingSession(null)
                              }
                            }}
                          >
                            {controllingSession === `pause-${session.id}` ? 'Working...' : 'Pause'}
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            disabled={controllingSession !== null}
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!window.confirm('Are you sure you want to terminate this session?')) return
                              setControllingSession(`terminate-${session.id}`)
                              try {
                                const res = await fetch(`/api/sessions/${session.id}/control`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'terminate' }),
                                })
                                if (!res.ok) {
                                  const data = await res.json()
                                  alert(data.error || 'Failed to terminate session')
                                }
                              } catch {
                                alert('Failed to terminate session')
                              } finally {
                                setControllingSession(null)
                              }
                            }}
                          >
                            {controllingSession === `terminate-${session.id}` ? 'Working...' : 'Terminate'}
                          </Button>

                          {/* Delete Button */}
                          {confirmingDelete === session.key ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-red-400">Delete?</span>
                              <Button
                                size="xs"
                                variant="destructive"
                                disabled={controllingSession !== null}
                                onClick={() => handleDeleteSession(session.key)}
                              >
                                {controllingSession === `delete-${session.key}` ? '...' : 'Yes'}
                              </Button>
                              <Button
                                size="xs"
                                className="bg-secondary text-foreground border border-border hover:bg-secondary/80"
                                onClick={() => setConfirmingDelete(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="xs"
                              className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 ml-auto"
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmingDelete(session.key)
                              }}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Session Summary */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Session Overview</h2>

            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Sessions:</span>
                <span className="font-medium text-foreground">{sessions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active:</span>
                <span className="font-medium text-green-400">
                  {sessions.filter(s => s.active).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Idle:</span>
                <span className="font-medium text-muted-foreground">
                  {sessions.filter(s => !s.active).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub-agents:</span>
                <span className="font-medium text-foreground">
                  {sessions.filter(s => s.key.includes(':subagent:')).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cron Jobs:</span>
                <span className="font-medium text-foreground">
                  {sessions.filter(s => s.key.includes(':cron:')).length}
                </span>
              </div>
            </div>
          </div>

          {/* Model Distribution */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Model Distribution</h2>

            <div className="space-y-3">
              {Object.entries(
                sessions.reduce((acc, session) => {
                  const model = getModelInfo(session.model).alias
                  acc[model] = (acc[model] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).map(([model, count]) => (
                <div key={model} className="flex items-center justify-between">
                  <span className="text-foreground">{model}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">{count}</span>
                    <div className="w-16 bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${(count / sessions.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* High Token Usage Alert */}
          {sessions.some(s => parseTokenUsage(s.tokens).percentage > 80) && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <h3 className="font-medium text-yellow-400 mb-2">High Token Usage</h3>
              <div className="text-sm text-muted-foreground">
                {sessions.filter(s => parseTokenUsage(s.tokens).percentage > 80).length} sessions
                are using more than 80% of their token limit.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
