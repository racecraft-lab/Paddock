import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { validateBody, qualityReviewSchema } from '@/lib/validation'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'
import { advanceTaskChain } from '@/lib/task-dispatch'
import { resolveFlag } from '@/lib/feature-flags'
import { READY_FOR_OWNER_STATUS, READY_FOR_OWNER_TERMINAL_EVENT, resolveTaskTerminalTransition } from '@/lib/task-status'
import { syncTaskOutbound } from '@/lib/github-sync-engine'

function readyForOwnerRecipient(task: { assigned_to?: string | null; created_by?: string | null }): string | null {
  return task.assigned_to?.trim() || task.created_by?.trim() || null
}

function recordReadyForOwnerEntrySideEffects(
  task: {
    id: number
    title: string
    workspace_id: number
    assigned_to?: string | null
    created_by?: string | null
    github_repo?: string | null
    github_pr_number?: number | null
  },
  actor: string,
): void {
  if (task.github_repo && task.github_pr_number) return

  const data = {
    task_id: task.id,
    workspace_id: task.workspace_id,
    reason: 'missing_explicit_pr_linkage',
    github_repo: task.github_repo ?? null,
    github_pr_number: task.github_pr_number ?? null,
  }
  db_helpers.logActivity(
    'task_ready_for_owner',
    'task',
    task.id,
    actor,
    `Task ready for owner merge is missing explicit PR linkage: ${task.title}`,
    data,
    task.workspace_id,
  )

  const recipient = readyForOwnerRecipient(task)
  if (!recipient) return
  db_helpers.createNotification(
    recipient,
    'task_ready_for_owner',
    'Ready for owner merge',
    `Owner action required: ${task.title} is ready for owner merge but needs explicit GitHub PR linkage.`,
    'task',
    task.id,
    task.workspace_id,
  )
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'workspace_id')
    const taskIdsParam = searchParams.get('taskIds')
    const taskId = parseInt(searchParams.get('taskId') || '')

    if (taskIdsParam) {
      const ids = taskIdsParam
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !Number.isNaN(id))

      if (ids.length === 0) {
        return NextResponse.json({ error: 'taskIds must include at least one numeric id' }, { status: 400 })
      }

      const placeholders = ids.map(() => '?').join(',')
      const rows = db.prepare(`
        SELECT * FROM quality_reviews
        WHERE task_id IN (${placeholders}) AND ${workspaceFilter.sql}
        ORDER BY task_id ASC, created_at DESC
      `).all(...ids, ...workspaceFilter.params) as Array<{ task_id: number; reviewer?: string; status?: string; created_at?: number }>

      const byTask: Record<number, { status?: string; reviewer?: string; created_at?: number } | null> = {}
      for (const id of ids) {
        byTask[id] = null
      }

      for (const row of rows) {
        const existing = byTask[row.task_id]
        if (!existing || (row.created_at || 0) > (existing.created_at || 0)) {
          byTask[row.task_id] = { status: row.status, reviewer: row.reviewer, created_at: row.created_at }
        }
      }

      return NextResponse.json({ latest: byTask })
    }

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const reviews = db.prepare(`
      SELECT * FROM quality_reviews
      WHERE task_id = ? AND ${workspaceFilter.sql}
      ORDER BY created_at DESC
      LIMIT 10
    `).all(taskId, ...workspaceFilter.params)

    return NextResponse.json({ reviews })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/quality-review error')
    return NextResponse.json({ error: 'Failed to fetch quality reviews' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const validated = await validateBody(request, qualityReviewSchema)
    if ('error' in validated) return validated.error
    const { taskId, reviewer, status, notes } = validated.data

    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    if (acceptedScope.kind === 'facility' || acceptedScope.workspaceId === null) {
      return NextResponse.json({ error: 'workspace_id is required for quality reviews' }, { status: 400 })
    }
    const workspaceId = acceptedScope.workspaceId

    const task = db
      .prepare(`
        SELECT t.id, t.title, t.description, t.status, t.priority, t.project_id, t.workspace_id,
               t.assigned_to, t.created_by, t.github_repo, t.github_issue_number, t.github_pr_number,
               COALESCE(wt.produces_pr, 0) AS produces_pr,
               wt.external_terminal_event,
               w.feature_flags
        FROM tasks t
        LEFT JOIN workflow_templates wt ON wt.id = t.workflow_template_id AND wt.workspace_id = t.workspace_id
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        WHERE t.id = ? AND t.workspace_id = ?
      `)
      .get(taskId, workspaceId) as any
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const approvedTransition = status === 'approved'
      ? resolveTaskTerminalTransition({
          taskId,
          currentStatus: task.status,
          requestedStatus: 'done',
          producesPr: task.produces_pr === 1 && task.external_terminal_event === READY_FOR_OWNER_TERMINAL_EVENT,
          twoStepTerminalEnabled: resolveFlag('FEATURE_TWO_STEP_TERMINAL', {
            workspaceFlags: task.feature_flags,
          }),
          transitionIntent: 'approval',
        })
      : null
    if (approvedTransition && !approvedTransition.ok) {
      return NextResponse.json(approvedTransition.body, { status: approvedTransition.status })
    }

    const result = db.prepare(`
      INSERT INTO quality_reviews (task_id, reviewer, status, notes, workspace_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, reviewer, status, notes, workspaceId)

    db_helpers.logActivity(
      'quality_review',
      'task',
      taskId,
      reviewer,
      `Quality review ${status} for task: ${task.title}`,
      { status, notes },
      workspaceId
    )

    // Auto-advance task based on review outcome
    if (status === 'approved') {
      const nextStatus = approvedTransition?.ok ? approvedTransition.status : 'done'
      db.prepare('UPDATE tasks SET status = ?, updated_at = unixepoch() WHERE id = ? AND workspace_id = ?')
        .run(nextStatus, taskId, workspaceId)
      syncTaskOutbound({ ...task, status: nextStatus }, workspaceId)
      if (nextStatus === READY_FOR_OWNER_STATUS) {
        recordReadyForOwnerEntrySideEffects(task, reviewer)
      }
      if (nextStatus === 'done') {
        advanceTaskChain({
          taskId,
          workspaceId,
          previousStatus: task.status,
          trigger: 'quality_review',
        })
      }
      eventBus.broadcast('task.status_changed', {
        id: taskId,
        status: nextStatus,
        previous_status: task.status,
        updated_at: Math.floor(Date.now() / 1000),
        workspace_id: workspaceId,
      })
    } else if (status === 'rejected') {
      // Rejected: push back to in_progress with the rejection notes as error_message
      db.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = unixepoch() WHERE id = ? AND workspace_id = ?')
        .run('in_progress', `Quality review rejected by ${reviewer}: ${notes}`, taskId, workspaceId)
      eventBus.broadcast('task.status_changed', {
        id: taskId,
        status: 'in_progress',
        previous_status: 'review',
        updated_at: Math.floor(Date.now() / 1000),
        workspace_id: workspaceId,
      })
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/quality-review error')
    return NextResponse.json({ error: 'Failed to create quality review' }, { status: 500 })
  }
}
