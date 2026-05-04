/**
 * SPEC-008 — T293 — Bulk policy promotion happy / wrong-phrase /
 * cross-workspace 422 / Idempotency-Key replay.
 *
 * Operator selects ≥ 2 shadow-mode policies and promotes them to
 * `hard` via the bulk-promote modal (typed phrase: PROMOTE BULK).
 * Cross-workspace selection rejected with 422; same Idempotency-Key
 * replay returns identical body.
 *
 * @see specs/008-resource-governance/spec.md FR-301, FR-090h, US5
 * @see specs/008-resource-governance/tasks.md T293, T308
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

test.describe('SPEC-008 T293 — bulk policy promotion + Idempotency-Key', () => {
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
    { name: 'happy', phrase: 'PROMOTE BULK', status: 'success' },
    { name: 'wrong-phrase', phrase: 'PROMOTE', status: 'submit-disabled' },
    { name: 'cross-workspace-422', phrase: 'PROMOTE BULK', status: '422' },
    { name: 'idempotency-replay', phrase: 'PROMOTE BULK', status: 'replay-200' },
  ]) {
    test(`bulk-promote ${variant.name}`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await request.post('/api/admin/spec-008/bulk-promote-state', {
        headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
        data: { workspaceId, variant: variant.name },
      })
      await page.goto('/cost-tracker?tab=governance&sub=policies')
      await page.getByTestId('governance-policies-bulk-promote').click()
      await expect(page.getByTestId('bulk-promote-modal')).toBeVisible()
      await page.getByTestId('bulk-promote-phrase-input').fill(variant.phrase)
      await axeAssert(page, `bulk-promote.${variant.name}.modal`)
      await snapshotState(page, testInfo, `bulk-promote.${variant.name}.modal`)
      if (variant.status === 'submit-disabled') {
        await expect(page.getByTestId('bulk-promote-submit')).toBeDisabled()
        await axeAssert(page, `bulk-promote.${variant.name}.result`)
        await snapshotState(page, testInfo, `bulk-promote.${variant.name}.result`)
        return
      }
      await page.getByTestId('bulk-promote-submit').click()
      await axeAssert(page, `bulk-promote.${variant.name}.result`)
      await snapshotState(page, testInfo, `bulk-promote.${variant.name}.result`)
    })
  }
})
