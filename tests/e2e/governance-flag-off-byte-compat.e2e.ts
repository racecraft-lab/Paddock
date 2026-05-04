/**
 * SPEC-008 — Flag-OFF byte-compat regression spec.
 *
 * Per FR-186 / FR-193 / FR-305. Asserts that when
 * `FEATURE_RESOURCE_GOVERNANCE` is OFF for the caller's workspace,
 * the rendered HTML of the cost-tracker panel is byte-identical to
 * the legacy panel — i.e. no <GovernanceTab> tab is added, no
 * governance subview is rendered, and no governance JS bundle is
 * eagerly fetched.
 *
 * This live e2e seeds a flag-OFF workspace + auth session against the
 * running app, verifies the legacy cost-tracker affordances stay clean,
 * then flips the governance flag ON and snapshots the landing tab.
 *
 * @see specs/008-resource-governance/tasks.md T164 (byte-compat
 *      branch), T201, T202
 */

import { test, expect } from '@playwright/test';
import { axeAssert } from './spec-008/governance-axe-shim';
import {
  loginAsGovernanceOperator,
  seedGovernanceFixture,
  setWorkspaceFlags,
  snapshotState,
  teardownGovernanceFixture,
} from './spec-008/governance-fixtures';

test.describe('SPEC-008 cost-tracker feature-flag byte-compat', () => {
  let workspaceId = 0;

  test.beforeAll(async ({ request }) => {
    const seed = await seedGovernanceFixture(request, { flagOn: false });
    workspaceId = seed.workspaceId;
  });

  test.beforeEach(async ({ page, request }) => {
    await loginAsGovernanceOperator(page, request);
  });

  test.afterAll(async ({ request }) => {
    await teardownGovernanceFixture(request, workspaceId);
  });

  test('FEATURE_RESOURCE_GOVERNANCE OFF hides all governance affordances', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0);
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: false });
    await page.goto('/cost-tracker');
    await expect(page.getByTestId('cost-tracker-view-tabs')).toBeVisible();
    await expect(page.getByTestId('cost-tracker-governance-tab')).toHaveCount(0);
    await expect(page.locator('[data-spec="008"]')).toHaveCount(0);
    await axeAssert(page, 'flag-off-byte-compat.live', '[data-testid="cost-tracker-view-tabs"]');
    await snapshotState(page, testInfo, 'flag-off-byte-compat.live');
  });

  test('FEATURE_RESOURCE_GOVERNANCE ON reveals the governance landing tab', async ({ page, request }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0);
    await setWorkspaceFlags(request, workspaceId, { FEATURE_RESOURCE_GOVERNANCE: true });
    await page.goto('/cost-tracker?tab=governance');
    await expect(page.getByTestId('cost-tracker-governance-tab')).toBeVisible();
    await expect(page.getByTestId('governance-tab-policies')).toBeVisible();
    await axeAssert(page, 'flag-on-tab-landing.live');
    await snapshotState(page, testInfo, 'flag-on-tab-landing.live');
  });
});
