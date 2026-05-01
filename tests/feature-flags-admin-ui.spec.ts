import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { argosScreenshot } from '@argos-ci/playwright'
import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  FEATURE_FLAG_ADMIN_VISUAL_WORKSPACE,
  freezeSpec002VisualClock,
  loginAsE2EAdmin,
  resetFeatureFlagAdminVisualFixture,
} from './helpers'

const ARGOS_SCREENSHOT_TAGS = ['feature-flag-admin']
const ARGOS_TEST_TAGS = ['@feature-flag-admin']
const REVIEW_SCREENSHOTS_ENABLED = process.env.MC_E2E_SCREENSHOTS === '1'
const ARGOS_SCREENSHOTS_ENABLED = process.env.ARGOS_PLAYWRIGHT_SCREENSHOTS === '1'

interface SeededWorkspace {
  id: number
  name: string
  slug: string
}

async function attachReviewScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {}
) {
  const normalizedName = name.replace(/[^a-z0-9-]+/gi, '-')
  const fullPage = options.fullPage ?? true

  if (REVIEW_SCREENSHOTS_ENABLED) {
    const dir = process.env.MC_E2E_SCREENSHOT_DIR ||
      path.join(process.cwd(), 'test-results', 'feature-flag-admin-screenshots')
    const screenshotPath = path.join(dir, `${normalizedName}.png`)
    await fs.mkdir(dir, { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage })
    await testInfo.attach(`feature-flag-admin-${name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }

  if (ARGOS_SCREENSHOTS_ENABLED) {
    await argosScreenshot(page, `feature-flag-admin-${normalizedName}`, {
      fullPage,
      tag: ARGOS_SCREENSHOT_TAGS,
    })
  }
}

async function prepareAuthenticatedPage(page: Page, request: Parameters<typeof loginAsE2EAdmin>[1]) {
  await freezeSpec002VisualClock(page)
  await page.context().addInitScript(() => {
    sessionStorage.setItem('mc-onboarding-dismissed', '1')
    sessionStorage.removeItem('mc-onboarding-replay')
  })
  const cookieHeader = await loginAsE2EAdmin(page, request)
  await dismissOnboardingForE2E(request, cookieHeader)
}

test.describe.serial('Platform Feature Flag admin UI journey', () => {
  let workspace: SeededWorkspace

  test.beforeAll(async ({ request }) => {
    resetFeatureFlagAdminVisualFixture()
    const res = await request.post('/api/workspaces', {
      headers: API_KEY_HEADER,
      data: {
        name: FEATURE_FLAG_ADMIN_VISUAL_WORKSPACE.name,
        slug: FEATURE_FLAG_ADMIN_VISUAL_WORKSPACE.slug,
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
