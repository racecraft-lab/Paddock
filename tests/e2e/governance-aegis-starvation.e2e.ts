/**
 * SPEC-008 — T291 — Aegis starvation + reserve + escalation.
 *
 * Exercises AC-Aegis-1..6: starvation detector trips → emergency
 * reserve grants → operator escalation banner appears in System
 * Health. Visual snapshots per state. axe per FR-090n.
 *
 * @see specs/008-resource-governance/spec.md FR-303, FR-169, US4
 * @see specs/008-resource-governance/tasks.md T291, T306
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

test.describe('SPEC-008 T291 — Aegis starvation/reserve/escalation', () => {
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

  for (const ac of ['AC-Aegis-1', 'AC-Aegis-2', 'AC-Aegis-3', 'AC-Aegis-4', 'AC-Aegis-5', 'AC-Aegis-6']) {
    test(`${ac} state`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await request.post('/api/admin/spec-008/aegis-state', {
        headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
        data: { workspaceId, ac },
      })
      await page.goto('/cost-tracker?tab=governance&sub=system-health')
      await expect(page.getByTestId('aegis-emergency-reserve-badge')).toBeVisible()
      await axeAssert(page, `aegis-starvation.${ac}`)
      await snapshotState(page, testInfo, `aegis-starvation.${ac}`)
    })
  }
})
