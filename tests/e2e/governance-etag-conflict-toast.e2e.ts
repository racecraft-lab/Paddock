/**
 * SPEC-008 — Gap 4 — etag-conflict toast e2e (PR #26 gap-closure).
 *
 * Per FR-205 / FR-288. The override-grant + policy-edit PUT/PATCH
 * endpoints reject mismatched `If-Match` etags with 412 Precondition
 * Failed. The UI MUST surface this as a toast (via
 * `<EtagConflictToast>`) and refresh the row's etag so the operator
 * can retry without losing their edit context.
 *
 * This live e2e drives the PolicyEditor from the Governance Policies
 * subview, stubs the policy PUT as a 412 response, and verifies the
 * conflict toast plus refreshed edit context with an Argos/axe snapshot.
 *
 * @see specs/008-resource-governance/spec.md FR-205, FR-288
 * @see specs/008-resource-governance/tasks.md T188 (component), T319
 * @see src/components/governance/etag-conflict-toast.tsx
 * @see tests/e2e/governance-flag-off-byte-compat.e2e.ts
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

test.describe('SPEC-008 Gap 4 — etag conflict toast (FR-205 / FR-288)', () => {
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

  test(
    'SPEC-008 FR-205 etag conflict toast — live policy edit conflict',
    async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await page.route('**/api/governance/policies/*', async (route) => {
        if (route.request().method() !== 'PUT') {
          await route.continue()
          return
        }
        await route.fulfill({
          status: 412,
          contentType: 'application/json',
          headers: { etag: '"spec-008-refreshed-etag"' },
          body: JSON.stringify({
            code: 'precondition_failed',
            detail: 'policy changed upstream',
          }),
        })
      })
      await page.goto('/cost-tracker?tab=governance&sub=policies')
      await expect(page.getByTestId('governance-policies-new-button')).toBeVisible()
      await page.locator('[data-policy-id]').first().click()
      await expect(page.getByTestId('policy-editor')).toBeVisible()
      await page.getByTestId('policy-editor-limit-value').fill('4')
      await page.getByTestId('policy-editor-save').click()
      await expect(page.locator('[data-toast="etag_conflict"]')).toBeVisible()
      await axeAssert(page, 'etag-conflict-toast.live')
      await snapshotState(page, testInfo, 'etag-conflict-toast.live')
    },
  )
})
