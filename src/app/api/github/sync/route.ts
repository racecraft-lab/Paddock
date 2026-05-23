import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { evaluateFeatureFlagCore } from '@/lib/feature-flags'
import { pullFromGitHub } from '@/lib/github-sync-engine'
import {
  acquireLifecycleLease,
  classifyGitHubSyncFailure,
  completeLifecycleRun,
  computeLifecycleRetry,
  getLifecycleStatusForScope,
  recordLifecycleRejectedOverlap,
  recordLifecycleRunStarted,
} from '@/lib/github-sync-lifecycle'
import {
  GITHUB_SYNC_AUTOMATION_FLAG,
  GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION,
  serializeLifecycleEnvelope,
} from '@/lib/github-sync-lifecycle-api'
import type { LifecycleHealthSummary, LifecycleScopeStatus } from '@/lib/github-sync-lifecycle-types'
import { getSyncPollerStatus } from '@/lib/github-sync-poller'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
  type AcceptedWorkspaceScope,
} from '@/lib/workspaces'
import type Database from 'better-sqlite3'

interface GitHubSyncProject {
  id: number
  workspace_id?: number
  github_repo: string
  github_sync_enabled: number
  github_default_branch: string | null
}

interface ManualLifecycleControl {
  workspace_id: number
  github_repo: string
  interval_seconds: number
  max_duration_seconds: number
  last_success_cursor: string | null
  consecutive_failures: number
  lease_run_id: string | null
  lease_owner: string | null
  lease_started_at: number | null
  lease_expires_at: number | null
}

interface ManualSyncResult {
  pulled: number
  pushed: number
  cursor?: string | null
}

function requireSingleGitHubWorkspace(scope: AcceptedWorkspaceScope): number | NextResponse {
  if (scope.workspaceId == null) {
    return NextResponse.json({ error: 'Product Line workspace_id is required for GitHub sync actions' }, { status: 400 })
  }
  return scope.workspaceId
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT 1 AS ok
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName) as { ok: number } | undefined
  return Boolean(row)
}

function lifecycleSchemaVersion(db: Database.Database): typeof GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION | 'unavailable' {
  if (!tableExists(db, 'github_sync_lifecycle_controls') || !tableExists(db, 'github_sync_lifecycle_runs')) {
    return 'unavailable'
  }
  const row = db.prepare(`
    SELECT id
    FROM schema_migrations
    WHERE id = ?
    LIMIT 1
  `).get(GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION) as { id: string } | undefined
  return row ? GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION : 'unavailable'
}

function workspaceFlagsForEnvelope(
  db: Database.Database,
  scope: AcceptedWorkspaceScope,
  fallbackWorkspaceId?: number,
): string | null {
  const workspaceId = scope.workspaceId ?? fallbackWorkspaceId ?? scope.workspaceIds[0]
  if (!workspaceId) return null
  const row = db.prepare(`
    SELECT feature_flags
    FROM workspaces
    WHERE id = ?
    LIMIT 1
  `).get(workspaceId) as { feature_flags: string | null } | undefined
  return row?.feature_flags ?? null
}

function featureFlagDisabledHealth(status: LifecycleScopeStatus): LifecycleHealthSummary {
  return {
    ...status.diagnostics.health_summary,
    severity: 'disabled',
    reason: 'feature flag disabled',
    state_drivers: ['feature_flag_disabled'],
    manual_fallback_available: true,
  }
}

function applyLifecycleFlagHealth(
  status: LifecycleScopeStatus,
  flagEnabled: boolean,
): LifecycleScopeStatus {
  if (flagEnabled) return status
  return {
    ...status,
    diagnostics: {
      ...status.diagnostics,
      health_summary: featureFlagDisabledHealth(status),
    },
  }
}

function getLifecycleScopes(
  db: Database.Database,
  scope: AcceptedWorkspaceScope,
  flagEnabled: boolean,
  now: number,
): LifecycleScopeStatus[] {
  if (lifecycleSchemaVersion(db) === 'unavailable') return []
  const workspaceFilter = workspaceScopePredicate(scope)
  const rows = db.prepare(`
    SELECT workspace_id, github_repo
    FROM github_sync_lifecycle_controls
    WHERE ${workspaceFilter.sql}
    ORDER BY workspace_id ASC, github_repo ASC
  `).all(...workspaceFilter.params) as Array<{ workspace_id: number; github_repo: string }>

  return rows.map((row) => applyLifecycleFlagHealth(
    getLifecycleStatusForScope(db, {
      workspace_id: row.workspace_id,
      github_repo: row.github_repo,
      now,
    }),
    flagEnabled,
  ))
}

function toIso(epochSeconds: number | null | undefined): string | null {
  return epochSeconds == null ? null : new Date(epochSeconds * 1000).toISOString()
}

function readManualLifecycleControl(
  db: Database.Database,
  workspaceId: number,
  githubRepo: string,
): ManualLifecycleControl | undefined {
  if (lifecycleSchemaVersion(db) === 'unavailable') return undefined
  return db.prepare(`
    SELECT workspace_id, github_repo, interval_seconds, max_duration_seconds,
           last_success_cursor, consecutive_failures, lease_run_id, lease_owner,
           lease_started_at, lease_expires_at
    FROM github_sync_lifecycle_controls
    WHERE workspace_id = ? AND github_repo = ?
    LIMIT 1
  `).get(workspaceId, githubRepo) as ManualLifecycleControl | undefined
}

function manualRunId(project: Pick<GitHubSyncProject, 'id'>, workspaceId: number, now: number): string {
  return `ghsync_manual_${now}_${workspaceId}_${project.id}`
}

function manualLeaseOwner(user: { id: number; username?: string | null }): string {
  return `operator:${user.username || user.id}`
}

function triggerFromLeaseOwner(leaseOwner: string | null): 'manual' | 'automatic' {
  return leaseOwner?.startsWith('operator:') ? 'manual' : 'automatic'
}

function activeRunPayload(control: ManualLifecycleControl) {
  return {
    run_id: control.lease_run_id,
    trigger: triggerFromLeaseOwner(control.lease_owner),
    workspace_id: control.workspace_id,
    github_repo: control.github_repo,
    lease_owner: control.lease_owner,
    started_at: toIso(control.lease_started_at),
    lease_expires_at: toIso(control.lease_expires_at),
  }
}

function retryAfterSeconds(control: ManualLifecycleControl, now: number): number {
  return Math.max(0, (control.lease_expires_at ?? now) - now)
}

function hasActiveLease(control: ManualLifecycleControl, now: number): boolean {
  return Boolean(control.lease_run_id && control.lease_expires_at && control.lease_expires_at > now)
}

function recordManualRejectedOverlap(
  db: Database.Database,
  input: {
    project: Pick<GitHubSyncProject, 'id'>
    control: ManualLifecycleControl
    run_id: string
    retry_after_seconds: number
    now: number
  },
): void {
  if (!input.control.lease_run_id || !input.control.lease_expires_at) return
  recordLifecycleRejectedOverlap(db, {
    run_id: input.run_id,
    workspace_id: input.control.workspace_id,
    github_repo: input.control.github_repo,
    trigger: 'manual',
    project_id: input.project.id,
    cursor_before: input.control.last_success_cursor,
    conflicting_run_id: input.control.lease_run_id,
    retry_after_seconds: input.retry_after_seconds,
    lease_expires_at: input.control.lease_expires_at,
    now: input.now,
  })
}

function manualOverlapResponse(
  db: Database.Database,
  input: {
    project: Pick<GitHubSyncProject, 'id'>
    control: ManualLifecycleControl
    run_id: string
    error: string
    now: number
  },
): NextResponse {
  const retry = retryAfterSeconds(input.control, input.now)
  recordManualRejectedOverlap(db, {
    project: input.project,
    control: input.control,
    run_id: input.run_id,
    retry_after_seconds: retry,
    now: input.now,
  })
  return NextResponse.json({
    ok: false,
    error: input.error,
    code: 'github_sync_overlap',
    active_run: activeRunPayload(input.control),
    retry_after_seconds: retry,
  }, { status: 409 })
}

async function runManualProjectSyncWithLifecycle(
  db: Database.Database,
  input: {
    project: GitHubSyncProject
    workspaceId: number
    control: ManualLifecycleControl
    actor: string
    now: number
  },
): Promise<{ ok: true; result: ManualSyncResult } | { ok: false; response: NextResponse }> {
  const run_id = manualRunId(input.project, input.workspaceId, input.now)
  const lease = acquireLifecycleLease(db, {
    workspace_id: input.workspaceId,
    github_repo: input.project.github_repo,
    run_id,
    lease_owner: input.actor,
    now: input.now,
    max_duration_seconds: input.control.max_duration_seconds,
  })
  if (!lease.acquired) {
    const refreshed = readManualLifecycleControl(db, input.workspaceId, input.project.github_repo) ?? input.control
    return {
      ok: false,
      response: manualOverlapResponse(db, {
        project: input.project,
        control: refreshed,
        run_id,
        error: 'GitHub sync already running for this scope',
        now: input.now,
      }),
    }
  }

  recordLifecycleRunStarted(db, {
    run_id,
    workspace_id: input.workspaceId,
    github_repo: input.project.github_repo,
    trigger: 'manual',
    lease_owner: input.actor,
    project_id: input.project.id,
    cursor_before: input.control.last_success_cursor,
    now: input.now,
  })

  try {
    const result = await pullFromGitHub(input.project, input.workspaceId) as ManualSyncResult
    completeLifecycleRun(db, {
      run_id,
      result: 'success',
      cursor_after: result.cursor ?? input.control.last_success_cursor,
      next_retry_at: input.now + input.control.interval_seconds,
      now: Math.floor(Date.now() / 1000),
    })
    return { ok: true, result }
  } catch (err) {
    const failure = classifyGitHubSyncFailure(err)
    const retry = computeLifecycleRetry({
      now: input.now,
      failure_count: input.control.consecutive_failures + 1,
      max_backoff_seconds: 30 * 60,
    })
    completeLifecycleRun(db, {
      run_id,
      result: 'failed',
      failure_reason: failure.category,
      failure_message: failure.sanitized_message,
      cursor_after: input.control.last_success_cursor,
      backoff_seconds: retry.seconds,
      next_retry_at: retry.next_retry_at,
      now: Math.floor(Date.now() / 1000),
    })
    throw err
  }
}

/**
 * GET /api/github/sync — sync status for all GitHub-linked projects.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user, {
      requireExplicitWhenEnabled: false,
    })
    const workspaceFilter = workspaceScopePredicate(scope, 'gs.workspace_id')

    const syncs = db.prepare(`
      SELECT
        gs.project_id,
        p.name as project_name,
        p.github_repo,
        MAX(gs.last_synced_at) as last_synced_at,
        SUM(gs.changes_pushed) as total_pushed,
        SUM(gs.changes_pulled) as total_pulled,
        COUNT(*) as sync_count
      FROM github_syncs gs
      LEFT JOIN projects p ON p.id = gs.project_id AND p.workspace_id = gs.workspace_id
      WHERE ${workspaceFilter.sql} AND gs.project_id IS NOT NULL
      GROUP BY gs.project_id
      ORDER BY last_synced_at DESC
    `).all(...workspaceFilter.params)

    const poller = getSyncPollerStatus()
    const schemaVersion = lifecycleSchemaVersion(db)
    const flag = evaluateFeatureFlagCore(GITHUB_SYNC_AUTOMATION_FLAG, {
      workspaceFlags: workspaceFlagsForEnvelope(db, scope, auth.user.workspace_id),
    })
    const now = Math.floor(Date.now() / 1000)
    const github_sync_lifecycle = serializeLifecycleEnvelope({
      generated_at: new Date(now * 1000).toISOString(),
      flag: { key: GITHUB_SYNC_AUTOMATION_FLAG, enabled: flag.value, reason: flag.reason },
      scopes: schemaVersion === 'unavailable' ? [] : getLifecycleScopes(db, scope, flag.value, now),
      scheduler_task_registered: true,
      schema_version: schemaVersion,
    })

    return NextResponse.json({ syncs, poller, github_sync_lifecycle })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/github/sync error')
    return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
  }
}

/**
 * POST /api/github/sync — trigger sync manually.
 * Body: { action: 'trigger', project_id: number } or { action: 'trigger-all' }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { action, project_id } = body
    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user, {
      body,
      requireExplicitWhenEnabled: false,
    })
    const now = Math.floor(Date.now() / 1000)
    const actor = manualLeaseOwner(auth.user)

    if (action === 'trigger' && typeof project_id === 'number') {
      const workspaceId = requireSingleGitHubWorkspace(scope)
      if (workspaceId instanceof NextResponse) return workspaceId

      const project = db.prepare(`
        SELECT id, github_repo, github_sync_enabled, github_default_branch
        FROM projects
        WHERE id = ? AND workspace_id = ? AND status = 'active'
      `).get(project_id, workspaceId) as GitHubSyncProject | undefined

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      if (!project.github_repo || !project.github_sync_enabled) {
        return NextResponse.json({ error: 'GitHub sync not enabled for this project' }, { status: 400 })
      }

      const control = readManualLifecycleControl(db, workspaceId, project.github_repo)
      if (control && hasActiveLease(control, now)) {
        return manualOverlapResponse(db, {
          project,
          control,
          run_id: manualRunId(project, workspaceId, now),
          error: 'GitHub sync already running for this scope',
          now,
        })
      }

      const wrapped = control
        ? await runManualProjectSyncWithLifecycle(db, { project, workspaceId, control, actor, now })
        : { ok: true as const, result: await pullFromGitHub(project, workspaceId) as ManualSyncResult }
      if (!wrapped.ok) return wrapped.response
      const result = wrapped.result
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'trigger-all') {
      const workspaceFilter = workspaceScopePredicate(scope)
      const projects = db.prepare(`
        SELECT id, workspace_id, github_repo, github_sync_enabled, github_default_branch
        FROM projects
        WHERE github_sync_enabled = 1 AND github_repo IS NOT NULL AND ${workspaceFilter.sql} AND status = 'active'
      `).all(...workspaceFilter.params) as Required<GitHubSyncProject>[]

      const conflicts = []
      for (const project of projects) {
        const control = readManualLifecycleControl(db, project.workspace_id, project.github_repo)
        if (!control || !hasActiveLease(control, now)) continue
        const retry = retryAfterSeconds(control, now)
        recordManualRejectedOverlap(db, {
          project,
          control,
          run_id: manualRunId(project, project.workspace_id, now),
          retry_after_seconds: retry,
          now,
        })
        conflicts.push({
          workspace_id: project.workspace_id,
          github_repo: project.github_repo,
          active_run: activeRunPayload(control),
          retry_after_seconds: retry,
        })
      }

      if (conflicts.length > 0) {
        return NextResponse.json({
          ok: false,
          error: 'GitHub sync already running for one or more requested scopes',
          code: 'github_sync_overlap',
          conflicts,
        }, { status: 409 })
      }

      let totalPulled = 0
      let totalPushed = 0

      for (const project of projects) {
        try {
          const control = readManualLifecycleControl(db, project.workspace_id, project.github_repo)
          const wrapped = control
            ? await runManualProjectSyncWithLifecycle(db, {
                project,
                workspaceId: project.workspace_id,
                control,
                actor,
                now,
              })
            : { ok: true as const, result: await pullFromGitHub(project, project.workspace_id) as ManualSyncResult }
          if (!wrapped.ok) {
            logger.error({ projectId: project.id }, 'Trigger-all: lifecycle lease conflict after preflight')
            continue
          }
          const result = wrapped.result
          totalPulled += result.pulled
          totalPushed += result.pushed
        } catch (err) {
          logger.error({ err, projectId: project.id }, 'Trigger-all: project sync failed')
        }
      }

      return NextResponse.json({
        ok: true,
        projects_synced: projects.length,
        pulled: totalPulled,
        pushed: totalPushed,
      })
    }

    return NextResponse.json({ error: 'Unknown action. Use trigger or trigger-all' }, { status: 400 })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/github/sync error')
    return NextResponse.json({ error: 'Sync trigger failed' }, { status: 500 })
  }
}
