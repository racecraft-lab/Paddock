/**
 * SPEC-008 — T285 — Daily USD budget admission journey.
 *
 * Operator authors a workspace-scoped daily USD budget; soft 80% +
 * hard 100% precedence enforced. Visual snapshots at 0/50/80/95/100%
 * utilization (FR-296, US2). axe-core scans on each state.
 *
 * @see specs/008-resource-governance/spec.md FR-296, US2
 * @see specs/008-resource-governance/tasks.md T285, T300
 */

import { test, expect } from '@playwright/test'
import { axeAssert } from './spec-008/governance-axe-shim'
import {
  loginAsGovernanceOperator,
  seedGovernanceFixture,
  setWorkspaceFlags,
  snapshotState,
  teardownGovernanceFixture,
} from './spec-008/governance-fixtures'

test.describe('SPEC-008 T285 — daily USD budget soft/hard precedence', () => {
  let workspaceId = 0

  test.beforeAll(async ({ request }) => {
    const seed = await seedGovernanceFixture(request, { flagOn: true })
    workspaceId = seed.workspaceId
  })

  test.beforeEach(async ({ page, request }) => {
    await loginAsGovernanceOperator(page, request)
  })

  test.afterAll(async ({ request }) => {
    await teardownGovernanceFixture(request, workspaceId)
  })

  for (const pct of [0, 50, 80, 95, 100]) {
    test(`utilization snapshot at ${pct}%`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await request.post(`/api/admin/spec-008/budget-utilization`, {
        headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
        data: { workspaceId, pct },
      })
      await page.goto('/cost-tracker?tab=governance&sub=budgets')
      await expect(page.getByTestId('governance-budgets-utilization')).toBeVisible()
      await axeAssert(page, `budget.${pct}pct`)
      await snapshotState(page, testInfo, `budget.${pct}pct`)
    })
  }

  test('flag-OFF: budgets subview not present', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: false })
    await page.goto('/cost-tracker')
    await expect(page.getByTestId('governance-budgets-subview')).toHaveCount(0)
    await axeAssert(page, 'budget.flag-off', '[data-testid="cost-tracker-view-tabs"]')
    await snapshotState(page, testInfo, 'budget.flag-off')
  })
})
