'use client'

/**
 * SPEC-007 US10 -- Artifact Admin Panel.
 *
 * Operator surface for the task-artifact store. Lists / searches artifacts
 * for the current workspace, exposes destructive admin actions (quarantine,
 * un-quarantine, delete, archive, hash-verify) via
 * `POST /api/task-artifacts/[id]`, and surfaces a health metrics tile via
 * `GET /api/task-artifacts/health`.
 *
 * The panel is admin-only on the server side (every action endpoint enforces
 * `requireRole('admin')`). The UI also gates destructive controls on
 * `usePaddock().user.role === 'admin'` for affordance, but the auth
 * boundary is the API.
 */

import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePaddock } from '@/store'
import { appendScopeToPath } from '@/types/product-line'

interface ArtifactRow {
  id: number
  task_id: number
  workspace_id: number
  artifact_type: string
  storage_kind: string
  storage_uri: string | null
  redaction_status: string
  security_scan_status: string
  sha256: string | null
  byte_size: number | null
  mime: string | null
  preview_text: string | null
  schema_version: string | null
  workflow_template_slug: string | null
  original_filename: string | null
  producer_agent_id: number | null
  supersedes_artifact_id: number | null
  content?: string | null
  created_at?: number | string
}

interface HealthSnapshot {
  workspace_id: number
  counts: {
    total: number
    by_redaction_status: Record<string, number>
    by_security_scan_status: Record<string, number>
  }
  total_bytes: number
  failed_publishes_24h: number
  failed_scans_24h: number
  failed_reads_24h: number
  failed_disposition_inserts_24h: number
  orphan_count: number
  free_space_bytes: number | null
  p95: { publish_p95_ms: number | null; read_p95_ms: number | null } | 'insufficient_data'
}

const REDACTION_STATUS_OPTIONS = [
  'pending',
  'clean',
  'redacted',
  'rejected',
  'quarantined',
  'superseded',
] as const

const SECURITY_SCAN_STATUS_OPTIONS = [
  'pending',
  'scanned_clean',
  'scanned_with_findings',
  'scan_error',
  'hash_mismatch',
  'file_missing',
] as const

type ActionKind = 'quarantine' | 'unquarantine' | 'delete' | 'archive' | 'hash_verify'

interface FilterState {
  artifact_type: string
  redaction_status: string[]
  security_scan_status: string[]
  date_from: string
  date_to: string
}

const EMPTY_FILTERS: FilterState = {
  artifact_type: '',
  redaction_status: [],
  security_scan_status: [],
  date_from: '',
  date_to: '',
}

function formatBytes(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`
}

function isPreviewable(row: ArtifactRow): boolean {
  if (row.redaction_status === 'quarantined') return false
  const mime = row.mime ?? ''
  if (mime.startsWith('text/')) return true
  if (mime === 'application/json' || mime === 'application/x-yaml') return true
  if (row.storage_kind === 'inline_json' || row.storage_kind === 'inline_markdown') return true
  return false
}

function isDownloadable(row: ArtifactRow): boolean {
  if (row.redaction_status === 'quarantined') return false
  if (row.storage_kind === 'external_uri') return false
  return true
}

export default function ArtifactAdminPanel(): React.JSX.Element {
  const { activeProductLineScope } = usePaddock()
  const [rows, setRows] = useState<ArtifactRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<ArtifactRow | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const actionBusy = actionStatus?.endsWith(': pending') ?? false

  const scopedPath = useCallback(
    (pathname: string) => appendScopeToPath(pathname, activeProductLineScope),
    [activeProductLineScope],
  )

  const fetchHealth = useCallback(async () => {
    setHealthError(null)
    try {
      const res = await fetch(scopedPath('/api/task-artifacts/health'), { credentials: 'include' })
      if (!res.ok) {
        setHealthError(`health: ${String(res.status)}`)
        setHealth(null)
        return
      }
      const data = (await res.json()) as HealthSnapshot
      setHealth(data)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    }
  }, [scopedPath])

  const fetchList = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const params = new URLSearchParams()
      if (filters.artifact_type.length > 0) params.set('artifact_type', filters.artifact_type)
      if (filters.redaction_status.length > 0) params.set('redaction_status', filters.redaction_status.join(','))
      if (filters.security_scan_status.length > 0) params.set('security_scan_status', filters.security_scan_status.join(','))
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)
      const query = params.toString()
      const res = await fetch(scopedPath(query ? `/api/task-artifacts?${query}` : '/api/task-artifacts'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setRows([])
        setLoadingList(false)
        return
      }
      const data = (await res.json()) as { rows?: ArtifactRow[] }
      setRows(data.rows ?? [])
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
      setRows([])
    } finally {
      setLoadingList(false)
    }
  }, [filters, scopedPath])

  useEffect(() => {
    void fetchHealth()
    void fetchList()
  }, [fetchHealth, fetchList])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filters.redaction_status.length > 0 && !filters.redaction_status.includes(r.redaction_status)) {
        return false
      }
      if (
        filters.security_scan_status.length > 0 &&
        !filters.security_scan_status.includes(r.security_scan_status)
      ) {
        return false
      }
      if (filters.artifact_type.length > 0 && !r.artifact_type.includes(filters.artifact_type)) {
        return false
      }
      return true
    })
  }, [rows, filters])

  const performAction = useCallback(
    async (artifactId: number, action: ActionKind, reason?: string) => {
      setActionStatus(`${action}: pending`)
      try {
        const res = await fetch(scopedPath(`/api/task-artifacts/${String(artifactId)}`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason }),
        })
        const body = (await res.json()) as Record<string, unknown>
        if (!res.ok) {
          const errMsg = typeof body['error'] === 'string' ? (body['error'] as string) : String(res.status)
          setActionStatus(`${action}: ${errMsg}`)
          return
        }
        setActionStatus(`${action}: ok`)
        // Refresh data.
        void fetchList()
        void fetchHealth()
      } catch (err) {
        setActionStatus(`${action}: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [fetchHealth, fetchList, scopedPath],
  )

  const renderHealth = (): React.JSX.Element => {
    if (healthError !== null) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Health endpoint error: {healthError}
        </div>
      )
    }
    if (health === null) {
      return <div className="text-sm text-muted-foreground">Loading health metrics...</div>
    }
    const p95Display =
      health.p95 === 'insufficient_data'
        ? 'insufficient data'
        : `pub ${String(health.p95.publish_p95_ms ?? '—')}ms / read ${String(health.p95.read_p95_ms ?? '—')}ms`
    return (
      <div
        className="grid grid-cols-2 gap-3 rounded-md border border-border bg-secondary/30 p-4 sm:grid-cols-4"
        data-testid="artifact-health-tile"
      >
        <div>
          <div className="text-xs uppercase text-muted-foreground">Total artifacts</div>
          <div className="text-lg font-semibold text-foreground">{health.counts.total}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Total bytes</div>
          <div className="text-lg font-semibold text-foreground">{formatBytes(health.total_bytes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Orphans</div>
          <div className="text-lg font-semibold text-foreground">{health.orphan_count}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Free space</div>
          <div className="text-lg font-semibold text-foreground">{formatBytes(health.free_space_bytes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Failed publishes (24h)</div>
          <div className="text-lg font-semibold text-foreground">{health.failed_publishes_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Failed scans (24h)</div>
          <div className="text-lg font-semibold text-foreground">{health.failed_scans_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Failed reads (24h)</div>
          <div className="text-lg font-semibold text-foreground">{health.failed_reads_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Failed disposition inserts (24h)</div>
          <div className="text-lg font-semibold text-foreground">{health.failed_disposition_inserts_24h}</div>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <div className="text-xs uppercase text-muted-foreground">p95 latencies</div>
          <div className="text-sm font-mono" data-testid="artifact-p95-tile">
            {p95Display}
          </div>
        </div>
      </div>
    )
  }

  const renderFilters = (): React.JSX.Element => (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/30 p-3 md:grid-cols-4">
      <label className="text-sm">
        <span className="block text-xs uppercase text-muted-foreground">Artifact type</span>
        <input
          type="text"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filters.artifact_type}
          onChange={(e) => setFilters((f) => ({ ...f, artifact_type: e.target.value }))}
          placeholder="e.g. triage_outcome"
        />
      </label>
      <label className="text-sm">
        <span className="block text-xs uppercase text-muted-foreground">Redaction status</span>
        <select
          multiple
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filters.redaction_status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              redaction_status: Array.from(e.target.selectedOptions, (o) => o.value),
            }))
          }
        >
          {REDACTION_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-xs uppercase text-muted-foreground">Security scan status</span>
        <select
          multiple
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filters.security_scan_status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              security_scan_status: Array.from(e.target.selectedOptions, (o) => o.value),
            }))
          }
        >
          {SECURITY_SCAN_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2">
        <label className="text-sm">
          <span className="block text-xs uppercase text-muted-foreground">From</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase text-muted-foreground">To</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          />
        </label>
      </div>
    </div>
  )

  const renderActions = (row: ArtifactRow): React.JSX.Element => (
    <div className="flex flex-wrap gap-2">
      {row.redaction_status === 'quarantined' ? (
        <button
          type="button"
          className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white transition-smooth hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={actionBusy}
          onClick={() => void performAction(row.id, 'unquarantine')}
        >
          Un-quarantine
        </button>
      ) : (
        <button
          type="button"
          className="rounded-md bg-amber-600 px-2 py-1 text-xs text-white transition-smooth hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={actionBusy}
          onClick={() => void performAction(row.id, 'quarantine')}
        >
          Quarantine
        </button>
      )}
      <button
        type="button"
        className="rounded-md bg-secondary px-2 py-1 text-xs text-foreground transition-smooth hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={actionBusy}
        onClick={() => void performAction(row.id, 'archive')}
      >
        Archive
      </button>
      <button
        type="button"
        className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white transition-smooth hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={actionBusy}
        onClick={() => void performAction(row.id, 'hash_verify')}
      >
        Hash-verify
      </button>
      <button
        type="button"
        className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground transition-smooth hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={actionBusy}
        onClick={() => {
          const confirmed = window.confirm(`Delete artifact #${String(row.id)}? This is irreversible.`)
          if (confirmed) void performAction(row.id, 'delete', 'admin_panel_delete')
        }}
      >
        Delete
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-4 text-foreground" data-testid="artifact-admin-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Artifact Admin</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={actionBusy}
            onClick={() => {
              void fetchHealth()
              void fetchList()
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {renderHealth()}

      {actionStatus !== null ? (
        <div
          className="rounded-md border border-primary/40 bg-primary/10 p-2 text-sm text-primary"
          data-testid="artifact-action-status"
        >
          {actionStatus}
        </div>
      ) : null}

      {renderFilters()}

      <div className="overflow-auto rounded-md border border-border bg-card">
        {loadingList ? (
          <div className="p-4 text-sm text-muted-foreground">Loading artifacts...</div>
        ) : listError !== null ? (
          <div className="p-4 text-sm text-destructive">List error: {listError}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground" data-testid="artifact-list-empty">
            No artifacts match the current filters.
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Task</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Storage</th>
                <th className="px-2 py-1">Redaction</th>
                <th className="px-2 py-1">Scan</th>
                <th className="px-2 py-1">Bytes</th>
                <th className="px-2 py-1">MIME</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border align-top"
                  data-testid={`artifact-row-${String(r.id)}`}
                >
                  <td className="px-2 py-1 font-mono">{r.id}</td>
                  <td className="px-2 py-1 font-mono">{r.task_id}</td>
                  <td className="px-2 py-1">{r.artifact_type}</td>
                  <td className="px-2 py-1">
                    {r.storage_kind}
                    {r.storage_kind === 'external_uri' ? (
                        <span className="ml-1 rounded bg-purple-500/10 px-1 text-[10px] uppercase text-purple-300">
                        external
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1">{r.redaction_status}</td>
                  <td className="px-2 py-1">{r.security_scan_status}</td>
                  <td className="px-2 py-1">{formatBytes(r.byte_size)}</td>
                  <td className="px-2 py-1 font-mono text-xs text-muted-foreground">{r.mime ?? '—'}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-col gap-1">
                      {renderActions(r)}
                      <div className="flex gap-2 text-xs">
                        {isPreviewable(r) ? (
                          <button
                            type="button"
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={() => setSelected(r)}
                          >
                            Preview
                          </button>
                        ) : null}
                        {isDownloadable(r) ? (
                          <a
                            className="text-primary underline-offset-2 hover:underline"
                            href={scopedPath(`/api/task-artifacts/${String(r.id)}?download=1`)}
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected !== null ? (
        <div
          className="rounded-md border border-border bg-card p-3"
          data-testid="artifact-preview-pane"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">
              Preview · #{String(selected.id)} · {selected.artifact_type}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {selected.mime ?? 'unknown'} · {formatBytes(selected.byte_size)} · sha256{' '}
            {selected.sha256 ?? '—'}
          </div>
          <pre className="mt-2 max-h-[60vh] overflow-auto rounded-md bg-background p-2 text-xs text-foreground">
            {(selected.preview_text ?? selected.content ?? '(no preview available)').slice(0, 4096)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
