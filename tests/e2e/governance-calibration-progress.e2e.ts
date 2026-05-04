/**
 * SPEC-008 — T294 — Calibration progress milestones.
 *
 * Drift detector emits AC-Drift-1..4 progression: auto-repair tier
 * idempotency banner; operator-confirmed UI flow; hard-block enters
 * `pending_rebuild_job_id` shadow; post-rebuild verification ack.
 *
 * @see specs/008-resource-governance/spec.md FR-302, US5
 * @see specs/008-resource-governance/tasks.md T294
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

const TIERS = ['auto-repair', 'operator-confirmed', 'hard-block', 'post-rebuild-verify'] as const

test.describe('SPEC-008 T294 — calibration progress AC-Drift-1..4', () => {
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

  for (const tier of TIERS) {
    test(`calibration tier ${tier}`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await request.post('/api/admin/spec-008/calibration-state', {
        headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
        data: { workspaceId, tier },
      })
      await page.goto('/cost-tracker?tab=governance&sub=system-health')
      await expect(page.getByTestId('calibration-progress')).toBeVisible()
      await axeAssert(page, `calibration.${tier}`)
      await snapshotState(page, testInfo, `calibration.${tier}`)
    })
  }
})
