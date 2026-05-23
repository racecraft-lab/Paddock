import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { evaluateFeatureFlagCore } from '@/lib/feature-flags'
import { pullFromGitHub } from '@/lib/github-sync-engine'
import { getLifecycleStatusForScope } from '@/lib/github-sync-lifecycle'
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

    if (action === 'trigger' && typeof project_id === 'number') {
      const workspaceId = requireSingleGitHubWorkspace(scope)
      if (workspaceId instanceof NextResponse) return workspaceId

      const project = db.prepare(`
        SELECT id, github_repo, github_sync_enabled, github_default_branch
        FROM projects
        WHERE id = ? AND workspace_id = ? AND status = 'active'
      `).get(project_id, workspaceId) as any | undefined

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      if (!project.github_repo || !project.github_sync_enabled) {
        return NextResponse.json({ error: 'GitHub sync not enabled for this project' }, { status: 400 })
      }

      const result = await pullFromGitHub(project, workspaceId)
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'trigger-all') {
      const workspaceFilter = workspaceScopePredicate(scope)
      const projects = db.prepare(`
        SELECT id, workspace_id, github_repo, github_sync_enabled, github_default_branch
        FROM projects
        WHERE github_sync_enabled = 1 AND github_repo IS NOT NULL AND ${workspaceFilter.sql} AND status = 'active'
      `).all(...workspaceFilter.params) as any[]

      let totalPulled = 0
      let totalPushed = 0

      for (const project of projects) {
        try {
          const result = await pullFromGitHub(project, project.workspace_id)
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
