/**
 * SPEC-008 — T289 — Diagnostic feed initial / next-page / live-append /
 * filter / empty (FR-297, FR-090j, US6).
 *
 * Cursor-paginated. SSE live-append. Filter by reason code. Empty
 * state when filter excludes everything.
 *
 * @see specs/008-resource-governance/spec.md FR-297, FR-090j, US6
 * @see specs/008-resource-governance/tasks.md T289, T304
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

test.describe('SPEC-008 T289 — diagnostic feed pagination + SSE', () => {
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

  test('initial page renders rows + cursor', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics')
    await expect(page.getByTestId('diagnostic-feed-rows')).toBeVisible()
    await axeAssert(page, 'diagnostic-feed.initial', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'diagnostic-feed.initial')
  })

  test('next-page advances cursor', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics')
    await page.getByTestId('diagnostic-feed-next').click()
    await axeAssert(page, 'diagnostic-feed.next-page', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'diagnostic-feed.next-page')
  })

  test('live-append via SSE on new decision', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics')
    await request.post('/api/admin/spec-008/emit-decision', {
      headers: { 'x-api-key': process.env.API_KEY ?? 'test-api-key-e2e-12345' },
      data: { workspaceId, reason: 'wip_exceeded' },
    })
    await axeAssert(page, 'diagnostic-feed.live-append', '[data-testid="governance-diagnostics-subview"]')
    await snapshotState(page, testInfo, 'diagnostic-feed.live-append')
  })

  test('filter by reason — empty state', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true })
    await page.goto('/cost-tracker?tab=governance&sub=diagnostics&reason=does-not-exist')
    await expect(page.getByTestId('diagnostic-feed-empty')).toBeVisible()
    await axeAssert(page, 'diagnostic-feed.empty')
    await snapshotState(page, testInfo, 'diagnostic-feed.empty')
  })
})
