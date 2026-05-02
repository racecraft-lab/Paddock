import fs from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import { argosScreenshot } from '@argos-ci/playwright'
import Database from 'better-sqlite3'
import path from 'node:path'

import { API_KEY_HEADER, dismissOnboardingForE2E, freezeProductLineVisualClock, loginAsE2EAdmin } from '../helpers'

type SeededTask = {
  id: number
  title: string
}

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ||
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
const READY_FOR_OWNER_RECIPIENT = 'owner-e2e-ready-for-owner-visual'
const READY_FOR_OWNER_SCREENSHOT_TAGS = ['ready-for-owner']
const READY_FOR_OWNER_TEST_TAGS = ['@ready-for-owner']
const REVIEW_SCREENSHOTS_ENABLED = process.env.MC_E2E_SCREENSHOTS === '1'
const ARGOS_SCREENSHOTS_ENABLED = process.env.ARGOS_PLAYWRIGHT_SCREENSHOTS === '1'
const FIXTURE_NOW_SECONDS = Math.floor(new Date('2026-04-28T12:00:00.000Z').getTime() / 1000)
const FIXTURE_TITLES = {
  awaitingOwner: 'SPEC-005 Ready for Owner - Awaiting Owner',
  qualityReview: 'SPEC-005 Ready for Owner - Quality Review',
  readyForOwner: 'SPEC-005 Ready for Owner - Waiting on Merge',
  done: 'SPEC-005 Ready for Owner - Done',
} as const

function sqlPlaceholders(values: readonly unknown[]) {
  return values.map(() => '?').join(', ')
}

function tableExists(db: Database.Database, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function withTwoStepTerminalDisabled() {
  const db = new Database(E2E_DB_PATH)
  try {
    if (!tableExists(db, 'workspaces')) return () => undefined
    const rows = db.prepare('SELECT id, feature_flags FROM workspaces').all() as Array<{
      id: number
      feature_flags: string | null
    }>
    const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')

    for (const row of rows) {
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
      delete flags.FEATURE_TWO_STEP_TERMINAL
      update.run(Object.keys(flags).length > 0 ? JSON.stringify(flags) : null, row.id)
    }

    return () => {
      const restoreDb = new Database(E2E_DB_PATH)
      try {
        const restore = restoreDb.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
        for (const row of rows) {
          restore.run(row.feature_flags, row.id)
        }
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
      const titles = Object.values(FIXTURE_TITLES)
      const taskIds = db.prepare(`
        SELECT id FROM tasks
        WHERE title IN (${sqlPlaceholders(titles)})
      `).all(...titles).map((row) => (row as { id: number }).id)

      if (tableExists(db, 'notifications')) {
        db.prepare('DELETE FROM notifications WHERE recipient = ?').run(READY_FOR_OWNER_RECIPIENT)
        if (taskIds.length > 0) {
          db.prepare(`DELETE FROM notifications WHERE source_type = 'task' AND source_id IN (${sqlPlaceholders(taskIds)})`)
            .run(...taskIds)
        }
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
    })()
  } finally {
    db.close()
  }
}

function setSeededTaskTimestamps(taskIds: readonly number[]) {
  if (taskIds.length === 0) return
  const db = new Database(E2E_DB_PATH)
  try {
    const update = db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?')
    for (const taskId of taskIds) {
      update.run(FIXTURE_NOW_SECONDS, FIXTURE_NOW_SECONDS, taskId)
    }
  } finally {
    db.close()
  }
}

function forceReadyForOwnerStatus(taskId: number) {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare("UPDATE tasks SET status = 'ready_for_owner', updated_at = ? WHERE id = ?")
      .run(FIXTURE_NOW_SECONDS, taskId)
  } finally {
    db.close()
  }
}

function seedReadyForOwnerNotification(taskId: number, title: string) {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare(`
      INSERT INTO notifications (
        recipient, type, title, message, source_type, source_id, workspace_id, created_at
      )
      VALUES (?, 'task_ready_for_owner', 'Ready for owner merge', ?, 'task', ?, 1, ?)
    `).run(
      READY_FOR_OWNER_RECIPIENT,
      `Owner action required: ${title} is ready for owner merge.`,
      taskId,
      FIXTURE_NOW_SECONDS,
    )
  } finally {
    db.close()
  }
}

async function attachReadyForOwnerScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const normalizedName = name.replace(/[^a-z0-9-]+/gi, '-')

  if (REVIEW_SCREENSHOTS_ENABLED) {
    const dir = process.env.MC_E2E_SCREENSHOT_DIR ||
      path.join(process.cwd(), 'test-results', 'ready-for-owner-screenshots')
    const screenshotPath = path.join(dir, `${normalizedName}.png`)
    await fs.mkdir(dir, { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await testInfo.attach(`ready-for-owner-${name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }

  if (ARGOS_SCREENSHOTS_ENABLED) {
    await argosScreenshot(page, `ready-for-owner-${normalizedName}`, {
      fullPage: true,
      tag: READY_FOR_OWNER_SCREENSHOT_TAGS,
    })
  }
}

async function createTask(
  request: APIRequestContext,
  title: string,
  status: 'awaiting_owner' | 'quality_review' | 'done'
): Promise<SeededTask> {
  const res = await request.post('/api/tasks', {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} seeded for ready_for_owner Kanban e2e coverage`,
      priority: 'high',
      status,
    },
  })
  const body = await res.json().catch(() => ({}))
  expect(res.status(), JSON.stringify(body)).toBe(201)
  expect(body.task?.id).toBeTruthy()
  return { id: body.task.id as number, title }
}

test.describe.serial('Ready for Owner Kanban lane', () => {
  const seeded: SeededTask[] = []
  let awaitingOwner: SeededTask
  let qualityReview: SeededTask
  let readyForOwner: SeededTask
  let done: SeededTask
  let restoreFeatureFlags: (() => void) | undefined

  test.beforeAll(async ({ request }) => {
    await request.get('/api/tasks', { headers: API_KEY_HEADER })
    resetReadyForOwnerVisualFixture()
    restoreFeatureFlags = withTwoStepTerminalDisabled()

    awaitingOwner = await createTask(request, FIXTURE_TITLES.awaitingOwner, 'awaiting_owner')
    qualityReview = await createTask(request, FIXTURE_TITLES.qualityReview, 'quality_review')
    readyForOwner = await createTask(request, FIXTURE_TITLES.readyForOwner, 'quality_review')
    done = await createTask(request, FIXTURE_TITLES.done, 'done')
    seeded.push(awaitingOwner, qualityReview, readyForOwner, done)
    setSeededTaskTimestamps(seeded.map((task) => task.id))

    forceReadyForOwnerStatus(readyForOwner.id)
    seedReadyForOwnerNotification(readyForOwner.id, readyForOwner.title)
  })

  test.afterAll(async ({ request }) => {
    for (const task of [...seeded].reverse()) {
      await request.delete(`/api/tasks/${task.id}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    resetReadyForOwnerVisualFixture()
    restoreFeatureFlags?.()
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

  test('orders the lane between Quality Review and Done while preserving flag-off ready_for_owner visibility', { tag: READY_FOR_OWNER_TEST_TAGS }, async ({ page }, testInfo) => {
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

    const notificationCard = page.locator('div').filter({
      hasText: /Ready for owner merge[\s\S]*task_ready_for_owner[\s\S]*Owner action required/i,
    }).first()
    await expect(notificationCard).toBeVisible()
    await expect(notificationCard.getByText(new RegExp(readyForOwner.title))).toBeVisible()

    const markRead = notificationCard.getByRole('button', { name: /Mark read/i })
    await expect(markRead).toBeVisible()
    await page.getByRole('textbox', { name: /Agent name/i }).focus()
    await page.keyboard.press('Tab')
    await expect(markRead).toBeFocused()
    await expect(markRead).toHaveClass(/focus-visible:ring-2/)

    await attachReadyForOwnerScreenshot(page, testInfo, 'notification-action-required')
  })
})
