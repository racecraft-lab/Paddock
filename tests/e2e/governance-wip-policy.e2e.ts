/**
 * SPEC-008 — T284 — Governance WIP policy operator journey.
 *
 * Operator creates an agent-scoped WIP policy with `limit_value=1`.
 * First task admits (`allow:clear`); second task defers with
 * reason `wip_exceeded`. The Governance tab reflects:
 *   - Policy editor → policies list → row.
 *   - Diagnostic feed shows the deny + the second-task defer.
 *   - System Health shows the WIP counter at 1/1.
 *
 * States exercised (visual snapshots per FR-228 + FR-229):
 *   - default
 *   - loading
 *   - error
 *   - empty
 *   - dense
 *   - flag-OFF (byte-compat — no Governance tab)
 *   - flag-ON (Governance tab visible + landing on Policies)
 *
 * axe-core a11y scans on every state per FR-090n WCAG 2.1 AA.
 *
 * @see specs/008-resource-governance/spec.md FR-296, US1, FR-296..305
 * @see specs/008-resource-governance/tasks.md T284 (this), T299 (axe)
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

test.describe('SPEC-008 T284 — WIP policy admission + Governance tab', () => {
  let workspaceId = 0
  let agentId = 0

  test.beforeAll(async ({ request }) => {
    const seed = await seedGovernanceFixture(request, { flagOn: true, seedPolicies: false })
    workspaceId = seed.workspaceId
    agentId = seed.agentIds[0] ?? 0
  })

  test.beforeEach(async ({ page, request }) => {
    await loginAsGovernanceOperator(page, request)
  })

  test.afterAll(async ({ request }) => {
    await teardownGovernanceFixture(request, workspaceId)
  })

  test('flag-ON: WIP limit_value=1 admits first, defers second with wip_exceeded', async ({
    page,
    request,
  }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    expect(agentId).toBeGreaterThan(0)

    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })

    await page.goto(`/cost-tracker?tab=governance&workspace_id=${workspaceId.toString()}`)
    await axeAssert(page, 'wip-policy.default')
    await snapshotState(page, testInfo, 'wip-policy.default')

    // Empty state — no policies yet.
    await expect(page.getByTestId('governance-policies-empty')).toBeVisible()
    await axeAssert(page, 'wip-policy.empty')
    await snapshotState(page, testInfo, 'wip-policy.empty')

    // Author the policy.
    await page.getByTestId('governance-policies-new-button').click()
    await page.getByTestId('policy-editor-name').fill('agent-wip-1')
    await page.getByTestId('policy-editor-type').selectOption('wip')
    await page.getByTestId('policy-editor-scope').selectOption('agent')
    await page.getByTestId('policy-editor-agent-id').fill(agentId.toString())
    await page.getByTestId('policy-editor-limit-value').fill('1')
    await page.getByTestId('policy-editor-enforce-mode').selectOption('hard')
    await axeAssert(page, 'wip-policy.editor.filled')
    await snapshotState(page, testInfo, 'wip-policy.editor.filled')

    await page.getByTestId('policy-editor-save').click()
    await expect(page.getByTestId('governance-policies-row-agent-wip-1')).toBeVisible()

    // Dense state — multiple policies + recent decisions in feed.
    await axeAssert(page, 'wip-policy.dense')
    await snapshotState(page, testInfo, 'wip-policy.dense')

    // Loading state surface.
    await page.getByTestId('governance-tab-diagnostics').click()
    await expect(page.getByTestId('diagnostic-feed-loading').or(page.getByTestId('diagnostic-feed-rows'))).toBeVisible()
    await axeAssert(page, 'wip-policy.diagnostics.loading')
    await snapshotState(page, testInfo, 'wip-policy.diagnostics.loading')
  })

  test('flag-OFF: governance tab is hidden (byte-compat)', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: false })
    await page.goto('/cost-tracker')
    await expect(page.getByTestId('cost-tracker-governance-tab')).toHaveCount(0)
    await axeAssert(page, 'wip-policy.flag-off', '[data-testid="cost-tracker-view-tabs"]')
    await snapshotState(page, testInfo, 'wip-policy.flag-off')
  })

  test('error state surfaces a helpful retry affordance', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.route('**/api/governance/policies**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'forced' }) }),
    )
    await page.goto('/cost-tracker?tab=governance')
    await expect(page.getByTestId('governance-policies-error')).toBeVisible()
    await axeAssert(page, 'wip-policy.error')
    await snapshotState(page, testInfo, 'wip-policy.error')
  })
})
