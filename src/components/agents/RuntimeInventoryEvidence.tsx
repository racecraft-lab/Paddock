'use client'

import type { RuntimeInventoryEnvelope, RuntimeInventoryEntry } from '@/lib/harness-adapters/types'

export interface RuntimeInventoryEvidenceProps {
  readonly inventory: RuntimeInventoryEnvelope | null
  readonly loading: boolean
  readonly error: string | null
}

const stateTone: Record<RuntimeInventoryEntry['state'], string> = {
  visible: 'border-gray-500 text-gray-200',
  unassigned: 'border-sky-500 text-sky-200',
  assigned: 'border-blue-500 text-blue-200',
  eligible: 'border-green-500 text-green-200',
  blocked: 'border-yellow-500 text-yellow-100',
}

function shortList(values: readonly string[], emptyLabel = 'none'): string {
  if (values.length === 0) return emptyLabel
  const visible = values.slice(0, 4)
  const suffix = values.length > visible.length ? `, +${(values.length - visible.length).toString()} more` : ''
  return `${visible.join(', ')}${suffix}`
}

function EntryEvidence({ entry }: { readonly entry: RuntimeInventoryEntry }) {
  return (
    <article className={`rounded border ${stateTone[entry.state]} bg-gray-900/60 p-3`} aria-label={`Runtime inventory ${entry.selected_manifest.display_name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="break-words text-sm font-semibold text-white">{entry.selected_manifest.display_name}</h5>
          <p className="break-all text-xs text-gray-400">Manifest: {entry.selected_manifest.manifest_id}</p>
        </div>
        <span className="rounded border border-current px-2 py-0.5 text-xs font-medium">State: {entry.state}</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-300 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-gray-400">Assignment</dt>
          <dd className="break-words">
            {entry.assignment.status}
            {entry.assignment.role ? `, role ${entry.assignment.role}` : ''}
            {entry.assignment.agent_name ? `, agent ${entry.assignment.agent_name}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Requested capability</dt>
          <dd className="break-words">{entry.capability_resolution.requested_capability}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Reason codes</dt>
          <dd className="break-words">{shortList(entry.reason_codes)}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Lifecycle references</dt>
          <dd className="break-words">
            {entry.sandbox_lifecycle_refs.length === 0
              ? 'none'
              : entry.sandbox_lifecycle_refs.map((ref) => `${ref.id}:${ref.status}`).join(', ')}
          </dd>
        </div>
      </dl>

      {entry.sanitized_fake_evidence.length > 0 && (
        <div className="mt-3 text-xs text-gray-300">
          <p className="font-medium text-gray-400">Sanitized evidence</p>
          <ul className="mt-1 space-y-1">
            {entry.sanitized_fake_evidence.slice(0, 3).map((evidence) => (
              <li key={`${evidence.kind}:${evidence.ref}`} className="break-words">
                {evidence.kind}: {evidence.label} ({evidence.ref})
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.rejection_metadata && (
        <p className="mt-3 break-words text-xs text-yellow-100" role="alert">
          Evidence rejected: {entry.rejection_metadata.field_path} ({entry.rejection_metadata.reason_code})
        </p>
      )}
    </article>
  )
}

export function RuntimeInventoryEvidence({ inventory, loading, error }: RuntimeInventoryEvidenceProps) {
  if (loading && !inventory) {
    return (
      <section aria-label="Runtime inventory evidence" className="rounded border border-gray-700 bg-gray-900/60 p-4">
        <h4 className="text-sm font-semibold text-white">Runtime inventory evidence</h4>
        <p className="mt-2 text-sm text-gray-400" role="status">Loading runtime inventory evidence</p>
      </section>
    )
  }

  if (error) {
    return (
      <section aria-label="Runtime inventory evidence" className="rounded border border-red-700 bg-red-950/30 p-4">
        <h4 className="text-sm font-semibold text-white">Runtime inventory evidence</h4>
        <p className="mt-2 break-words text-sm text-red-200" role="alert">{error}</p>
      </section>
    )
  }

  if (!inventory || inventory.entries.length === 0) {
    return (
      <section aria-label="Runtime inventory evidence" className="rounded border border-gray-700 bg-gray-900/60 p-4">
        <h4 className="text-sm font-semibold text-white">Runtime inventory evidence</h4>
        <p className="mt-2 text-sm text-gray-400">No runtime inventory entries are visible for this scope.</p>
      </section>
    )
  }

  return (
    <section aria-label="Runtime inventory evidence" className="rounded border border-gray-700 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">Runtime inventory evidence</h4>
          <p className="mt-1 text-xs text-gray-400">Generated: {inventory.generated_at}</p>
        </div>
        <div className="text-xs text-gray-300">
          Feature flag: {inventory.feature_flag.enabled ? 'enabled' : 'disabled'}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-300 sm:grid-cols-3">
        <span>Total: {inventory.summary.total}</span>
        <span>Visible: {inventory.summary.visible}</span>
        <span>Unassigned: {inventory.summary.unassigned}</span>
        <span>Assigned: {inventory.summary.assigned}</span>
        <span>Eligible: {inventory.summary.eligible}</span>
        <span>Blocked: {inventory.summary.blocked}</span>
      </div>

      <div className="mt-4 space-y-3">
        {inventory.entries.map((entry) => <EntryEvidence key={entry.id} entry={entry} />)}
      </div>

      {inventory.diagnostics.warnings.length > 0 && (
        <div className="mt-3 rounded border border-yellow-700 bg-yellow-950/30 p-2 text-xs text-yellow-100" role="alert">
          Diagnostics: {shortList(inventory.diagnostics.warnings)}
        </div>
      )}
    </section>
  )
}
