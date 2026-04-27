import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { argosScreenshot } from '@argos-ci/playwright'
import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  loginAsE2EAdmin,
} from './helpers'

const ARGOS_SCREENSHOT_TAGS = ['spec-002', 'feature-flag-admin']
const ARGOS_TEST_TAGS = ['@spec-002', '@feature-flag-admin']

interface SeededWorkspace {
  id: number
  name: string
  slug: string
}

function stamp() {
  return Date.now().toString(36).slice(-8)
}

async function attachReviewScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {}
) {
  const normalizedName = name.replace(/[^a-z0-9-]+/gi, '-')
  const fullPage = options.fullPage ?? true

  if (process.env.SPEC002_SCREENSHOTS === '1') {
    const dir = process.env.SPEC002_SCREENSHOT_DIR || path.join(process.cwd(), 'test-results', 'spec-002-screenshots')
    const screenshotPath = path.join(dir, `${normalizedName}.png`)
    await fs.mkdir(dir, { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage })
    await testInfo.attach(`spec-002-${name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }

  if (process.env.SPEC002_ARGOS_SCREENSHOTS === '1') {
    await argosScreenshot(page, `spec-002-${normalizedName}`, {
      fullPage,
      tag: ARGOS_SCREENSHOT_TAGS,
    })
  }
}

async function prepareAuthenticatedPage(page: Page, request: Parameters<typeof loginAsE2EAdmin>[1]) {
  await page.context().addInitScript(() => {
    sessionStorage.setItem('mc-onboarding-dismissed', '1')
    sessionStorage.removeItem('mc-onboarding-replay')
  })
  const cookieHeader = await loginAsE2EAdmin(page, request)
  await dismissOnboardingForE2E(request, cookieHeader)
}

test.describe.serial('SPEC-002 Feature Flag admin UI journey', () => {
  let workspace: SeededWorkspace

  test.beforeAll(async ({ request }) => {
    const suffix = stamp()
    const res = await request.post('/api/workspaces', {
      headers: API_KEY_HEADER,
      data: {
        name: `SPEC-002 Flag Admin ${suffix}`,
        slug: `spec-002-flag-admin-${suffix}`,
      },
    })
    const body = await res.json().catch(() => ({}))
    expect(res.ok(), `create workspace failed: ${JSON.stringify(body)}`).toBe(true)
    expect(body.workspace?.id).toBeTruthy()
    workspace = body.workspace
  })

  test.afterAll(async ({ request }) => {
    if (workspace?.id) {
      await request.delete(`/api/workspaces/${workspace.id}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
  })

  test.beforeEach(async ({ page, request }) => {
    await prepareAuthenticatedPage(page, request)
  })

  test('loads the admin Feature Flags tab and toggles the Product Line switcher for one workspace', { tag: ARGOS_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/settings')
    await expect(page).not.toHaveURL(/\/login/)

    await page.getByRole('button', { name: /^Feature Flags$/i }).click()
    await expect(page.getByRole('heading', { name: /^Feature Flags$/i })).toBeVisible()
    await expect(page.getByText(/Human admin session only/i)).toBeVisible()
    const workspaceSelect = page.getByLabel(/Target workspace/i)
    await workspaceSelect.selectOption(String(workspace.id))
    await expect(workspaceSelect).toHaveValue(String(workspace.id))

    const switcherCard = page.getByTestId('feature-flag-card-FEATURE_WORKSPACE_SWITCHER')
    await expect(switcherCard).toContainText('Product Line switcher')
    await expect(switcherCard).toContainText('Evaluated OFF')
    await expect(page.getByText('workspaces.feature_flags')).toBeVisible()
    await switcherCard.scrollIntoViewIfNeeded()
    await page.mouse.move(20, 20)
    await attachReviewScreenshot(page, testInfo, 'feature-flag-admin-default', { fullPage: false })

    await switcherCard.getByRole('button', { name: /enable product line switcher/i }).click()
    await expect(page.getByText(/Product Line switcher enabled/i)).toBeVisible()
    await expect(switcherCard).toContainText('Evaluated ON')
    await expect(switcherCard).toContainText('true')
    await expect(switcherCard.getByRole('button', { name: /disable product line switcher/i })).toBeVisible()
    await switcherCard.scrollIntoViewIfNeeded()
    await page.mouse.move(20, 20)
    await attachReviewScreenshot(page, testInfo, 'feature-flag-admin-toggle-on', { fullPage: false })

    await switcherCard.getByRole('button', { name: /disable product line switcher/i }).click()
    await expect(page.getByText(/Product Line switcher disabled/i)).toBeVisible()
    await expect(switcherCard).toContainText('Evaluated OFF')
  })
})
