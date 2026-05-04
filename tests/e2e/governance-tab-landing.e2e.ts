/**
 * SPEC-008 — T288 — Governance tab landing + drilldowns.
 *
 * Flag-ON: Governance tab is the 4th tab in cost-tracker; default
 * subview is Policies; ArrowLeft/ArrowRight navigation per FR-200;
 * every sub-view × every state visual-snapshotted (FR-296).
 *
 * @see specs/008-resource-governance/spec.md FR-296, US5
 * @see specs/008-resource-governance/tasks.md T288, T303
 */

import { test, expect } from '@playwright/test'
import { dismissOnboardingForE2E, loginAsE2EAdmin } from '../helpers'
import { axeAssert } from './spec-008/governance-axe-shim'
import {
  seedGovernanceFixture,
  setWorkspaceFlags,
  snapshotState,
  teardownGovernanceFixture,
} from './spec-008/governance-fixtures'

const SUBVIEWS = ['policies', 'budgets', 'windows', 'overrides', 'diagnostics', 'system-health'] as const

const TARGET_TEST_ONLY = process.env.SPEC_008_TARGET_TEST_ONLY === '1'

test.describe('SPEC-008 T288 — Governance tab landing', () => {
  let workspaceId = 0

  test.beforeAll(async ({ request }) => {
    const seed = await seedGovernanceFixture(request, { flagOn: true })
    workspaceId = seed.workspaceId
  })

  // Login the page context for every test — the cost-tracker page is
  // gated behind the e2e admin session cookie. Without this, page.goto
  // redirects to /setup or /login and the governance tabpanel never
  // mounts.
  test.beforeEach(async ({ page, request }) => {
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  // Use the afterAll-supplied request (a fresh APIRequestContext) so
  // we don't reuse the closure-captured beforeAll one — Playwright
  // invalidates the latter before afterAll runs.
  test.afterAll(async ({ request }) => {
    await teardownGovernanceFixture(request, workspaceId)
  })

  for (const sub of SUBVIEWS) {
    for (const state of ['default', 'loading', 'error', 'empty', 'dense']) {
      const isTarget = sub === 'policies' && state === 'default'
      const runner = TARGET_TEST_ONLY && !isTarget ? test.skip : test
      runner(`subview ${sub} state ${state} @spec-008`, async ({ page, request }, testInfo) => {
        expect(workspaceId).toBeGreaterThan(0)
        await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
        await request.post('/api/admin/spec-008/seed-state', {
          headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
          data: { workspaceId, sub, state },
        })
        await page.goto(`/cost-tracker?tab=governance&sub=${sub}`)
        await expect(page.getByTestId(`governance-${sub}-subview`)).toBeVisible()
        await axeAssert(page, `tab-landing.${sub}.${state}`, `[data-testid="governance-${sub}-subview"]`)
        await snapshotState(page, testInfo, `tab-landing.${sub}.${state}`)
      })
    }
  }

  const kbdRunner = TARGET_TEST_ONLY ? test.skip : test
  kbdRunner('keyboard ArrowLeft/Right navigates between subviews @spec-008', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await axeAssert(page, 'tab-landing.kbd.right2', '[data-testid^="governance-"][role="tabpanel"]')
    await snapshotState(page, testInfo, 'tab-landing.kbd.right2')
  })
})
