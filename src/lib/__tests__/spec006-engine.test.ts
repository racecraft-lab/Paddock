/**
 * SPEC-006 — github-sync-engine flag-OFF parity (T009 / T011 / T016 / T018)
 *
 * Asserts:
 *   (T009 / FR-002, FR-017, US1-AC2) `pushTaskToGitHub` for a flag-OFF
 *     workspace emits ONLY `pd:*` and `priority:*` labels, even when the
 *     task's project has `area_slug='qa'` set.
 *   (T011 / FR-002, FR-044, US1-AC4, SC-010) After a full poll cycle in a
 *     flag-OFF workspace, the activities table contains zero rows of
 *     `type='area_routing_resolved'` or `type='area_routing_unresolved'`.
 *   (T018 / FR-002) The engine MUST gate any area-routing activity write
 *     behind an explicit `if (flagOn) { ... }` guard. We exercise the
 *     `writeAreaRoutingActivity` helper directly with `flagOn=false` and
 *     assert it is a no-op.
 *
 * Uses relative imports per the worktree convention.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ───────────────────────────────────────────
const {
  createIssueMock,
  updateIssueMock,
  fetchIssueMock,
  fetchIssuesMock,
  ensureLabelsMock,
  getDatabaseMock,
} = vi.hoisted(() => ({
  createIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  fetchIssueMock: vi.fn(),
  fetchIssuesMock: vi.fn(),
  ensureLabelsMock: vi.fn(async () => undefined),
  getDatabaseMock: vi.fn(),
}))

vi.mock('@/lib/github', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github')>('@/lib/github')
  return {
    ...actual,
    createIssue: createIssueMock,
    updateIssue: updateIssueMock,
    fetchIssue: fetchIssueMock,
    fetchIssues: fetchIssuesMock,
    ensureLabels: ensureLabelsMock,
  }
})

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    ...actual,
    getDatabase: getDatabaseMock,
  }
})

import { runMigrations } from '../migrations'
import {
  pushTaskToGitHub,
  pullFromGitHub,
  writeAreaRoutingActivity,
} from '../github-sync-engine'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  createIssueMock.mockReset()
  updateIssueMock.mockReset()
  fetchIssueMock.mockReset()
  fetchIssuesMock.mockReset()
  ensureLabelsMock.mockClear()
  getDatabaseMock.mockReset()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function seedProject(
  db: Database.Database,
  args: {
    workspaceId: number
    slug: string
    areaSlug?: string | null
    githubRepo?: string | null
    githubSyncEnabled?: number
  },
): number {
  const stmt = db.prepare(
    `INSERT INTO projects (workspace_id, name, slug, ticket_prefix, area_slug, github_repo, github_sync_enabled, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
  )
  const info = stmt.run(
    args.workspaceId,
    args.slug,
    args.slug,
    args.slug.toUpperCase(),
    args.areaSlug ?? null,
    args.githubRepo ?? null,
    args.githubSyncEnabled ?? 1,
  )
  return Number(info.lastInsertRowid)
}

// ── T009 — flag-OFF outbound emission ──────────────

describe('SPEC-006 / T009 — pushTaskToGitHub flag-OFF emission (FR-002, FR-017, US1-AC2)', () => {
  it('emits ONLY pd:* and priority:* labels even when project.area_slug is set', async () => {
    const db = freshMigratedDb()
    const projectId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-qa',
      areaSlug: 'qa',
      githubRepo: 'org/repo',
    })

    getDatabaseMock.mockReturnValue(db)
    createIssueMock.mockResolvedValue({ number: 42 })

    await pushTaskToGitHub(
      {
        id: 1,
        title: 'New issue',
        description: 'body',
        status: 'inbox',
        priority: 'medium',
        github_issue_number: null,
        github_repo: null,
        workspace_id: 1,
      },
      {
        id: projectId,
        github_repo: 'org/repo',
        github_sync_enabled: 1,
      },
    )

    expect(createIssueMock).toHaveBeenCalledTimes(1)
    const callArgs = createIssueMock.mock.calls[0]
    const issueArg = callArgs[1] as { labels: string[] }
    expect(issueArg.labels).toEqual(['pd:inbox', 'priority:medium'])

    for (const label of issueArg.labels) {
      expect(label.startsWith('area:')).toBe(false)
    }
  })
})

// ── T011 — flag-OFF activity log shape ─────────────

describe('SPEC-006 / T011 — flag-OFF activity log shape (FR-002, FR-044, US1-AC4, SC-010)', () => {
  it('writes zero area_routing_* activity rows after a full inbound sync cycle', async () => {
    const db = freshMigratedDb()
    const projectId = seedProject(db, {
      workspaceId: 1,
      slug: 'p',
      githubRepo: 'org/repo',
    })

    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      {
        number: 1,
        title: 'Issue 1',
        body: '',
        state: 'open',
        updated_at: new Date().toISOString(),
        labels: [{ name: 'area:qa' }],
      },
    ])

    await pullFromGitHub(
      { id: projectId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const rows = db
      .prepare(
        `SELECT COUNT(*) AS c FROM activities
          WHERE type = 'area_routing_resolved' OR type = 'area_routing_unresolved'`,
      )
      .get() as { c: number }
    expect(rows.c).toBe(0)
  })
})

// ── T018 — explicit flag guard helper ──────────────

describe('SPEC-006 / T018 — area-routing activity guard (FR-002)', () => {
  it('writeAreaRoutingActivity is a no-op when flagOn=false', () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)

    writeAreaRoutingActivity(
      false,
      {
        type: 'area_routing_resolved',
        entityId: 1,
        actor: 'github-sync',
        description: 'should not be written',
        data: { reason: 'single_match' },
        workspaceId: 1,
      },
    )

    const rows = db
      .prepare(
        `SELECT COUNT(*) AS c FROM activities
          WHERE type = 'area_routing_resolved' OR type = 'area_routing_unresolved'`,
      )
      .get() as { c: number }
    expect(rows.c).toBe(0)
  })

  it('writeAreaRoutingActivity writes when flagOn=true', () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)

    writeAreaRoutingActivity(
      true,
      {
        type: 'area_routing_resolved',
        entityId: 1,
        actor: 'github-sync',
        description: 'flag on — should write',
        data: { reason: 'single_match' },
        workspaceId: 1,
      },
    )

    const rows = db
      .prepare(
        `SELECT COUNT(*) AS c FROM activities WHERE type = 'area_routing_resolved'`,
      )
      .get() as { c: number }
    expect(rows.c).toBe(1)
  })
})
