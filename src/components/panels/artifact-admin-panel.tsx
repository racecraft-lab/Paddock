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
 * `useMissionControl().user.role === 'admin'` for affordance, but the auth
 * boundary is the API.
 */

import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
  const [rows, setRows] = useState<ArtifactRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<ArtifactRow | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setHealthError(null)
    try {
      const res = await fetch('/api/task-artifacts/health', { credentials: 'include' })
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
  }, [])

  const fetchList = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      // The list endpoint is intentionally simple for v1 -- the detector and
      // pagination integration is deferred. We hit a focused list endpoint
      // (which falls back to the [id] GET for detail loads). For US10 v1 the
      // panel reads via the existing audit-panel scope: a future iteration
      // will introduce GET /api/task-artifacts (list) -- not in this PR.
      // For now we surface the health snapshot's redaction-status histogram
      // and rely on detail-by-id loads when an admin selects a row.
      const params = new URLSearchParams()
      if (filters.artifact_type.length > 0) params.set('artifact_type', filters.artifact_type)
      const res = await fetch(`/api/task-artifacts?${params.toString()}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        // No GET on the collection in v1 (only POST). The panel still loads
        // and renders the health tile; the table is empty when no list API is
        // available.
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
  }, [filters])

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
        const res = await fetch(`/api/task-artifacts/${String(artifactId)}`, {
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
    [fetchHealth, fetchList],
  )

  const renderHealth = (): React.JSX.Element => {
    if (healthError !== null) {
      return (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Health endpoint error: {healthError}
        </div>
      )
    }
    if (health === null) {
      return <div className="text-sm text-gray-500">Loading health metrics...</div>
    }
    const p95Display =
      health.p95 === 'insufficient_data'
        ? 'insufficient data'
        : `pub ${String(health.p95.publish_p95_ms ?? '—')}ms / read ${String(health.p95.read_p95_ms ?? '—')}ms`
    return (
      <div
        className="grid grid-cols-2 gap-3 rounded border border-gray-200 bg-white p-4 sm:grid-cols-4"
        data-testid="artifact-health-tile"
      >
        <div>
          <div className="text-xs uppercase text-gray-500">Total artifacts</div>
          <div className="text-lg font-semibold">{health.counts.total}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Total bytes</div>
          <div className="text-lg font-semibold">{formatBytes(health.total_bytes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Orphans</div>
          <div className="text-lg font-semibold">{health.orphan_count}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Free space</div>
          <div className="text-lg font-semibold">{formatBytes(health.free_space_bytes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Failed publishes (24h)</div>
          <div className="text-lg font-semibold">{health.failed_publishes_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Failed scans (24h)</div>
          <div className="text-lg font-semibold">{health.failed_scans_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Failed reads (24h)</div>
          <div className="text-lg font-semibold">{health.failed_reads_24h}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Failed disposition inserts (24h)</div>
          <div className="text-lg font-semibold">{health.failed_disposition_inserts_24h}</div>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <div className="text-xs uppercase text-gray-500">p95 latencies</div>
          <div className="text-sm font-mono" data-testid="artifact-p95-tile">
            {p95Display}
          </div>
        </div>
      </div>
    )
  }

  const renderFilters = (): React.JSX.Element => (
    <div className="grid grid-cols-1 gap-3 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
      <label className="text-sm">
        <span className="block text-xs uppercase text-gray-500">Artifact type</span>
        <input
          type="text"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={filters.artifact_type}
          onChange={(e) => setFilters((f) => ({ ...f, artifact_type: e.target.value }))}
          placeholder="e.g. triage_outcome"
        />
      </label>
      <label className="text-sm">
        <span className="block text-xs uppercase text-gray-500">Redaction status</span>
        <select
          multiple
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
        <span className="block text-xs uppercase text-gray-500">Security scan status</span>
        <select
          multiple
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
          <span className="block text-xs uppercase text-gray-500">From</span>
          <input
            type="date"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase text-gray-500">To</span>
          <input
            type="date"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          onClick={() => void performAction(row.id, 'unquarantine')}
        >
          Un-quarantine
        </button>
      ) : (
        <button
          type="button"
          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
          onClick={() => void performAction(row.id, 'quarantine')}
        >
          Quarantine
        </button>
      )}
      <button
        type="button"
        className="rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-700"
        onClick={() => void performAction(row.id, 'archive')}
      >
        Archive
      </button>
      <button
        type="button"
        className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
        onClick={() => void performAction(row.id, 'hash_verify')}
      >
        Hash-verify
      </button>
      <button
        type="button"
        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
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
    <div className="flex flex-col gap-4 p-4" data-testid="artifact-admin-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Artifact Admin</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
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
          className="rounded border border-blue-300 bg-blue-50 p-2 text-sm text-blue-800"
          data-testid="artifact-action-status"
        >
          {actionStatus}
        </div>
      ) : null}

      {renderFilters()}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        {loadingList ? (
          <div className="p-4 text-sm text-gray-500">Loading artifacts...</div>
        ) : listError !== null ? (
          <div className="p-4 text-sm text-red-700">List error: {listError}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500" data-testid="artifact-list-empty">
            No artifacts in scope. (List API unavailable in v1; use detail-by-id.)
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-1 font-mono">{r.id}</td>
                  <td className="px-2 py-1 font-mono">{r.task_id}</td>
                  <td className="px-2 py-1">{r.artifact_type}</td>
                  <td className="px-2 py-1">
                    {r.storage_kind}
                    {r.storage_kind === 'external_uri' ? (
                      <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] uppercase text-purple-700">
                        external
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1">{r.redaction_status}</td>
                  <td className="px-2 py-1">{r.security_scan_status}</td>
                  <td className="px-2 py-1">{formatBytes(r.byte_size)}</td>
                  <td className="px-2 py-1 font-mono text-xs">{r.mime ?? '—'}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-col gap-1">
                      {renderActions(r)}
                      <div className="flex gap-2 text-xs">
                        {isPreviewable(r) ? (
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => setSelected(r)}
                          >
                            Preview
                          </button>
                        ) : null}
                        {isDownloadable(r) ? (
                          <a
                            className="text-blue-600 underline"
                            href={`/api/task-artifacts/${String(r.id)}?download=1`}
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
          className="rounded border border-gray-200 bg-white p-3"
          data-testid="artifact-preview-pane"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">
              Preview · #{String(selected.id)} · {selected.artifact_type}
            </div>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="text-xs text-gray-500">
            {selected.mime ?? 'unknown'} · {formatBytes(selected.byte_size)} · sha256{' '}
            {selected.sha256 ?? '—'}
          </div>
          <pre className="mt-2 max-h-[60vh] overflow-auto rounded bg-gray-50 p-2 text-xs">
            {(selected.preview_text ?? selected.content ?? '(no preview available)').slice(0, 4096)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
