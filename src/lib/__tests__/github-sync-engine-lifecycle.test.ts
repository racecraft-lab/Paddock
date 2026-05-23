import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getDatabaseMock, fetchIssuesMock } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  fetchIssuesMock: vi.fn(async (): Promise<unknown> => []),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock }
})

vi.mock('@/lib/github', () => ({
  fetchIssues: fetchIssuesMock,
  fetchIssue: vi.fn(),
  updateIssue: vi.fn(),
  createIssue: vi.fn(),
  ensureLabels: vi.fn(),
  createLabel: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn() },
}))

vi.mock('@/lib/config', () => ({
  config: { gnap: { enabled: false, autoSync: false, repoPath: '' } },
}))

import { runMigrations } from '../migrations'
import { pullFromGitHub } from '../github-sync-engine'
import type { GitHubIssue } from '../github'

const openDbs: Database.Database[] = []

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, status)
    VALUES (10, 1, 'Owner', 'owner', 'OWN', 'org/repo', 1, 'active')
  `).run()
  return db
}

beforeEach(() => {
  getDatabaseMock.mockReset()
  fetchIssuesMock.mockReset()
  fetchIssuesMock.mockResolvedValue([])
})

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

describe('SPEC-013A1 / T030 automatic pull cursor and bounds', () => {
  it('keeps manual pull defaults tied to github_syncs history', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    db.prepare(`
      INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, project_id, workspace_id)
      VALUES ('org/repo', 1779499999, 0, 'inbound', 'success', 10, 1)
    `).run()

    await pullFromGitHub({ id: 10, github_repo: 'org/repo', github_sync_enabled: 1 }, 1)

    expect(fetchIssuesMock).toHaveBeenCalledWith('org/repo', {
      state: 'all',
      since: new Date(1779499999 * 1000).toISOString(),
      per_page: 100,
    })
  })

  it('uses automatic lifecycle cursor and issue bound without changing manual defaults', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    db.prepare(`
      INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, project_id, workspace_id)
      VALUES ('org/repo', 100, 0, 'inbound', 'success', 10, 1)
    `).run()

    await pullFromGitHub(
      { id: 10, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
      {
        automatic: {
          cursor: '2026-05-22T23:49:59.000Z',
          maxPages: 4,
          maxIssues: 6,
          maxDurationMs: 8_000,
        },
      },
    )

    expect(fetchIssuesMock).toHaveBeenCalledWith('org/repo', {
      state: 'all',
      since: '2026-05-22T23:49:59.000Z',
      per_page: 6,
      page: 1,
    })
  })

  it('stops automatic pulls at the issue bound and reports partial resume state', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      issue(101, '2026-05-23T00:00:01.000Z'),
      issue(102, '2026-05-23T00:00:02.000Z'),
      issue(103, '2026-05-23T00:00:03.000Z'),
    ])

    const result = await pullFromGitHub(
      { id: 10, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
      {
        automatic: {
          cursor: '2026-05-22T23:49:59.000Z',
          maxPages: 5,
          maxIssues: 2,
          maxDurationMs: 8_000,
        },
      },
    )

    expect(result).toMatchObject({
      result: 'partial',
      partialRunReason: 'max_issues',
      cursor: '2026-05-23T00:00:02.000Z',
      issuesSeen: 2,
      pagesFetched: 1,
    })
    expect(db.prepare(`SELECT status, issue_count FROM github_syncs WHERE repo = 'org/repo'`).get()).toEqual({
      status: 'partial',
      issue_count: 2,
    })
  })

  it('stops automatic pulls at the page bound and keeps the next run on the last success cursor', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock
      .mockResolvedValueOnce([issue(201, '2026-05-23T00:00:01.000Z')])
      .mockResolvedValueOnce([issue(202, '2026-05-23T00:00:02.000Z')])

    const result = await pullFromGitHub(
      { id: 10, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
      {
        automatic: {
          cursor: '2026-05-22T23:49:59.000Z',
          maxPages: 2,
          maxIssues: 20,
          maxDurationMs: 8_000,
        },
      },
    )

    expect(result).toMatchObject({
      result: 'partial',
      partialRunReason: 'max_pages',
      pagesFetched: 2,
      issuesSeen: 2,
    })
    expect(fetchIssuesMock).toHaveBeenNthCalledWith(2, 'org/repo', expect.objectContaining({ page: 2 }))
  })

  it('fails malformed first automatic page without advancing the cursor', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValueOnce({ message: 'not an array' })

    await expect(pullFromGitHub(
      { id: 10, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
      {
        automatic: {
          cursor: '2026-05-22T23:49:59.000Z',
          maxPages: 2,
          maxIssues: 20,
          maxDurationMs: 8_000,
        },
      },
    )).rejects.toMatchObject({ kind: 'unexpected_shape' })
    expect(db.prepare(`SELECT status, issue_count FROM github_syncs WHERE repo = 'org/repo'`).get()).toEqual({
      status: 'error',
      issue_count: 0,
    })
  })
})

function issue(number: number, updatedAt: string): GitHubIssue {
  return {
    number,
    title: `Issue ${number}`,
    body: null,
    state: 'open',
    labels: [],
    assignee: null,
    html_url: `https://github.test/org/repo/issues/${number}`,
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}
