import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'
import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  loginAsE2EAdmin,
} from '../helpers'

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ??
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'spec-013a-task-stage-attempts')
const FIXTURE_MARKER = 'seeded by SPEC-013A task stage attempts e2e'

interface CreatedTask {
  id: number
  title: string
}

interface TaskWorkspaceRow {
  workspace_id: number
}

const createdTasks: CreatedTask[] = []

function sqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

function checkpoint(db: Database.Database): void {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // The app server may hold a transient reader; committed rows are still visible.
  }
}

async function createStageAttemptsTask(page: Page): Promise<CreatedTask> {
  const title = 'SPEC-013A Run State Stage Attempts Fixture'
  const response = await page.request.post('/api/tasks', {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} ${FIXTURE_MARKER}`,
      priority: 'medium',
      status: 'in_progress',
    },
  })
  const body = await response.json().catch(() => ({})) as { task?: { id?: number; title?: string } }
  expect(response.status(), JSON.stringify(body)).toBe(201)
  if (!body.task?.id || !body.task.title) {
    throw new Error(`SPEC-013A e2e task create failed: ${JSON.stringify(body)}`)
  }
  const task = { id: body.task.id, title: body.task.title }
  createdTasks.push(task)
  return task
}

function insertAttempt(
  db: Database.Database,
  taskId: number,
  workspaceId: number,
  values: {
    stageKey: string
    attemptNumber: number
    status: string
    observedAt: string
    runId?: string | null
    workflowTemplateSlug?: string | null
    startedAt?: string | null
    completedAt?: string | null
    archivedAt?: string | null
    message?: string
  },
): number {
  const result = db.prepare(`
    INSERT INTO task_stage_attempts (
      workspace_id, task_id, stage_key, attempt_number, status,
      created_at, updated_at, started_at, completed_at, archived_at,
      run_id, workflow_template_id, workflow_template_slug, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    workspaceId,
    taskId,
    values.stageKey,
    values.attemptNumber,
    values.status,
    values.observedAt,
    values.observedAt,
    values.startedAt ?? null,
    values.completedAt ?? null,
    values.archivedAt ?? null,
    values.runId ?? null,
    values.workflowTemplateSlug ?? 'mission-control_issue_remediation',
    JSON.stringify({ fixture: 'spec-013a-e2e' }),
  )
  const attemptId = Number(result.lastInsertRowid)
  db.prepare(`
    INSERT INTO task_stage_attempt_events (
      attempt_id, workspace_id, task_id, stage_key, attempt_number,
      status, observed_at, actor_type, actor_id, message, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'test', 'spec-013a-e2e', ?, ?)
  `).run(
    attemptId,
    workspaceId,
    taskId,
    values.stageKey,
    values.attemptNumber,
    values.status,
    values.observedAt,
    values.message ?? `${values.stageKey} ${values.status}`,
    JSON.stringify({ fixture: 'spec-013a-e2e' }),
  )
  return attemptId
}

function insertAttemptEvent(
  db: Database.Database,
  taskId: number,
  workspaceId: number,
  attemptId: number,
  stageKey: string,
  attemptNumber: number,
  status: string,
  observedAt: string,
  message: string,
): void {
  db.prepare(`
    INSERT INTO task_stage_attempt_events (
      attempt_id, workspace_id, task_id, stage_key, attempt_number,
      status, observed_at, actor_type, actor_id, message, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'test', 'spec-013a-e2e', ?, ?)
  `).run(
    attemptId,
    workspaceId,
    taskId,
    stageKey,
    attemptNumber,
    status,
    observedAt,
    message,
    JSON.stringify({ fixture: 'spec-013a-e2e' }),
  )
}

function seedStageAttemptRows(task: CreatedTask): void {
  const db = new Database(E2E_DB_PATH)
  try {
    const taskRow = db.prepare('SELECT workspace_id FROM tasks WHERE id = ? LIMIT 1').get(task.id) as TaskWorkspaceRow | undefined
    if (!taskRow) throw new Error(`SPEC-013A e2e task not found after create: ${String(task.id)}`)

    db.prepare(`
      INSERT OR REPLACE INTO runs (
        id, agent_id, agent_name, model, provider, runtime, trigger_type,
        task_id, status, started_at, ended_at, git_branch, git_commit,
        workspace_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(
      'spec-013a-linked-run',
      'aegis',
      'aegis',
      'gpt-5.5',
      'openai',
      'mission-control',
      'task_stage_attempt',
      String(task.id),
      'running',
      '2026-05-22T13:01:00.000Z',
      '013a-run-state-spine',
      'abc123',
      taskRow.workspace_id,
      JSON.stringify({ fixture: 'spec-013a-e2e' }),
    )

    insertAttempt(db, task.id, taskRow.workspace_id, {
      stageKey: 'analysis',
      attemptNumber: 1,
      status: 'running',
      observedAt: '2026-05-22T13:00:00.000Z',
      startedAt: '2026-05-22T13:00:00.000Z',
      runId: 'spec-013a-linked-run',
      workflowTemplateSlug: 'mission-control_issue_analysis',
      message: 'analysis running',
    })

    insertAttempt(db, task.id, taskRow.workspace_id, {
      stageKey: 'remediation',
      attemptNumber: 1,
      status: 'failed',
      observedAt: '2026-05-22T13:05:00.000Z',
      completedAt: '2026-05-22T13:12:00.000Z',
      runId: 'spec-013a-missing-run',
      message: 'remediation failed with missing run reference',
    })

    const archivedAttemptId = insertAttempt(db, task.id, taskRow.workspace_id, {
      stageKey: 'validation',
      attemptNumber: 1,
      status: 'archived',
      observedAt: '2026-05-22T13:10:00.000Z',
      completedAt: '2026-05-22T13:12:00.000Z',
      archivedAt: '2026-05-22T13:20:00.000Z',
      runId: null,
      workflowTemplateSlug: 'mission-control_issue_validation',
      message: 'validation archived',
    })
    for (let index = 0; index < 12; index += 1) {
      insertAttemptEvent(
        db,
        task.id,
        taskRow.workspace_id,
        archivedAttemptId,
        'validation',
        1,
        index % 2 === 0 ? 'running' : 'released',
        `2026-05-22T13:${String(index + 21).padStart(2, '0')}:00.000Z`,
        `lifecycle event ${String(index).padStart(2, '0')}`,
      )
    }

    const driftAttemptId = insertAttempt(db, task.id, taskRow.workspace_id, {
      stageKey: 'zz_projection_drift',
      attemptNumber: 1,
      status: 'running',
      observedAt: '2026-05-22T13:40:00.000Z',
      startedAt: null,
      completedAt: null,
      runId: null,
      workflowTemplateSlug: 'mission-control_issue_projection',
      message: 'projection initially running',
    })
    insertAttemptEvent(
      db,
      task.id,
      taskRow.workspace_id,
      driftAttemptId,
      'zz_projection_drift',
      1,
      'failed',
      '2026-05-22T13:45:00.000Z',
      'projection drift latest lifecycle failed',
    )
    checkpoint(db)
  } finally {
    db.close()
  }
}

function cleanupDirectRows(): void {
  const db = new Database(E2E_DB_PATH)
  try {
    const markerRows = db.prepare(`
      SELECT id
      FROM tasks
      WHERE description LIKE ?
    `).all(`%${FIXTURE_MARKER}%`) as { id: number }[]
    const taskIds = Array.from(new Set([
      ...createdTasks.map((task) => task.id),
      ...markerRows.map((task) => task.id),
    ]))
    if (taskIds.length === 0) return
    const placeholders = sqlPlaceholders(taskIds)
    const runIds = db.prepare(`SELECT run_id FROM task_stage_attempts WHERE task_id IN (${placeholders}) AND run_id IS NOT NULL`)
      .all(...taskIds)
      .map((row) => (row as { run_id: string }).run_id)

    db.prepare(`DELETE FROM task_stage_attempt_events WHERE task_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM task_stage_attempts WHERE task_id IN (${placeholders})`).run(...taskIds)
    if (runIds.length > 0) {
      db.prepare(`DELETE FROM runs WHERE id IN (${sqlPlaceholders(runIds)})`).run(...runIds)
    }
    db.prepare(`DELETE FROM activities WHERE entity_type = 'task' AND entity_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...taskIds)
    checkpoint(db)
  } finally {
    db.close()
  }
}

async function openStageAttempts(page: Page, title: string) {
  const card = page.getByRole('button', { name: new RegExp(title, 'i') }).first()
  await expect(card).toBeVisible()
  await card.click()
  const region = page.getByRole('region', { name: /run state and stage attempts/i })
  await expect(region).toBeVisible()
  await expect(region.getByText(/loading stage attempts/i)).toHaveCount(0)
  return region
}

async function attachStageAttemptScreenshot(
  region: Awaited<ReturnType<typeof openStageAttempts>>,
  testInfo: TestInfo,
): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, 'spec-013a-task-stage-attempts.png')
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach('spec-013a-task-stage-attempts', {
    path: filePath,
    contentType: 'image/png',
  })
}

test.describe.serial('SPEC-013A task detail stage attempts', () => {
  test.beforeAll(() => {
    cleanupDirectRows()
  })

  test.beforeEach(async ({ page, request }) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  test.afterAll(async ({ request }) => {
    cleanupDirectRows()
    for (const task of [...createdTasks].reverse()) {
      await request.delete(`/api/tasks/${String(task.id)}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    cleanupDirectRows()
  })

  test('shows active, linked, missing, archived, and projection-drift stage attempts as read-only state', async ({ page }, testInfo) => {
    const task = await createStageAttemptsTask(page)
    seedStageAttemptRows(task)

    await page.goto('/tasks')
    await expect(page.getByRole('region', { name: /^Task Board$/i })).toBeVisible()

    const region = await openStageAttempts(page, task.title)
    await expect(region.getByText(/^Active attempt$/i).first()).toBeVisible()
    await expect(region.getByText(/^Archived attempt$/i).first()).toBeVisible()
    await expect(region.getByRole('status').filter({ hasText: /attempt analysis #1 is running/i })).toBeVisible()
    await expect(region.getByText(/linked run \(read-only reference\): spec-013a-linked-run/i)).toBeVisible()
    await expect(region.getByText(/agent aegis/i)).toBeVisible()
    await expect(region.getByText(/runtime mission-control/i)).toBeVisible()
    await expect(region.getByText(/state running/i)).toBeVisible()

    await expect(region.getByText(/run missing or unavailable: spec-013a-missing-run/i)).toBeVisible()
    await expect(region.getByText(/no runtime run linked/i).first()).toBeVisible()
    await expect(region.getByText(/archived at 2026-05-22T13:20:00.000Z/i)).toBeVisible()
    await expect(region.getByRole('alert').filter({ hasText: /projection drift: attempt/i }).first()).toBeVisible()
    await expect(region.getByRole('alert').filter({ hasText: /status stored running, expected failed/i }).first()).toBeVisible()
    await expect(region.getByText(/lifecycle event 00/i)).toHaveCount(0)
    await expect(region.getByText(/lifecycle event 01/i)).toHaveCount(0)
    await expect(region.getByText(/lifecycle event 02/i)).toBeVisible()
    await expect(region.getByText(/lifecycle event 11/i)).toBeVisible()
    await expect(region.locator('button, form, input, select, textarea, [role="menu"]')).toHaveCount(0)

    await attachStageAttemptScreenshot(region, testInfo)
  })
})
