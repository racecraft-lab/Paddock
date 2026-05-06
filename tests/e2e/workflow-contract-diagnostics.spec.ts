import { expect, test } from '@playwright/test'
import { dismissOnboardingForE2E, loginAsE2EAdmin } from '../helpers'
import { seedWorkflowContractDiagnosticsForE2E } from './fixtures/workflow-contract-diagnostics'

test.describe('Workflow contract diagnostics', () => {
  test('shows read-only redacted diagnostics in the Workflows surface', async ({ page, request }) => {
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
  })
})
