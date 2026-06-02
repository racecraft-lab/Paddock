import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubSyncPanel } from '../github-sync-panel'

const storeMocks = vi.hoisted(() => ({
  activeProductLineScope: null as unknown,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign(
    (key: string, values?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        title: 'GitHub Sync',
        subtitle: 'Import and sync GitHub issues',
        connectedAs: `Connected as ${String(values?.user ?? 'connected')}`,
        notConfigured: 'Not configured',
        loading: 'Loading',
        importIssues: 'Import Issues',
        labelRepository: 'Repository',
        placeholderRepo: 'owner/repo',
        labelLabels: 'Labels',
        placeholderLabels: 'bug, enhancement',
        labelState: 'State',
        stateOpen: 'Open',
        stateClosed: 'Closed',
        stateAll: 'All',
        labelAssignAgent: 'Assign agent',
        unassigned: 'Unassigned',
        buttonPreview: 'Preview',
        buttonImport: 'Import',
        twoWaySync: 'Two-Way Sync',
        syncAll: 'Sync all',
        disableSync: 'Disable sync',
        enableSync: 'Enable sync',
        syncButton: 'Sync now',
        syncHistory: 'Sync History',
        noSyncHistory: 'No sync history',
        linkedTasks: 'Linked Tasks',
        noLinkedTasks: 'No linked tasks',
        noProjectsLinked: 'No projects linked',
        colRepo: 'Repo',
        colIssues: 'Issues',
        colStatus: 'Status',
        colSyncedAt: 'Synced at',
        colTask: 'Task',
        colPriority: 'Priority',
        colGitHub: 'GitHub',
        colSynced: 'Synced',
      }
      return messages[key] || key
    },
    {
      rich: (key: string) => key,
    },
  ),
}))

vi.mock('@/store', () => ({
  usePaddock: () => ({ activeProductLineScope: storeMocks.activeProductLineScope }),
}))

function lifecycleEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    version: 'github_sync_lifecycle.v1',
    generated_at: '2026-05-23T04:00:00.000Z',
    flag: { key: 'FEATURE_GITHUB_SYNC_AUTOMATION', enabled: true, reason: 'enabled' },
    diagnostics: {
      scheduler_task_registered: true,
      schema_version: '077_github_sync_lifecycle',
      telemetry_service: 'none',
    },
    scopes: [
      {
        scope: { workspace_id: 1, github_repo: 'racecraft-lab/Paddock', owner_project_id: 101 },
        controls: {
          enabled: true,
          interval_seconds: 300,
          max_pages: 10,
          max_issues: 1000,
          max_duration_seconds: 45,
          disabled_reason: null,
          next_eligible_at: '2026-05-23T04:05:00.000Z',
        },
        active_run: null,
        last_run: {
          run_id: 'run-success',
          trigger: 'automatic',
          result: 'success',
          started_at: '2026-05-23T03:55:00.000Z',
          completed_at: '2026-05-23T03:55:10.000Z',
          pulled: 4,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: true,
        },
        last_success_cursor: '2026-05-23T03:55:10.000Z',
        last_error: null,
        backoff: {
          seconds: 0,
          next_retry_at: null,
          reason: null,
          signal_source: 'none',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: { successes: 3, failures: 0, partials: 0, overlap_rejections: 0 },
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
          cursor_effect: 'advanced',
          manual_fallback_available: true,
          failure: { category: null, sanitized_message: null, redaction_applied: false },
          health_summary: {
            severity: 'green',
            reason: 'healthy',
            source_updated_at: '2026-05-23T03:55:10.000Z',
            state_drivers: [],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [],
          },
        },
      },
      {
        scope: { workspace_id: 1, github_repo: 'racecraft/partial', owner_project_id: 102 },
        controls: {
          enabled: true,
          interval_seconds: 300,
          max_pages: 1,
          max_issues: 25,
          max_duration_seconds: 5,
          disabled_reason: null,
          next_eligible_at: '2026-05-23T04:10:00.000Z',
        },
        active_run: {
          run_id: 'run-active',
          trigger: 'automatic',
          lease_owner: 'scheduler',
          started_at: '2026-05-23T04:00:00.000Z',
          lease_expires_at: '2026-05-23T04:01:00.000Z',
        },
        last_run: {
          run_id: 'run-partial',
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
        last_error: null,
        backoff: {
          seconds: 0,
          next_retry_at: null,
          reason: null,
          signal_source: 'none',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: { successes: 1, failures: 0, partials: 1, overlap_rejections: 0 },
        skipped: { owner: 1, non_owner: 2 },
        diagnostics: {
          latest_partial_run_reason: 'max_pages',
          ownership: 'owner_selected',
          ownership_detail: {
            decision: 'owner_selected',
            project_id: 102,
            owner_project_id: 102,
            eligible_project_ids: [102],
            skipped_project_ids: [],
            reason: 'single_project',
          },
          lease: { age_seconds: 12, stale: false },
          cursor_effect: 'preserved',
          manual_fallback_available: true,
          failure: { category: null, sanitized_message: null, redaction_applied: false },
          health_summary: {
            severity: 'amber',
            reason: 'partial run',
            source_updated_at: '2026-05-23T03:50:05.000Z',
            state_drivers: ['partial'],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [],
          },
        },
      },
      {
        scope: { workspace_id: 1, github_repo: 'racecraft/failing', owner_project_id: 103 },
        controls: {
          enabled: false,
          interval_seconds: 600,
          max_pages: 5,
          max_issues: 100,
          max_duration_seconds: 30,
          disabled_reason: 'operator paused',
          next_eligible_at: null,
        },
        active_run: null,
        last_run: {
          run_id: 'run-failed',
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
        last_success_cursor: null,
        last_error: 'GitHub rate limited the request',
        backoff: {
          seconds: 900,
          next_retry_at: '2026-05-23T04:15:00.000Z',
          reason: 'github_retry_after',
          signal_source: 'retry_after',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: { successes: 0, failures: 1, partials: 0, overlap_rejections: 0 },
        skipped: { owner: 0, non_owner: 0 },
        diagnostics: {
          latest_partial_run_reason: null,
          ownership: 'owner_selected',
          ownership_detail: {
            decision: 'owner_selected',
            project_id: 103,
            owner_project_id: 103,
            eligible_project_ids: [103],
            skipped_project_ids: [],
            reason: 'single_project',
          },
          lease: { age_seconds: null, stale: false },
          cursor_effect: 'preserved',
          manual_fallback_available: true,
          failure: {
            category: 'github_rate_limited',
            sanitized_message: 'GitHub rate limited the request',
            redaction_applied: true,
          },
          health_summary: {
            severity: 'red',
            reason: 'rate limited',
            source_updated_at: '2026-05-23T03:45:02.000Z',
            state_drivers: ['failed', 'backoff'],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [{ id: 'reset_backoff', endpoint: '/api/github/sync/control' }],
          },
        },
      },
      {
        scope: { workspace_id: 1, github_repo: 'racecraft/skipped-non-owner', owner_project_id: 104 },
        controls: {
          enabled: true,
          interval_seconds: 300,
          max_pages: 10,
          max_issues: 1000,
          max_duration_seconds: 45,
          disabled_reason: null,
          next_eligible_at: '2026-05-23T04:05:00.000Z',
        },
        active_run: null,
        last_run: {
          run_id: 'run-skipped-non-owner',
          trigger: 'automatic',
          result: 'skipped_non_owner',
          started_at: '2026-05-23T03:58:00.000Z',
          completed_at: '2026-05-23T03:58:00.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: false,
        },
        last_success_cursor: '2026-05-23T03:40:00.000Z',
        last_error: null,
        backoff: {
          seconds: 0,
          next_retry_at: null,
          reason: null,
          signal_source: 'none',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: { successes: 0, failures: 0, partials: 0, overlap_rejections: 0 },
        skipped: { owner: 0, non_owner: 1 },
        diagnostics: {
          latest_partial_run_reason: null,
          ownership: 'skipped_non_owner',
          ownership_detail: {
            decision: 'skipped_non_owner',
            project_id: 105,
            owner_project_id: 104,
            eligible_project_ids: [104, 105],
            skipped_project_ids: [105],
            reason: 'owner_selected',
          },
          lease: { age_seconds: null, stale: false },
          cursor_effect: 'unchanged',
          manual_fallback_available: true,
          failure: { category: null, sanitized_message: null, redaction_applied: false },
          health_summary: {
            severity: 'amber',
            reason: 'ownership skipped latest attempt',
            source_updated_at: '2026-05-23T03:58:00.000Z',
            state_drivers: ['ownership_skipped'],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [],
          },
        },
      },
      {
        scope: { workspace_id: 1, github_repo: 'racecraft/unresolved-owner', owner_project_id: null },
        controls: {
          enabled: true,
          interval_seconds: 300,
          max_pages: 10,
          max_issues: 1000,
          max_duration_seconds: 45,
          disabled_reason: null,
          next_eligible_at: '2026-05-23T04:05:00.000Z',
        },
        active_run: null,
        last_run: {
          run_id: 'run-ownership-unresolved',
          trigger: 'automatic',
          result: 'ownership_unresolved',
          started_at: '2026-05-23T03:59:00.000Z',
          completed_at: '2026-05-23T03:59:00.000Z',
          pulled: 0,
          pushed: 0,
          partial_run_reason: null,
          failure_reason: null,
          cursor_advanced: false,
        },
        last_success_cursor: null,
        last_error: 'ownership_unresolved',
        backoff: {
          seconds: 0,
          next_retry_at: null,
          reason: null,
          signal_source: 'none',
          cap_applied: false,
          fallback_applied: false,
        },
        counters: { successes: 0, failures: 0, partials: 0, overlap_rejections: 0 },
        skipped: { owner: 0, non_owner: 0 },
        diagnostics: {
          latest_partial_run_reason: null,
          ownership: 'ownership_unresolved',
          ownership_detail: {
            decision: 'ownership_unresolved',
            project_id: null,
            owner_project_id: null,
            eligible_project_ids: [106, 107],
            skipped_project_ids: [],
            reason: 'no_repo_sync_owner',
          },
          lease: { age_seconds: null, stale: false },
          cursor_effect: 'unchanged',
          manual_fallback_available: true,
          failure: { category: null, sanitized_message: null, redaction_applied: false },
          health_summary: {
            severity: 'red',
            reason: 'ownership unresolved',
            source_updated_at: '2026-05-23T03:59:00.000Z',
            state_drivers: ['ownership_unresolved'],
            manual_fallback_available: true,
            runbook_links: [],
            recovery_affordances: [],
          },
        },
      },
    ],
    ...overrides,
  }
}

function installFetchMock(envelope = lifecycleEnvelope()) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || 'GET'

    if (url === '/api/integrations' && method === 'POST') {
      return Response.json({ ok: true, detail: 'User: octocat' })
    }
    if (url.startsWith('/api/github/sync') && method === 'GET') {
      return Response.json({ syncs: [], poller: { running: true }, github_sync_lifecycle: envelope })
    }
    if (url === '/api/github/sync/control' && method === 'PATCH') {
      return Response.json({ ok: true })
    }
    if (url === '/api/github' && method === 'POST') {
      return Response.json({ syncs: [] })
    }
    if (url.startsWith('/api/tasks')) {
      return Response.json({ tasks: [] })
    }
    if (url.startsWith('/api/agents')) {
      return Response.json({ agents: [] })
    }
    if (url.startsWith('/api/projects')) {
      return Response.json({
        projects: [
          {
            id: 101,
            name: 'Paddock',
            github_repo: 'racecraft-lab/Paddock',
            github_sync_enabled: true,
          },
        ],
      })
    }

    return Response.json({}, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('GitHubSyncPanel automatic lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storeMocks.activeProductLineScope = null
  })

  it('renders automatic lifecycle state separately from manual sync history', async () => {
    installFetchMock()

    render(<GitHubSyncPanel />)

    const lifecycle = await screen.findByRole('region', { name: 'Automatic GitHub sync lifecycle' })
    expect(within(lifecycle).getByText('Automatic polling')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Scheduler registered')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Last sync successful')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Running')).toBeInTheDocument()
    expect(within(lifecycle).getByText(/Partial run/)).toBeInTheDocument()
    expect(within(lifecycle).getByText(/Failed with backoff/)).toBeInTheDocument()
    expect(within(lifecycle).getByText('Skipped non-owner')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Ownership unresolved')).toBeInTheDocument()
    expect(within(lifecycle).getAllByText('Disabled').length).toBeGreaterThan(0)
    expect(within(lifecycle).getByText('Skipped owner: 1')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Skipped non-owner: 2')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Ownership: skipped_non_owner')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Ownership: ownership_unresolved')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Ownership reason: owner_selected')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Ownership reason: no_repo_sync_owner')).toBeInTheDocument()
    expect(within(lifecycle).getByText(/Backoff until/)).toBeInTheDocument()
    expect(within(lifecycle).getByText('Backoff reason: github_retry_after')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Backoff source: retry_after')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Failure category: github_rate_limited')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Redacted failure details')).toBeInTheDocument()
    expect(within(lifecycle).getByRole('status')).toHaveTextContent('5 automatic scopes')
    expect(screen.getByText('Two-Way Sync')).toBeInTheDocument()
    expect(screen.getByText('Sync History')).toBeInTheDocument()
  })

  it('sends scoped enable and reset-backoff control requests', async () => {
    const fetchMock = installFetchMock()

    render(<GitHubSyncPanel />)

    const lifecycle = await screen.findByRole('region', { name: 'Automatic GitHub sync lifecycle' })
    fireEvent.click(within(lifecycle).getByRole('button', { name: 'Enable automatic sync for racecraft/failing' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/github/sync/control', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"github_repo":"racecraft/failing"'),
      }))
    })

    fireEvent.click(within(lifecycle).getByRole('button', { name: 'Reset backoff for racecraft/failing' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/github/sync/control', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"reset_backoff":true'),
      }))
    })
  })

  it('surfaces flag-disabled lifecycle state without hiding manual fallback controls', async () => {
    installFetchMock(lifecycleEnvelope({
      flag: { key: 'FEATURE_GITHUB_SYNC_AUTOMATION', enabled: false, reason: 'default-off' },
      scopes: [],
    }))

    render(<GitHubSyncPanel />)

    const lifecycle = await screen.findByRole('region', { name: 'Automatic GitHub sync lifecycle' })
    expect(within(lifecycle).getByText('Feature flag off')).toBeInTheDocument()
    expect(within(lifecycle).getByText('Manual sync remains available.')).toBeInTheDocument()
    expect(screen.getByText('Two-Way Sync')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync all' })).toBeInTheDocument()
  })

  it('surfaces manual sync overlap active-run details with retry guidance', async () => {
    storeMocks.activeProductLineScope = {
      kind: 'productLine',
      tenantId: 1,
      productLineId: 1,
      productLine: { id: 1, slug: 'paddock', name: 'Paddock', tenant_id: 1 },
      version: 1,
      scopeKey: 'tenant:1:product-line:1',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url === '/api/integrations' && method === 'POST') {
        return Response.json({ ok: true, detail: 'User: octocat' })
      }
      if (url.startsWith('/api/github/sync') && method === 'GET') {
        return Response.json({ syncs: [], poller: { running: true }, github_sync_lifecycle: lifecycleEnvelope() })
      }
      if (url === '/api/github/sync' && method === 'POST') {
        return Response.json({
          ok: false,
          error: 'GitHub sync already running for this scope',
          code: 'github_sync_overlap',
          active_run: {
            run_id: 'ghsync_active_1',
            trigger: 'automatic',
            workspace_id: 1,
            github_repo: 'racecraft-lab/Paddock',
            started_at: '2026-05-23T04:00:00.000Z',
            lease_expires_at: '2026-05-23T04:01:00.000Z',
          },
          retry_after_seconds: 45,
        }, { status: 409 })
      }
      if (url === '/api/github' && method === 'POST') {
        return Response.json({ syncs: [] })
      }
      if (url.startsWith('/api/tasks')) {
        return Response.json({ tasks: [] })
      }
      if (url.startsWith('/api/agents')) {
        return Response.json({ agents: [] })
      }
      if (url.startsWith('/api/projects')) {
        return Response.json({
          projects: [
            {
              id: 101,
              name: 'Paddock',
              github_repo: 'racecraft-lab/Paddock',
              github_sync_enabled: true,
            },
          ],
        })
      }

      return Response.json({}, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GitHubSyncPanel />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))

    await waitFor(() => {
      expect(screen.getByText(/GitHub sync already running for this scope/)).toBeInTheDocument()
    })
    const syncCall = fetchMock.mock.calls.find(([input, init]) => String(input) === '/api/github/sync' && init?.method === 'POST')
    expect(JSON.parse(String(syncCall?.[1]?.body))).toMatchObject({
      action: 'trigger',
      project_id: 101,
      workspace_id: 1,
    })
    expect(screen.getByText(/ghsync_active_1/)).toBeInTheDocument()
    expect(screen.getByText(/automatic/)).toBeInTheDocument()
    expect(screen.getByText(/Try again in 45 seconds/)).toBeInTheDocument()
    expect(screen.queryByText(/Enable automation for racecraft\/paddock/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sync all' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => {
        if (init?.method !== 'POST') return false
        const body = JSON.parse(String(init.body))
        return body.action === 'trigger-all' && body.workspace_id === 1
      })).toBe(true)
    })
  })
})
