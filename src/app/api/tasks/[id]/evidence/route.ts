import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { resolveFlag } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'
import { buildTaskEvidence } from '@/lib/task-evidence'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface FeatureFlagsRow {
  feature_flags: string | null
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    const status = auth.status ?? 401
    return NextResponse.json(
      { error: status === 401 ? 'unauthenticated' : 'forbidden_workspace_scope' },
      { status },
    )
  }

  try {
    const db = getDatabase()
    const { id } = await params
    const taskId = Number(id)
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
    }

    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(scope, 't.workspace_id')
    const artifactStorageEnabled = resolveFlag('FEATURE_TASK_ARTIFACTS', {
      workspaceFlags: readWorkspaceFlags(db, scope.workspaceId ?? scope.workspaceIds[0] ?? null),
    })

    const evidence = buildTaskEvidence(db, {
      taskId,
      scopeSql: workspaceFilter.sql,
      scopeParams: workspaceFilter.params,
      artifactStorageEnabled,
    })

    if (!evidence) {
      return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
    }

    return NextResponse.json(evidence)
  } catch (error) {
    const scoped = workspaceScopeError(error)
    if (scoped) {
      const responseError = scoped.status === 400 ? 'invalid_workspace_scope' : 'forbidden_workspace_scope'
      return NextResponse.json({ error: responseError }, { status: scoped.status })
    }
    logger.error({ err: error }, 'GET /api/tasks/[id]/evidence error')
    return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
  }
}

function readWorkspaceFlags(db: ReturnType<typeof getDatabase>, workspaceId: number | null): string | null {
  if (!workspaceId) return null
  try {
    const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(workspaceId) as FeatureFlagsRow | undefined
    return row?.feature_flags ?? null
  } catch {
    return null
  }
}
