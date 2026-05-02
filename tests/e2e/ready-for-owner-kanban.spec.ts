import { expect, test, type APIRequestContext } from '@playwright/test'
import Database from 'better-sqlite3'
import path from 'node:path'

import { API_KEY_HEADER, dismissOnboardingForE2E, loginAsE2EAdmin } from '../helpers'

type SeededTask = {
  id: number
  title: string
}

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ||
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')

function uniqueTitle(label: string) {
  return `SPEC-005 Kanban ${label} ${Date.now()} ${Math.random().toString(16).slice(2)}`
}

function tableExists(db: Database.Database, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function withFeatureFlagsDisabled() {
  const db = new Database(E2E_DB_PATH)
  try {
    if (!tableExists(db, 'workspaces')) return
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
      delete flags.FEATURE_WORKSPACE_SWITCHER
      update.run(Object.keys(flags).length > 0 ? JSON.stringify(flags) : null, row.id)
    }
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}

function forceReadyForOwnerStatus(taskId: number) {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare("UPDATE tasks SET status = 'ready_for_owner', updated_at = ? WHERE id = ?")
      .run(Math.floor(Date.now() / 1000), taskId)
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}

function seedReadyForOwnerNotification(taskId: number, title: string) {
  const db = new Database(E2E_DB_PATH)
  const now = Math.floor(Date.now() / 1000)
  try {
    db.prepare(`
      INSERT INTO notifications (
        recipient, type, title, message, source_type, source_id, workspace_id, created_at
      )
      VALUES (?, 'task_ready_for_owner', 'Ready for owner merge', ?, 'task', ?, 1, ?)
    `).run(
      'owner-e2e',
      `${title} is ready for owner merge.`,
      taskId,
      now,
    )
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}

async function createTask(
  request: APIRequestContext,
  label: string,
  status: 'awaiting_owner' | 'quality_review' | 'done'
): Promise<SeededTask> {
  const title = uniqueTitle(label)
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

  test.beforeAll(async ({ request }) => {
    await request.get('/api/tasks', { headers: API_KEY_HEADER })
    withFeatureFlagsDisabled()

    awaitingOwner = await createTask(request, 'Awaiting Owner', 'awaiting_owner')
    qualityReview = await createTask(request, 'Quality Review', 'quality_review')
    readyForOwner = await createTask(request, 'Ready For Owner', 'quality_review')
    done = await createTask(request, 'Done', 'done')
    seeded.push(awaitingOwner, qualityReview, readyForOwner, done)

    forceReadyForOwnerStatus(readyForOwner.id)
    seedReadyForOwnerNotification(readyForOwner.id, readyForOwner.title)
  })

  test.afterAll(async ({ request }) => {
    for (const task of [...seeded].reverse()) {
      await request.delete(`/api/tasks/${task.id}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
  })

  test.beforeEach(async ({ page, request }) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  test('orders the lane between Quality Review and Done while preserving flag-off ready_for_owner visibility', async ({ page }) => {
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
  })

  test('exposes accessible lane and keyboard focus affordances for Ready for Owner tasks', async ({ page }) => {
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
  })

  test('keeps unread ready-for-owner notification actions keyboard reachable and identifiable', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('mc.notifications.recipient', 'owner-e2e')
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
  })
})
