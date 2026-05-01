'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'
import { appendScopeToPath } from '@/types/product-line'
import { resolveFlag } from '@/lib/feature-flags'

interface Project {
  id: number
  name: string
  slug: string
  description?: string
  ticket_prefix: string
  status: 'active' | 'archived'
  github_repo?: string
  deadline?: number
  color?: string
  github_sync_enabled?: boolean
  github_default_branch?: string
  task_count?: number
  assigned_agents?: string[]
  // SPEC-006 / FR-040 — area-routing fields, additive and always present
  // when the server returns them. Defaults are null/false on the server side.
  area_slug?: string | null
  is_triage_project?: boolean
  is_repo_sync_owner?: boolean
}

// SPEC-006 / FR-037, FR-058 — owner_conflict surfaced inline so operators
// can resolve it via the "Transfer ownership" action without leaving the modal.
interface OwnerConflictState {
  projectId: number
  existingProjectId: number
  existingProjectSlug: string
  message: string
}

// SPEC-006 / FR-036, FR-040, FR-041 — triage_conflict surfaced inline.
// The partial unique index `idx_projects_one_triage_per_workspace` enforces
// at-most-one triage per workspace; the API returns this 409 shape when a
// second project tries to claim the flag.
interface TriageConflictState {
  projectId: number
  existingProjectId: number
  existingProjectSlug: string
  message: string
}

// SPEC-006 / FR-035, FR-040, FR-041 — area_slug_conflict surfaced inline
// when another project in the workspace already holds the desired slug.
interface AreaSlugConflictState {
  projectId: number
  existingProjectId: number
  existingProjectSlug: string
  message: string
}

// SPEC-006 / FR-034 — RFC 1123 / Kubernetes DNS label, max 32 chars.
const AREA_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/

interface Agent {
  id: number
  name: string
  role: string
  status: string
}

const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

export function ProjectManagerModal({
  onClose,
  onChanged
}: {
  onClose: () => void
  onChanged?: () => Promise<void>
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', ticket_prefix: '', description: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{
    description: string
    github_repo: string
    deadline: string
    color: string
    assigned_agents: string[]
    github_sync_enabled: boolean
    github_default_branch: string
    is_repo_sync_owner: boolean
    is_triage_project: boolean
    area_slug: string
  }>({ description: '', github_repo: '', deadline: '', color: '', assigned_agents: [], github_sync_enabled: false, github_default_branch: 'main', is_repo_sync_owner: false, is_triage_project: false, area_slug: '' })
  const [ownerConflict, setOwnerConflict] = useState<OwnerConflictState | null>(null)
  const [triageConflict, setTriageConflict] = useState<TriageConflictState | null>(null)
  const [areaSlugConflict, setAreaSlugConflict] = useState<AreaSlugConflictState | null>(null)
  const { activeProductLineScope, activeProductLine } = useMissionControl()

  // SPEC-006 / FR-040b — banner visibility derived client-side from the
  // active workspace's `feature_flags` blob. We deliberately mirror the
  // server-side `resolveFlag` semantics so the UI cannot drift from the API.
  const areaRoutingFlagOn = useMemo(() => {
    return resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
      workspaceFlags: activeProductLine?.feature_flags ?? null,
    })
  }, [activeProductLine])

  const hasTriageProject = useMemo(
    () => projects.some((p) => p.is_triage_project),
    [projects],
  )
  const showNoTriageBanner = areaRoutingFlagOn && !hasTriageProject

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [projectsRes, agentsRes] = await Promise.all([
        fetch(appendScopeToPath('/api/projects?includeArchived=1', activeProductLineScope)),
        fetch(appendScopeToPath('/api/agents', activeProductLineScope))
      ])
      const projectsData = await projectsRes.json()
      if (!projectsRes.ok) throw new Error(projectsData.error || 'Failed to load projects')
      setProjects(projectsData.projects || [])

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json()
        setAgents(agentsData.agents || [])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [activeProductLineScope])

  useEffect(() => {
    load()
  }, [load])

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      const response = await fetch(appendScopeToPath('/api/projects', activeProductLineScope), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          ticket_prefix: form.ticket_prefix,
          description: form.description
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create project')
      setForm({ name: '', ticket_prefix: '', description: '' })
      await load()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const archiveProject = async (project: Project) => {
    try {
      const response = await fetch(appendScopeToPath(`/api/projects/${project.id}`, activeProductLineScope), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: project.status === 'active' ? 'archived' : 'active' })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update project')
      await load()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    }
  }

  const deleteProject = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? Existing tasks will be moved to General.`)) return
    try {
      const response = await fetch(appendScopeToPath(`/api/projects/${project.id}?mode=delete`, activeProductLineScope), { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to delete project')
      await load()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  const startEditing = (project: Project) => {
    if (editingId === project.id) {
      setEditingId(null)
      setOwnerConflict(null)
      setTriageConflict(null)
      return
    }
    setEditingId(project.id)
    setOwnerConflict(null)
    setTriageConflict(null)
    setAreaSlugConflict(null)
    setEditForm({
      description: project.description || '',
      github_repo: project.github_repo || '',
      deadline: project.deadline ? new Date(project.deadline * 1000).toISOString().split('T')[0] : '',
      color: project.color || '',
      assigned_agents: project.assigned_agents || [],
      github_sync_enabled: !!project.github_sync_enabled,
      github_default_branch: project.github_default_branch || 'main',
      is_repo_sync_owner: !!project.is_repo_sync_owner,
      is_triage_project: !!project.is_triage_project,
      area_slug: project.area_slug ?? '',
    })
  }

  // SPEC-006 / FR-040, FR-041 — submit area-routing fields via the new PUT
  // route. The single dispatcher handles all four 409 shapes (area_slug,
  // triage, owner) and the activity-bearing transfer_owner=true atomic swap.
  // Body fields are passed through verbatim so callers can mix is_triage,
  // is_repo_sync_owner, area_slug, and transfer_owner in one round-trip.
  const submitAreaRouting = async (
    project: Project,
    body: Record<string, unknown>,
  ) => {
    try {
      const response = await fetch(
        appendScopeToPath(`/api/projects/${project.id}`, activeProductLineScope),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const data = await response.json()
      if (response.status === 409 && data?.error === 'owner_conflict') {
        setOwnerConflict({
          projectId: project.id,
          existingProjectId: data.existing_owner_project_id as number,
          existingProjectSlug: String(data.existing_owner_project_slug),
          message: String(data.message ?? 'Another project owns this repo.'),
        })
        setTriageConflict(null)
        setAreaSlugConflict(null)
        return false
      }
      if (response.status === 409 && data?.error === 'triage_conflict') {
        setTriageConflict({
          projectId: project.id,
          existingProjectId: data.existing_triage_project_id as number,
          existingProjectSlug: String(data.existing_triage_project_slug),
          message: String(data.message ?? 'Another project is the triage project.'),
        })
        setOwnerConflict(null)
        setAreaSlugConflict(null)
        return false
      }
      if (response.status === 409 && data?.error === 'area_slug_conflict') {
        setAreaSlugConflict({
          projectId: project.id,
          existingProjectId: data.existing_area_slug_project_id as number,
          existingProjectSlug: String(data.existing_area_slug_project_slug),
          message: String(data.message ?? 'Another project uses this area slug.'),
        })
        setOwnerConflict(null)
        setTriageConflict(null)
        return false
      }
      if (!response.ok) {
        throw new Error(data?.error ?? data?.message ?? 'Failed to update project')
      }
      setOwnerConflict(null)
      setTriageConflict(null)
      setAreaSlugConflict(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
      return false
    }
  }

  const saveEdit = async (project: Project) => {
    try {
      const body: Record<string, unknown> = {
        description: editForm.description,
        github_repo: editForm.github_repo || null,
        color: editForm.color || null,
        deadline: editForm.deadline ? Math.floor(new Date(editForm.deadline).getTime() / 1000) : null,
        github_sync_enabled: editForm.github_sync_enabled ? 1 : 0,
        github_default_branch: editForm.github_default_branch || 'main',
      }
      const response = await fetch(appendScopeToPath(`/api/projects/${project.id}`, activeProductLineScope), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update project')

      // SPEC-006 / FR-040 — area-routing fields go through the new PUT
      // handler. Only call when at least one toggle changed to keep the
      // legacy PATCH path side-effect free.
      const desiredIsOwner = editForm.is_repo_sync_owner
      const ownerChanged = desiredIsOwner !== !!project.is_repo_sync_owner
      const desiredIsTriage = editForm.is_triage_project
      const triageChanged = desiredIsTriage !== !!project.is_triage_project

      if (ownerChanged || triageChanged) {
        const areaBody: Record<string, unknown> = {}
        if (ownerChanged) areaBody.is_repo_sync_owner = desiredIsOwner
        if (triageChanged) areaBody.is_triage_project = desiredIsTriage
        const ok = await submitAreaRouting(project, areaBody)
        if (!ok) {
          // Either an owner_conflict / triage_conflict surfaced inline or
          // another error in `error`. Bail without dismissing the editor
          // so the operator can act.
          return
        }
      }

      // Sync agent assignments
      const currentAgents = project.assigned_agents || []
      const newAgents = editForm.assigned_agents
      const toAdd = newAgents.filter(a => !currentAgents.includes(a))
      const toRemove = currentAgents.filter(a => !newAgents.includes(a))

      for (const agentName of toAdd) {
        await fetch(appendScopeToPath(`/api/projects/${project.id}/agents`, activeProductLineScope), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: agentName })
        })
      }
      for (const agentName of toRemove) {
        await fetch(appendScopeToPath(`/api/projects/${project.id}/agents?agent_name=${encodeURIComponent(agentName)}`, activeProductLineScope), {
          method: 'DELETE'
        })
      }

      setEditingId(null)
      await load()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    }
  }

  const toggleAgentAssignment = (agentName: string) => {
    setEditForm(prev => ({
      ...prev,
      assigned_agents: prev.assigned_agents.includes(agentName)
        ? prev.assigned_agents.filter(a => a !== agentName)
        : [...prev.assigned_agents, agentName]
    }))
  }

  const dialogRef = useFocusTrap(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="projects-title" className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 id="projects-title" className="text-xl font-bold text-foreground">Project Management</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-xl">&times;</Button>
          </div>

          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</div>}

          <form onSubmit={createProject} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Project name"
                className="bg-surface-1 text-foreground border border-border rounded-md px-3 py-2"
                required
              />
              <input
                type="text"
                value={form.ticket_prefix}
                onChange={(e) => setForm((prev) => ({ ...prev, ticket_prefix: e.target.value }))}
                placeholder="Ticket prefix (e.g. PA)"
                className="bg-surface-1 text-foreground border border-border rounded-md px-3 py-2"
              />
              <Button type="submit">
                Add Project
              </Button>
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
          </form>

          {/* SPEC-006 / FR-040b — no-triage-designated banner. Visible when
              FEATURE_AREA_LABEL_ROUTING is ON and no project in the workspace
              has is_triage_project=1. Disappears the moment any project is
              promoted to triage, so the cue is purely state-driven (no
              dedicated API). */}
          {showNoTriageBanner && !loading && (
            <div
              data-testid="no-triage-banner"
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              No triage project designated. Unresolvable issues will route to the sync-owner project until you designate one.
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading projects...</div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div key={project.id} className="border border-border rounded-md overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/30 transition-smooth"
                    onClick={() => startEditing(project)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: project.color || '#6b7280' }}
                      />
                      <div>
                        <div className="text-sm font-medium text-foreground flex items-center gap-2">
                          {project.name}
                          {typeof project.task_count === 'number' && (
                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground">
                              {project.task_count} tasks
                            </span>
                          )}
                          {project.deadline && project.deadline < Math.floor(Date.now() / 1000) && (
                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Overdue" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {project.ticket_prefix} &middot; {project.slug} &middot; {project.status}
                          {project.github_repo && <> &middot; {project.github_repo}</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {project.assigned_agents && project.assigned_agents.length > 0 && (
                        <div className="flex -space-x-1">
                          {project.assigned_agents.slice(0, 3).map(a => (
                            <div key={a} className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold border border-card" title={a}>
                              {a[0]?.toUpperCase()}
                            </div>
                          ))}
                          {project.assigned_agents.length > 3 && (
                            <div className="w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground flex items-center justify-center text-[8px] font-bold border border-card">
                              +{project.assigned_agents.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                      {project.slug !== 'general' && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" size="xs" onClick={() => archiveProject(project)}>
                            {project.status === 'active' ? 'Archive' : 'Activate'}
                          </Button>
                          <Button variant="destructive" size="xs" onClick={() => deleteProject(project)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline Edit Section */}
                  {editingId === project.id && (
                    <div className="border-t border-border p-3 bg-surface-1/50 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Description</label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            rows={2}
                            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm resize-none"
                            placeholder="Project description"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">GitHub Repo</label>
                          <input
                            type="text"
                            value={editForm.github_repo}
                            onChange={(e) => setEditForm(prev => ({ ...prev, github_repo: e.target.value }))}
                            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm"
                            placeholder="owner/repo"
                          />
                        </div>
                      </div>

                      {editForm.github_repo && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Default Branch</label>
                            <input
                              type="text"
                              value={editForm.github_default_branch}
                              onChange={(e) => setEditForm(prev => ({ ...prev, github_default_branch: e.target.value }))}
                              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm"
                              placeholder="main"
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-5">
                            <button
                              type="button"
                              onClick={() => setEditForm(prev => ({ ...prev, github_sync_enabled: !prev.github_sync_enabled }))}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                editForm.github_sync_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                              }`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                editForm.github_sync_enabled ? 'translate-x-4' : 'translate-x-0.5'
                              }`} />
                            </button>
                            <label className="text-xs text-muted-foreground">Enable Two-Way Sync</label>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setEditForm(prev => ({ ...prev, is_repo_sync_owner: !prev.is_repo_sync_owner }))}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                editForm.is_repo_sync_owner ? 'bg-primary' : 'bg-muted-foreground/30'
                              }`}
                              aria-label="Toggle repo sync owner"
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                editForm.is_repo_sync_owner ? 'translate-x-4' : 'translate-x-0.5'
                              }`} />
                            </button>
                            <label className="text-xs text-muted-foreground">Repo Sync Owner (one per repo per workspace)</label>
                          </div>
                          {ownerConflict && ownerConflict.projectId === project.id && (
                            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                              <div className="font-medium">Sync owner conflict</div>
                              <div className="mt-0.5">
                                Project <code className="font-mono">{ownerConflict.existingProjectSlug}</code>{' '}
                                (id={ownerConflict.existingProjectId}) currently owns this repo.{' '}
                                {ownerConflict.message}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SPEC-006 / FR-040 — triage project toggle. Visible
                          only when FEATURE_AREA_LABEL_ROUTING is ON for the
                          workspace; otherwise the PUT route would reject any
                          attempt with `feature_flag_disabled`. */}
                      {areaRoutingFlagOn && (
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditForm(prev => ({ ...prev, is_triage_project: !prev.is_triage_project }))}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                editForm.is_triage_project ? 'bg-primary' : 'bg-muted-foreground/30'
                              }`}
                              aria-label="Toggle triage project"
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                editForm.is_triage_project ? 'translate-x-4' : 'translate-x-0.5'
                              }`} />
                            </button>
                            <label className="text-xs text-muted-foreground">
                              Triage Project (one per workspace) — absorbs ambiguous issues
                            </label>
                          </div>
                          {triageConflict && triageConflict.projectId === project.id && (
                            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                              <div className="font-medium">Triage project conflict</div>
                              <div className="mt-0.5">
                                Project <code className="font-mono">{triageConflict.existingProjectSlug}</code>{' '}
                                (id={triageConflict.existingProjectId}) is already the triage project.{' '}
                                {triageConflict.message}
                              </div>
                            </div>
                          )}
                          <div className="mt-2">
                            <label className="block text-xs text-muted-foreground mb-1">
                              Area slug (FR-034) — `area:&lt;slug&gt;` GitHub label routes to this project
                            </label>
                            <input
                              type="text"
                              value={editForm.area_slug}
                              onChange={(e) => setEditForm(prev => ({ ...prev, area_slug: e.target.value }))}
                              placeholder="qa, dev, infra, frontend (lowercase; 1-32 chars; RFC 1123)"
                              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm font-mono"
                            />
                            {editForm.area_slug.length > 0 && !AREA_SLUG_REGEX.test(editForm.area_slug) && (
                              <div className="mt-1 text-xs text-red-400">
                                Invalid format. Use lowercase alphanumeric with optional hyphens
                                (RFC 1123, 1-32 chars). Examples: <code className="font-mono">qa</code>,
                                <code className="font-mono">product-line-a</code>.
                              </div>
                            )}
                            {areaSlugConflict && areaSlugConflict.projectId === project.id && (
                              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                <div className="font-medium">Area slug conflict</div>
                                <div className="mt-0.5">
                                  Project <code className="font-mono">{areaSlugConflict.existingProjectSlug}</code>{' '}
                                  (id={areaSlugConflict.existingProjectId}) already uses this slug.{' '}
                                  {areaSlugConflict.message}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Deadline</label>
                          <input
                            type="date"
                            value={editForm.deadline}
                            onChange={(e) => setEditForm(prev => ({ ...prev, deadline: e.target.value }))}
                            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Color</label>
                          <div className="flex gap-1.5 items-center flex-wrap">
                            {COLOR_PALETTE.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, color: prev.color === c ? '' : c }))}
                                className={`w-6 h-6 rounded-full border-2 transition-smooth ${editForm.color === c ? 'border-foreground scale-110' : 'border-transparent hover:border-border'}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {agents.length > 0 && (
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Assigned Agents</label>
                          <div className="flex flex-wrap gap-1.5">
                            {agents.map(agent => (
                              <button
                                key={agent.name}
                                type="button"
                                onClick={() => toggleAgentAssignment(agent.name)}
                                className={`px-2 py-1 rounded text-xs border transition-smooth ${
                                  editForm.assigned_agents.includes(agent.name)
                                    ? 'bg-primary/20 text-primary border-primary/40'
                                    : 'bg-surface-1 text-muted-foreground border-border hover:border-primary/30'
                                }`}
                              >
                                {agent.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => saveEdit(project)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
