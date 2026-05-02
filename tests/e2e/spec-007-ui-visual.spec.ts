import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { argosScreenshot } from '@argos-ci/playwright'
import {
  dismissOnboardingForE2E,
  loginAsE2EAdmin,
} from '../helpers'
import {
  SPEC_007_FIXED_NOW,
  seedSpec007E2E,
  type Spec007E2EFixture,
} from '../../scripts/seed-spec-007'

const ARGOS_SCREENSHOT_TAGS = ['spec-007']
const ARGOS_TEST_TAGS = ['@spec-007']
const REVIEW_SCREENSHOTS_ENABLED = process.env.MC_E2E_SCREENSHOTS === '1'
const ARGOS_SCREENSHOTS_ENABLED = process.env.ARGOS_PLAYWRIGHT_SCREENSHOTS === '1'

async function attachReviewScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {},
) {
  const normalizedName = name.replace(/[^a-z0-9-]+/gi, '-')
  const fullPage = options.fullPage ?? true

  if (REVIEW_SCREENSHOTS_ENABLED) {
    const dir = process.env.MC_E2E_SCREENSHOT_DIR ||
      path.join(process.cwd(), 'test-results', 'spec-007-screenshots')
    const screenshotPath = path.join(dir, `${normalizedName}.png`)
    await fs.mkdir(dir, { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage })
    await testInfo.attach(`spec-007-${name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }

  if (ARGOS_SCREENSHOTS_ENABLED) {
    await argosScreenshot(page, `spec-007-${normalizedName}`, {
      fullPage,
      tag: ARGOS_SCREENSHOT_TAGS,
    })
  }
}

async function prepareAuthenticatedSpec007Page(
  page: Page,
  request: Parameters<typeof loginAsE2EAdmin>[1],
  fixture: Spec007E2EFixture,
) {
  await page.clock.setFixedTime(SPEC_007_FIXED_NOW)
  await page.context().addInitScript(({ workspaceId }) => {
    sessionStorage.setItem('mc-onboarding-dismissed', '1')
    sessionStorage.removeItem('mc-onboarding-replay')
    localStorage.setItem('mc:active-workspace:v1', JSON.stringify({
      payloadVersion: 1,
      tenantId: 1,
      productLineId: workspaceId,
      scopeVersion: 1,
    }))
  }, { workspaceId: fixture.alpha.workspace.id })
  const cookieHeader = await loginAsE2EAdmin(page, request)
  await dismissOnboardingForE2E(request, cookieHeader)
}

test.describe.serial('SPEC-007 disposition and artifact UI journeys', () => {
  let fixture: Spec007E2EFixture

  test.beforeAll(async ({ request }) => {
    fixture = await seedSpec007E2E(request)
  })

  test.afterAll(async () => {
    await fixture?.cleanup()
  })

  test.beforeEach(async ({ page, request }) => {
    await prepareAuthenticatedSpec007Page(page, request, fixture)
  })

  test('shows the dashboard 7-day disposition rollup for the active product line', { tag: ARGOS_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/')
    const widget = page.getByTestId('last-7d-triage-totals-widget')
    await expect(widget).toBeVisible()
    await expect(widget.getByTestId('last-7d-triage-totals-total')).toHaveText('50')
    await expect(widget.getByTestId('last-7d-triage-totals-day')).toHaveCount(7)
    await expect(widget.getByTestId('last-7d-triage-totals-legend-item').filter({ hasText: 'validation_failed' })).toBeVisible()
    await attachReviewScreenshot(page, testInfo, 'dashboard-rollup-widget', { fullPage: false })
  })

  test('filters and pages the Dispositions audit tab', { tag: ARGOS_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/audit')
    await page.getByTestId('audit-tab-dispositions').click()
    await expect(page.getByTestId('dispositions-tab')).toBeVisible()

    const workspaceInput = page.getByTestId('dispositions-filter-workspace')
    await workspaceInput.fill(String(fixture.alpha.workspace.id))
    await page.getByRole('button', { name: /^Refresh$/ }).click()

    await expect(page.getByTestId('dispositions-list')).toBeVisible()
    await expect(page.getByTestId('dispositions-row-disposition').first()).toBeVisible()
    await expect(page.getByTestId('dispositions-filter-chip-unknown')).toHaveText(/validation_failed/i)
    await attachReviewScreenshot(page, testInfo, 'audit-dispositions-loaded')

    await page.getByTestId('dispositions-filter-chip-unknown').click()
    await page.getByRole('button', { name: /^Refresh$/ }).click()
    await expect(page.getByTestId('dispositions-row-disposition').first()).toHaveText(/validation_failed/i)
    await attachReviewScreenshot(page, testInfo, 'audit-dispositions-validation-filter', { fullPage: false })
  })

  test('loads Artifact Admin health, list, preview, and quarantine action states', { tag: ARGOS_TEST_TAGS }, async ({ page }, testInfo) => {
    await page.goto('/audit')
    await page.getByTestId('audit-tab-artifacts').click()
    await expect(page.getByTestId('artifact-admin-panel')).toBeVisible()

    const healthTile = page.getByTestId('artifact-health-tile')
    await expect(healthTile).toContainText('Total artifacts')
    await expect(healthTile).toContainText('12')
    await expect(page.getByTestId('artifact-p95-tile')).toHaveText(/insufficient data/i)

    const cleanArtifact = fixture.alpha.artifacts.find((row) => row.redaction_status === 'clean')
    expect(cleanArtifact, 'seed includes a clean artifact').toBeTruthy()
    const cleanRow = page.getByTestId(`artifact-row-${String(cleanArtifact!.id)}`)
    await expect(cleanRow).toBeVisible()
    await expect(cleanRow).toContainText('triage_outcome')
    await attachReviewScreenshot(page, testInfo, 'artifact-admin-mixed-state')

    await cleanRow.getByRole('button', { name: /^Preview$/ }).click()
    await expect(page.getByTestId('artifact-preview-pane')).toBeVisible()
    await attachReviewScreenshot(page, testInfo, 'artifact-admin-preview', { fullPage: false })

    await cleanRow.getByRole('button', { name: /^Quarantine$/ }).click()
    await expect(page.getByTestId('artifact-action-status')).toHaveText(/quarantine: ok/i)
    await attachReviewScreenshot(page, testInfo, 'artifact-admin-quarantine-action', { fullPage: false })
  })
})
