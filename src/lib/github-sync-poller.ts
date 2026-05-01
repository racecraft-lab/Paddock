/**
 * Background poller for GitHub ↔ MC task sync.
 * Lazy singleton — call startSyncPoller() to begin.
 */

import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { pullFromGitHub, backfillAreaRouting } from '@/lib/github-sync-engine'
import { resolveFlag } from '@/lib/feature-flags'

const INTERVAL_MS = parseInt(process.env.GITHUB_SYNC_INTERVAL_MS || '60000', 10)

let intervalHandle: ReturnType<typeof setInterval> | null = null
let lastRun: number | undefined

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
  return {
    running: intervalHandle !== null,
    interval: INTERVAL_MS,
    lastRun,
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
          // FR-018 (US2): only the is_repo_sync_owner=1 project for this
          // (workspace_id, github_repo) is allowed to poll. Non-owner rows
          // are skipped silently to keep this branch a pure read-side
          // filter (no DB writes from the poller).
          const ownerRow = db.prepare(`
            SELECT id FROM projects
            WHERE workspace_id = ?
              AND github_repo = ?
              AND is_repo_sync_owner = 1
              AND status = 'active'
            LIMIT 1
          `).get(project.workspace_id, project.github_repo) as
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
