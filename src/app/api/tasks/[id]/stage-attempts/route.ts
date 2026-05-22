import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { listTaskStageAttemptsForTask } from '@/lib/task-stage-attempts'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface VisibleTaskRow {
  id: number
  workspace_id: number
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
    const task = db.prepare(`
      SELECT t.id, t.workspace_id
      FROM tasks t
      WHERE t.id = ? AND ${workspaceFilter.sql}
      LIMIT 1
    `).get(taskId, ...workspaceFilter.params) as VisibleTaskRow | undefined

    if (!task) {
      return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
    }

    const envelope = listTaskStageAttemptsForTask(db, {
      taskId: task.id,
      workspaceId: task.workspace_id,
    })
    return NextResponse.json(envelope)
  } catch (error) {
    const scoped = workspaceScopeError(error)
    if (scoped) {
      const responseError = scoped.status === 400 ? 'invalid_workspace_scope' : 'forbidden_workspace_scope'
      return NextResponse.json({ error: responseError }, { status: scoped.status })
    }
    logger.error({ err: error }, 'GET /api/tasks/[id]/stage-attempts error')
    return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
  }
}
