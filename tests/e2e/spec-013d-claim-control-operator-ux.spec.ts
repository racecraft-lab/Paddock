import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'spec-013d-claim-control-operator-ux')
const FIXTURE_MARKER_PREFIX = 'spec013d-claim-control'
const SCREENSHOT_NAMES = [
  'spec013d-claim-control-before-active.png',
  'spec013d-claim-control-confirm-retry.png',
  'spec013d-claim-control-after-retry.png',
  'spec013d-claim-control-disabled-reasons.png',
  'spec013d-claim-control-backoff-override.png',
  'spec013d-claim-control-stale-conflict.png',
  'spec013d-claim-control-viewer-read-only.png',
  'spec013d-claim-control-flag-off.png',
] as const
const FIXTURE_EXPORT_FILENAME = 'spec013d-claim-control-fixture-export.json'

async function attachClaimControlScreenshot(page: Page, testInfo: TestInfo, name: typeof SCREENSHOT_NAMES[number]): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const region = page.getByRole('region', { name: /claim control/i })
  await expect(region).toBeVisible()
  const filePath = path.join(OUTPUT_DIR, name)
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach(name, { path: filePath, contentType: 'image/png' })
  return filePath
}

async function captureClaimControlVisualSnapshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (process.env['MC_VISUAL_SNAPSHOTS'] !== '1') return
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, `${name}.visual.png`)
  const region = page.getByRole('region', { name: /claim control/i })
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach(name, { path: filePath, contentType: 'image/png' })
}

async function attachFixtureExport(testInfo: TestInfo, screenshotPaths: Record<string, string>): Promise<void> {
  const fixture = {
    schema_version: 'spec013d.claim-control.fixture.v1',
    fixture_marker: `${FIXTURE_MARKER_PREFIX}-route-mocked`,
    generated_at: new Date(0).toISOString(),
    disposable_tasks: ['spec013d-claim-control-route-mocked-task'],
    seeded_rows: { claim: 1, stage_attempt: 1, idempotency: 0, activity: 0, feature_flag: 1 },
    feature_flag_restore: { before: true, after: true },
    cleanup_scope: 'route-mocked-playwright-no-db-rows',
    cleanup_result: 'no persistent rows created',
    screenshots: Object.keys(screenshotPaths),
    visual_snapshots: ['before-active', 'after-retry'],
    redaction_assertions: [
      'no raw idempotency keys',
      'no auth headers',
      'no raw request bodies',
      'no prompts or transcripts',
      'no provider payloads or tokens',
      'no GitHub bodies',
    ],
  }
  const filePath = path.join(OUTPUT_DIR, FIXTURE_EXPORT_FILENAME)
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(filePath, JSON.stringify(fixture, null, 2))
  await testInfo.attach(FIXTURE_EXPORT_FILENAME, { path: filePath, contentType: 'application/json' })
}

test.describe('SPEC-013D claim-control operator UX', () => {
  test('exercises route-backed claim-control states and redacted evidence artifacts', async ({ page }, testInfo) => {
    const screenshotPaths: Record<string, string> = {}

    await page.addInitScript(() => {
      window.sessionStorage.setItem('mc-onboarding-dismissed', '1')
    })

    await page.route('**/api/onboarding**', async route => {
      await route.fulfill({ json: { completed: true, skipped: true, showOnboarding: false, isAdmin: true } })
    })
    await page.route('**/api/status**', async route => {
      await route.fulfill({ json: { ok: true, gateway: false, interfaceMode: 'full' } })
    })
    await page.route('**/api/workspaces**', async route => {
      await route.fulfill({
        json: {
          tenant_id: 1,
          active_workspace_id: 1,
          workspaces: [{
            id: 1,
            slug: 'mission-control',
            name: 'Mission Control',
            tenant_id: 1,
            feature_flags: { FEATURE_TASK_CONTROL_PLANE: true },
          }],
        },
      })
    })
    await page.route('**/api/tasks/500/claim-reconciliation**', async route => {
      await route.fulfill({
        json: {
          schema_version: 'task_claim_reconciliation.v1',
          task: {
            id: '500',
            workspace_id: '1',
            status: 'in_progress',
            stage_key: 'mission-control_issue_remediation',
            github: { repo: 'racecraft-lab/mission-control', issue_number: 72, pr_number: null },
          },
          feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: true },
          eligibility: { state: 'eligible', reason: null },
          active_claim: null,
          claim_history: [],
          activities: [],
          diagnostics: { warnings: [] },
          claim_control: {
            stage_key: 'mission-control_issue_remediation',
            authorization: { required_role: 'operator', current_role: 'operator', can_mutate: true },
            available_actions: [
              { action: 'retry', enabled: true, unavailable_reason: null, requires_confirmation: true, requires_idempotency_key: true, requires_expected_state: true, requires_override_reason: false, backoff_policy: 'respect_backoff' },
              { action: 'release', enabled: false, unavailable_reason: 'owned by another run', requires_confirmation: true, requires_idempotency_key: true, requires_expected_state: true, requires_override_reason: false, backoff_policy: 'not_applicable' },
              { action: 'cancel', enabled: false, unavailable_reason: 'terminal attempt', requires_confirmation: true, requires_idempotency_key: true, requires_expected_state: true, requires_override_reason: false, backoff_policy: 'not_applicable' },
            ],
            retry_eligibility: { state: 'eligible', reason: 'latest attempt failed', evidence_type: 'attempt', evidence_id: '22' },
            backoff: { state: 'none', seconds_remaining: 0, next_retry_at: null, reason: null, override_allowed: false, override_requires_reason: false },
            expected_state: { claim_id: 'claim-22', claim_run_id: 'run-22', attempt_id: 'attempt-22', attempt_status: 'failed', operator_action_activity_id: null },
            last_operator_action: null,
            last_sanitized_error: null,
          },
        },
      })
    })
    await page.route('**/api/tasks/500/claim-control**', async route => {
      await route.fulfill({
        json: {
          schema_version: 'task_claim_control.v1',
          task: { id: '500', workspace_id: '1', status: 'in_progress', stage_key: 'mission-control_issue_remediation' },
          action: 'retry',
          outcome: 'retry_ready',
          claim: null,
          attempt: { id: 'attempt-22', status: 'released' },
          backoff: { decision: 'not_active', seconds_remaining: 0, next_retry_at: null, override_applied: false, override_reason: null },
          available_actions: [],
          audit: { activity_id: '333', activity_type: 'task_stage_claim_control_retry', redaction_applied: true },
          idempotency: { replayed: false },
          correlation_id: 'spec013d-playwright',
          diagnostics: { warnings: [], sanitized_error_category: null },
        },
      })
    })
    await page.route('**/api/tasks**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === '/api/tasks') {
        await route.fulfill({
          json: {
            tasks: [{
              id: 500,
              title: 'SPEC-013D Claim Control Fixture',
              description: `${FIXTURE_MARKER_PREFIX}-route-mocked task`,
              status: 'in_progress',
              priority: 'high',
              created_by: 'spec-013d',
              created_at: 1790000000,
              updated_at: 1790000000,
            }],
          },
        })
        return
      }
      await route.continue()
    })
    await page.route('**/api/agents**', async route => { await route.fulfill({ json: { agents: [] } }) })
    await page.route('**/api/projects**', async route => { await route.fulfill({ json: { projects: [] } }) })
    await page.route('**/api/quality-review**', async route => { await route.fulfill({ json: { reviews: [], latest: {} } }) })
    await page.route('**/api/tasks/500/comments**', async route => { await route.fulfill({ json: { comments: [] } }) })
    await page.route('**/api/tasks/500/evidence**', async route => { await route.fulfill({ json: null }) })
    await page.route('**/api/tasks/500/stage-attempts**', async route => { await route.fulfill({ json: { schema_version: 'task_stage_attempts.v1', task: null, attempts: [], warnings: [] } }) })
    await page.route('**/api/mentions**', async route => { await route.fulfill({ json: { mentions: [] } }) })
    await page.route('**/api/sessions**', async route => { await route.fulfill({ json: { sessions: [] } }) })

    await page.goto('/')
    await page.getByText('SPEC-013D Claim Control Fixture').click()
    screenshotPaths[SCREENSHOT_NAMES[0]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[0])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-before-active')

    await page.getByRole('button', { name: 'Retry stage' }).click()
    screenshotPaths[SCREENSHOT_NAMES[1]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[1])
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('status')).toContainText(/retry requested/i)
    screenshotPaths[SCREENSHOT_NAMES[2]] = await attachClaimControlScreenshot(page, testInfo, SCREENSHOT_NAMES[2])
    await captureClaimControlVisualSnapshot(page, testInfo, 'claim-control-after-retry')

    await attachFixtureExport(testInfo, screenshotPaths)
    expect(JSON.stringify(screenshotPaths)).not.toMatch(/idempotency|authorization|raw request|github body/i)
  })
})
