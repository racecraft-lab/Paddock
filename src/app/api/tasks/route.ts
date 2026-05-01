import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, Task, db_helpers } from '@/lib/db';
import { eventBus } from '@/lib/event-bus';
import { requireRole } from '@/lib/auth';
import { mutationLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { validateBody, createTaskSchema, bulkUpdateTaskStatusSchema } from '@/lib/validation';
import { normalizeTaskCreateStatus } from '@/lib/task-status';
import { syncTaskOutbound } from '@/lib/github-sync-engine';
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces';
import { createTask, UnknownMentionsError } from '@/lib/task-create';
import { advanceTaskChain } from '@/lib/task-dispatch';

function formatTicketRef(prefix?: string | null, num?: number | null): string | undefined {
  if (!prefix || typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return undefined
  return `${prefix}-${String(num).padStart(3, '0')}`
}

function mapTaskRow(task: any): Task & { tags: string[]; metadata: Record<string, unknown> } {
  return {
    ...task,
    tags: task.tags ? JSON.parse(task.tags) : [],
    metadata: task.metadata ? JSON.parse(task.metadata) : {},
    ticket_ref: formatTicketRef(task.project_prefix, task.project_ticket_no),
  }
}

function resolveProjectId(db: ReturnType<typeof getDatabase>, workspaceId: number, requestedProjectId?: number): number {
  if (typeof requestedProjectId === 'number' && Number.isFinite(requestedProjectId)) {
    const project = db.prepare(`
      SELECT id FROM projects
      WHERE id = ? AND workspace_id = ? AND status = 'active'
      LIMIT 1
    `).get(requestedProjectId, workspaceId) as { id: number } | undefined
    if (project) return project.id
  }

  const fallback = db.prepare(`
    SELECT id FROM projects
    WHERE workspace_id = ? AND status = 'active'
    ORDER BY CASE WHEN slug = 'general' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(workspaceId) as { id: number } | undefined

  if (!fallback) {
    throw new Error('No active project available in workspace')
  }
  return fallback.id
}

function hasAegisApproval(db: ReturnType<typeof getDatabase>, taskId: number, workspaceId: number): boolean {
  const review = db.prepare(`
    SELECT status FROM quality_reviews
    WHERE task_id = ? AND reviewer = 'aegis' AND workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId, workspaceId) as { status?: string } | undefined
  return review?.status === 'approved'
}

/**
 * GET /api/tasks - List all tasks with optional filtering
 * Query params: status, assigned_to, priority, project_id, limit, offset
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 't.workspace_id');
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const status = searchParams.get('status');
    const assigned_to = searchParams.get('assigned_to');
    const priority = searchParams.get('priority');
    const projectIdParam = Number.parseInt(searchParams.get('project_id') || '', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Build dynamic query
    let query = `
      SELECT t.*, p.name as project_name, p.ticket_prefix as project_prefix,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id AND c.workspace_id = t.workspace_id) as comment_count
      FROM tasks t
      LEFT JOIN projects p
        ON p.id = t.project_id AND p.workspace_id = t.workspace_id
      WHERE ${workspaceFilter.sql}
    `;
    const params: any[] = [...workspaceFilter.params];
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    if (assigned_to) {
      query += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }
    
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }

    if (Number.isFinite(projectIdParam)) {
      query += ' AND t.project_id = ?';
      params.push(projectIdParam);
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const tasks = stmt.all(...params) as Task[];
    
    // Parse JSON fields
    const tasksWithParsedData = tasks.map(mapTaskRow);
    
    // Get total count for pagination
    const countFilter = workspaceScopePredicate(acceptedScope, 'workspace_id');
    let countQuery = `SELECT COUNT(*) as total FROM tasks WHERE ${countFilter.sql}`;
    const countParams: any[] = [...countFilter.params];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (assigned_to) {
      countQuery += ' AND assigned_to = ?';
      countParams.push(assigned_to);
    }
    if (priority) {
      countQuery += ' AND priority = ?';
      countParams.push(priority);
    }
    if (Number.isFinite(projectIdParam)) {
      countQuery += ' AND project_id = ?';
      countParams.push(projectIdParam);
    }
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number };

    return NextResponse.json({ tasks: tasksWithParsedData, total: countRow.total, page: Math.floor(offset / limit) + 1, limit });
  } catch (error) {
    const scopeError = workspaceScopeError(error);
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
    logger.error({ err: error }, 'GET /api/tasks error');
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * POST /api/tasks - Create a new task
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  try {
    const db = getDatabase();
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    if (acceptedScope.kind === 'facility' || acceptedScope.workspaceId === null) {
      return NextResponse.json({ error: 'workspace_id is required for task creation' }, { status: 400 });
    }
    const workspaceId = acceptedScope.workspaceId;
    const validated = await validateBody(request, createTaskSchema);
    if ('error' in validated) return validated.error;
    const body = validated.data;

    const user = auth.user
    const actor = user.display_name || user.username || 'system'
    const {
      title,
      description,
      status,
      priority = 'medium',
      project_id,
      assigned_to,
      due_date,
      estimated_hours,
      actual_hours,
      outcome,
      error_message,
      resolution,
      feedback_rating,
      feedback_notes,
      retry_count = 0,
      completed_at,
      tags = [],
      metadata = {}
    } = body;
    const normalizedStatus = normalizeTaskCreateStatus(status, assigned_to)

    // Resolve project_id for the task
    const resolvedProjectId = resolveProjectId(db, workspaceId, project_id)
    
    const now = Math.floor(Date.now() / 1000);
    const resolvedCompletedAt = completed_at ?? (normalizedStatus === 'done' ? now : null)

    let createResult
    try {
      createResult = createTask({
        source: 'api',
        title,
        description,
        status: normalizedStatus,
        priority,
        project_id: resolvedProjectId,
        assigned_to,
        created_by: actor,
        workspace_id: workspaceId,
        due_date,
        estimated_hours,
        actual_hours,
        outcome,
        error_message,
        resolution,
        feedback_rating,
        feedback_notes,
        retry_count,
        completed_at: resolvedCompletedAt,
        tags,
        metadata,
      })
    } catch (err) {
      if (err instanceof UnknownMentionsError) {
        return NextResponse.json({
          error: err.message,
          missing_mentions: err.missingMentions,
        }, { status: 400 })
      }
      throw err
    }

    const parsedTask = createResult.task as unknown as Task & { tags: string[]; metadata: Record<string, unknown> };

    return NextResponse.json({ task: parsedTask }, { status: 201 });
  } catch (error) {
    const scopeError = workspaceScopeError(error);
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
    logger.error({ err: error }, 'POST /api/tasks error');
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

/**
 * PUT /api/tasks - Update multiple tasks (for drag-and-drop status changes)
 */
export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  try {
    const db = getDatabase();
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    if (acceptedScope.kind === 'facility' || acceptedScope.workspaceId === null) {
      return NextResponse.json({ error: 'workspace_id is required for task updates' }, { status: 400 });
    }
    const workspaceId = acceptedScope.workspaceId;
    const validated = await validateBody(request, bulkUpdateTaskStatusSchema);
    if ('error' in validated) return validated.error;
    const { tasks } = validated.data;

    const now = Math.floor(Date.now() / 1000);

    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `);
    const updateDoneStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?)
      WHERE id = ? AND workspace_id = ?
    `);

    const actor = auth.user.username

    const transaction = db.transaction((tasksToUpdate: any[]) => {
      for (const task of tasksToUpdate) {
        const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(task.id, workspaceId) as Task;
        if (!oldTask) continue;

        if (task.status === 'done' && !hasAegisApproval(db, task.id, workspaceId)) {
          throw new Error(`Aegis approval required for task ${task.id}`)
        }

        if (task.status === 'done') {
          updateDoneStmt.run(task.status, now, now, task.id, workspaceId);
        } else {
          updateStmt.run(task.status, now, task.id, workspaceId);
        }

        // Log status change if different
        if (oldTask && oldTask.status !== task.status) {
          db_helpers.logActivity(
            'task_updated',
            'task',
            task.id,
            actor,
            `Task moved from ${oldTask.status} to ${task.status}`,
            { oldStatus: oldTask.status, newStatus: task.status },
            workspaceId
          );
        }

        if (oldTask.status !== 'done' && task.status === 'done') {
          advanceTaskChain({
            taskId: task.id,
            workspaceId,
            previousStatus: oldTask.status,
            trigger: 'bulk_task_update',
          })
        }
      }
    });
    
    transaction(tasks);

    // Broadcast status changes to SSE clients + outbound sync
    for (const task of tasks) {
      eventBus.broadcast('task.status_changed', {
        id: task.id,
        status: task.status,
        updated_at: Math.floor(Date.now() / 1000),
        workspace_id: workspaceId,
      });

      // Fire-and-forget outbound sync (GitHub + GNAP)
      const fullTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(task.id, workspaceId) as Task | undefined;
      if (fullTask) {
        syncTaskOutbound(fullTask as any, workspaceId);
      }
    }

    return NextResponse.json({ success: true, updated: tasks.length });
  } catch (error) {
    const scopeError = workspaceScopeError(error);
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
    logger.error({ err: error }, 'PUT /api/tasks error');
    const message = error instanceof Error ? error.message : 'Failed to update tasks'
    if (message.includes('Aegis approval required')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to update tasks' }, { status: 500 });
  }
}
