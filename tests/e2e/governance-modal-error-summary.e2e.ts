/**
 * SPEC-008 — Gap 5 — modal error summary e2e (PR #26 gap-closure).
 *
 * Per FR-206 / FR-090p. The override-grant + policy-promotion modals
 * MUST surface validation + server errors in an aggregated summary
 * at the top of the modal. Required a11y semantics:
 *   - `role="alert"` on the summary container.
 *   - Programmatic focus on the summary when it appears (so screen
 *     readers announce the message immediately).
 *   - Stable testid (`modal-error-summary` by default; story-level
 *     ids `modal-error-summary-phrase-mismatch`,
 *     `modal-error-summary-server-422`, `modal-error-summary-network`).
 *
 * This live e2e drives the override-grant form through a validation
 * failure and verifies the rendered ModalErrorSummary focus behavior,
 * `role="alert"` semantics, axe state, and Argos snapshot.
 *
 * @see specs/008-resource-governance/spec.md FR-206, FR-090p
 * @see specs/008-resource-governance/tasks.md T319
 * @see src/components/governance/modal-error-summary.tsx
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

test.describe('SPEC-008 Gap 5 — modal error summary (FR-206 / FR-090p)', () => {
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
    'SPEC-008 FR-206 modal error summary — live override validation failure',
    async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await page.goto('/cost-tracker?tab=governance&sub=overrides')
      await expect(page.getByTestId('governance-overrides-grant-form')).toBeVisible()
      await page.getByTestId('override-grant-reason').fill('SPEC-008 modal summary')
      await page.getByTestId('override-grant-ttl-minutes').fill('0')
      await page.getByTestId('override-grant-submit').click()
      const summary = page.getByTestId('modal-error-summary-server-422')
      await expect(summary).toBeVisible()
      await expect(summary).toHaveAttribute('role', 'alert')
      await expect.poll(async () => (
        await summary.evaluate((node) => node === document.activeElement)
      )).toBe(true)
      await axeAssert(page, 'modal-error-summary.live')
      await snapshotState(page, testInfo, 'modal-error-summary.live')
    },
  )
})
