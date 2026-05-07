import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { dismissOnboardingForE2E, loginAsE2EAdmin } from '../helpers'
import { captureVisualSnapshot } from '../visual/visual-snapshot'
import { seedWorkflowContractDiagnosticsForE2E } from './fixtures/workflow-contract-diagnostics'

const VISUAL_SNAPSHOT_TAGS = ['workflow-contracts']
const VISUAL_TEST_TAGS = ['@workflow-contracts']

async function attachWorkflowContractSnapshot(page: Page, testInfo: TestInfo) {
  await captureVisualSnapshot(page, testInfo, {
    domain: 'workflow-contracts',
    name: 'contracts-diagnostics-redacted',
    description: 'Review the read-only Workflow Contracts diagnostics tab for redacted validation state.',
    expected: 'The Contracts tab should show read-only diagnostics, last-known-good state, redacted validation details, and no mutating workflow actions.',
    reviewFocus: [
      'Contracts tab is selected and diagnostics are visible',
      'Last-known-good and latest run metadata are readable',
      'Secret-like validation details remain redacted',
      'No apply, dispatch, or governance override actions are present',
    ],
    tags: VISUAL_SNAPSHOT_TAGS,
  })
}

test.describe('Workflow contract diagnostics', () => {
  test('shows read-only redacted diagnostics in the Workflows surface', { tag: VISUAL_TEST_TAGS }, async ({ page, request }, testInfo) => {
    seedWorkflowContractDiagnosticsForE2E()
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)

    await page.goto('/agents')
    await page.getByRole('button', { name: 'Contracts' }).click()

    const panel = page.getByTestId('workflow-contract-diagnostics')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('import_dry_run')).toBeVisible()
    await expect(panel.getByText('UNKNOWN_TEMPLATE_VARIABLE')).toBeVisible()
    await expect(panel.getByText('[REDACTED]')).toBeVisible()
    await expect(panel.getByText(/sk-test|hunter2|secret-value/)).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Apply Import|Dispatch|Governance Override/ })).toHaveCount(0)
    await attachWorkflowContractSnapshot(page, testInfo)
  })
})
