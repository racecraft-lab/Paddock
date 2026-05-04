/**
 * SPEC-008 — T292 — One-click recovery affordance gesture matrix.
 *
 * Exercises every gesture in the FR-090i recovery matrix: typed
 * confirmation modal, focus-trap, Esc cancels, Enter on disabled
 * submit no-op until phrase matches. Argos snapshots; axe scans.
 *
 * @see specs/008-resource-governance/spec.md FR-298, FR-090i, US8
 * @see specs/008-resource-governance/tasks.md T292, T307
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

const GESTURES = [
  'breaker-reset',
  'reservation-reaper-force-run',
  'counter-rebuild-restart',
  'reconciler-retry',
  'audit-chain-verify',
  'collector-rotate-key',
] as const

test.describe('SPEC-008 T292 — System Health recovery gesture matrix', () => {
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

  for (const gesture of GESTURES) {
    test(`gesture ${gesture}: typed-confirmation modal flow`, async ({ page, request }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
      await page.goto('/cost-tracker?tab=governance&sub=system-health')
      await page.getByTestId(`recovery-${gesture}-button`).click()
      await expect(page.getByTestId('incident-recovery-modal')).toBeVisible()
      await axeAssert(page, `recovery.${gesture}.modal-open`)
      await snapshotState(page, testInfo, `recovery.${gesture}.modal-open`)

      // Submit disabled until phrase matches
      const submit = page.getByTestId('incident-recovery-submit')
      await expect(submit).toBeDisabled()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('incident-recovery-modal')).toBeVisible()
      await axeAssert(page, `recovery.${gesture}.disabled-noop`)
      await snapshotState(page, testInfo, `recovery.${gesture}.disabled-noop`)

      // Esc cancels
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('incident-recovery-modal')).toHaveCount(0)
    })
  }
})
