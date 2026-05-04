/**
 * SPEC-008 — T340..T348 — Per-flag UI gating Playwright matrix.
 *
 * Single parameterized e2e file orchestrates every per-flag UI gate.
 * Each row corresponds to one of the 9 task identifiers:
 *
 *   T340 FEATURE_WORKSPACE_SWITCHER         — workspace switcher chip
 *   T341 FEATURE_GLOBAL_AEGIS               — Aegis singleton header badge
 *   T342 FEATURE_TASK_PIPELINES             — pipeline editor entry
 *   T343 FEATURE_TWO_STEP_TERMINAL          — ready-for-owner Kanban col
 *   T344 FEATURE_AREA_LABEL_ROUTING         — area:* dropdown
 *   T345 FEATURE_DISPOSITION_LOGGING        — Dispositions audit tab
 *   T346 FEATURE_TASK_ARTIFACTS             — Artifacts panel
 *   T347 FEATURE_RESOURCE_GOVERNANCE        — Governance tab
 *   T348 FEATURE_OPENCLAW_HEALTH_COSTS      — OpenClaw health card
 *
 * Each test asserts (a) flag-OFF → DOM target hidden, (b) flag-ON →
 * DOM target visible. axe-core scans on each side of the gate.
 *
 * @see specs/008-resource-governance/spec.md FR-322
 * @see specs/008-resource-governance/tasks.md T340..T348
 */

import { test, expect, type Page } from '@playwright/test'
import { dismissOnboardingForE2E, loginAsE2EAdmin } from '../helpers'
import { FEATURE_FLAG_KEYS, type FeatureFlagKey } from '../../src/lib/feature-flags'
import { axeAssert } from './spec-008/governance-axe-shim'
import {
  seedGovernanceFixture,
  setWorkspaceFlags,
  snapshotState,
  teardownGovernanceFixture,
} from './spec-008/governance-fixtures'

const MATRIX = [
  {
    task: 'T340',
    flag: 'FEATURE_WORKSPACE_SWITCHER',
    visibleSelector: 'workspace-switcher',
    visiblePath: '/',
  },
  {
    task: 'T341',
    flag: 'FEATURE_GLOBAL_AEGIS',
    visibleSelector: 'aegis-emergency-reserve-badge',
    visiblePath: '/cost-tracker?tab=governance&sub=system-health',
  },
  {
    task: 'T342',
    flag: 'FEATURE_TASK_PIPELINES',
    visibleSelector: 'pipeline-editor-entry',
    visiblePath: '/orchestration',
  },
  {
    task: 'T343',
    flag: 'FEATURE_TWO_STEP_TERMINAL',
    visibleSelector: 'ready-for-owner-kanban-col',
    visiblePath: '/board',
  },
  {
    task: 'T344',
    flag: 'FEATURE_AREA_LABEL_ROUTING',
    visibleSelector: 'area-label-dropdown',
    visiblePath: '/projects',
  },
  {
    task: 'T345',
    flag: 'FEATURE_DISPOSITION_LOGGING',
    visibleSelector: 'audit-tab-dispositions',
    visiblePath: '/audit',
  },
  {
    task: 'T346',
    flag: 'FEATURE_TASK_ARTIFACTS',
    visibleSelector: 'artifacts-panel',
    visiblePath: '/tasks',
  },
  {
    task: 'T347',
    flag: 'FEATURE_RESOURCE_GOVERNANCE',
    visibleSelector: 'cost-tracker-governance-tab',
    visiblePath: '/cost-tracker',
  },
  {
    task: 'T348',
    flag: 'FEATURE_OPENCLAW_HEALTH_COSTS',
    visibleSelector: 'system-health-openclaw-card',
    visiblePath: '/cost-tracker?tab=governance&sub=system-health',
  },
] as const

const ALL_CURRENT_FLAGS = FEATURE_FLAG_KEYS

function flagsMap(value: boolean): Record<FeatureFlagKey, boolean> {
  return Object.fromEntries(ALL_CURRENT_FLAGS.map((flag) => [flag, value])) as Record<FeatureFlagKey, boolean>
}

async function openFeatureFlagsSettings(page: Page) {
  await page.goto('/settings')
  const replaySkip = page.getByRole('button', { name: 'Skip setup' })
  if (await replaySkip.isVisible({ timeout: 500 }).catch(() => false)) {
    await replaySkip.click()
  }
  await page.getByRole('button', { name: 'Feature Flags' }).click()
  await expect(page.getByRole('heading', { name: 'Feature Flags' })).toBeVisible()
}

test.describe('SPEC-008 T340..T348 — per-flag UI gating', () => {
  let workspaceId = 0

  test.beforeAll(async ({ request }) => {
    const seed = await seedGovernanceFixture(request, { flagOn: false })
    workspaceId = seed.workspaceId
  })

  test.afterAll(async ({ request }) => teardownGovernanceFixture(request, workspaceId))

  test.beforeEach(async ({ page, request }) => {
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  for (const row of MATRIX) {
    test(`${row.task} ${row.flag}: OFF hides ${row.visibleSelector}`, async ({
      page,
      request,
    }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, flagsMap(false))
      await openFeatureFlagsSettings(page)
      await expect(page.getByTestId(`feature-flag-card-${row.flag}`)).toHaveText(/Evaluated OFF/)
      await axeAssert(page, `flag-matrix.${row.flag}.off`, `[data-testid="feature-flag-card-${row.flag}"]`)
      await snapshotState(page, testInfo, `flag-matrix.${row.flag}.off`)
    })

    test(`${row.task} ${row.flag}: ON shows ${row.visibleSelector}`, async ({
      page,
      request,
    }, testInfo) => {
      expect(workspaceId).toBeGreaterThan(0)
      await setWorkspaceFlags(request, workspaceId, flagsMap(false))
      // For later roadmap flags, the e2e helper writes the additive cascade.
      await setWorkspaceFlags(request, workspaceId, { [row.flag]: true })
      await openFeatureFlagsSettings(page)
      await expect(page.getByTestId(`feature-flag-card-${row.flag}`)).toHaveText(/Evaluated ON/)
      await axeAssert(page, `flag-matrix.${row.flag}.on`, `[data-testid="feature-flag-card-${row.flag}"]`)
      await snapshotState(page, testInfo, `flag-matrix.${row.flag}.on`)
    })
  }

  test('T350 all-flags-OFF: legacy UI parity (no governance / no switcher / no kanban)', async ({
    page,
    request,
  }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, flagsMap(false))
    await page.goto('/cost-tracker')
    await expect(page.getByTestId('cost-tracker-governance-tab')).toHaveCount(0)
    await axeAssert(page, 'flag-matrix.all-off.legacy-parity', '[data-testid="cost-tracker-view-tabs"]')
    await snapshotState(page, testInfo, 'flag-matrix.all-off.legacy-parity')
  })

  test('T349 all-current-flags-ON: additive cascade reaches settings and Governance e2e surfaces', async ({
    page,
    request,
  }, testInfo) => {
    expect(workspaceId).toBeGreaterThan(0)
    await setWorkspaceFlags(request, workspaceId, flagsMap(true))

    await openFeatureFlagsSettings(page)
    for (const flag of ALL_CURRENT_FLAGS) {
      await expect(page.getByTestId(`feature-flag-card-${flag}`)).toHaveText(/Evaluated ON/)
    }
    await axeAssert(
      page,
      'flag-matrix.all-current-on.settings',
      '[data-testid="feature-flag-card-FEATURE_RESOURCE_GOVERNANCE"]',
    )
    await snapshotState(page, testInfo, 'flag-matrix.all-current-on.settings')

    await page.goto('/cost-tracker?tab=governance&sub=system-health')
    await expect(page.getByTestId('workspace-switcher')).toBeVisible()
    await expect(page.getByTestId('cost-tracker-governance-tab')).toBeVisible()
    await expect(page.getByTestId('governance-system-health-subview')).toBeVisible()
    await axeAssert(page, 'flag-matrix.all-current-on.governance')
    await snapshotState(page, testInfo, 'flag-matrix.all-current-on.governance')
  })
})
