/**
 * SPEC-008 — T290 — System Health drilldown + breaker-open banner.
 *
 * Operator opens System Health subview; cards show source health,
 * collector heartbeat, breaker state. Drilldown opens per-source
 * detail. Breaker-open banner appears at top when state='open'.
 *
 * @see specs/008-resource-governance/spec.md FR-304, US7
 * @see specs/008-resource-governance/tasks.md T290, T305
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

test.describe('SPEC-008 T290 — System Health drilldown + breaker banner', () => {
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

  test('healthy state shows green cards', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=system-health')
    await expect(page.getByTestId('system-health-cards')).toBeVisible()
    await axeAssert(page, 'telemetry-health.healthy')
    await snapshotState(page, testInfo, 'telemetry-health.healthy')
  })

  test('breaker-open banner appears + drilldown', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await request.post('/api/admin/spec-008/breaker-state', {
      headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
      data: { state: 'open' },
    })
    await page.goto('/cost-tracker?tab=governance&sub=system-health')
    await expect(page.getByTestId('breaker-open-banner')).toBeVisible()
    await axeAssert(page, 'telemetry-health.breaker-open')
    await snapshotState(page, testInfo, 'telemetry-health.breaker-open')

    await page.getByTestId('system-health-card-claude-code').click()
    await axeAssert(page, 'telemetry-health.drilldown')
    await snapshotState(page, testInfo, 'telemetry-health.drilldown')
  })
})
