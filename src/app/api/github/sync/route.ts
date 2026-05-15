import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { pullFromGitHub } from '@/lib/github-sync-engine'
import { getSyncPollerStatus } from '@/lib/github-sync-poller'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
  type AcceptedWorkspaceScope,
} from '@/lib/workspaces'

function requireSingleGitHubWorkspace(scope: AcceptedWorkspaceScope): number | NextResponse {
  if (scope.workspaceId == null) {
    return NextResponse.json({ error: 'Product Line workspace_id is required for GitHub sync actions' }, { status: 400 })
  }
  return scope.workspaceId
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

    return NextResponse.json({ syncs, poller })
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
