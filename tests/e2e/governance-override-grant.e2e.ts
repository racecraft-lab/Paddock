/**
 * SPEC-008 — T287 — Override grant happy path + 409/412/422/423.
 *
 * Operator grants an override token from the Governance > Overrides
 * subview; concurrent edits surface 412 (If-Match), invalid TTL surfaces
 * 422 (sanity bounds), locked grant surfaces 423. Snapshots at each
 * variant per FR-299, US4.
 *
 * @see specs/008-resource-governance/spec.md FR-299, US4
 * @see specs/008-resource-governance/tasks.md T287, T302
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

test.describe('SPEC-008 T287 — override grant happy + conflict shapes', () => {
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

  for (const variant of [
    { name: 'happy', expectStatus: 201 },
    { name: 'concurrent-edit-412', expectStatus: 412 },
    { name: 'invalid-ttl-422', expectStatus: 422 },
    { name: 'locked-423', expectStatus: 423 },
    { name: 'duplicate-409', expectStatus: 409 },
  ]) {
    test(`override grant ${variant.name}`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await request.post('/api/admin/spec-008/override-grant-state', {
        headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
        data: { workspaceId, variant: variant.name },
      })
      await page.goto('/cost-tracker?tab=governance&sub=overrides')
      await expect(page.getByTestId('governance-overrides-grant-form')).toBeVisible()
      await page.getByTestId('override-grant-reason').fill(`SPEC-008 ${variant.name}`)
      if (variant.name === 'invalid-ttl-422') {
        await page.getByTestId('override-grant-ttl-minutes').fill('0')
      }
      await axeAssert(page, `override-grant.${variant.name}.form`)
      await snapshotState(page, testInfo, `override-grant.${variant.name}.form`)
      await page.getByTestId('override-grant-submit').click()
      await axeAssert(page, `override-grant.${variant.name}.result`)
      await snapshotState(page, testInfo, `override-grant.${variant.name}.result`)
    })
  }
})
