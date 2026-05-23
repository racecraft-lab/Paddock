/**
 * Background poller for GitHub ↔ MC task sync.
 * Lazy singleton — call startSyncPoller() to begin.
 */

import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { pullFromGitHub, backfillAreaRouting } from '@/lib/github-sync-engine'
import { resolveFlag } from '@/lib/feature-flags'
import {
  acquireLifecycleLease,
  classifyGitHubSyncFailure,
  completeLifecycleRun,
  computeLifecycleRetry,
  recordLifecycleOwnershipUnresolved,
  recordLifecycleRunStarted,
  recordLifecycleSkippedNonOwner,
  recordLifecycleSkippedOverlap,
} from '@/lib/github-sync-lifecycle'
import { GITHUB_SYNC_AUTOMATION_FLAG } from '@/lib/github-sync-lifecycle-types'

const INTERVAL_MS = parseInt(process.env.GITHUB_SYNC_INTERVAL_MS || '60000', 10)

let intervalHandle: ReturnType<typeof setInterval> | null = null
let lastRun: number | undefined

interface AutomationTickOptions {
  now?: number
  candidateLimit?: number
  leaseOwner?: string
}

interface AutomationControlCandidate {
  workspace_id: number
  github_repo: string
  interval_seconds: number
  max_pages: number
  max_issues: number
  max_duration_seconds: number
  owner_project_id: number | null
  last_success_cursor: string | null
  consecutive_failures: number
}

interface AutomationProjectCandidate {
  id: number
  github_repo: string
  github_sync_enabled: number
  github_default_branch: string | null
  workspace_id: number
  is_repo_sync_owner: number
}

interface AutomationTickResult {
  ok: boolean
  message: string
  scopesConsidered: number
  scopesStarted: number
  scopesSkipped: number
}

export function startSyncPoller(): void {
  if (intervalHandle) return

  logger.info({ intervalMs: INTERVAL_MS }, 'Starting GitHub sync poller')

  intervalHandle = setInterval(async () => {
    await runSyncTick()
  }, INTERVAL_MS)

  // Run immediately on start
  runSyncTick().catch(() => {})
}

export function stopSyncPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    logger.info('GitHub sync poller stopped')
  }
}

export function getSyncPollerStatus(): { running: boolean; interval: number; lastRun?: number } {
  const status: { running: boolean; interval: number; lastRun?: number } = {
    running: intervalHandle !== null,
    interval: INTERVAL_MS,
  }
  if (lastRun !== undefined) status.lastRun = lastRun
  return status
}

function runIdFor(scope: AutomationControlCandidate, now: number): string {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `ghsync_${now}_${scope.workspace_id}_${suffix}`
}

function readWorkspaceFlags(db: ReturnType<typeof getDatabase>, workspaceId: number): string | null {
  try {
    const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as
      | { feature_flags: string | null }
      | undefined
    return row?.feature_flags ?? null
  } catch {
    return null
  }
}

function selectAutomationProjects(
  db: ReturnType<typeof getDatabase>,
  candidate: AutomationControlCandidate,
): AutomationProjectCandidate[] {
  return db.prepare(`
    SELECT id, github_repo, github_sync_enabled, github_default_branch, workspace_id, is_repo_sync_owner
    FROM projects
    WHERE workspace_id = ?
      AND github_repo = ?
      AND github_sync_enabled = 1
      AND status = 'active'
    ORDER BY id ASC
  `).all(candidate.workspace_id, candidate.github_repo) as AutomationProjectCandidate[]
}

function resolveAutomationOwner(projects: AutomationProjectCandidate[]): {
  project?: AutomationProjectCandidate
  nonOwners: AutomationProjectCandidate[]
  unresolved: boolean
  reason?: string
} {
  if (projects.length === 0) {
    return { nonOwners: [], unresolved: true, reason: 'no_enabled_project' }
  }
  if (projects.length === 1) {
    return { project: projects[0], nonOwners: [], unresolved: false, reason: 'single_project' }
  }

  const owners = projects.filter((project) => project.is_repo_sync_owner === 1)
  if (owners.length !== 1) {
    return {
      nonOwners: [],
      unresolved: true,
      reason: owners.length === 0 ? 'no_repo_sync_owner' : 'multiple_repo_sync_owners',
    }
  }

  return {
    project: owners[0],
    nonOwners: projects.filter((project) => project.id !== owners[0].id),
    unresolved: false,
    reason: 'owner_selected',
  }
}

function persistAutomationOwner(
  db: ReturnType<typeof getDatabase>,
  candidate: AutomationControlCandidate,
  ownerProjectId: number | null,
  now: number,
): void {
  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET owner_project_id = ?, updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(ownerProjectId, now, candidate.workspace_id, candidate.github_repo)
}

export async function runGitHubSyncAutomationTick(
  options: AutomationTickOptions = {},
): Promise<AutomationTickResult> {
  const db = getDatabase()
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const limit = Math.max(1, Math.min(options.candidateLimit ?? 10, 100))
  const leaseOwner = options.leaseOwner ?? 'scheduler:github_sync_automation'
  const candidates = db.prepare(`
    SELECT workspace_id, github_repo, interval_seconds, max_pages, max_issues,
           max_duration_seconds, owner_project_id, last_success_cursor, consecutive_failures
    FROM github_sync_lifecycle_controls
    WHERE enabled = 1
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY COALESCE(next_retry_at, 0) ASC, workspace_id ASC, github_repo ASC
    LIMIT ?
  `).all(now, limit) as AutomationControlCandidate[]

  let scopesStarted = 0
  let scopesSkipped = 0

  for (const candidate of candidates) {
    const workspaceFlags = readWorkspaceFlags(db, candidate.workspace_id)
    const flagOn = resolveFlag(GITHUB_SYNC_AUTOMATION_FLAG, { workspaceFlags })
    if (!flagOn) {
      scopesSkipped++
      continue
    }

    const projects = selectAutomationProjects(db, candidate)
    const ownership = resolveAutomationOwner(projects)
    const eligibleProjectIds = projects.map((project) => project.id)
    if (ownership.unresolved || !ownership.project) {
      recordLifecycleOwnershipUnresolved(db, {
        run_id: runIdFor(candidate, now),
        workspace_id: candidate.workspace_id,
        github_repo: candidate.github_repo,
        trigger: 'automatic',
        cursor_before: candidate.last_success_cursor,
        eligible_project_ids: eligibleProjectIds,
        reason: ownership.reason,
        now,
      })
      scopesSkipped++
      continue
    }
    const project = ownership.project
    persistAutomationOwner(db, candidate, project.id, now)
    for (const skippedProject of ownership.nonOwners) {
      recordLifecycleSkippedNonOwner(db, {
        run_id: runIdFor(candidate, now),
        workspace_id: candidate.workspace_id,
        github_repo: candidate.github_repo,
        trigger: 'automatic',
        project_id: skippedProject.id,
        owner_project_id: project.id,
        cursor_before: candidate.last_success_cursor,
        eligible_project_ids: eligibleProjectIds,
        skipped_project_ids: [skippedProject.id],
        reason: ownership.reason,
        now,
      })
      scopesSkipped++
    }

    const run_id = runIdFor(candidate, now)
    const lease = acquireLifecycleLease(db, {
      workspace_id: candidate.workspace_id,
      github_repo: candidate.github_repo,
      run_id,
      lease_owner: leaseOwner,
      now,
      max_duration_seconds: candidate.max_duration_seconds,
    })
    if (!lease.acquired) {
      recordLifecycleSkippedOverlap(db, {
        run_id,
        workspace_id: candidate.workspace_id,
        github_repo: candidate.github_repo,
        trigger: 'automatic',
        cursor_before: candidate.last_success_cursor,
        conflicting_run_id: lease.conflict.run_id,
        retry_after_seconds: lease.conflict.retry_after_seconds,
        lease_expires_at: now + lease.conflict.retry_after_seconds,
        now,
      })
      scopesSkipped++
      continue
    }

    scopesStarted++
    recordLifecycleRunStarted(db, {
      run_id,
      workspace_id: candidate.workspace_id,
      github_repo: candidate.github_repo,
      trigger: 'automatic',
      lease_owner: leaseOwner,
      project_id: project.id,
      cursor_before: candidate.last_success_cursor,
      now,
    })

    try {
      const result = await pullFromGitHub(project, candidate.workspace_id, {
        automatic: {
          cursor: candidate.last_success_cursor,
          maxPages: candidate.max_pages,
          maxIssues: candidate.max_issues,
          maxDurationMs: candidate.max_duration_seconds * 1000,
        },
      })
      completeLifecycleRun(db, {
        run_id,
        result: result.result === 'partial' ? 'partial' : 'success',
        partial_run_reason: result.partialRunReason ?? null,
        cursor_after: result.cursor ?? candidate.last_success_cursor,
        next_retry_at: now + candidate.interval_seconds,
        now: Math.floor(Date.now() / 1000),
      })
    } catch (err) {
      const failure = classifyGitHubSyncFailure(err)
      const headers = err && typeof err === 'object' && 'headers' in err && typeof err.headers === 'object'
        ? err.headers as Record<string, unknown>
        : undefined
      const retry = computeLifecycleRetry({
        now,
        failure_count: candidate.consecutive_failures + 1,
        max_backoff_seconds: 30 * 60,
        headers,
      })
      completeLifecycleRun(db, {
        run_id,
        result: 'failed',
        failure_reason: failure.category,
        failure_message: failure.sanitized_message,
        failure_redaction_applied: failure.redaction_applied,
        cursor_after: candidate.last_success_cursor,
        backoff_seconds: retry.seconds,
        next_retry_at: retry.next_retry_at,
        retry_plan: retry,
        now: Math.floor(Date.now() / 1000),
      })
    }
  }

  return {
    ok: true,
    message: `GitHub sync automation: ${scopesStarted} started, ${scopesSkipped} skipped`,
    scopesConsidered: candidates.length,
    scopesStarted,
    scopesSkipped,
  }
}

async function runSyncTick(): Promise<void> {
  try {
    const db = getDatabase()

    // Legacy candidate selection (FR-002, FR-018 OFF branch). The poller
    // continues to select per-project rows here; the owner-only filter
    // (`is_repo_sync_owner = 1`) is wired in T027 (US2) via the per-row
    // branch below — NOT by changing this SELECT.
    const projects = db.prepare(`
      SELECT id, github_repo, github_sync_enabled, github_default_branch, workspace_id
      FROM projects
      WHERE github_sync_enabled = 1 AND github_repo IS NOT NULL AND status = 'active'
    `).all() as Array<{
      id: number
      github_repo: string
      github_sync_enabled: number
      github_default_branch: string | null
      workspace_id: number
    }>

    // FR-052 — per-row resolveFlag mixed-tenant guard. We read each
    // workspace's `feature_flags` JSON exactly once per tick (cached in
    // `flagsByWorkspace`) and call `resolveFlag` per candidate row so an
    // ON-workspace's flag value cannot leak into an OFF-workspace's
    // selection branch. The ON branch's owner-only behavior change lands
    // in T027 (US2); for US1 the call site is auditable but does NOT
    // change behavior — flag-OFF parity is preserved byte-for-byte.
    const flagsByWorkspace = new Map<number, string | null>()
    const readFlagsStmt = db.prepare(
      'SELECT feature_flags FROM workspaces WHERE id = ?',
    )
    const flagsForWorkspace = (workspaceId: number): string | null => {
      if (flagsByWorkspace.has(workspaceId)) {
        return flagsByWorkspace.get(workspaceId) ?? null
      }
      let value: string | null = null
      try {
        const row = readFlagsStmt.get(workspaceId) as
          | { feature_flags: string | null }
          | undefined
        value = row?.feature_flags ?? null
      } catch {
        value = null
      }
      flagsByWorkspace.set(workspaceId, value)
      return value
    }

    // SPEC-006 / FR-019, FR-022 (T059): first-flag-on bootstrap. For each
    // workspace whose flag is ON and whose backfill completion marker is
    // unset, run `backfillAreaRouting(db, workspaceId)` once before the
    // legacy/owner-filtered project loop. The marker (set inside
    // backfillAreaRouting) is the durable gate — re-invocations are no-ops
    // because the predicate `area_routing_backfilled_at IS NULL` returns
    // zero rows.
    const distinctWorkspaceIds = new Set<number>(projects.map((p) => p.workspace_id))
    for (const workspaceId of distinctWorkspaceIds) {
      try {
        const workspaceFlags = flagsForWorkspace(workspaceId)
        const areaRoutingOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
          workspaceFlags,
        })
        if (!areaRoutingOn) continue
        let alreadyDone = false
        if (workspaceFlags) {
          try {
            const parsed = JSON.parse(workspaceFlags) as Record<string, unknown>
            alreadyDone = parsed.area_label_routing_backfill_completed_at !== undefined
          } catch {
            alreadyDone = false
          }
        }
        if (alreadyDone) continue
        backfillAreaRouting(db, workspaceId)
        // Refresh the cache so the post-bootstrap pollers see the marker.
        flagsByWorkspace.delete(workspaceId)
      } catch (err) {
        logger.error(
          { err, workspaceId, event: 'backfill_bootstrap_failed' },
          'Sync poller: backfill bootstrap failed',
        )
      }
    }

    // Prepare the owner-filter statement once outside the loop so we don't
    // recompile it per candidate project. Includes `github_sync_enabled = 1`
    // to match the M63 election semantics — a row that has
    // is_repo_sync_owner=1 but sync disabled should NOT be treated as the
    // owner; otherwise we'd skip every other enabled project for that repo
    // and the workspace would silently stop syncing.
    const ownerFilterStmt = db.prepare(`
      SELECT id FROM projects
      WHERE workspace_id = ?
        AND github_repo = ?
        AND is_repo_sync_owner = 1
        AND github_sync_enabled = 1
        AND status = 'active'
      LIMIT 1
    `)

    for (const project of projects) {
      try {
        const workspaceFlags = flagsForWorkspace(project.workspace_id)
        // Per-row resolveFlag (FR-052). When ON, owner-filter (FR-018, T027):
        // skip rows whose project is NOT the elected sync owner for the
        // (workspace_id, github_repo) group. The legacy per-project SELECT
        // above is unchanged so flag-OFF behavior is byte-identical.
        const areaRoutingOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
          workspaceFlags,
        })

        if (areaRoutingOn) {
          // FR-018 (US2): only the is_repo_sync_owner=1 + sync-enabled
          // project for this (workspace_id, github_repo) is allowed to
          // poll. Non-owner rows are skipped silently to keep this branch
          // a pure read-side filter (no DB writes from the poller).
          const ownerRow = ownerFilterStmt.get(project.workspace_id, project.github_repo) as
            | { id: number }
            | undefined
          if (!ownerRow || ownerRow.id !== project.id) {
            continue
          }
        }

        await pullFromGitHub(project, project.workspace_id)
      } catch (err) {
        logger.error({ err, projectId: project.id, repo: project.github_repo }, 'Sync poller: project sync failed')
      }
    }

    lastRun = Math.floor(Date.now() / 1000)
  } catch (err) {
    logger.error({ err }, 'Sync poller tick failed')
  }
}

/**
 * Test-only export: drives a single sync tick. Intended for vitest in
 * `src/lib/__tests__/spec006-poller.test.ts` and similar harnesses.
 *
 * Production callers MUST go through `startSyncPoller()` so the interval
 * scheduler manages lifecycle.
 */
export async function runSyncTickForTest(): Promise<void> {
  await runSyncTick()
}

export async function runGitHubSyncAutomationTickForTest(
  options: AutomationTickOptions = {},
): Promise<AutomationTickResult> {
  return runGitHubSyncAutomationTick(options)
}
