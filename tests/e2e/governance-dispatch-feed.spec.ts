/**
 * SPEC-008 — T297 — Dispatch feed cursor pagination + SSE.
 *
 * Sister spec to T289 but for the dispatcher decision feed (vs the
 * diagnostic feed). FR-090j cursor pagination + live SSE append.
 *
 * @see specs/008-resource-governance/spec.md FR-090j
 * @see specs/008-resource-governance/tasks.md T297
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

test.describe('SPEC-008 T297 — dispatch feed pagination + SSE', () => {
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

  test('initial render + next-page', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics&feed=dispatch')
    await expect(page.getByTestId('diagnostic-feed-rows')).toBeVisible()
    await axeAssert(page, 'dispatch-feed.initial', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'dispatch-feed.initial')

    await page.getByTestId('diagnostic-feed-next').click()
    await axeAssert(page, 'dispatch-feed.next-page', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'dispatch-feed.next-page')
  })

  test('SSE live-append on new dispatch', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics&feed=dispatch')
    await request.post('/api/admin/spec-008/emit-dispatch', {
      headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
      data: { workspaceId },
    })
    await axeAssert(page, 'dispatch-feed.sse', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'dispatch-feed.sse')
  })
})
