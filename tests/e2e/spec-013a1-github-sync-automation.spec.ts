import { expect, test } from '@playwright/test'

type LifecycleMode = 'disabled' | 'enabled' | 'success'

function lifecycleEnvelope(mode: LifecycleMode) {
  const enabled = mode !== 'disabled'
  return {
    version: 'github_sync_lifecycle.v1',
    generated_at: '2026-05-23T04:00:00.000Z',
    flag: { key: 'FEATURE_GITHUB_SYNC_AUTOMATION', enabled: true, reason: 'workspace_override' },
    diagnostics: {
      scheduler_task_registered: true,
      schema_version: '077_github_sync_lifecycle',
      telemetry_service: 'none',
    },
    scopes: [
      {
        scope: { workspace_id: 4, github_repo: 'racecraft/mission-control', owner_project_id: 101 },
        controls: {
          enabled,
          interval_seconds: 300,
          max_pages: 10,
          max_issues: 1000,
          max_duration_seconds: 45,
          disabled_reason: enabled ? null : 'operator paused',
          next_eligible_at: enabled ? '2026-05-23T04:05:00.000Z' : null,
        },
        active_run: null,
        last_run: mode === 'success'
          ? {
              run_id: 'e2e-success',
              trigger: 'automatic',
              result: 'success',
              started_at: '2026-05-23T03:55:00.000Z',
              completed_at: '2026-05-23T03:55:10.000Z',
              pulled: 3,
              pushed: 0,
              partial_run_reason: null,
              failure_reason: null,
              cursor_advanced: true,
            }
          : null,
        last_success_cursor: mode === 'success' ? '2026-05-23T03:55:10.000Z' : null,
        last_error: null,
        backoff: {
          seconds: 0,
          next_retry_at: null,
          reason: null,
          signal_source: 'none',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: {
          successes: mode === 'success' ? 1 : 0,
          failures: 0,
          partials: 0,
          overlap_rejections: 0,
        },
        skipped: { owner: 0, non_owner: 0 },
        diagnostics: {
          latest_partial_run_reason: null,
          ownership: 'owner_selected',
          ownership_detail: {
            decision: 'owner_selected',
            project_id: 101,
            owner_project_id: 101,
            eligible_project_ids: [101],
            skipped_project_ids: [],
            reason: 'single_project',
          },
          lease: { age_seconds: null, stale: false },
          cursor_effect: mode === 'success' ? 'advanced' : null,
          manual_fallback_available: true,
          failure: { category: null, sanitized_message: null, redaction_applied: false },
          health_summary: {
            severity: enabled ? 'green' : 'disabled',
            reason: enabled ? 'healthy' : 'disabled',
            source_updated_at: '2026-05-23T03:55:10.000Z',
            state_drivers: enabled ? [] : ['disabled'],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [],
          },
        },
      },
    ],
  }
}

function diagnosticLifecycleEnvelope() {
  const base = lifecycleEnvelope('success')
  const successScope = base.scopes[0]
  return {
    ...base,
    scopes: [
      {
        ...successScope,
        scope: { workspace_id: 4, github_repo: 'racecraft/failing', owner_project_id: 201 },
        last_run: {
          run_id: 'e2e-failed',
          trigger: 'automatic',
          result: 'failed',
          started_at: '2026-05-23T03:45:00.000Z',
          completed_at: '2026-05-23T03:45:02.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: 'github_rate_limited',
          cursor_advanced: false,
        },
        last_success_cursor: '2026-05-23T03:40:00.000Z',
        last_error: 'GitHub rate limited the request',
        backoff: {
          seconds: 300,
          next_retry_at: '2026-05-23T04:15:00.000Z',
          reason: 'github_retry_after',
          signal_source: 'retry_after',
          cap_applied: true,
          fallback_applied: false,
        },
        counters: { successes: 1, failures: 1, partials: 0, overlap_rejections: 0 },
        diagnostics: {
          ...successScope.diagnostics,
          cursor_effect: 'unchanged',
          failure: { category: 'github_rate_limited', sanitized_message: 'GitHub rate limited the request', redaction_applied: true },
          health_summary: {
            ...successScope.diagnostics.health_summary,
            severity: 'amber',
            reason: 'backoff scheduled',
            state_drivers: ['active_backoff'],
          },
        },
      },
      {
        ...successScope,
        scope: { workspace_id: 4, github_repo: 'racecraft/partial', owner_project_id: 202 },
        last_run: {
          run_id: 'e2e-partial',
          trigger: 'automatic',
          result: 'partial',
          started_at: '2026-05-23T03:50:00.000Z',
          completed_at: '2026-05-23T03:50:05.000Z',
          pulled: 25,
          pushed: 0,
          partial_run_reason: 'max_pages',
          failure_reason: null,
          cursor_advanced: false,
        },
        last_success_cursor: '2026-05-23T03:40:00.000Z',
        counters: { successes: 1, failures: 0, partials: 1, overlap_rejections: 0 },
        diagnostics: {
          ...successScope.diagnostics,
          latest_partial_run_reason: 'max_pages',
          health_summary: {
            ...successScope.diagnostics.health_summary,
            severity: 'amber',
            reason: 'partial bounded stop',
            state_drivers: ['partial_bounded_stop'],
          },
        },
      },
      {
        ...successScope,
        scope: { workspace_id: 4, github_repo: 'racecraft/recovered', owner_project_id: 203 },
        last_run: {
          run_id: 'e2e-stale-recovered',
          trigger: 'automatic',
          result: 'stale_recovered',
          started_at: '2026-05-23T03:52:00.000Z',
          completed_at: '2026-05-23T03:52:01.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: false,
        },
        diagnostics: {
          ...successScope.diagnostics,
          health_summary: {
            ...successScope.diagnostics.health_summary,
            severity: 'green',
            reason: 'stale lease recovered',
            state_drivers: ['stale_recovered'],
          },
        },
      },
      {
        ...successScope,
        scope: { workspace_id: 4, github_repo: 'racecraft/skipped-non-owner', owner_project_id: 204 },
        last_run: {
          run_id: 'e2e-skipped-non-owner',
          trigger: 'automatic',
          result: 'skipped_non_owner',
          started_at: '2026-05-23T03:54:00.000Z',
          completed_at: '2026-05-23T03:54:00.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: false,
        },
        skipped: { owner: 0, non_owner: 1 },
        diagnostics: {
          ...successScope.diagnostics,
          ownership: 'skipped_non_owner',
          ownership_detail: {
            decision: 'skipped_non_owner',
            project_id: 205,
            owner_project_id: 204,
            eligible_project_ids: [204, 205],
            skipped_project_ids: [205],
            reason: 'owner_selected',
          },
          health_summary: {
            ...successScope.diagnostics.health_summary,
            severity: 'amber',
            reason: 'ownership skipped latest attempt',
            state_drivers: ['ownership_skipped'],
          },
        },
      },
      {
        ...successScope,
        scope: { workspace_id: 4, github_repo: 'racecraft/unresolved-owner', owner_project_id: null },
        last_run: {
          run_id: 'e2e-ownership-unresolved',
          trigger: 'automatic',
          result: 'ownership_unresolved',
          started_at: '2026-05-23T03:56:00.000Z',
          completed_at: '2026-05-23T03:56:00.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: false,
        },
        last_success_cursor: null,
        last_error: 'ownership_unresolved',
        skipped: { owner: 0, non_owner: 0 },
        diagnostics: {
          ...successScope.diagnostics,
          ownership: 'ownership_unresolved',
          ownership_detail: {
            decision: 'ownership_unresolved',
            project_id: null,
            owner_project_id: null,
            eligible_project_ids: [206, 207],
            skipped_project_ids: [],
            reason: 'no_repo_sync_owner',
          },
          health_summary: {
            ...successScope.diagnostics.health_summary,
            severity: 'red',
            reason: 'ownership unresolved',
            state_drivers: ['ownership_unresolved'],
          },
        },
      },
    ],
  }
}

test.describe('SPEC-013A1 GitHub sync automation journey', () => {
  test('enables scoped automation, observes scheduler state, disables it, and preserves manual fallback', async ({ page }) => {
    let mode: LifecycleMode = 'disabled'
    const controlBodies: unknown[] = []
    const manualSyncBodies: unknown[] = []

    await page.addInitScript(() => {
      window.sessionStorage.setItem('mc-onboarding-dismissed', '1')
    })

    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()

      if (url.pathname === '/api/integrations' && method === 'POST') {
        await route.fulfill({ json: { ok: true, detail: 'User: octocat' } })
        return
      }

      if (url.pathname === '/api/status' && url.searchParams.get('action') === 'capabilities') {
        await route.fulfill({
          json: {
            gateway: false,
            claudeHome: true,
            interfaceMode: 'full',
            processUser: 'testadmin',
          },
        })
        return
      }

      if (url.pathname === '/api/onboarding') {
        await route.fulfill({ json: { completed: true, skipped: true, showOnboarding: false, isAdmin: true } })
        return
      }

      if (url.pathname === '/api/github/sync' && method === 'GET') {
        await route.fulfill({
          json: {
            syncs: [],
            poller: { running: true, interval: 60000 },
            github_sync_lifecycle: lifecycleEnvelope(mode),
          },
        })
        return
      }

      if (url.pathname === '/api/github/sync/control' && method === 'PATCH') {
        const body = request.postDataJSON() as { enabled?: boolean }
        controlBodies.push(body)
        if (body.enabled === true) mode = 'success'
        if (body.enabled === false) mode = 'disabled'
        await route.fulfill({ json: { ok: true, control: { enabled: mode !== 'disabled' } } })
        return
      }

      if (url.pathname === '/api/github/sync' && method === 'POST') {
        manualSyncBodies.push(request.postDataJSON())
        await route.fulfill({
          json: {
            ok: true,
            projects_synced: 1,
            pulled: 3,
            pushed: 0,
            message: 'Manual sync triggered',
          },
        })
        return
      }

      if (url.pathname === '/api/github' && method === 'POST') {
        await route.fulfill({ json: { syncs: [] } })
        return
      }

      if (url.pathname === '/api/projects' && method === 'GET') {
        await route.fulfill({
          json: {
            projects: [
              {
                id: 101,
                name: 'Paddock',
                github_repo: 'racecraft/mission-control',
                github_sync_enabled: true,
              },
            ],
          },
        })
        return
      }

      if (url.pathname === '/api/tasks' && method === 'GET') {
        await route.fulfill({ json: { tasks: [] } })
        return
      }

      if (url.pathname === '/api/agents' && method === 'GET') {
        await route.fulfill({ json: { agents: [] } })
        return
      }

      if (url.pathname === '/api/workspaces') {
        await route.fulfill({
          json: {
            workspaces: [
              { id: 4, slug: 'mission-control', name: 'Paddock', feature_flags: { FEATURE_GITHUB_SYNC_AUTOMATION: true } },
            ],
          },
        })
        return
      }

      await route.continue()
    })

    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.AUTH_USER ?? 'testadmin')
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.AUTH_PASS ?? 'testpass1234!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(url => !url.pathname.startsWith('/login'))

    await page.goto('/github')
    const skipSetup = page.getByRole('button', { name: 'Skip setup' })
    await skipSetup.click({ timeout: 2_000 }).catch(() => undefined)

    const lifecycle = page.locator('section[aria-label="Automatic GitHub sync lifecycle"]')
    await expect(lifecycle).toBeVisible()
    await expect(lifecycle.getByText('Scheduler registered')).toBeVisible()
    await expect(lifecycle.getByText('Disabled').first()).toBeVisible()

    await lifecycle.getByRole('button', { name: /Enable automatic sync/ }).click()
    await expect(lifecycle.getByText('Last sync successful').first()).toBeVisible()
    await expect(lifecycle.getByText('Successes: 1')).toBeVisible()

    await lifecycle.getByRole('button', { name: /Disable automatic sync/ }).click()
    await expect(lifecycle.getByText('Disabled').first()).toBeVisible()

    await page.getByRole('button', { name: /Sync All/i }).click()

    expect(controlBodies).toEqual([
      expect.objectContaining({
        workspace_id: 4,
        github_repo: 'racecraft/mission-control',
        enabled: true,
      }),
      expect.objectContaining({
        workspace_id: 4,
        github_repo: 'racecraft/mission-control',
        enabled: false,
      }),
    ])
    expect(manualSyncBodies).toEqual([expect.objectContaining({ action: 'trigger-all' })])
  })

  test('shows failure, partial, stale recovery, and sanitized lifecycle diagnostics without forbidden authority copy', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mc-onboarding-dismissed', '1')
    })

    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()

      if (url.pathname === '/api/integrations' && method === 'POST') {
        await route.fulfill({ json: { ok: true, detail: 'User: octocat' } })
        return
      }
      if (url.pathname === '/api/status' && url.searchParams.get('action') === 'capabilities') {
        await route.fulfill({ json: { gateway: false, claudeHome: true, interfaceMode: 'full', processUser: 'testadmin' } })
        return
      }
      if (url.pathname === '/api/onboarding') {
        await route.fulfill({ json: { completed: true, skipped: true, showOnboarding: false, isAdmin: true } })
        return
      }
      if (url.pathname === '/api/github/sync' && method === 'GET') {
        await route.fulfill({ json: { syncs: [], poller: { running: true, interval: 60000 }, github_sync_lifecycle: diagnosticLifecycleEnvelope() } })
        return
      }
      if (url.pathname === '/api/github' && method === 'POST') {
        await route.fulfill({ json: { syncs: [] } })
        return
      }
      if (url.pathname === '/api/projects' && method === 'GET') {
        await route.fulfill({ json: { projects: [] } })
        return
      }
      if (url.pathname === '/api/tasks' && method === 'GET') {
        await route.fulfill({ json: { tasks: [] } })
        return
      }
      if (url.pathname === '/api/agents' && method === 'GET') {
        await route.fulfill({ json: { agents: [] } })
        return
      }
      if (url.pathname === '/api/workspaces') {
        await route.fulfill({ json: { workspaces: [{ id: 4, slug: 'mission-control', name: 'Paddock', feature_flags: { FEATURE_GITHUB_SYNC_AUTOMATION: true } }] } })
        return
      }

      await route.continue()
    })

    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.AUTH_USER ?? 'testadmin')
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.AUTH_PASS ?? 'testpass1234!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(url => !url.pathname.startsWith('/login'))

    await page.goto('/github')
    await page.getByRole('button', { name: 'Skip setup' }).click({ timeout: 2_000 }).catch(() => undefined)
    const lifecycle = page.locator('section[aria-label="Automatic GitHub sync lifecycle"]')
    await expect(lifecycle.getByText('Failed with backoff').first()).toBeVisible()
    await expect(lifecycle.getByText('Partial run').first()).toBeVisible()
    await expect(lifecycle.getByText('Stale lease recovered').first()).toBeVisible()
    await expect(lifecycle.getByText('Skipped non-owner').first()).toBeVisible()
    await expect(lifecycle.getByText('Ownership unresolved').first()).toBeVisible()
    await expect(lifecycle.getByText('Ownership: skipped_non_owner').first()).toBeVisible()
    await expect(lifecycle.getByText('Ownership: ownership_unresolved').first()).toBeVisible()
    await expect(lifecycle.getByText('Ownership reason: owner_selected').first()).toBeVisible()
    await expect(lifecycle.getByText('Ownership reason: no_repo_sync_owner').first()).toBeVisible()
    await expect(lifecycle.getByText('Backoff source: retry_after').first()).toBeVisible()
    await expect(lifecycle.getByText('Redacted failure details').first()).toBeVisible()
    await expect(lifecycle).not.toContainText(/claim|dispatch|remediation execution|sandbox|auto-merge|triage/i)
  })
})
