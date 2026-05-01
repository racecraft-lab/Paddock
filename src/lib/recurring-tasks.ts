/**
 * Recurring Task Spawner
 *
 * Queries task templates with recurrence metadata and spawns child tasks
 * when their cron schedule is due. Uses template-clone pattern:
 * the recurring task stays as a template, child tasks get spawned with
 * date-suffixed titles.
 */

import { getDatabase } from './db'
import { logger } from './logger'
import { isCronDue } from './schedule-parser'
import { createTask } from './task-create'

export interface RecurrenceMetadata {
  cron_expr: string
  natural_text: string
  enabled: boolean
  last_spawned_at: number | null
  spawn_count: number
  parent_task_id: null
}

function formatDateSuffix(): string {
  const now = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')}`
}

export async function spawnRecurringTasks(): Promise<{ ok: boolean; message: string }> {
  try {
    const db = getDatabase()
    const nowMs = Date.now()
    const nowSec = Math.floor(nowMs / 1000)

    // Find all template tasks with enabled recurrence
    const templates = db.prepare(`
      SELECT id, title, description, priority, project_id, assigned_to, created_by,
             tags, metadata, workspace_id
      FROM tasks
      WHERE json_extract(metadata, '$.recurrence.enabled') = 1
        AND json_extract(metadata, '$.recurrence.cron_expr') IS NOT NULL
        AND json_extract(metadata, '$.recurrence.parent_task_id') IS NULL
    `).all() as Array<{
      id: number
      title: string
      description: string | null
      priority: string
      project_id: number | null
      assigned_to: string | null
      created_by: string
      tags: string | null
      metadata: string | null
      workspace_id: number
    }>

    if (templates.length === 0) {
      return { ok: true, message: 'No recurring tasks' }
    }

    let spawned = 0

    for (const template of templates) {
      const metadata = template.metadata ? JSON.parse(template.metadata) : {}
      const recurrence = metadata.recurrence as RecurrenceMetadata | undefined
      if (!recurrence?.cron_expr || !recurrence.enabled) continue

      const lastSpawnedAtMs = recurrence.last_spawned_at ? recurrence.last_spawned_at * 1000 : 0

      if (!isCronDue(recurrence.cron_expr, nowMs, lastSpawnedAtMs)) continue

      const dateSuffix = formatDateSuffix()
      const childTitle = `${template.title} - ${dateSuffix}`

      // Duplicate prevention: check if a child with this exact title already exists in the same project
      const existing = db.prepare(`
        SELECT id FROM tasks
        WHERE title = ? AND workspace_id = ? AND project_id = ?
        LIMIT 1
      `).get(childTitle, template.workspace_id, template.project_id)
      if (existing) continue

      // Spawn child task
      const childMetadata = {
        recurrence: {
          parent_task_id: template.id,
          spawned_from_cron: recurrence.cron_expr,
        },
      }

      db.transaction(() => {
        createTask({
          source: 'recurring',
          db,
          transaction: 'caller',
          title: childTitle,
          description: template.description,
          status: template.assigned_to ? 'assigned' : 'inbox',
          priority: template.priority,
          project_id: template.project_id,
          assigned_to: template.assigned_to,
          created_by: 'scheduler',
          workspace_id: template.workspace_id,
          tags: template.tags ? JSON.parse(template.tags) : [],
          metadata: childMetadata,
          activity: {
            actor: 'scheduler',
            description: `Recurring task spawned: ${childTitle}`,
            data: { parent_task_id: template.id, cron_expr: recurrence.cron_expr },
          },
        })

        // Update template: bump spawn count and last_spawned_at
        const updatedRecurrence = {
          ...recurrence,
          last_spawned_at: nowSec,
          spawn_count: (recurrence.spawn_count || 0) + 1,
        }
        const updatedMetadata = { ...metadata, recurrence: updatedRecurrence }
        db.prepare(`
          UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?
        `).run(JSON.stringify(updatedMetadata), nowSec, template.id)
      })()

      spawned++
    }

    return { ok: true, message: spawned > 0 ? `Spawned ${spawned} recurring task(s)` : 'No tasks due' }
  } catch (err: any) {
    logger.error({ err }, 'Recurring task spawn failed')
    return { ok: false, message: `Recurring spawn failed: ${err.message}` }
  }
}
