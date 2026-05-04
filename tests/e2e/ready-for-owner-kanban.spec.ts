import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'
import path from 'node:path'

import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  enableWorkspaceSwitcherFlagForE2E,
  freezeProductLineVisualClock,
  loginAsE2EAdmin,
} from '../helpers'
import { captureVisualSnapshot } from '../visual/visual-snapshot'

type SeededTask = {
  id: number
  title: string
  status?: string
  workflow_template_slug?: string | null
}

type SeededWorkspace = {
  id: number
  name: string
  slug: string
}

type SeededProject = {
  id: number
  name: string
}

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ||
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
const FACILITY_SCOPE_QUERY = 'workspace_scope=facility'
const READY_FOR_OWNER_RECIPIENT = 'owner-e2e-ready-for-owner-visual'
const READY_FOR_OWNER_VISUAL_TAGS = ['ready-for-owner']
const READY_FOR_OWNER_TEST_TAGS = ['@ready-for-owner']
const FIXTURE_NOW_SECONDS = Math.floor(new Date('2026-04-28T12:00:00.000Z').getTime() / 1000)
const FIXTURE_TITLES = {
  awaitingOwner: 'SPEC-005 Ready for Owner - Awaiting Owner',
  qualityReview: 'SPEC-005 Ready for Owner - Quality Review',
  readyForOwner: 'SPEC-005 Ready for Owner - Waiting on Merge',
  done: 'SPEC-005 Ready for Owner - Done',
} as const
const READY_FOR_OWNER_WORKSPACE = {
  name: 'SPEC-005 Ready for Owner Visual',
  slug: 'spec-005-ready-for-owner-visual',
} as const
const READY_FOR_OWNER_PROJECT = {
  name: 'SPEC-005 Ready for Owner',
  slug: 'spec-005-ready-for-owner',
  ticket_prefix: 'S005',
} as const
const READY_FOR_OWNER_WORKFLOW_SLUG = 'spec-005-ready-for-owner-pr'
const READY_FOR_OWNER_REQUIRED_FLAGS = {
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_GLOBAL_AEGIS: true,
  FEATURE_TASK_PIPELINES: true,
  FEATURE_TWO_STEP_TERMINAL: true,
} as const
const READY_FOR_OWNER_PRESEEDED = process.env.MC_READY_FOR_OWNER_PRESEEDED === '1'

function sqlPlaceholders(values: readonly unknown[]) {
  return values.map(() => '?').join(', ')
}

function tableExists(db: Database.Database, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function checkpointFixtureDb(db: Database.Database) {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // The Dockerized app may hold a reader briefly; committed writes remain visible
    // to subsequent requests even when a best-effort passive checkpoint is skipped.
  }
}

function withRequiredReadyForOwnerFlagsEnabled(workspaceId: number) {
  const db = new Database(E2E_DB_PATH)
  try {
    if (!tableExists(db, 'workspaces')) return () => undefined
    const row = db.prepare('SELECT id, feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as {
      id: number
      feature_flags: string | null
    } | undefined
    if (!row) return () => undefined

    let flags: Record<string, unknown> = {}
    if (row.feature_flags) {
      try {
        const parsed = JSON.parse(row.feature_flags)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          flags = parsed as Record<string, unknown>
        }
      } catch {
        flags = {}
      }
    }

    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
      .run(JSON.stringify({ ...flags, ...READY_FOR_OWNER_REQUIRED_FLAGS }), workspaceId)
    checkpointFixtureDb(db)

    return () => {
      const restoreDb = new Database(E2E_DB_PATH)
      try {
        restoreDb.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(row.feature_flags, row.id)
        checkpointFixtureDb(restoreDb)
      } finally {
        restoreDb.close()
      }
    }
  } finally {
    db.close()
  }
}

function resetReadyForOwnerVisualFixture() {
  const db = new Database(E2E_DB_PATH)
  try {
    db.transaction(() => {
      if (!tableExists(db, 'tasks')) return
      const workspaceIds = tableExists(db, 'workspaces')
        ? db.prepare('SELECT id FROM workspaces WHERE slug = ?')
          .all(READY_FOR_OWNER_WORKSPACE.slug)
          .map((row) => (row as { id: number }).id)
        : []
      const titles = Object.values(FIXTURE_TITLES)
      const taskIdsByTitle = db.prepare(`
        SELECT id FROM tasks
        WHERE title IN (${sqlPlaceholders(titles)})
      `).all(...titles).map((row) => (row as { id: number }).id)
      const taskIdsByWorkspace = workspaceIds.length > 0
        ? db.prepare(`SELECT id FROM tasks WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`)
          .all(...workspaceIds)
          .map((row) => (row as { id: number }).id)
        : []
      const taskIds = Array.from(new Set([...taskIdsByTitle, ...taskIdsByWorkspace]))

      if (tableExists(db, 'notifications')) {
        db.prepare('DELETE FROM notifications WHERE recipient = ?').run(READY_FOR_OWNER_RECIPIENT)
        if (taskIds.length > 0) {
          db.prepare(`DELETE FROM notifications WHERE source_type = 'task' AND source_id IN (${sqlPlaceholders(taskIds)})`)
            .run(...taskIds)
        }
        if (workspaceIds.length > 0) {
          db.prepare(`DELETE FROM notifications WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
        }
      }
      if (workspaceIds.length > 0 && tableExists(db, 'activities')) {
        db.prepare(`DELETE FROM activities WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
      }
      if (taskIds.length > 0) {
        if (tableExists(db, 'activities')) {
          db.prepare(`DELETE FROM activities WHERE entity_type = 'task' AND entity_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
        }
        if (tableExists(db, 'comments')) {
          db.prepare(`DELETE FROM comments WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
        }
        if (tableExists(db, 'task_subscriptions')) {
          db.prepare(`DELETE FROM task_subscriptions WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
        }
        if (tableExists(db, 'quality_reviews')) {
          db.prepare(`DELETE FROM quality_reviews WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
        }
        db.prepare(`DELETE FROM tasks WHERE id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
      }
      if (workspaceIds.length > 0 && tableExists(db, 'workflow_templates')) {
        db.prepare(`DELETE FROM workflow_templates WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
      }
      if (workspaceIds.length > 0 && tableExists(db, 'projects')) {
        db.prepare(`DELETE FROM projects WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
      }
      if (workspaceIds.length > 0 && tableExists(db, 'workspaces')) {
        db.prepare(`DELETE FROM workspaces WHERE id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
      }
    })()
    checkpointFixtureDb(db)
  } finally {
    db.close()
  }
}

function scopedApiPath(pathname: string) {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}${FACILITY_SCOPE_QUERY}`
}

function workspaceApiPath(pathname: string, workspaceId: number) {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}workspace_id=${encodeURIComponent(String(workspaceId))}`
}

function parseFeatureFlags(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function setSeededTaskTimestamps(taskIds: readonly number[]) {
  if (taskIds.length === 0) return
  const db = new Database(E2E_DB_PATH)
  try {
    const update = db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?')
    for (const taskId of taskIds) {
      update.run(FIXTURE_NOW_SECONDS, FIXTURE_NOW_SECONDS, taskId)
    }
    checkpointFixtureDb(db)
  } finally {
    db.close()
  }
}

function setReadyForOwnerNotificationTimestamp(taskId: number) {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare("UPDATE notifications SET created_at = ? WHERE source_type = 'task' AND source_id = ?")
      .run(FIXTURE_NOW_SECONDS, taskId)
    checkpointFixtureDb(db)
  } finally {
    db.close()
  }
}

function configureReadyForOwnerTemplate(workspaceId: number, taskId: number) {
  const db = new Database(E2E_DB_PATH)
  try {
    const existing = db.prepare(`
      SELECT id FROM workflow_templates
      WHERE workspace_id = ? AND slug = ?
      LIMIT 1
    `).get(workspaceId, READY_FOR_OWNER_WORKFLOW_SLUG) as { id: number } | undefined

    const templateId = existing?.id ?? Number(db.prepare(`
      INSERT INTO workflow_templates (
        name, task_prompt, workspace_id, slug, agent_role, produces_pr, external_terminal_event, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'builder', 1, 'github_pr_merged', 'e2e', ?, ?)
    `).run(
      'SPEC-005 Ready for Owner PR workflow',
      'Produce a pull request and wait for owner merge.',
      workspaceId,
      READY_FOR_OWNER_WORKFLOW_SLUG,
      FIXTURE_NOW_SECONDS,
      FIXTURE_NOW_SECONDS,
    ).lastInsertRowid)

    db.prepare(`
      UPDATE tasks
      SET workflow_template_id = ?,
          workflow_template_slug = ?,
          github_repo = 'racecraft-lab/mission-control',
          github_pr_number = 23,
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      templateId,
      READY_FOR_OWNER_WORKFLOW_SLUG,
      FIXTURE_NOW_SECONDS,
      taskId,
      workspaceId,
    )
    checkpointFixtureDb(db)
  } finally {
    db.close()
  }
}

async function attachReadyForOwnerScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await captureVisualSnapshot(page, testInfo, {
    domain: 'ready-for-owner',
    name,
    description: 'Review the Ready-for-Owner workflow state from the seeded SPEC-005 owner handoff fixture.',
    expected: 'The Ready for Owner lane, focused task card, and owner notification states should preserve the owner-action contract.',
    reviewFocus: [
      'Ready for Owner lane order and counts',
      'Owner-action task card copy and controls',
      'Notification and merge-gate status visibility',
    ],
    tags: READY_FOR_OWNER_VISUAL_TAGS,
  })
}

async function createReadyForOwnerWorkspace(request: APIRequestContext): Promise<SeededWorkspace> {
  const res = await request.post('/api/workspaces', {
    headers: API_KEY_HEADER,
    data: READY_FOR_OWNER_WORKSPACE,
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(201)
  expect(body.workspace?.id).toBeTruthy()
  return body.workspace as SeededWorkspace
}

async function createReadyForOwnerProject(request: APIRequestContext, workspaceId: number): Promise<SeededProject> {
  const res = await request.post(workspaceApiPath('/api/projects', workspaceId), {
    headers: API_KEY_HEADER,
    data: READY_FOR_OWNER_PROJECT,
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(201)
  expect(body.project?.id).toBeTruthy()
  return body.project as SeededProject
}

async function getReadyForOwnerWorkspace(request: APIRequestContext): Promise<SeededWorkspace> {
  const res = await request.get('/api/workspaces', { headers: API_KEY_HEADER })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(200)
  const workspace = (body.workspaces as Array<SeededWorkspace & { feature_flags?: unknown }> | undefined)
    ?.find((candidate) => candidate.slug === READY_FOR_OWNER_WORKSPACE.slug)
  expect(workspace, JSON.stringify(body)).toBeTruthy()

  const flags = parseFeatureFlags(workspace?.feature_flags)
  for (const [key, expected] of Object.entries(READY_FOR_OWNER_REQUIRED_FLAGS)) {
    expect(flags[key], `${key} must be active for SPEC-005 ready-for-owner visual e2e`).toBe(expected)
  }

  return workspace as SeededWorkspace
}

async function loadReadyForOwnerWorkflow(request: APIRequestContext, workspaceId: number) {
  const res = await request.get(workspaceApiPath('/api/workflows', workspaceId), {
    headers: API_KEY_HEADER,
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(200)
  const template = (body.templates as Array<{
    id: number
    slug: string | null
    produces_pr: boolean
    external_terminal_event: string | null
  }> | undefined)?.find((candidate) => candidate.slug === READY_FOR_OWNER_WORKFLOW_SLUG)
  expect(template, JSON.stringify(body)).toBeTruthy()
  expect(template?.produces_pr).toBe(true)
  expect(template?.external_terminal_event).toBe('github_pr_merged')
  return template
}

async function loadReadyForOwnerTasks(request: APIRequestContext, workspaceId: number) {
  const res = await request.get(workspaceApiPath('/api/tasks?limit=200', workspaceId), {
    headers: API_KEY_HEADER,
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(200)
  const tasks = (body.tasks as SeededTask[] | undefined) ?? []
  const byTitle = new Map(tasks.map((task) => [task.title, task]))

  const awaitingOwner = byTitle.get(FIXTURE_TITLES.awaitingOwner)
  const qualityReview = byTitle.get(FIXTURE_TITLES.qualityReview)
  const readyForOwner = byTitle.get(FIXTURE_TITLES.readyForOwner)
  const done = byTitle.get(FIXTURE_TITLES.done)

  expect(awaitingOwner, JSON.stringify(body)).toBeTruthy()
  expect(qualityReview, JSON.stringify(body)).toBeTruthy()
  expect(readyForOwner, JSON.stringify(body)).toBeTruthy()
  expect(done, JSON.stringify(body)).toBeTruthy()
  expect(readyForOwner?.status).toBe('quality_review')
  expect(readyForOwner?.workflow_template_slug).toBe(READY_FOR_OWNER_WORKFLOW_SLUG)

  return {
    awaitingOwner: awaitingOwner as SeededTask,
    qualityReview: qualityReview as SeededTask,
    readyForOwner: readyForOwner as SeededTask,
    done: done as SeededTask,
  }
}

async function createTask(
  request: APIRequestContext,
  workspaceId: number,
  projectId: number,
  title: string,
  status: 'awaiting_owner' | 'quality_review' | 'done'
): Promise<SeededTask> {
  const res = await request.post(workspaceApiPath('/api/tasks', workspaceId), {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} seeded for ready_for_owner Kanban e2e coverage`,
      priority: 'high',
      status,
      project_id: projectId,
      assigned_to: READY_FOR_OWNER_RECIPIENT,
    },
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(201)
  expect(body.task?.id).toBeTruthy()
  return { id: body.task.id as number, title }
}

async function approveReadyForOwnerTask(request: APIRequestContext, workspaceId: number, taskId: number) {
  const res = await request.post(workspaceApiPath('/api/quality-review', workspaceId), {
    headers: API_KEY_HEADER,
    data: {
      taskId,
      reviewer: 'aegis',
      status: 'approved',
      notes: 'SPEC-005 e2e approval enters the ready_for_owner merge gate.',
    },
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(200)

  const taskRes = await request.get(workspaceApiPath(`/api/tasks/${taskId}`, workspaceId), {
    headers: API_KEY_HEADER,
  })
  const taskBody = await taskRes.json().catch(() => ({}))
  expect(taskRes.status(), JSON.stringify(taskBody)).toBe(200)
  expect(taskBody.task?.status).toBe('ready_for_owner')

  const notificationRes = await request.get(
    workspaceApiPath(`/api/notifications?recipient=${encodeURIComponent(READY_FOR_OWNER_RECIPIENT)}&type=task_ready_for_owner`, workspaceId),
    { headers: API_KEY_HEADER }
  )
  const notificationBody = await notificationRes.json().catch(() => ({}))
  expect(notificationRes.status(), JSON.stringify(notificationBody)).toBe(200)
  expect(notificationBody.notifications).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'task_ready_for_owner',
      recipient: READY_FOR_OWNER_RECIPIENT,
      source_id: taskId,
    }),
  ]))
}

test.describe.serial('Ready for Owner Kanban lane', () => {
  const seeded: SeededTask[] = []
  let awaitingOwner: SeededTask
  let qualityReview: SeededTask
  let readyForOwner: SeededTask
  let done: SeededTask
  let visualWorkspace: SeededWorkspace
  let visualProject: SeededProject
  let restoreFeatureFlags: (() => void) | undefined
  let restoreWorkspaceSwitcherFlag: (() => void) | undefined

  test.beforeAll(async ({ request }) => {
    await request.get(scopedApiPath('/api/tasks'), { headers: API_KEY_HEADER })

    if (READY_FOR_OWNER_PRESEEDED) {
      visualWorkspace = await getReadyForOwnerWorkspace(request)
      await loadReadyForOwnerWorkflow(request, visualWorkspace.id)
      const loaded = await loadReadyForOwnerTasks(request, visualWorkspace.id)
      awaitingOwner = loaded.awaitingOwner
      qualityReview = loaded.qualityReview
      readyForOwner = loaded.readyForOwner
      done = loaded.done
      seeded.push(awaitingOwner, qualityReview, readyForOwner, done)
    } else {
      resetReadyForOwnerVisualFixture()
      restoreWorkspaceSwitcherFlag = await enableWorkspaceSwitcherFlagForE2E(request)

      visualWorkspace = await createReadyForOwnerWorkspace(request)
      restoreFeatureFlags = withRequiredReadyForOwnerFlagsEnabled(visualWorkspace.id)
      visualProject = await createReadyForOwnerProject(request, visualWorkspace.id)
      awaitingOwner = await createTask(request, visualWorkspace.id, visualProject.id, FIXTURE_TITLES.awaitingOwner, 'awaiting_owner')
      qualityReview = await createTask(request, visualWorkspace.id, visualProject.id, FIXTURE_TITLES.qualityReview, 'quality_review')
      readyForOwner = await createTask(request, visualWorkspace.id, visualProject.id, FIXTURE_TITLES.readyForOwner, 'quality_review')
      done = await createTask(request, visualWorkspace.id, visualProject.id, FIXTURE_TITLES.done, 'done')
      seeded.push(awaitingOwner, qualityReview, readyForOwner, done)
      setSeededTaskTimestamps(seeded.map((task) => task.id))

      configureReadyForOwnerTemplate(visualWorkspace.id, readyForOwner.id)
      await getReadyForOwnerWorkspace(request)
      await loadReadyForOwnerWorkflow(request, visualWorkspace.id)
      await loadReadyForOwnerTasks(request, visualWorkspace.id)
    }

    await approveReadyForOwnerTask(request, visualWorkspace.id, readyForOwner.id)
    if (!READY_FOR_OWNER_PRESEEDED) {
      setSeededTaskTimestamps(seeded.map((task) => task.id))
      setReadyForOwnerNotificationTimestamp(readyForOwner.id)
    }
  })

  test.afterAll(async ({ request }) => {
    if (READY_FOR_OWNER_PRESEEDED) return

    for (const task of [...seeded].reverse()) {
      if (visualWorkspace?.id) {
        await request.delete(workspaceApiPath(`/api/tasks/${task.id}`, visualWorkspace.id), { headers: API_KEY_HEADER }).catch(() => undefined)
      }
    }
    resetReadyForOwnerVisualFixture()
    restoreFeatureFlags?.()
    restoreWorkspaceSwitcherFlag?.()
  })

  test.beforeEach(async ({ page, request }) => {
    await freezeProductLineVisualClock(page)
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  test('orders the flag-on ready_for_owner lane between Quality Review and Done', { tag: READY_FOR_OWNER_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/tasks')

    const board = page.getByRole('region', { name: /^Task Board$/i })
    await expect(board).toBeVisible()

    const columnHeadings = board.locator(':scope > [role="region"] h3')
    const headings = await columnHeadings.allInnerTexts()
    expect(headings).toContain('Awaiting Owner')
    expect(headings).toContain('Quality Review')
    expect(headings).toContain('Ready for Owner')
    expect(headings).toContain('Done')
    expect(headings.indexOf('Awaiting Owner')).toBeLessThan(headings.indexOf('In Progress'))
    expect(headings.indexOf('Quality Review')).toBeLessThan(headings.indexOf('Ready for Owner'))
    expect(headings.indexOf('Ready for Owner')).toBeLessThan(headings.indexOf('Done'))

    const awaitingOwnerRegion = page.getByRole('region', { name: /Awaiting Owner column/i })
    const readyForOwnerRegion = page.getByRole('region', { name: /Ready for Owner column/i })
    await expect(awaitingOwnerRegion.getByRole('button', { name: new RegExp(awaitingOwner.title) })).toBeVisible()
    await expect(readyForOwnerRegion.getByRole('button', { name: new RegExp(readyForOwner.title) })).toBeVisible()
    await expect(awaitingOwnerRegion.getByRole('button', { name: new RegExp(readyForOwner.title) })).toHaveCount(0)
    await expect(readyForOwnerRegion.getByRole('button', { name: new RegExp(awaitingOwner.title) })).toHaveCount(0)

    await attachReadyForOwnerScreenshot(page, testInfo, 'kanban-lane-order')
  })

  test('exposes accessible lane and keyboard focus affordances for Ready for Owner tasks', { tag: READY_FOR_OWNER_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/tasks')

    const readyForOwnerRegion = page.getByRole('region', { name: /Ready for Owner column, 1 tasks/i })
    await expect(readyForOwnerRegion).toBeVisible()

    const readyForOwnerCard = readyForOwnerRegion.getByRole('button', {
      name: new RegExp(`${readyForOwner.title}.*Ready for Owner`, 'i'),
    })
    await expect(readyForOwnerCard).toBeVisible()
    await expect(readyForOwnerCard).toHaveAttribute('tabindex', '0')

    await readyForOwnerCard.focus()
    await expect(readyForOwnerCard).toBeFocused()
    await expect(readyForOwnerCard).toHaveClass(/focus-visible:ring-2/)
    await expect(readyForOwnerRegion.getByText(/Owner action required/i)).toBeVisible()

    await attachReadyForOwnerScreenshot(page, testInfo, 'focused-ready-for-owner-card')
  })

  test('keeps unread ready-for-owner notification actions keyboard reachable and identifiable', { tag: READY_FOR_OWNER_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('mc.notifications.recipient', 'owner-e2e-ready-for-owner-visual')
    })
    await page.goto('/notifications')

    const ownerActionMessage = page.getByText(
      `Owner action required: ${readyForOwner.title} is ready for owner merge.`,
      { exact: true },
    )
    const notificationCard = page.locator('div.rounded-lg').filter({
      has: ownerActionMessage,
    }).first()
    await expect(notificationCard).toBeVisible()
    await expect(ownerActionMessage).toBeVisible()

    const markRead = notificationCard.getByRole('button', { name: /Mark read/i })
    await expect(markRead).toBeVisible()
    await page.getByRole('textbox', { name: /Agent name/i }).focus()
    let targetFocused = false
    for (let tabStop = 0; tabStop < 10; tabStop += 1) {
      await page.keyboard.press('Tab')
      targetFocused = await markRead.evaluate((button) => button === document.activeElement)
      if (targetFocused) break
    }
    expect(targetFocused).toBe(true)
    await expect(markRead).toBeFocused()
    await expect(markRead).toHaveClass(/focus-visible:ring-2/)

    await attachReadyForOwnerScreenshot(page, testInfo, 'notification-action-required')
  })
})
