/**
 * Bidirectional mapping between Mission Control statuses/priorities and GitHub labels.
 *
 * Three label families are defined here:
 *   - `mc:*`        — Mission Control task statuses (mc:backlog, mc:in-progress, ...)
 *   - `priority:*`  — task priorities (priority:low/medium/high/critical)
 *   - `area:*`      — SPEC-006 product-line / department routing
 *                     (area:qa, area:dev, area:triage, ...)
 *
 * The `mc:` prefix on the status family is intentional, to avoid collisions
 * with existing repo labels; `priority:*` and `area:*` are conventional GitHub
 * label namespaces and do not use a `mc:` prefix because they are already
 * domain-specific enough not to collide.
 */

import type Database from 'better-sqlite3'

export type TaskStatus = 'backlog' | 'inbox' | 'assigned' | 'awaiting_owner' | 'in_progress' | 'review' | 'quality_review' | 'done' | 'failed'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

interface LabelDef {
  name: string
  color: string
  description?: string
}

// ── Status ↔ Label mapping ──────────────────────────────────────

const STATUS_LABEL_MAP: Record<TaskStatus, LabelDef> = {
  backlog:        { name: 'mc:backlog',        color: '94a3b8', description: 'Mission Control: backlog' },
  inbox:          { name: 'mc:inbox',          color: '6b7280', description: 'Mission Control: inbox' },
  assigned:       { name: 'mc:assigned',       color: '3b82f6', description: 'Mission Control: assigned' },
  in_progress:    { name: 'mc:in-progress',    color: 'eab308', description: 'Mission Control: in progress' },
  review:         { name: 'mc:review',         color: 'a855f7', description: 'Mission Control: review' },
  quality_review: { name: 'mc:quality-review', color: '6366f1', description: 'Mission Control: quality review' },
  done:           { name: 'mc:done',           color: '22c55e', description: 'Mission Control: done' },
  awaiting_owner: { name: 'mc:awaiting-owner', color: 'f97316', description: 'Mission Control: awaiting owner' },
  failed:         { name: 'mc:failed',          color: 'ef4444', description: 'Mission Control: failed' },
}

const LABEL_STATUS_MAP: Record<string, TaskStatus> = Object.fromEntries(
  Object.entries(STATUS_LABEL_MAP).map(([status, def]) => [def.name, status as TaskStatus])
)

export function statusToLabel(status: TaskStatus): LabelDef {
  return STATUS_LABEL_MAP[status]
}

export function labelToStatus(labelName: string): TaskStatus | null {
  return LABEL_STATUS_MAP[labelName] ?? null
}

// ── Priority ↔ Label mapping ───────────────────────────────────

const PRIORITY_LABEL_MAP: Record<TaskPriority, LabelDef> = {
  critical: { name: 'priority:critical', color: 'ef4444', description: 'Priority: critical' },
  high:     { name: 'priority:high',     color: 'f97316', description: 'Priority: high' },
  medium:   { name: 'priority:medium',   color: 'eab308', description: 'Priority: medium' },
  low:      { name: 'priority:low',      color: '22c55e', description: 'Priority: low' },
}

const LABEL_PRIORITY_MAP: Record<string, TaskPriority> = Object.fromEntries(
  Object.entries(PRIORITY_LABEL_MAP).map(([priority, def]) => [def.name, priority as TaskPriority])
)

export function priorityToLabel(priority: TaskPriority): LabelDef {
  return PRIORITY_LABEL_MAP[priority] ?? PRIORITY_LABEL_MAP.medium
}

export function labelToPriority(labels: string[]): TaskPriority {
  for (const label of labels) {
    const p = LABEL_PRIORITY_MAP[label]
    if (p) return p
  }
  return 'medium'
}

// ── All MC labels (for initialization) ──────────────────────────

export const ALL_MC_LABELS: LabelDef[] = [
  ...Object.values(STATUS_LABEL_MAP),
  ...Object.values(PRIORITY_LABEL_MAP),
]

export const ALL_STATUS_LABEL_NAMES = Object.values(STATUS_LABEL_MAP).map(l => l.name)
export const ALL_PRIORITY_LABEL_NAMES = Object.values(PRIORITY_LABEL_MAP).map(l => l.name)

// ── Area ↔ Label mapping (SPEC-006 / FR-030..FR-032) ────────────
//
// Static catalog of the 12 canonical Mission Control "area" labels. These are
// the well-known department / function buckets that ship with every workspace
// when `FEATURE_AREA_LABEL_ROUTING` is enabled. Workspaces may also define
// their own free-form `projects.area_slug` values — `areaLabelsForWorkspace`
// returns the union of these static labels and any workspace-defined slugs
// not already covered by the static map.
//
// Snapshot-pinned by `github-label-map-spec006.test.ts` per FR-030. Any drift
// in name / color / description is a deliberate decision that requires a
// matching test update.

export const AREA_LABEL_MAP: Record<string, LabelDef> = {
  'area:qa':       { name: 'area:qa',       color: 'a855f7', description: 'Mission Control area: quality assurance' },
  'area:dev':      { name: 'area:dev',      color: '3b82f6', description: 'Mission Control area: development' },
  'area:design':   { name: 'area:design',   color: 'be185d', description: 'Mission Control area: design' },
  'area:infra':    { name: 'area:infra',    color: '64748b', description: 'Mission Control area: infrastructure' },
  'area:security': { name: 'area:security', color: 'ef4444', description: 'Mission Control area: security' },
  'area:docs':     { name: 'area:docs',     color: 'eab308', description: 'Mission Control area: documentation' },
  'area:ops':      { name: 'area:ops',      color: 'f97316', description: 'Mission Control area: operations' },
  'area:frontend': { name: 'area:frontend', color: '0e7490', description: 'Mission Control area: frontend' },
  'area:backend':  { name: 'area:backend',  color: '6366f1', description: 'Mission Control area: backend' },
  'area:data':     { name: 'area:data',     color: '22c55e', description: 'Mission Control area: data' },
  'area:ml':       { name: 'area:ml',       color: '6d28d9', description: 'Mission Control area: machine learning' },
  'area:triage':   { name: 'area:triage',   color: '6b7280', description: 'Mission Control area: triage (unresolvable inbound issues)' },
}

export const ALL_AREA_LABEL_NAMES = Object.values(AREA_LABEL_MAP).map(l => l.name)

// Stable fallback color for synthesized (workspace-defined) area labels.
// Slate-400, distinct from every color in the static AREA_LABEL_MAP so that
// operators can visually differentiate workspace-defined slugs in the GitHub UI.
const SYNTHESIZED_AREA_LABEL_COLOR = '94a3b8'

/**
 * Return the union of the static AREA_LABEL_MAP values plus a synthesized
 * `LabelDef` for every non-NULL `projects.area_slug` in the given workspace
 * that is NOT already covered by a static `area:<slug>` entry.
 *
 * Synthesized labels carry a stable slate fallback color and a description
 * suffixed with `(workspace-defined)` so operators can tell them apart from
 * the canonical 12. The static map always wins on collision — a project with
 * `area_slug='qa'` does NOT add a duplicate `area:qa` row.
 *
 * Used by `initializeLabels(repo, workspaceId)` (FR-025) to seed area labels
 * on a connected GitHub repo.
 */
export function areaLabelsForWorkspace(
  db: Database.Database,
  workspaceId: number,
): LabelDef[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT area_slug
         FROM projects
        WHERE workspace_id = ?
          AND area_slug IS NOT NULL`,
    )
    .all(workspaceId) as Array<{ area_slug: string }>

  const labels: LabelDef[] = [...Object.values(AREA_LABEL_MAP)]
  const seen = new Set(labels.map((l) => l.name))

  for (const { area_slug } of rows) {
    const name = `area:${area_slug}`
    if (seen.has(name)) continue
    seen.add(name)
    labels.push({
      name,
      color: SYNTHESIZED_AREA_LABEL_COLOR,
      description: `Mission Control area: ${area_slug} (workspace-defined)`,
    })
  }

  return labels
}
