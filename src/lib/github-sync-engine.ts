/**
 * GitHub Sync Engine — bidirectional sync between MC tasks and GitHub issues.
 * Uses proper DB columns (github_repo, github_issue_number, github_synced_at)
 * instead of metadata JSON for matching.
 */

import { getDatabase, db_helpers } from '@/lib/db'
import { logger } from '@/lib/logger'
import { resolveFlag } from '@/lib/feature-flags'
import {
  fetchIssues,
  fetchIssue,
  updateIssue,
  createIssue,
  ensureLabels,
  createLabel,
  type GitHubIssue,
} from '@/lib/github'
import {
  ALL_MC_LABELS,
  ALL_STATUS_LABEL_NAMES,
  ALL_PRIORITY_LABEL_NAMES,
  ALL_AREA_LABEL_NAMES,
  areaLabelsForWorkspace,
  statusToLabel,
  labelToStatus,
  priorityToLabel,
  labelToPriority,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/github-label-map'
import { createTask } from '@/lib/task-create'
import { eventBus } from '@/lib/event-bus'
import { config } from '@/lib/config'
import {
  READY_FOR_OWNER_STATUS,
  READY_FOR_OWNER_TERMINAL_EVENT,
  resolveTaskTerminalTransition,
} from '@/lib/task-status'
import type Database from 'better-sqlite3'

// ── SPEC-006 / FR-027b — error classification + sanitization ─────────
//
// `classifyLabelProvisioningError` maps a thrown error to one of the
// FR-027b error_class values. The HTTP error path (from
// `createLabel`) carries the status in `Error('GitHub API error <status>:
// ...')` form (see github.ts:268); we match that shape. Network failures
// (DNS, TLS, connection reset, timeout) come back as `TypeError` from
// `fetch()`; any other thrown error class falls through to UnknownError.
type LabelProvisioningErrorClass =
  | 'RateLimitError'
  | 'NetworkError'
  | 'HttpClientError'
  | 'HttpServerError'
  | 'UnknownError'

export function classifyLabelProvisioningError(err: unknown): LabelProvisioningErrorClass {
  if (!(err instanceof Error)) return 'UnknownError'
  const m = err.message.match(/GitHub API error (\d{3})/)
  if (m) {
    const status = Number(m[1])
    if (status === 429) return 'RateLimitError'
    if (status >= 400 && status < 500) return 'HttpClientError'
    if (status >= 500 && status < 600) return 'HttpServerError'
  }
  if (
    err.name === 'TypeError' ||
    /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|certificate|TLS|network/i.test(err.message)
  ) {
    return 'NetworkError'
  }
  return 'UnknownError'
}

// FR-027a / FR-027b — sanitize a free-text error message:
//  - strip Authorization header lines
//  - strip GitHub PAT-shaped tokens (gh[posru]_...)
//  - strip emails
//  - strip API-key-shaped runs (long opaque tokens)
//  - truncate to 500 chars
// Sanitization is at the call site, not deferred.
const GH_TOKEN_RE = /gh[posru]_[A-Za-z0-9_]+/g
const AUTH_HEADER_RE = /Authorization:\s*[^\n\r]+/gi
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const OPAQUE_KEY_RE = /\b[A-Za-z0-9_]{32,}\b/g

export function sanitizeLabelProvisioningError(input: string): string {
  if (typeof input !== 'string') return ''
  let out = input
  out = out.replace(AUTH_HEADER_RE, '<redacted-auth>')
  out = out.replace(GH_TOKEN_RE, '<redacted-gh-token>')
  out = out.replace(EMAIL_RE, '<redacted-email>')
  out = out.replace(OPAQUE_KEY_RE, '<redacted>')
  if (out.length > 500) out = out.slice(0, 500)
  return out
}

/**
 * Idempotently create Mission Control labels on a GitHub repo.
 *
 * Signatures (FR-053, US1-AC3, P5-AC1, US6-T068):
 *   - `initializeLabels(repo)` — legacy 1-arg call; creates ONLY the
 *     mc:* status and priority:* labels.
 *   - `initializeLabels(repo, workspaceId)` — 2-arg call. With
 *     `FEATURE_AREA_LABEL_ROUTING` OFF for the workspace, behavior is
 *     identical to the 1-arg call. The ON-branch behavior — provisioning
 *     `area:*` labels via `areaLabelsForWorkspace` per FR-025 — is wired
 *     in T074 (US7). For US1, the additional argument is accepted but
 *     does NOT change the outbound label set; this preserves byte-identical
 *     behavior under flag-OFF (US1-AC3) while letting downstream callers
 *     start passing the workspace context.
 *   - `initializeLabels(repo, workspaceId, { trigger })` — 3-arg call.
 *     `trigger` is one of `'connect' | 'area_slug_change' | 'bootstrap'`
 *     and identifies the call site for downstream observability (FR-027a
 *     `data.trigger`). For US6, the third argument is ACCEPTED and
 *     CARRIED through to the downstream label-provisioning path (wired in
 *     T074). It does NOT change the outbound label set today.
 */
export interface InitializeLabelsOptions {
  trigger?: 'connect' | 'area_slug_change' | 'bootstrap'
}

export async function initializeLabels(
  repo: string,
  workspaceId?: number,
  opts?: InitializeLabelsOptions,
): Promise<void> {
  // 1) Resolve flag (per-workspace) and assemble the full label set.
  let flagOn = false
  let extraAreaLabels: Array<{ name: string; color: string; description?: string }> = []
  if (typeof workspaceId === 'number') {
    try {
      const db = getDatabase()
      const row = db
        .prepare(`SELECT feature_flags FROM workspaces WHERE id = ?`)
        .get(workspaceId) as { feature_flags: string | null } | undefined
      flagOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
        workspaceFlags: row?.feature_flags ?? null,
      })
      if (flagOn) {
        extraAreaLabels = areaLabelsForWorkspace(db, workspaceId)
      }
    } catch (err) {
      // Resolving the flag must NEVER abort label provisioning. Fall
      // through with flagOn=false so legacy behavior wins.
      flagOn = false
      extraAreaLabels = []
      logger.warn(
        { err, workspaceId, event: 'label_provisioning_flag_resolve_failed' },
        'initializeLabels: flag resolution failed, falling back to legacy label set',
      )
    }
  }

  // Flag-OFF path: byte-identical to legacy (FR-053). No new behavior, no
  // new logs, no activity rows.
  if (!flagOn) {
    await ensureLabels(repo, ALL_MC_LABELS)
    logger.info({ repo }, 'GitHub labels initialized')
    return
  }

  // 2) Flag-ON path. Per-label loop with isolated try/catch so a single
  // failure cannot abort the rest of the set or the surrounding sync run
  // (FR-027). Idempotency (FR-026) is provided by `createLabel`'s 422-OK
  // semantics; existing labels with different color/description are NOT
  // modified here.
  const fullSet = [...ALL_MC_LABELS, ...extraAreaLabels]
  const failures: Array<{ name: string; err: unknown }> = []
  for (const label of fullSet) {
    try {
      await createLabel(repo, label)
    } catch (err) {
      failures.push({ name: label.name, err })
    }
  }

  // 3) Per-failure structured logs (FR-027b) — emitted unconditionally,
  // independent of the 24h activity throttle. Use console.error for the
  // structured shape (single object argument) so test harnesses and
  // production log aggregators see the same payload.
  for (const f of failures) {
    const message = f.err instanceof Error ? f.err.message : String(f.err)
    console.error({
      event: 'label_provisioning_failed',
      workspace_id: workspaceId,
      github_repo: repo,
      error_message: sanitizeLabelProvisioningError(message),
      error_class: classifyLabelProvisioningError(f.err),
      label: f.name,
    })
  }

  if (failures.length === 0) {
    logger.info({ repo, workspaceId, areaCount: extraAreaLabels.length }, 'GitHub labels initialized (with area labels)')
    return
  }

  // 4) Aggregated activity row (FR-027 / FR-027a). Throttled to one row
  // per (workspace_id, github_repo) per 24 hours. The structured logs
  // above are NOT throttled; only this row is.
  try {
    const db = getDatabase()
    const recent = db
      .prepare(
        `SELECT id FROM activities
          WHERE type = 'label_provisioning_failed'
            AND workspace_id = ?
            AND json_extract(data, '$.github_repo') = ?
            AND created_at >= unixepoch() - 86400
          LIMIT 1`,
      )
      .get(workspaceId, repo) as { id: number } | undefined
    if (recent) {
      logger.info(
        { repo, workspaceId, failureCount: failures.length, event: 'label_provisioning_failed_throttled' },
        'initializeLabels: activity throttled (within 24h window)',
      )
      return
    }

    const sampleRaw =
      failures[0].err instanceof Error
        ? failures[0].err.message
        : String(failures[0].err)
    const failedLabels = failures.map((f) => f.name)
    const data = {
      workspace_id: workspaceId,
      github_repo: repo,
      failed_labels: failedLabels,
      error_count: failures.length,
      sample_error: sanitizeLabelProvisioningError(sampleRaw),
      trigger: opts?.trigger ?? 'connect',
    }
    db.prepare(
      `INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
       VALUES ('label_provisioning_failed', 'workspace', ?, 'github-sync',
               ?, ?, ?)`,
    ).run(
      workspaceId ?? 0,
      `Label provisioning failed for ${failedLabels.length}/${fullSet.length} labels on ${repo}`,
      JSON.stringify(data),
      workspaceId,
    )
  } catch (writeErr) {
    // Activity-write failure must NOT throw out of initializeLabels.
    logger.error(
      {
        err: writeErr,
        workspace_id: workspaceId,
        github_repo: repo,
        event: 'label_provisioning_activity_write_failed',
      },
      'initializeLabels: activity insert failed',
    )
  }
}

// ── SPEC-006 / FR-009..FR-014 — area-routing cache + parser ──────────
//
// `loadAreaRoutingCache` is built ONCE per `pullFromGitHub` invocation.
// It resolves both:
//   (a) `slugToProjectId` — every project in the workspace whose
//       `area_slug` is non-NULL maps to its project id. Includes a
//       project that uses `area_slug='triage'` even when its
//       `is_triage_project=0` (FR-014 amendment: the cache wins for
//       single_match, the triage flag is the routing authority for
//       ambiguous issues only).
//   (b) `triageProjectId` — the workspace's triage project id, or
//       null when no project has `is_triage_project=1`.
//
// One SELECT, no JOINs, lookup is O(1). The migration provides
// `idx_projects_workspace_area_slug` and the partial unique index
// `idx_projects_one_triage_per_workspace` so this query is index-backed.
export interface AreaRoutingCache {
  slugToProjectId: Map<string, number>
  triageProjectId: number | null
}

export function loadAreaRoutingCache(
  db: Database.Database,
  workspaceId: number,
): AreaRoutingCache {
  const rows = db.prepare(`
    SELECT id, area_slug, is_triage_project
    FROM projects
    WHERE workspace_id = ?
  `).all(workspaceId) as Array<{
    id: number
    area_slug: string | null
    is_triage_project: number
  }>
  const slugToProjectId = new Map<string, number>()
  let triageProjectId: number | null = null
  for (const row of rows) {
    if (row.area_slug) {
      slugToProjectId.set(row.area_slug, row.id)
    }
    if (row.is_triage_project === 1 && triageProjectId === null) {
      triageProjectId = row.id
    }
  }
  return { slugToProjectId, triageProjectId }
}

// Parse `area:*` labels from a GitHub issue. Lowercase, prefix-stripped,
// empty values (`area:` alone) skipped, deduplicated in input order.
function parseAreaLabels(labelNames: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of labelNames) {
    if (typeof raw !== 'string') continue
    const lower = raw.toLowerCase()
    if (!lower.startsWith('area:')) continue
    const value = lower.slice(5)
    if (value.length === 0) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

type RoutingReason =
  | 'single_match'
  | 'no_label'
  | 'multi_label'
  | 'no_match'
  | 'no_triage'

export interface RoutingResolution {
  resolvedProjectId: number | null
  reason: RoutingReason
  areaLabels: string[]
}

export interface GitHubTerminalFixture {
  repo: string
  issue_number?: number | null
  pull_request?: {
    number: number
    state?: 'open' | 'closed'
    merged?: boolean
    merged_at?: string | null
    merge_commit_sha?: string | null
  } | null
}

export interface PullFromGitHubOptions {
  webhookFixture?: GitHubTerminalFixture
  automatic?: {
    cursor?: string | null
    maxPages?: number
    maxIssues?: number
    maxDurationMs?: number
  }
}

interface ReadyForOwnerTaskRow {
  id: number
  title: string
  status: string
  assigned_to: string | null
  created_by: string | null
  workspace_id: number
  github_repo: string | null
  github_issue_number: number | null
  github_pr_number: number | null
  produces_pr: number | null
  external_terminal_event: string | null
}

interface PullRequestMergeEvidence {
  number: number
  state?: 'open' | 'closed'
  merged?: boolean
  merged_at?: string | null
  merge_commit_sha?: string | null
}

function hasMergedPrEvidence(pr: PullRequestMergeEvidence | null | undefined): pr is PullRequestMergeEvidence {
  return Boolean(pr && pr.merged === true)
}

function isOwnerMergeGatedTask(
  task: ReadyForOwnerTaskRow,
  twoStepTerminalEnabled: boolean,
): boolean {
  return twoStepTerminalEnabled
    && (task.status === READY_FOR_OWNER_STATUS || task.status === 'done')
    && task.produces_pr === 1
    && task.external_terminal_event === READY_FOR_OWNER_TERMINAL_EVENT
}

function fixturePullRequestForTask(
  task: ReadyForOwnerTaskRow,
  fixture: GitHubTerminalFixture | undefined,
): PullRequestMergeEvidence | null {
  if (!fixture || fixture.repo !== task.github_repo) return null
  if (
    fixture.issue_number !== undefined
    && fixture.issue_number !== null
    && fixture.issue_number !== task.github_issue_number
  ) {
    return null
  }
  const pr = fixture.pull_request
  if (!pr || task.github_pr_number === null || task.github_pr_number === undefined) return null
  if (pr.number !== task.github_pr_number) return null
  return pr
}

async function livePullRequestForTask(task: ReadyForOwnerTaskRow): Promise<PullRequestMergeEvidence | null> {
  if (!task.github_repo || task.github_pr_number === null || task.github_pr_number === undefined) return null
  try {
    const github = await import('@/lib/github') as {
      fetchPullRequest?: (
        repo: string,
        pullNumber: number
      ) => Promise<PullRequestMergeEvidence>
    }
    if (typeof github.fetchPullRequest !== 'function') return null
    const pr = await github.fetchPullRequest(task.github_repo, task.github_pr_number)
    return pr.number === task.github_pr_number ? pr : null
  } catch (err) {
    logger.warn({ err, taskId: task.id, repo: task.github_repo }, 'Failed to fetch linked PR merge evidence')
    return null
  }
}

async function mergedPullRequestEvidenceForTask(
  task: ReadyForOwnerTaskRow,
  fixture: GitHubTerminalFixture | undefined,
): Promise<PullRequestMergeEvidence | null> {
  const fixturePr = fixturePullRequestForTask(task, fixture)
  if (hasMergedPrEvidence(fixturePr)) return fixturePr
  const livePr = await livePullRequestForTask(task)
  return hasMergedPrEvidence(livePr) ? livePr : null
}

function writeReadyForOwnerReconciliation(
  db: Database.Database,
  task: ReadyForOwnerTaskRow,
): void {
  const reason = 'linked_issue_closed_without_merged_pr'
  const existingActivity = db.prepare(`
    SELECT id FROM activities
    WHERE type = 'github_terminal_reconciliation_required'
      AND entity_type = 'task'
      AND entity_id = ?
      AND workspace_id = ?
      AND json_extract(data, '$.github_issue_number') = ?
      AND json_extract(data, '$.reason') = ?
    LIMIT 1
  `).get(task.id, task.workspace_id, task.github_issue_number, reason) as { id: number } | undefined

  const data = {
    task_id: task.id,
    workspace_id: task.workspace_id,
    github_repo: task.github_repo,
    github_issue_number: task.github_issue_number,
    github_pr_number: task.github_pr_number ?? null,
    reason,
    source: 'github_sync',
  }

  if (!existingActivity) {
    db_helpers.logActivity(
      'github_terminal_reconciliation_required',
      'task',
      task.id,
      'github-sync',
      `GitHub issue closed without merged linked PR for task: ${task.title}`,
      data,
      task.workspace_id,
    )
  }

  const existingNotification = db.prepare(`
    SELECT id FROM notifications
    WHERE type = 'task_ready_for_owner'
      AND source_type = 'task'
      AND source_id = ?
      AND workspace_id = ?
      AND title = 'Owner merge reconciliation required'
      AND message LIKE ?
      AND message LIKE ?
    LIMIT 1
  `).get(
    task.id,
    task.workspace_id,
    `%GitHub issue #${task.github_issue_number ?? 'unknown'}%`,
    `%Reason: ${reason}.%`,
  ) as { id: number } | undefined
  if (existingNotification) return

  db_helpers.createTaskReadyForOwnerNotification(task, { kind: 'reconciliation', reason })
}

// FR-010..FR-014 + FR-014 amendment: resolve area labels to a project.
//   - exactly one match in cache → single_match → that project
//   - zero area labels → no_label → triage (or no_triage if no triage)
//   - multiple area labels → multi_label → triage (or no_triage)
//   - exactly one unmatched area label → no_match → triage (or no_triage)
// Triage authority is the `is_triage_project=1` flag, NOT the slug
// `area_slug='triage'` (FR-014 amendment).
export function resolveAreaRouting(
  areaLabels: string[],
  cache: AreaRoutingCache,
  syncOwnerProjectId: number,
): RoutingResolution {
  if (areaLabels.length === 1) {
    const hit = cache.slugToProjectId.get(areaLabels[0])
    if (hit !== undefined) {
      return { resolvedProjectId: hit, reason: 'single_match', areaLabels }
    }
    // Single label, no match → triage (or no_triage fallback).
    if (cache.triageProjectId !== null) {
      return { resolvedProjectId: cache.triageProjectId, reason: 'no_match', areaLabels }
    }
    return { resolvedProjectId: syncOwnerProjectId, reason: 'no_triage', areaLabels }
  }
  if (areaLabels.length === 0) {
    if (cache.triageProjectId !== null) {
      return { resolvedProjectId: cache.triageProjectId, reason: 'no_label', areaLabels }
    }
    return { resolvedProjectId: syncOwnerProjectId, reason: 'no_triage', areaLabels }
  }
  // Multi-label.
  if (cache.triageProjectId !== null) {
    return { resolvedProjectId: cache.triageProjectId, reason: 'multi_label', areaLabels }
  }
  return { resolvedProjectId: syncOwnerProjectId, reason: 'no_triage', areaLabels }
}

/**
 * Push a single MC task to GitHub (create or update issue).
 */
export async function pushTaskToGitHub(
  task: {
    id: number
    title: string
    description?: string | null
    status: string
    priority: string
    github_issue_number?: number | null
    github_repo?: string | null
    workspace_id?: number
    project_id?: number | null
  },
  project: {
    id: number
    github_repo?: string | null
    github_sync_enabled?: number | null
    area_slug?: string | null
  }
): Promise<void> {
  const repo = task.github_repo || project.github_repo
  if (!repo) return

  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const statusLabel = statusToLabel(task.status as TaskStatus)
  const priorityLabel = priorityToLabel(task.priority as TaskPriority)
  const state: 'open' | 'closed' = task.status === 'done' ? 'closed' : 'open'

  // SPEC-006 / FR-016, FR-017 — outbound area:<slug> emission.
  // Resolve the workspace's area-routing flag and the project's
  // `area_slug` from the DB. When flag is ON and area_slug is non-NULL,
  // append `area:<slug>` alongside mc:* and priority:* labels. When flag
  // is OFF or area_slug IS NULL, no area:* label is emitted (byte-exact
  // legacy behavior).
  let areaLabel: string | null = null
  if (task.workspace_id && task.project_id !== null && task.project_id !== undefined) {
    try {
      const flagsRow = db.prepare(
        `SELECT feature_flags FROM workspaces WHERE id = ?`,
      ).get(task.workspace_id) as { feature_flags: string | null } | undefined
      const flagOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
        workspaceFlags: flagsRow?.feature_flags ?? null,
      })
      if (flagOn) {
        const projectRow = db.prepare(
          `SELECT area_slug FROM projects WHERE id = ? AND workspace_id = ?`,
        ).get(task.project_id, task.workspace_id) as { area_slug: string | null } | undefined
        if (projectRow?.area_slug) {
          areaLabel = `area:${projectRow.area_slug}`
        }
      }
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'Failed to resolve area_slug for outbound sync')
    }
  }

  if (task.github_issue_number) {
    // Update existing issue
    let existingIssue: GitHubIssue
    try {
      existingIssue = await fetchIssue(repo, task.github_issue_number)
    } catch (err) {
      logger.error({ err, repo, issue: task.github_issue_number }, 'Failed to fetch issue for update')
      return
    }

    // Keep non-MC labels, replace MC labels with current values.
    // Drop any pre-existing area:* labels so the project's current
    // area_slug is the sole source of truth (FR-016).
    const nonMcLabels = existingIssue.labels
      .map(l => l.name)
      .filter(name =>
        !ALL_STATUS_LABEL_NAMES.includes(name)
        && !ALL_PRIORITY_LABEL_NAMES.includes(name)
        && !ALL_AREA_LABEL_NAMES.includes(name)
        && !name.toLowerCase().startsWith('area:'),
      )

    const labels = [
      ...nonMcLabels,
      statusLabel.name,
      priorityLabel.name,
      ...(areaLabel ? [areaLabel] : []),
    ]

    await updateIssue(repo, task.github_issue_number, {
      title: task.title,
      body: task.description || '',
      state,
      labels,
    })

    // Mark synced to prevent ping-pong
    db.prepare(`
      UPDATE tasks SET github_synced_at = ? WHERE id = ?
    `).run(now, task.id)

    logger.info({ repo, issue: task.github_issue_number }, 'Pushed task update to GitHub')
  } else if (project.github_sync_enabled) {
    // Create new issue
    const labels = [statusLabel.name, priorityLabel.name, ...(areaLabel ? [areaLabel] : [])]

    const created = await createIssue(repo, {
      title: task.title,
      body: task.description || undefined,
      labels,
    })

    // Store the issue number and repo on the task
    db.prepare(`
      UPDATE tasks
      SET github_issue_number = ?, github_repo = ?, github_synced_at = ?
      WHERE id = ?
    `).run(created.number, repo, now, task.id)

    logger.info({ repo, issue: created.number, taskId: task.id }, 'Created GitHub issue for task')
  }
}

/**
 * Pull issues from GitHub and sync into MC tasks for a project.
 */
export async function pullFromGitHub(
  project: {
    id: number
    github_repo?: string | null
    github_sync_enabled?: number | null
    github_default_branch?: string | null
  },
  workspaceId: number,
  opts?: PullFromGitHubOptions,
): Promise<{ pulled: number; pushed: number; cursor?: string | null }> {
  const repo = project.github_repo
  if (!repo || !project.github_sync_enabled) {
    return { pulled: 0, pushed: 0 }
  }

  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  let pulled = 0
  let pushed = 0

  // SPEC-006 / FR-002, FR-009 — resolve flag once and build the area-routing
  // cache once per pullFromGitHub invocation.
  const flagsRow = db.prepare(
    `SELECT feature_flags FROM workspaces WHERE id = ?`,
  ).get(workspaceId) as { feature_flags: string | null } | undefined
  const areaRoutingFlagOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
    workspaceFlags: flagsRow?.feature_flags ?? null,
  })
  const routingCache = loadAreaRoutingCache(db, workspaceId)

  // Find last sync time for this project
  const lastSync = db.prepare(`
    SELECT last_synced_at FROM github_syncs
    WHERE project_id = ? AND workspace_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(project.id, workspaceId) as { last_synced_at: number } | undefined

  const automatic = opts?.automatic
  const sinceDate = automatic
    ? (automatic.cursor ?? undefined)
    : lastSync
      ? new Date(lastSync.last_synced_at * 1000).toISOString()
      : undefined
  const fetchParams: {
    state: 'all'
    since?: string
    per_page: number
    page?: number
  } = {
    state: 'all',
    per_page: automatic ? Math.max(1, Math.min(100, automatic.maxIssues ?? 100)) : 100,
  }
  if (sinceDate !== undefined) fetchParams.since = sinceDate
  if (automatic) fetchParams.page = 1

  // Fetch all issues updated since last sync
  let issues: GitHubIssue[]
  try {
    issues = await fetchIssues(repo, fetchParams)
  } catch (err) {
    logger.error({ err, repo }, 'Failed to fetch issues from GitHub')
    // Record failed sync
    db.prepare(`
      INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, error, project_id, changes_pushed, changes_pulled, workspace_id)
      VALUES (?, ?, 0, 'inbound', 'error', ?, ?, 0, 0, ?)
    `).run(repo, now, (err as Error).message, project.id, workspaceId)
    return automatic
      ? { pulled: 0, pushed: 0, cursor: automatic.cursor ?? null }
      : { pulled: 0, pushed: 0 }
  }

  const cursor = issues.reduce<string | null>(
    (latest, issue) => {
      if (!issue.updated_at) return latest
      if (latest === null) return issue.updated_at
      return new Date(issue.updated_at).getTime() > new Date(latest).getTime()
        ? issue.updated_at
        : latest
    },
    automatic?.cursor ?? sinceDate ?? null,
  )

  for (const issue of issues) {
    try {
      // Match to existing task via DB columns
      const existingTask = db.prepare(`
        SELECT t.*, COALESCE(wt.produces_pr, 0) AS produces_pr, wt.external_terminal_event
        FROM tasks t
        LEFT JOIN workflow_templates wt ON wt.id = t.workflow_template_id AND wt.workspace_id = t.workspace_id
        WHERE t.github_repo = ? AND t.github_issue_number = ? AND t.workspace_id = ?
      `).get(repo, issue.number, workspaceId) as any | undefined

      const issueUpdatedAt = Math.floor(new Date(issue.updated_at).getTime() / 1000)
      const labelNames = issue.labels.map(l => l.name)

      if (!existingTask) {
        // New issue — create MC task
        const status = issue.state === 'closed' ? 'done' : (labelToStatus(
          labelNames.find(l => ALL_STATUS_LABEL_NAMES.includes(l)) || ''
        ) || 'backlog')
        const priority = labelToPriority(labelNames)
        const tags = labelNames.filter(l => !ALL_STATUS_LABEL_NAMES.includes(l) && !ALL_PRIORITY_LABEL_NAMES.includes(l))

        // SPEC-006 / FR-010..FR-014 — resolve area routing on FIRST ingest
        // ONLY (FR-015 anti-thrash). The resolved project becomes the new
        // task's project_id. When flag is OFF, route to the calling
        // project to preserve legacy behavior byte-exactly.
        const areaLabels = parseAreaLabels(labelNames)
        const resolution = resolveAreaRouting(areaLabels, routingCache, project.id)
        const targetProjectId = areaRoutingFlagOn
          ? (resolution.resolvedProjectId ?? project.id)
          : project.id

        // SPEC-004 introduced the centralized `createTask` helper which
        // owns ticket allocation, idempotent dedup (returns
        // `duplicate: true` instead of inserting a second row), and the
        // standard `task_created` activity row.
        // Pass `db` and `runtime` explicitly so createTask does not bypass
        // the test's `vi.mock('@/lib/db')` via runtimeRequire and so its
        // event-bus / gnap helpers resolve through static ESM imports
        // (which vitest's mock system DOES intercept), not Node's CJS
        // createRequire (which it does not).
        const createResult = createTask({
          db,
          runtime: {
            broadcast: (type, data) => eventBus.broadcast(type as Parameters<typeof eventBus.broadcast>[0], data),
            gnap: config.gnap,
          },
          source: 'github_sync',
          title: issue.title,
          description: issue.body || '',
          status,
          priority,
          created_by: 'github-sync',
          workspace_id: workspaceId,
          project_id: targetProjectId,
          tags,
          metadata: {},
          github_issue_number: issue.number,
          github_repo: repo,
          github_synced_at: now,
          activity: {
            actor: 'github-sync',
            description: `Synced from GitHub: ${repo}#${issue.number}`,
            data: { github_issue: issue.number, github_repo: repo },
          },
        })

        pulled++
        if (createResult.duplicate) {
          pulled--
        } else {
          // SPEC-006 / FR-042, FR-043, FR-043a — area routing activity row.
          // Skipped when createTask returned duplicate=true (no new ingest,
          // and the original routing decision was logged on the first pass).
          const activityType: 'area_routing_resolved' | 'area_routing_unresolved' =
            resolution.reason === 'single_match'
              ? 'area_routing_resolved'
              : 'area_routing_unresolved'
          writeAreaRoutingActivity(areaRoutingFlagOn, {
            type: activityType,
            entityId: createResult.taskId,
            actor: 'github-sync',
            description:
              resolution.reason === 'single_match'
                ? `Routed ${repo}#${issue.number} via area:${areaLabels[0]}`
                : `Routed ${repo}#${issue.number} (${resolution.reason})`,
            data: {
              area_labels: areaLabels,
              resolved_project_id: resolution.resolvedProjectId ?? targetProjectId,
              reason: resolution.reason,
              source: 'ingest',
              github_issue_number: issue.number,
              workspace_id: workspaceId,
              github_repo: repo,
            },
            workspaceId,
          })
        }
      } else {
        // Existing task — anti-ping-pong: skip if task was just pushed
        if (existingTask.github_synced_at && Math.abs(existingTask.github_synced_at - issueUpdatedAt) < 10) {
          continue
        }

        // Only update if GitHub is newer
        if (issueUpdatedAt <= existingTask.updated_at) {
          continue
        }

        if (isOwnerMergeGatedTask(existingTask, resolveFlag('FEATURE_TWO_STEP_TERMINAL', {
          workspaceFlags: flagsRow?.feature_flags ?? null,
        }))) {
          const mergedPr = await mergedPullRequestEvidenceForTask(existingTask, opts?.webhookFixture)
          if (mergedPr) {
            if (existingTask.status === 'done') {
              continue
            }

            const transition = resolveTaskTerminalTransition({
              taskId: existingTask.id,
              currentStatus: existingTask.status,
              requestedStatus: 'done',
              producesPr: true,
              twoStepTerminalEnabled: true,
              transitionIntent: 'status_write',
              terminalEvent: READY_FOR_OWNER_TERMINAL_EVENT,
            })
            if (!transition.ok) {
              writeReadyForOwnerReconciliation(db, existingTask)
              continue
            }

            db.prepare(`
              UPDATE tasks
              SET title = ?, description = ?, status = ?, priority = ?,
                  completed_at = COALESCE(completed_at, ?),
                  github_synced_at = ?, updated_at = ?
              WHERE id = ? AND workspace_id = ?
            `).run(
              issue.title,
              issue.body || '',
              transition.status,
              labelToPriority(labelNames),
              now,
              now, now,
              existingTask.id, workspaceId,
            )

            const terminalPriority = labelToPriority(labelNames)
            const terminalLabels = [
              ...labelNames.filter(name =>
                !ALL_STATUS_LABEL_NAMES.includes(name)
                && !ALL_PRIORITY_LABEL_NAMES.includes(name),
              ),
              statusToLabel(transition.status as TaskStatus).name,
              priorityToLabel(terminalPriority).name,
            ]
            await updateIssue(repo, issue.number, {
              title: issue.title,
              body: issue.body || '',
              state: 'closed',
              labels: terminalLabels,
            })

            pulled++
            db_helpers.logActivity(
              'task_updated', 'task', existingTask.id, 'github-sync',
              `Updated from GitHub merged PR: ${repo}#${mergedPr.number}`,
              { github_issue: issue.number, github_repo: repo, github_pr_number: mergedPr.number, terminal_event: READY_FOR_OWNER_TERMINAL_EVENT },
              workspaceId,
            )
            const { advanceTaskChain } = await import('@/lib/task-dispatch')
            advanceTaskChain({
              taskId: existingTask.id,
              workspaceId,
              previousStatus: existingTask.status,
              trigger: READY_FOR_OWNER_TERMINAL_EVENT,
            })
            continue
          }

          if (issue.state === 'closed') {
            db.prepare(`
              UPDATE tasks
              SET title = ?, description = ?,
                  status = CASE WHEN status = 'done' THEN ? ELSE status END,
                  completed_at = CASE WHEN status = 'done' THEN NULL ELSE completed_at END,
                  priority = ?,
                  github_synced_at = ?, updated_at = ?
              WHERE id = ? AND workspace_id = ?
            `).run(
              issue.title,
              issue.body || '',
              READY_FOR_OWNER_STATUS,
              labelToPriority(labelNames),
              now, now,
              existingTask.id, workspaceId,
            )
            pulled++
            writeReadyForOwnerReconciliation(db, existingTask)
            continue
          }
        }

        const status = issue.state === 'closed' ? 'done' : (labelToStatus(
          labelNames.find(l => ALL_STATUS_LABEL_NAMES.includes(l)) || ''
        ) || existingTask.status)
        const priority = labelToPriority(labelNames)

        db.prepare(`
          UPDATE tasks
          SET title = ?, description = ?, status = ?, priority = ?,
              github_synced_at = ?, updated_at = ?
          WHERE id = ? AND workspace_id = ?
        `).run(
          issue.title,
          issue.body || '',
          status,
          priority,
          now, now,
          existingTask.id, workspaceId
        )

        pulled++
        db_helpers.logActivity(
          'task_updated', 'task', existingTask.id, 'github-sync',
          `Updated from GitHub: ${repo}#${issue.number}`,
          { github_issue: issue.number, github_repo: repo },
          workspaceId
        )
      }
    } catch (err) {
      logger.error({ err, issue: issue.number, repo }, 'Failed to sync GitHub issue')
    }
  }

  // Record sync
  db.prepare(`
    INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, project_id, changes_pushed, changes_pulled, workspace_id)
    VALUES (?, ?, ?, 'inbound', 'success', ?, ?, ?, ?)
  `).run(repo, now, pulled, project.id, pushed, pulled, workspaceId)

  logger.info({ repo, pulled, pushed, projectId: project.id }, 'GitHub sync completed')

  return automatic ? { pulled, pushed, cursor } : { pulled, pushed }
}

/**
 * Fire-and-forget outbound sync for a task to GitHub + GNAP.
 * Called after any status change — drag-drop, dispatch, Aegis, requeue.
 */
export function syncTaskOutbound(
  task: { id: number; title: string; status: string; priority: string; description?: string | null; github_issue_number?: number | null; github_repo?: string | null; project_id?: number | null; workspace_id?: number },
  workspaceId: number
): void {
  const db = getDatabase()
  try {
    // GitHub sync
    if (task.project_id) {
      const project = db.prepare(
        'SELECT id, github_repo, github_sync_enabled FROM projects WHERE id = ? AND workspace_id = ?'
      ).get(task.project_id, workspaceId) as { id: number; github_repo?: string | null; github_sync_enabled?: number | null } | undefined
      if (project?.github_sync_enabled) {
        pushTaskToGitHub(task as any, project).catch(err =>
          logger.warn({ err, taskId: task.id }, 'Outbound GitHub sync failed')
        )
      }
    }
  } catch (err) {
    logger.warn({ err, taskId: task.id }, 'GitHub sync lookup failed')
  }

  try {
    // GNAP sync
    const { config } = require('@/lib/config')
    if (config.gnap?.enabled && config.gnap?.repoPath) {
      const { pushTaskToGnap } = require('@/lib/gnap-sync')
      pushTaskToGnap(task, config.gnap.repoPath)
    }
  } catch (err) {
    logger.warn({ err, taskId: task.id }, 'GNAP sync failed')
  }
}

// ── SPEC-006 / FR-002 / FR-052: flag-gated area-routing activity helper ──────
//
// Single audited write site for `area_routing_resolved` and
// `area_routing_unresolved` activities. Callers (inbound routing in
// `pullFromGitHub`, backfill in `backfillAreaRouting`) MUST pass the workspace's
// resolved `FEATURE_AREA_LABEL_ROUTING` flag value as the first argument; when
// false, the helper is a deterministic no-op so flag-OFF parity is byte-exact
// (FR-001/002). When true, the helper inserts one activity row using the
// existing activities-table schema.
export interface AreaRoutingActivityArgs {
  type: 'area_routing_resolved' | 'area_routing_unresolved'
  entityId: number
  actor: string
  description: string
  data: Record<string, unknown>
  workspaceId: number
}

export function writeAreaRoutingActivity(
  flagOn: boolean,
  args: AreaRoutingActivityArgs,
): void {
  if (!flagOn) {
    // Flag-OFF parity: no activity write, no log, no side effects.
    return
  }
  const db = getDatabase()
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    VALUES (?, 'task', ?, ?, ?, ?, ?)
  `).run(
    args.type,
    args.entityId,
    args.actor,
    args.description,
    JSON.stringify(args.data),
    args.workspaceId,
  )
}

// ── SPEC-006 / Phase 7 (US5) — backfillAreaRouting (FR-019..FR-024) ──────
//
// First-time-flag-on bootstrap. Iterates GitHub-synced tasks in the
// workspace whose `area_routing_backfilled_at IS NULL`, applies the
// same FR-011..FR-014 routing rules using each task's stored labels
// (in `tasks.tags`, the column where ingest persists `area:*` labels),
// and updates `tasks.project_id` + sets the resume marker. Per-task
// transaction wraps SELECT/parse/UPDATE/INSERT activity. Failure on
// any task is isolated and logged via FR-027b structured log
// (`event='backfill_task_failed'`); the loop continues. After the
// loop drains, the workspace's `feature_flags.area_label_routing_backfill_completed_at`
// is set in a separate transaction iff zero pending rows remain.
//
// Idempotent: with `area_routing_backfilled_at IS NULL` predicate +
// the partial index `idx_tasks_area_routing_backfill_pending`, the
// resume scan is O(remaining tasks). The completion marker prevents
// re-invocation by the poller bootstrap.
//
// Monotonicity (FR-021a, FR-056): `area_routing_backfilled_at` is
// only ever set forward; failed transactions ROLLBACK so the marker
// stays NULL and the next resume retries. No code path resets the
// marker to NULL or decreases it.
//
// Tests: see SPEC-006 / T050-T057 in github-sync-engine.test.ts.
interface BackfillTaskRow {
  id: number
  project_id: number | null
  workspace_id: number
  github_repo: string | null
  github_issue_number: number | null
  tags: string | null
  area_routing_backfilled_at: number | null
}

function parseStoredLabels(tagsJson: string | null, taskId: number): string[] {
  if (tagsJson === null || tagsJson === undefined) return []
  try {
    const parsed = JSON.parse(tagsJson) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string')
    }
    return []
  } catch (err) {
    // FR-021: malformed JSON treated as no_label; log but do NOT abort.
    logger.warn(
      { err, taskId, event: 'backfill_task_label_parse_failed' },
      'backfill: failed to parse tasks.tags JSON',
    )
    return []
  }
}

export function backfillAreaRouting(
  db: Database.Database,
  workspaceId: number,
): void {
  // Build a per-workspace map of github_repo → owner project id. Tasks
  // are filtered to repos owned in this workspace; the owner project
  // also doubles as the syncOwnerProjectId for the no_triage fallback.
  const ownerRows = db
    .prepare(
      `SELECT id, github_repo FROM projects
       WHERE workspace_id = ? AND is_repo_sync_owner = 1 AND github_repo IS NOT NULL`,
    )
    .all(workspaceId) as Array<{ id: number; github_repo: string }>
  const repoToOwnerProjectId = new Map<string, number>()
  for (const r of ownerRows) {
    repoToOwnerProjectId.set(r.github_repo, r.id)
  }

  const cache = loadAreaRoutingCache(db, workspaceId)

  const pendingStmt = db.prepare(`
    SELECT id, project_id, workspace_id, github_repo, github_issue_number,
           tags, area_routing_backfilled_at
    FROM tasks
    WHERE workspace_id = ?
      AND github_issue_number IS NOT NULL
      AND area_routing_backfilled_at IS NULL
  `)

  const pending = pendingStmt.all(workspaceId) as BackfillTaskRow[]

  for (const row of pending) {
    if (!row.github_repo) continue
    const ownerProjectId = repoToOwnerProjectId.get(row.github_repo)
    if (ownerProjectId === undefined) {
      // No sync-owner project in this workspace claims this repo. Skip.
      continue
    }

    try {
      const labelNames = parseStoredLabels(row.tags, row.id)
      const areaLabels = parseAreaLabels(labelNames)
      const resolution = resolveAreaRouting(areaLabels, cache, ownerProjectId)
      const targetProjectId = resolution.resolvedProjectId ?? ownerProjectId
      const activityType: 'area_routing_resolved' | 'area_routing_unresolved' =
        resolution.reason === 'single_match'
          ? 'area_routing_resolved'
          : 'area_routing_unresolved'
      const description =
        resolution.reason === 'single_match'
          ? `Backfilled ${row.github_repo}#${row.github_issue_number} via area:${areaLabels[0]}`
          : `Backfilled ${row.github_repo}#${row.github_issue_number} (${resolution.reason})`

      const txn = db.transaction(() => {
        db.prepare(
          `UPDATE tasks
             SET project_id = ?,
                 area_routing_backfilled_at = unixepoch()
           WHERE id = ?`,
        ).run(targetProjectId, row.id)
        db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, 'task', ?, 'github-sync', ?, ?, ?)
        `).run(
          activityType,
          row.id,
          description,
          JSON.stringify({
            area_labels: areaLabels,
            resolved_project_id: targetProjectId,
            reason: resolution.reason,
            source: 'backfill',
            github_issue_number: row.github_issue_number,
            workspace_id: workspaceId,
            github_repo: row.github_repo,
          }),
          workspaceId,
        )
      })
      txn()
    } catch (err) {
      // FR-021 / FR-027b: per-task failure isolated and logged. The
      // transaction rolled back on throw; `area_routing_backfilled_at`
      // stays NULL so the next resume retries.
      logger.error(
        {
          event: 'backfill_task_failed',
          workspace_id: workspaceId,
          github_repo: row.github_repo,
          task_id: row.id,
          error_message: (err as Error)?.message,
          error_class: (err as Error)?.name ?? 'UnknownError',
        },
        'backfill: per-task transaction failed',
      )
      continue
    }
  }

  // Completion marker (FR-022). Set ONLY when the pending predicate is
  // empty. Runs in its own statement (separate transaction). If this
  // UPDATE itself fails, the next bootstrap finds zero pending rows
  // and re-runs to set the marker without reprocessing.
  const remaining = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM tasks
         WHERE workspace_id = ?
           AND github_issue_number IS NOT NULL
           AND area_routing_backfilled_at IS NULL`,
      )
      .get(workspaceId) as { c: number }
  ).c
  if (remaining === 0) {
    try {
      db.prepare(
        `UPDATE workspaces
           SET feature_flags = json_patch(
             COALESCE(feature_flags, '{}'),
             json_object('area_label_routing_backfill_completed_at', unixepoch())
           )
         WHERE id = ?`,
      ).run(workspaceId)
    } catch (err) {
      logger.error(
        {
          event: 'backfill_marker_update_failed',
          workspace_id: workspaceId,
          error_message: (err as Error)?.message,
          error_class: (err as Error)?.name ?? 'UnknownError',
        },
        'backfill: completion-marker UPDATE failed; next bootstrap will retry',
      )
    }
  }
}
