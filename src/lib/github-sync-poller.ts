/**
 * Background poller for GitHub ↔ MC task sync.
 * Lazy singleton — call startSyncPoller() to begin.
 */

import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { pullFromGitHub } from '@/lib/github-sync-engine'
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

    for (const project of projects) {
      try {
        const workspaceFlags = flagsForWorkspace(project.workspace_id)
        // Per-row resolveFlag (FR-052). The boolean is currently observed
        // for audit only — the owner-only candidate filter is T027.
        const _areaRoutingOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
          workspaceFlags,
        })
        void _areaRoutingOn

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
