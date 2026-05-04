/**
 * SPEC-008 — T296 — Each FR-090i gesture category.
 *
 * Sister spec to T292: cycles every recovery gesture category to
 * confirm independent end-to-end coverage; FR-090i.
 *
 * @see specs/008-resource-governance/spec.md FR-090i
 * @see specs/008-resource-governance/tasks.md T296
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

const CATEGORIES = ['breaker', 'reaper', 'rebuild', 'reconciler', 'audit', 'collector'] as const

test.describe('SPEC-008 T296 — FR-090i recovery gesture categories', () => {
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

  for (const cat of CATEGORIES) {
    test(`category ${cat} gesture round-trip`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await page.goto(`/cost-tracker?tab=governance&sub=system-health&category=${cat}`)
      await expect(page.getByTestId(`system-health-${cat}-card`)).toBeVisible()
      await axeAssert(page, `system-health.${cat}`)
      await snapshotState(page, testInfo, `system-health.${cat}`)
    })
  }
})
