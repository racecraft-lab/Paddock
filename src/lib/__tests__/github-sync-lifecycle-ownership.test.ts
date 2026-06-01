import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getDatabaseMock, pullFromGitHubMock } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  pullFromGitHubMock: vi.fn(async (): Promise<unknown> => ({
    pulled: 1,
    pushed: 0,
    cursor: '2026-05-23T04:01:00.000Z',
    result: 'success',
  })),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock }
})

vi.mock('@/lib/github-sync-engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github-sync-engine')>('@/lib/github-sync-engine')
  return { ...actual, pullFromGitHub: pullFromGitHubMock }
})

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { runMigrations } from '../migrations'
import { getLifecycleStatusForScope, recordLifecycleSkippedOwner } from '../github-sync-lifecycle'
import { runGitHubSyncAutomationTickForTest } from '../github-sync-poller'

const openDbs: Database.Database[] = []

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  db.prepare(`
    INSERT OR REPLACE INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES (1, 'mission-control', 'Paddock', 1, ?, unixepoch(), unixepoch())
  `).run(JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }))
  return db
}

function seedProject(
  db: Database.Database,
  values: { id: number; repo: string; owner?: number; enabled?: number },
): void {
  db.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled,
      is_repo_sync_owner, status
    )
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    values.id,
    `Project ${values.id}`,
    `project-${values.id}`,
    `P${values.id}`,
    values.repo,
    values.enabled ?? 1,
    values.owner ?? 0,
  )
}

function seedControl(db: Database.Database, repo = 'org/shared'): void {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, owner_project_id, next_retry_at, last_success_cursor,
      created_at, updated_at
    )
    VALUES (1, ?, 1, 300, 10, 1000, 45, NULL, 1, '2026-05-23T03:55:00.000Z', 1, 1)
  `).run(repo)
}

beforeEach(() => {
  getDatabaseMock.mockReset()
  pullFromGitHubMock.mockClear()
  pullFromGitHubMock.mockResolvedValue({
    pulled: 1,
    pushed: 0,
    cursor: '2026-05-23T04:01:00.000Z',
    result: 'success',
  })
})

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

describe('SPEC-013A1 / US4 automatic repository ownership decisions', () => {
  it('polls a single enabled project without requiring FEATURE_AREA_LABEL_ROUTING', async () => {
    const db = freshMigratedDb()
    seedProject(db, { id: 10, repo: 'org/solo', owner: 0 })
    seedControl(db, 'org/solo')
    getDatabaseMock.mockReturnValue(db)

    const result = await runGitHubSyncAutomationTickForTest({
      now: 1_779_500_000,
      candidateLimit: 1,
      leaseOwner: 'scheduler:test',
    })

    expect(result).toMatchObject({ scopesStarted: 1, scopesSkipped: 0 })
    expect(pullFromGitHubMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, github_repo: 'org/solo' }),
      1,
      expect.objectContaining({ automatic: expect.any(Object) }),
    )
  })

  it('selects exactly one shared-repository owner and records non-owner evidence without duplicate ingestion', async () => {
    const db = freshMigratedDb()
    seedProject(db, { id: 10, repo: 'org/shared', owner: 1 })
    seedProject(db, { id: 11, repo: 'org/shared', owner: 0 })
    seedControl(db)
    getDatabaseMock.mockReturnValue(db)

    const result = await runGitHubSyncAutomationTickForTest({
      now: 1_779_500_000,
      candidateLimit: 1,
      leaseOwner: 'scheduler:test',
    })

    expect(result).toMatchObject({ scopesStarted: 1, scopesSkipped: 1 })
    expect(pullFromGitHubMock).toHaveBeenCalledTimes(1)
    const firstPullCall = pullFromGitHubMock.mock.calls[0] as unknown as
      [{ id: number; github_repo: string }, ...unknown[]]
    expect(firstPullCall[0]).toMatchObject({ id: 10, github_repo: 'org/shared' })
    expect(db.prepare(`
      SELECT result, project_id, cursor_advanced
      FROM github_sync_lifecycle_runs
      WHERE result = 'skipped_non_owner'
    `).get()).toEqual({ result: 'skipped_non_owner', project_id: 11, cursor_advanced: 0 })
    expect(db.prepare(`
      SELECT owner_project_id, skipped_non_owner_count
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 1 AND github_repo = 'org/shared'
    `).get()).toEqual({ owner_project_id: 10, skipped_non_owner_count: 1 })
  })

  it('records unresolved ownership instead of polling duplicate shared-repository candidates with no owner', async () => {
    const db = freshMigratedDb()
    seedProject(db, { id: 10, repo: 'org/unresolved', owner: 0 })
    seedProject(db, { id: 11, repo: 'org/unresolved', owner: 0 })
    seedControl(db, 'org/unresolved')
    getDatabaseMock.mockReturnValue(db)

    const result = await runGitHubSyncAutomationTickForTest({
      now: 1_779_500_000,
      candidateLimit: 1,
      leaseOwner: 'scheduler:test',
    })

    expect(result).toMatchObject({ scopesStarted: 0, scopesSkipped: 1 })
    expect(pullFromGitHubMock).not.toHaveBeenCalled()
    const status = getLifecycleStatusForScope(db, {
      workspace_id: 1,
      github_repo: 'org/unresolved',
      now: 1_779_500_000,
    })
    expect(status.last_run).toMatchObject({ result: 'ownership_unresolved' })
    expect(status.last_error).toBe('ownership_unresolved')
    expect(status.diagnostics).toMatchObject({
      ownership: 'ownership_unresolved',
      health_summary: { severity: 'red', state_drivers: ['ownership_unresolved'] },
    })
  })

  it('fails closed when multiple shared-repository owners are present', async () => {
    const db = freshMigratedDb()
    db.prepare(`DROP INDEX IF EXISTS idx_projects_one_sync_owner_per_repo`).run()
    seedProject(db, { id: 10, repo: 'org/multiple-owners', owner: 1 })
    seedProject(db, { id: 11, repo: 'org/multiple-owners', owner: 1 })
    seedControl(db, 'org/multiple-owners')
    getDatabaseMock.mockReturnValue(db)

    const result = await runGitHubSyncAutomationTickForTest({
      now: 1_779_500_000,
      candidateLimit: 1,
      leaseOwner: 'scheduler:test',
    })

    expect(result).toMatchObject({ scopesStarted: 0, scopesSkipped: 1 })
    expect(pullFromGitHubMock).not.toHaveBeenCalled()
    expect(db.prepare(`
      SELECT result, diagnostics_json
      FROM github_sync_lifecycle_runs
      WHERE github_repo = 'org/multiple-owners'
    `).get()).toMatchObject({
      result: 'ownership_unresolved',
      diagnostics_json: expect.stringContaining('multiple_repo_sync_owners'),
    })
  })

  it('records skipped-owner terminal evidence with cursor preservation', () => {
    const db = freshMigratedDb()
    seedControl(db, 'org/skipped-owner')

    recordLifecycleSkippedOwner(db, {
      run_id: 'ghsync_skipped_owner_1',
      workspace_id: 1,
      github_repo: 'org/skipped-owner',
      trigger: 'automatic',
      project_id: 10,
      owner_project_id: 10,
      cursor_before: '2026-05-23T03:55:00.000Z',
      eligible_project_ids: [10, 11],
      skipped_project_ids: [10],
      now: 1_779_500_000,
    })

    expect(db.prepare(`
      SELECT result, project_id, cursor_before, cursor_after, cursor_advanced
      FROM github_sync_lifecycle_runs
      WHERE run_id = 'ghsync_skipped_owner_1'
    `).get()).toEqual({
      result: 'skipped_owner',
      project_id: 10,
      cursor_before: '2026-05-23T03:55:00.000Z',
      cursor_after: '2026-05-23T03:55:00.000Z',
      cursor_advanced: 0,
    })
    expect(db.prepare(`
      SELECT skipped_owner_count
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 1 AND github_repo = 'org/skipped-owner'
    `).get()).toEqual({ skipped_owner_count: 1 })
    expect(db.prepare(`SELECT type FROM activities WHERE type = 'github_sync_skipped_owner'`).get())
      .toEqual({ type: 'github_sync_skipped_owner' })
  })
})
