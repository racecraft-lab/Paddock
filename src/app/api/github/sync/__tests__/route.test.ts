import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
  pullFromGitHub: vi.fn(async () => ({ pulled: 1, pushed: 0 })),
  getSyncPollerStatus: vi.fn(() => ({ running: false, interval: 60000 })),
  loggerError: vi.fn(),
  githubSyncAutomationEnabled: false,
  now: 1779500000,
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/db', () => ({ getDatabase: mocks.getDatabase }))
vi.mock('@/lib/github-sync-engine', () => ({ pullFromGitHub: mocks.pullFromGitHub }))
vi.mock('@/lib/github-sync-poller', () => ({ getSyncPollerStatus: mocks.getSyncPollerStatus }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }))
vi.mock('@/lib/feature-flags', () => ({
  resolveFlag: vi.fn((name: string) => {
    if (name === 'FEATURE_WORKSPACE_SWITCHER') return true
    if (name === 'FEATURE_GITHUB_SYNC_AUTOMATION') return mocks.githubSyncAutomationEnabled
    return false
  }),
  evaluateFeatureFlagCore: vi.fn((name: string) => ({
    key: name,
    value: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' ? mocks.githubSyncAutomationEnabled : name === 'FEATURE_WORKSPACE_SWITCHER',
    reason: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' && !mocks.githubSyncAutomationEnabled
      ? 'default_off'
      : 'workspace_override',
    envLocked: false,
    envValue: null,
    storedValue: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' ? mocks.githubSyncAutomationEnabled : true,
  })),
}))

import { GET, POST } from '../route'
import { runMigrations } from '../../../../../lib/migrations'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.githubSyncAutomationEnabled = false
  mocks.pullFromGitHub.mockResolvedValue({ pulled: 1, pushed: 0 })
  mocks.getSyncPollerStatus.mockReturnValue({ running: false, interval: 60000 })
  mocks.requireRole.mockReturnValue({
    user: { id: 7, username: 'admin', role: 'admin', tenant_id: 1, workspace_id: 2 },
  })
  vi.spyOn(Date, 'now').mockReturnValue(mocks.now * 1000)
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function seedWorkspace(
  db: Database.Database,
  id: number,
  slug: string,
  name: string,
  featureFlags = '{"FEATURE_WORKSPACE_SWITCHER":true}',
): void {
  db.prepare(`
    INSERT OR REPLACE INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
  `).run(id, slug, name, 1, featureFlags)
}

function seedFacilityAndProductLine(db: Database.Database): void {
  seedWorkspace(db, 2, 'facility', 'Facility', '{"FEATURE_WORKSPACE_SWITCHER":true}')
  seedWorkspace(db, 4, 'paddock', 'Paddock', '{"FEATURE_WORKSPACE_SWITCHER":true,"FEATURE_AREA_LABEL_ROUTING":true}')
}

function seedGithubProject(db: Database.Database): void {
  seedGithubProjectRecord(db, {
    id: 3,
    workspace_id: 4,
    name: 'QA',
    slug: 'qa',
    ticket_prefix: 'QA',
    github_repo: 'org/repo',
  })
}

function seedGithubProjectRecord(
  db: Database.Database,
  values: {
    id: number
    workspace_id: number
    name: string
    slug: string
    ticket_prefix: string
    github_repo: string
    github_sync_enabled?: number
  },
): void {
  db.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
  `).run(
    values.id,
    values.workspace_id,
    values.name,
    values.slug,
    values.ticket_prefix,
    values.github_repo,
    values.github_sync_enabled ?? 1,
  )
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/github/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(path = '/api/github/sync'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' })
}

function seedLifecycleControl(
  db: Database.Database,
  values: {
    workspace_id: number
    github_repo: string
    enabled?: number
    owner_project_id?: number | null
    total_failures?: number
    backoff_seconds?: number
    next_retry_at?: number | null
    next_retry_reason?: string | null
    lease_run_id?: string | null
    lease_owner?: string | null
    lease_started_at?: number | null
    lease_expires_at?: number | null
    last_started_at?: number | null
    skipped_owner_count?: number
    skipped_non_owner_count?: number
    last_error?: string | null
  },
): void {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, owner_project_id, next_retry_at, next_retry_reason,
      backoff_seconds, total_failures, lease_run_id, lease_owner, lease_started_at,
      lease_expires_at, last_started_at, skipped_owner_count, skipped_non_owner_count,
      last_error, created_at, updated_at
    )
    VALUES (?, ?, ?, 300, 10, 1000, 45, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1779500000, 1779500000)
  `).run(
    values.workspace_id,
    values.github_repo,
    values.enabled ?? 1,
    values.owner_project_id ?? null,
    values.next_retry_at ?? null,
    values.next_retry_reason ?? null,
    values.backoff_seconds ?? 0,
    values.total_failures ?? 0,
    values.lease_run_id ?? null,
    values.lease_owner ?? null,
    values.lease_started_at ?? null,
    values.lease_expires_at ?? null,
    values.last_started_at ?? null,
    values.skipped_owner_count ?? 0,
    values.skipped_non_owner_count ?? 0,
    values.last_error ?? null,
  )
}

function seedLifecycleRun(
  db: Database.Database,
  values: {
    run_id: string
    workspace_id: number
    github_repo: string
    result: string
    failure_reason?: string | null
    project_id?: number | null
    diagnostics?: Record<string, unknown>
  },
): void {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_runs (
      run_id, workspace_id, github_repo, project_id, trigger, started_at, completed_at,
      result, failure_reason, cursor_before, cursor_after, diagnostics_json
    )
    VALUES (?, ?, ?, ?, 'automatic', 1779500000, 1779500003, ?, ?, 'cursor-1', 'cursor-1', ?)
  `).run(
    values.run_id,
    values.workspace_id,
    values.github_repo,
    values.project_id ?? null,
    values.result,
    values.failure_reason ?? null,
    JSON.stringify(values.diagnostics ?? {
      cursor_effect: 'unchanged',
      failure: {
        category: values.failure_reason ?? null,
        sanitized_message: values.failure_reason ? 'GitHub API returned a server error' : null,
        redaction_applied: false,
      },
    }),
  )
}

describe('GET /api/github/sync lifecycle envelope', () => {
  it('preserves compatibility fields and reports default-off lifecycle diagnostics', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/repo',
      enabled: 1,
      owner_project_id: 3,
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await GET(getRequest('/api/github/sync?workspace_id=4'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(expect.objectContaining({
      syncs: [],
      poller: { running: false, interval: 60000 },
      github_sync_lifecycle: expect.objectContaining({
        version: 'github_sync_lifecycle.v1',
        flag: {
          key: 'FEATURE_GITHUB_SYNC_AUTOMATION',
          enabled: false,
          reason: 'default_off',
        },
        diagnostics: {
          scheduler_task_registered: true,
          schema_version: '077_github_sync_lifecycle',
          telemetry_service: 'none',
        },
      }),
    }))
    expect(body.github_sync_lifecycle.scopes[0].diagnostics.health_summary).toMatchObject({
      severity: 'disabled',
      state_drivers: ['feature_flag_disabled'],
    })
  })

  it('filters lifecycle scopes with the same workspace scope as compatibility syncs', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedWorkspace(db, 5, 'other-product', 'Other Product', '{"FEATURE_WORKSPACE_SWITCHER":true}')
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/visible' })
    seedLifecycleControl(db, { workspace_id: 5, github_repo: 'org/hidden' })
    mocks.getDatabase.mockReturnValue(db)

    const res = await GET(getRequest('/api/github/sync?workspace_id=4'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.github_sync_lifecycle.scopes.map((scope: { scope: { github_repo: string } }) => scope.scope.github_repo))
      .toEqual(['org/visible'])
  })

  it('derives red health severity from repeated lifecycle failures', async () => {
    mocks.githubSyncAutomationEnabled = true
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/repo',
      total_failures: 3,
      backoff_seconds: 120,
      next_retry_at: 1779500120,
      next_retry_reason: 'exponential_backoff',
    })
    seedLifecycleRun(db, {
      run_id: 'ghsync_failure_1',
      workspace_id: 4,
      github_repo: 'org/repo',
      result: 'failed',
      failure_reason: 'github_http_5xx',
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await GET(getRequest('/api/github/sync?workspace_id=4'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.github_sync_lifecycle.flag).toMatchObject({ enabled: true, reason: 'workspace_override' })
    expect(body.github_sync_lifecycle.scopes[0].diagnostics.health_summary).toMatchObject({
      severity: 'red',
      reason: 'repeated sync failures',
      state_drivers: ['repeated_failure'],
    })
  })

  it('surfaces ownership decisions, skipped counters, owner IDs, and unresolved duplicate-prevention diagnostics', async () => {
    mocks.githubSyncAutomationEnabled = true
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/shared',
      owner_project_id: 3,
      skipped_non_owner_count: 1,
    })
    seedLifecycleRun(db, {
      run_id: 'ghsync_skipped_non_owner_1',
      workspace_id: 4,
      github_repo: 'org/shared',
      result: 'skipped_non_owner',
      project_id: 8,
      diagnostics: {
        cursor_effect: 'unchanged',
        ownership: {
          decision: 'skipped_non_owner',
          project_id: 8,
          owner_project_id: 3,
          eligible_project_ids: [3, 8],
          skipped_project_ids: [8],
          reason: 'owner_selected',
        },
      },
    })
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/unresolved',
      skipped_owner_count: 0,
      skipped_non_owner_count: 0,
      last_error: 'ownership_unresolved',
    })
    seedLifecycleRun(db, {
      run_id: 'ghsync_ownership_unresolved_1',
      workspace_id: 4,
      github_repo: 'org/unresolved',
      result: 'ownership_unresolved',
      diagnostics: {
        cursor_effect: 'unchanged',
        ownership: {
          decision: 'ownership_unresolved',
          project_id: null,
          owner_project_id: null,
          eligible_project_ids: [10, 11],
          skipped_project_ids: [],
          reason: 'no_repo_sync_owner',
        },
      },
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await GET(getRequest('/api/github/sync?workspace_id=4'))

    expect(res.status).toBe(200)
    const body = await res.json()
    const scopes = body.github_sync_lifecycle.scopes as Array<{
      scope: { github_repo: string; owner_project_id: number | null }
      skipped: { owner: number; non_owner: number }
      last_error: string | null
      diagnostics: {
        ownership: string | null
        ownership_detail: {
          decision: string
          owner_project_id: number | null
          eligible_project_ids: number[]
          skipped_project_ids: number[]
          reason: string
        } | null
        health_summary: { severity: string; state_drivers: string[] }
      }
    }>
    const shared = scopes.find((scope) => scope.scope.github_repo === 'org/shared')
    expect(shared).toMatchObject({
      scope: { owner_project_id: 3 },
      skipped: { owner: 0, non_owner: 1 },
      diagnostics: {
        ownership: 'skipped_non_owner',
        ownership_detail: {
          decision: 'skipped_non_owner',
          owner_project_id: 3,
          eligible_project_ids: [3, 8],
          skipped_project_ids: [8],
          reason: 'owner_selected',
        },
      },
    })
    const unresolved = scopes.find((scope) => scope.scope.github_repo === 'org/unresolved')
    expect(unresolved).toMatchObject({
      last_error: 'ownership_unresolved',
      diagnostics: {
        ownership: 'ownership_unresolved',
        ownership_detail: {
          decision: 'ownership_unresolved',
          eligible_project_ids: [10, 11],
          reason: 'no_repo_sync_owner',
        },
        health_summary: {
          severity: 'red',
          state_drivers: ['ownership_unresolved'],
        },
      },
    })
  })
})

describe('POST /api/github/sync workspace scoping', () => {
  it('uses explicit Product Line workspace scope when a Facility admin triggers project sync', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    mocks.getDatabase.mockReturnValue(db)

    const res = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true, pulled: 1, pushed: 0 })
    expect(mocks.pullFromGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, github_repo: 'org/repo' }),
      4,
    )
  })

  it('preserves the project trigger success response while wrapping an idle lifecycle scope', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/repo', owner_project_id: 3 })
    mocks.getDatabase.mockReturnValue(db)
    mocks.pullFromGitHub.mockResolvedValue({ pulled: 2, pushed: 1 })

    const res = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, pulled: 2, pushed: 1 })
    expect(mocks.pullFromGitHub).toHaveBeenCalledOnce()
  })

  it('preserves the trigger-all success response while wrapping idle lifecycle scopes', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedGithubProjectRecord(db, {
      id: 8,
      workspace_id: 4,
      name: 'Ops',
      slug: 'ops',
      ticket_prefix: 'OPS',
      github_repo: 'org/ops',
    })
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/repo', owner_project_id: 3 })
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/ops', owner_project_id: 8 })
    mocks.getDatabase.mockReturnValue(db)
    mocks.pullFromGitHub
      .mockResolvedValueOnce({ pulled: 2, pushed: 1 })
      .mockResolvedValueOnce({ pulled: 3, pushed: 4 })

    const res = await POST(request({ action: 'trigger-all', workspace_id: 4 }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      projects_synced: 2,
      pulled: 5,
      pushed: 5,
    })
  })

  it('rejects a same-scope project trigger when an active lifecycle lease exists', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/repo',
      owner_project_id: 3,
      lease_run_id: 'ghsync_active_1',
      lease_owner: 'scheduler:github_sync_automation',
      lease_started_at: mocks.now - 30,
      lease_expires_at: mocks.now + 90,
      last_started_at: mocks.now - 30,
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: 'GitHub sync already running for this scope',
      code: 'github_sync_overlap',
      active_run: {
        run_id: 'ghsync_active_1',
        trigger: 'automatic',
        workspace_id: 4,
        github_repo: 'org/repo',
        lease_owner: 'scheduler:github_sync_automation',
        lease_expires_at: new Date((mocks.now + 90) * 1000).toISOString(),
      },
      retry_after_seconds: 90,
    })
    expect(mocks.pullFromGitHub).not.toHaveBeenCalled()
  })

  it('preflights trigger-all conflicts and does not start any project sync when one requested scope is leased', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedGithubProjectRecord(db, {
      id: 8,
      workspace_id: 4,
      name: 'Ops',
      slug: 'ops',
      ticket_prefix: 'OPS',
      github_repo: 'org/ops',
    })
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/repo',
      owner_project_id: 3,
      lease_run_id: 'ghsync_active_1',
      lease_owner: 'scheduler:github_sync_automation',
      lease_started_at: mocks.now - 30,
      lease_expires_at: mocks.now + 90,
    })
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/ops', owner_project_id: 8 })
    mocks.getDatabase.mockReturnValue(db)

    const res = await POST(request({ action: 'trigger-all', workspace_id: 4 }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: 'GitHub sync already running for one or more requested scopes',
      code: 'github_sync_overlap',
      conflicts: [
        {
          workspace_id: 4,
          github_repo: 'org/repo',
          active_run: {
            run_id: 'ghsync_active_1',
            trigger: 'automatic',
          },
          retry_after_seconds: 90,
        },
      ],
    })
    expect(mocks.pullFromGitHub).not.toHaveBeenCalled()
  })

  it('releases the manual lifecycle lease after a successful project trigger', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/repo', owner_project_id: 3 })
    mocks.getDatabase.mockReturnValue(db)

    const res = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))

    expect(res.status).toBe(200)
    const control = db.prepare(`
      SELECT lease_run_id, lease_owner, lease_started_at, lease_expires_at
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 4 AND github_repo = 'org/repo'
    `).get()
    expect(control).toEqual({
      lease_run_id: null,
      lease_owner: null,
      lease_started_at: null,
      lease_expires_at: null,
    })
  })

  it('uses unique manual lifecycle run IDs for repeated same-second project triggers', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/repo', owner_project_id: 3 })
    mocks.getDatabase.mockReturnValue(db)

    const first = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))
    const second = await POST(request({ action: 'trigger', project_id: 3, workspace_id: 4 }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const rows = db.prepare(`
      SELECT run_id, result
      FROM github_sync_lifecycle_runs
      WHERE workspace_id = 4 AND github_repo = 'org/repo' AND trigger = 'manual'
      ORDER BY run_id ASC
    `).all() as Array<{ run_id: string; result: string }>
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.run_id)).size).toBe(2)
    expect(rows).toEqual([
      expect.objectContaining({ run_id: expect.stringMatching(/^ghsync_manual_/), result: 'success' }),
      expect.objectContaining({ run_id: expect.stringMatching(/^ghsync_manual_/), result: 'success' }),
    ])
    expect(db.prepare(`
      SELECT lease_run_id, lease_owner
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 4 AND github_repo = 'org/repo'
    `).get()).toEqual({ lease_run_id: null, lease_owner: null })
  })

  it('allows non-overlapping scopes to sync while another scope is leased', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db)
    seedGithubProjectRecord(db, {
      id: 8,
      workspace_id: 4,
      name: 'Ops',
      slug: 'ops',
      ticket_prefix: 'OPS',
      github_repo: 'org/ops',
    })
    seedLifecycleControl(db, {
      workspace_id: 4,
      github_repo: 'org/repo',
      owner_project_id: 3,
      lease_run_id: 'ghsync_active_1',
      lease_owner: 'scheduler:github_sync_automation',
      lease_started_at: mocks.now - 30,
      lease_expires_at: mocks.now + 90,
    })
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/ops', owner_project_id: 8 })
    mocks.getDatabase.mockReturnValue(db)

    const res = await POST(request({ action: 'trigger', project_id: 8, workspace_id: 4 }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, pulled: 1, pushed: 0 })
    expect(mocks.pullFromGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, github_repo: 'org/ops' }),
      4,
    )
  })

  it('surfaces skipped-overlap lifecycle records in the GET envelope', async () => {
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedLifecycleControl(db, { workspace_id: 4, github_repo: 'org/repo', owner_project_id: 3 })
    seedLifecycleRun(db, {
      run_id: 'ghsync_skipped_overlap_1',
      workspace_id: 4,
      github_repo: 'org/repo',
      result: 'skipped_overlap',
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await GET(getRequest('/api/github/sync?workspace_id=4'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.github_sync_lifecycle.scopes[0].last_run).toMatchObject({
      run_id: 'ghsync_skipped_overlap_1',
      result: 'skipped_overlap',
      trigger: 'automatic',
    })
  })
})
