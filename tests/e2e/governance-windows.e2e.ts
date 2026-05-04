/**
 * SPEC-008 — T286 — Windows blackout 22:00-06:00 CDT + DST.
 *
 * Operator authors a blackout window 22:00-06:00 in `America/Chicago`.
 * Test exercises before/in/after window + the DST spring-forward
 * boundary (2026-03-08 02:00 → 03:00 CDT) confirming the materializer
 * picks the right local-time anchor. axe + Argos per FR-090n + FR-228.
 *
 * @see specs/008-resource-governance/spec.md FR-300, US3
 * @see specs/008-resource-governance/tasks.md T286, T301
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

test.describe('SPEC-008 T286 — blackout window + DST', () => {
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

  for (const t of [
    { label: 'pre.blackout.21h59m', clock: '2026-03-07T21:59:00-06:00' },
    { label: 'in.blackout.23h00m', clock: '2026-03-07T23:00:00-06:00' },
    { label: 'in.blackout.dst.fold', clock: '2026-03-08T01:30:00-06:00' },
    { label: 'post.blackout.06h01m', clock: '2026-03-08T06:01:00-05:00' },
  ]) {
    test(`window state: ${t.label}`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await page.clock.setFixedTime(new Date(t.clock))
      await page.goto('/cost-tracker?tab=governance&sub=windows')
      await expect(page.getByTestId('governance-windows-status')).toBeVisible()
      await axeAssert(page, `windows.${t.label}`)
      await snapshotState(page, testInfo, `windows.${t.label}`)
    })
  }
})
