/**
 * SPEC-006 — github-sync-engine inbound/outbound area routing (US4).
 *
 * Covers:
 *   T038 — `loadAreaRoutingCache` builds once per pullFromGitHub call
 *          (single SELECT id, area_slug, is_triage_project FROM projects
 *          WHERE workspace_id=?). FR-009.
 *   T039 — Five-path resolution: single_match, no_label, multi_label,
 *          no_match, no_triage. Plus edge cases: empty `area:`, case
 *          insensitivity, area_slug='triage' on non-triage project.
 *          FR-010..FR-014, FR-042, FR-043, FR-043a.
 *   T040 — No-thrash: subsequent sync of an existing task does NOT
 *          rewrite `task.project_id` and writes ZERO new
 *          `area_routing_*` activity rows. FR-015, FR-044.
 *   T041 — Outbound `area:*` emission: pushTaskToGitHub appends
 *          `area:<area_slug>` when flag ON and area_slug is non-NULL;
 *          omits when flag OFF or area_slug IS NULL.
 *          FR-016, FR-017.
 *
 * Uses relative imports (`../github-sync-engine`, `../migrations`) per
 * worktree convention. `@/lib/github` is mocked so we don't hit the
 * network; `getDatabase` is mocked to return an in-memory DB seeded
 * with a fresh migration run.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────
const {
  getDatabaseMock,
  fetchIssuesMock,
  fetchIssueMock,
  updateIssueMock,
  createIssueMock,
  ensureLabelsMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  fetchIssuesMock: vi.fn(),
  fetchIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  createIssueMock: vi.fn(),
  ensureLabelsMock: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock }
})

vi.mock('@/lib/github', () => ({
  fetchIssues: fetchIssuesMock,
  fetchIssue: fetchIssueMock,
  updateIssue: updateIssueMock,
  createIssue: createIssueMock,
  ensureLabels: ensureLabelsMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { runMigrations } from '../migrations'
import {
  pullFromGitHub,
  pushTaskToGitHub,
  loadAreaRoutingCache,
  backfillAreaRouting,
} from '../github-sync-engine'
import type { GitHubIssue } from '../github'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  getDatabaseMock.mockReset()
  fetchIssuesMock.mockReset()
  fetchIssueMock.mockReset()
  updateIssueMock.mockReset()
  createIssueMock.mockReset()
  ensureLabelsMock.mockReset()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

interface SeedProjectArgs {
  workspaceId: number
  slug: string
  areaSlug?: string | null
  isTriageProject?: 0 | 1
  isRepoSyncOwner?: 0 | 1
  githubRepo?: string | null
  githubSyncEnabled?: 0 | 1
}

function seedProject(db: Database.Database, args: SeedProjectArgs): number {
  const stmt = db.prepare(`
    INSERT INTO projects (
      workspace_id, name, slug, ticket_prefix,
      area_slug, is_triage_project, is_repo_sync_owner,
      github_repo, github_sync_enabled, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `)
  const info = stmt.run(
    args.workspaceId,
    args.slug,
    args.slug,
    args.slug.slice(0, 4).toUpperCase(),
    args.areaSlug ?? null,
    args.isTriageProject ?? 0,
    args.isRepoSyncOwner ?? 0,
    args.githubRepo ?? null,
    args.githubSyncEnabled ?? 0,
  )
  return Number(info.lastInsertRowid)
}

function setWorkspaceFlag(
  db: Database.Database,
  workspaceId: number,
  on: boolean,
): void {
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_AREA_LABEL_ROUTING: on }),
    workspaceId,
  )
}

function makeIssue(args: {
  number: number
  title?: string
  body?: string
  state?: 'open' | 'closed'
  labels?: string[]
  updatedAt?: string
}): GitHubIssue {
  return {
    number: args.number,
    title: args.title ?? `Issue ${args.number}`,
    body: args.body ?? '',
    state: args.state ?? 'open',
    labels: (args.labels ?? []).map((name) => ({ name })),
    assignee: null,
    html_url: `https://github.com/org/repo/issues/${args.number}`,
    created_at: args.updatedAt ?? '2026-05-01T12:00:00Z',
    updated_at: args.updatedAt ?? '2026-05-01T12:00:00Z',
  }
}

// ── T038 — loadAreaRoutingCache (FR-009) ────────────────────────────
describe('SPEC-006 / T038 — loadAreaRoutingCache (FR-009)', () => {
  it('returns slugToProjectId map and triageProjectId from a single SELECT', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    const devId = seedProject(db, { workspaceId: 1, slug: 'p-dev', areaSlug: 'dev' })
    const triageId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-triage',
      isTriageProject: 1,
    })
    // Project with area_slug='triage' but is_triage_project=0 (FR-014 amendment).
    const literalTriageId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-literal-triage',
      areaSlug: 'triage',
      isTriageProject: 0,
    })
    // Different workspace — must NOT leak in.
    seedProject(db, { workspaceId: 2, slug: 'p-leaky', areaSlug: 'qa' })

    const cache = loadAreaRoutingCache(db, 1)
    expect(cache.slugToProjectId.get('qa')).toBe(qaId)
    expect(cache.slugToProjectId.get('dev')).toBe(devId)
    expect(cache.slugToProjectId.get('triage')).toBe(literalTriageId)
    expect(cache.triageProjectId).toBe(triageId)
  })

  it('triageProjectId is null when no project has is_triage_project=1', () => {
    const db = freshMigratedDb()
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    const cache = loadAreaRoutingCache(db, 1)
    expect(cache.triageProjectId).toBeNull()
    expect(cache.slugToProjectId.get('qa')).toBeDefined()
  })

  it('is built once per pullFromGitHub call (one SELECT for projects-by-workspace, regardless of issue count)', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    const triageId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-triage',
      isTriageProject: 1,
    })
    const ownerId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-owner',
      githubRepo: 'org/repo',
      isRepoSyncOwner: 1,
      githubSyncEnabled: 1,
    })

    let cacheSelectCount = 0
    const origPrepare = db.prepare.bind(db)
    db.prepare = ((sql: string) => {
      if (
        /SELECT\s+id,\s*area_slug,\s*is_triage_project\s+FROM\s+projects\s+WHERE\s+workspace_id\s*=\s*\?/i.test(
          sql,
        )
      ) {
        cacheSelectCount++
      }
      return origPrepare(sql)
    }) as typeof db.prepare

    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 1, labels: ['area:qa'] }),
      makeIssue({ number: 2, labels: [] }),
      makeIssue({ number: 3, labels: ['area:unknown'] }),
    ])

    await pullFromGitHub(
      {
        id: ownerId,
        github_repo: 'org/repo',
        github_sync_enabled: 1,
      },
      1,
    )
    expect(cacheSelectCount).toBe(1)
    // sanity: triageId variable used so vitest doesn't flag unused.
    expect(triageId).toBeGreaterThan(0)
  })
})

// ── T039 — Five-path inbound routing (FR-010..FR-014) ──────────────
describe('SPEC-006 / T039 — inbound routing five paths', () => {
  function setupOwner(
    db: Database.Database,
    extras: { triage?: boolean; areas?: Array<{ slug: string; areaSlug: string }> } = {},
  ): { ownerId: number; areaProjectIds: Map<string, number>; triageId: number | null } {
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-owner',
      githubRepo: 'org/repo',
      isRepoSyncOwner: 1,
      githubSyncEnabled: 1,
    })
    let triageId: number | null = null
    if (extras.triage !== false) {
      triageId = seedProject(db, {
        workspaceId: 1,
        slug: 'p-triage',
        isTriageProject: 1,
      })
    }
    const areaProjectIds = new Map<string, number>()
    for (const a of extras.areas ?? []) {
      const id = seedProject(db, {
        workspaceId: 1,
        slug: a.slug,
        areaSlug: a.areaSlug,
      })
      areaProjectIds.set(a.areaSlug, id)
    }
    return { ownerId, areaProjectIds, triageId }
  }

  it('single_match: area:qa → QA project, activity area_routing_resolved', async () => {
    const db = freshMigratedDb()
    const { ownerId, areaProjectIds } = setupOwner(db, {
      areas: [{ slug: 'p-qa', areaSlug: 'qa' }],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 101, labels: ['area:qa'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 101 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    expect(task?.project_id).toBe(areaProjectIds.get('qa'))

    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_resolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('single_match')
    expect(data.source).toBe('ingest')
    expect(data.area_labels).toEqual(['qa'])
    expect(data.resolved_project_id).toBe(areaProjectIds.get('qa'))
    expect(data.github_issue_number).toBe(101)
    expect(data.github_repo).toBe('org/repo')
    expect(data.workspace_id).toBe(1)
  })

  it('no_label: empty area:* set → triage project, reason no_label', async () => {
    const db = freshMigratedDb()
    const { ownerId, triageId } = setupOwner(db, {
      areas: [{ slug: 'p-qa', areaSlug: 'qa' }],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 102, labels: ['priority:p1'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 102 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    expect(task?.project_id).toBe(triageId)

    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_unresolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('no_label')
    expect(data.area_labels).toEqual([])
    expect(data.resolved_project_id).toBe(triageId)
  })

  it('multi_label: area:qa + area:dev → triage, reason multi_label, area_labels=[qa,dev]', async () => {
    const db = freshMigratedDb()
    const { ownerId, triageId } = setupOwner(db, {
      areas: [
        { slug: 'p-qa', areaSlug: 'qa' },
        { slug: 'p-dev', areaSlug: 'dev' },
      ],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 103, labels: ['area:qa', 'area:dev'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 103 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    expect(task?.project_id).toBe(triageId)

    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_unresolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('multi_label')
    expect(data.area_labels).toEqual(['qa', 'dev'])
    expect(data.resolved_project_id).toBe(triageId)
  })

  it('no_match: area:marketing with no matching project → triage, reason no_match', async () => {
    const db = freshMigratedDb()
    const { ownerId, triageId } = setupOwner(db, {
      areas: [{ slug: 'p-qa', areaSlug: 'qa' }],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 104, labels: ['area:marketing'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 104 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    expect(task?.project_id).toBe(triageId)
    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_unresolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('no_match')
    expect(data.area_labels).toEqual(['marketing'])
  })

  it('no_triage: ambiguous issue, no triage project → sync-owner fallback, reason no_triage', async () => {
    const db = freshMigratedDb()
    const { ownerId } = setupOwner(db, {
      triage: false,
      areas: [{ slug: 'p-qa', areaSlug: 'qa' }],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 105, labels: ['area:qa', 'area:dev'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 105 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    // Sync-owner fallback: the calling project (the one driving pullFromGitHub).
    expect(task?.project_id).toBe(ownerId)

    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_unresolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('no_triage')
    expect(data.resolved_project_id).toBe(ownerId)
  })

  it('parser: empty area: prefix is skipped; case insensitive', async () => {
    const db = freshMigratedDb()
    const { ownerId, areaProjectIds } = setupOwner(db, {
      areas: [{ slug: 'p-qa', areaSlug: 'qa' }],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 106, labels: ['area:', 'area:QA'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 106 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    // Empty `area:` is skipped → only `area:QA` (lowercased to `qa`) counts → single_match.
    expect(task?.project_id).toBe(areaProjectIds.get('qa'))
    const activity = db
      .prepare(
        `SELECT data FROM activities WHERE type = 'area_routing_resolved' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { data: string } | undefined
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('single_match')
    expect(data.area_labels).toEqual(['qa'])
  })

  it('FR-014 amendment: area_slug=triage on a NON-triage project resolves via cache (single_match), NOT to triage project', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-owner',
      githubRepo: 'org/repo',
      isRepoSyncOwner: 1,
      githubSyncEnabled: 1,
    })
    const triageId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-real-triage',
      isTriageProject: 1,
    })
    // Project that happens to use 'triage' as its area_slug but is NOT the triage project.
    const literalTriageId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-literal-triage',
      areaSlug: 'triage',
      isTriageProject: 0,
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeIssue({ number: 107, labels: ['area:triage'] }),
    ])

    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const task = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 107 AND workspace_id = 1`,
      )
      .get() as { project_id: number } | undefined
    expect(task?.project_id).toBe(literalTriageId)
    expect(task?.project_id).not.toBe(triageId)
    const activity = db
      .prepare(
        `SELECT type, data FROM activities WHERE type LIKE 'area_routing_%' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { type: string; data: string } | undefined
    expect(activity?.type).toBe('area_routing_resolved')
    const data = JSON.parse(activity!.data) as Record<string, unknown>
    expect(data.reason).toBe('single_match')
  })
})

// ── T040 — No-thrash on subsequent sync (FR-015, FR-044) ─────────────
describe('SPEC-006 / T040 — anti-thrash on subsequent sync', () => {
  it('existing task: label change does NOT change project_id and writes 0 new area_routing_* activity rows', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-owner',
      githubRepo: 'org/repo',
      isRepoSyncOwner: 1,
      githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-qa',
      areaSlug: 'qa',
    })
    const devId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-dev',
      areaSlug: 'dev',
    })
    seedProject(db, {
      workspaceId: 1,
      slug: 'p-triage',
      isTriageProject: 1,
    })

    getDatabaseMock.mockReturnValue(db)

    // First sync: area:qa → QA project, activity written.
    fetchIssuesMock.mockResolvedValueOnce([
      makeIssue({
        number: 200,
        labels: ['area:qa'],
        updatedAt: '2026-05-01T10:00:00Z',
      }),
    ])
    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const initialTask = db
      .prepare(
        `SELECT id, project_id FROM tasks WHERE github_issue_number = 200 AND workspace_id = 1`,
      )
      .get() as { id: number; project_id: number }
    expect(initialTask.project_id).toBe(qaId)
    const activitiesBefore = db
      .prepare(
        `SELECT COUNT(*) as c FROM activities WHERE type LIKE 'area_routing_%'`,
      )
      .get() as { c: number }
    expect(activitiesBefore.c).toBe(1)

    // Second sync: same issue, labels changed to area:dev (newer updated_at).
    fetchIssuesMock.mockResolvedValueOnce([
      makeIssue({
        number: 200,
        labels: ['area:dev'],
        updatedAt: '2026-05-02T10:00:00Z',
      }),
    ])
    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const afterTask = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 200 AND workspace_id = 1`,
      )
      .get() as { project_id: number }
    expect(afterTask.project_id).toBe(qaId)
    expect(afterTask.project_id).not.toBe(devId)

    const activitiesAfter = db
      .prepare(
        `SELECT COUNT(*) as c FROM activities WHERE type LIKE 'area_routing_%'`,
      )
      .get() as { c: number }
    expect(activitiesAfter.c).toBe(1)
  })

  it('existing task: labels removed entirely → project_id still unchanged, no new activity', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-owner',
      githubRepo: 'org/repo',
      isRepoSyncOwner: 1,
      githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-qa',
      areaSlug: 'qa',
    })
    seedProject(db, {
      workspaceId: 1,
      slug: 'p-triage',
      isTriageProject: 1,
    })
    getDatabaseMock.mockReturnValue(db)

    fetchIssuesMock.mockResolvedValueOnce([
      makeIssue({
        number: 201,
        labels: ['area:qa'],
        updatedAt: '2026-05-01T10:00:00Z',
      }),
    ])
    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    fetchIssuesMock.mockResolvedValueOnce([
      makeIssue({
        number: 201,
        labels: [],
        updatedAt: '2026-05-02T10:00:00Z',
      }),
    ])
    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 },
      1,
    )

    const t = db
      .prepare(
        `SELECT project_id FROM tasks WHERE github_issue_number = 201 AND workspace_id = 1`,
      )
      .get() as { project_id: number }
    expect(t.project_id).toBe(qaId)
    const a = db
      .prepare(
        `SELECT COUNT(*) as c FROM activities WHERE type LIKE 'area_routing_%'`,
      )
      .get() as { c: number }
    expect(a.c).toBe(1)
  })
})

// ── T041 — Outbound area:* emission (FR-016, FR-017) ─────────────────
describe('SPEC-006 / T041 — outbound area:* emission', () => {
  it('flag ON + project.area_slug=qa → outbound labels include area:qa with mc:* and priority:*', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const projectId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-qa',
      areaSlug: 'qa',
      githubRepo: 'org/repo',
      githubSyncEnabled: 1,
      isRepoSyncOwner: 1,
    })
    db.prepare(
      `INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, github_issue_number, github_repo, created_at, updated_at)
       VALUES (1, 'T1', 'in_progress', 'p1', ?, 1, 42, 'org/repo', unixepoch(), unixepoch())`,
    ).run(projectId)
    getDatabaseMock.mockReturnValue(db)

    fetchIssueMock.mockResolvedValue(
      makeIssue({ number: 42, labels: ['custom-label'] }),
    )
    updateIssueMock.mockResolvedValue(undefined)

    await pushTaskToGitHub(
      {
        id: 1,
        title: 'T1',
        status: 'in_progress',
        priority: 'p1',
        github_issue_number: 42,
        github_repo: 'org/repo',
        workspace_id: 1,
        project_id: projectId,
      },
      { id: projectId, github_repo: 'org/repo', github_sync_enabled: 1 },
    )

    expect(updateIssueMock).toHaveBeenCalledTimes(1)
    const call = updateIssueMock.mock.calls[0]
    const labels = call?.[2]?.labels as string[]
    expect(labels).toContain('area:qa')
    expect(labels).toContain('custom-label')
    expect(labels.some((l) => l.startsWith('mc:'))).toBe(true)
    expect(labels.some((l) => l.startsWith('priority:'))).toBe(true)
  })

  it('flag ON + project.area_slug=NULL → no area:* in outbound labels', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const projectId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-noslug',
      areaSlug: null,
      githubRepo: 'org/repo',
      githubSyncEnabled: 1,
    })
    db.prepare(
      `INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, github_issue_number, github_repo, created_at, updated_at)
       VALUES (2, 'T2', 'in_progress', 'p2', ?, 1, 43, 'org/repo', unixepoch(), unixepoch())`,
    ).run(projectId)
    getDatabaseMock.mockReturnValue(db)

    fetchIssueMock.mockResolvedValue(
      makeIssue({ number: 43, labels: [] }),
    )
    updateIssueMock.mockResolvedValue(undefined)

    await pushTaskToGitHub(
      {
        id: 2,
        title: 'T2',
        status: 'in_progress',
        priority: 'p2',
        github_issue_number: 43,
        github_repo: 'org/repo',
        workspace_id: 1,
        project_id: projectId,
      },
      { id: projectId, github_repo: 'org/repo', github_sync_enabled: 1 },
    )

    const labels = updateIssueMock.mock.calls[0]?.[2]?.labels as string[]
    expect(labels.some((l) => l.startsWith('area:'))).toBe(false)
  })

  it('flag OFF + project.area_slug=qa → no area:* in outbound labels', async () => {
    const db = freshMigratedDb()
    // Flag explicitly OFF.
    setWorkspaceFlag(db, 1, false)
    const projectId = seedProject(db, {
      workspaceId: 1,
      slug: 'p-qa',
      areaSlug: 'qa',
      githubRepo: 'org/repo',
      githubSyncEnabled: 1,
    })
    db.prepare(
      `INSERT INTO tasks (id, title, status, priority, project_id, workspace_id, github_issue_number, github_repo, created_at, updated_at)
       VALUES (3, 'T3', 'in_progress', 'p1', ?, 1, 44, 'org/repo', unixepoch(), unixepoch())`,
    ).run(projectId)
    getDatabaseMock.mockReturnValue(db)

    fetchIssueMock.mockResolvedValue(
      makeIssue({ number: 44, labels: [] }),
    )
    updateIssueMock.mockResolvedValue(undefined)

    await pushTaskToGitHub(
      {
        id: 3,
        title: 'T3',
        status: 'in_progress',
        priority: 'p1',
        github_issue_number: 44,
        github_repo: 'org/repo',
        workspace_id: 1,
        project_id: projectId,
      },
      { id: projectId, github_repo: 'org/repo', github_sync_enabled: 1 },
    )

    const labels = updateIssueMock.mock.calls[0]?.[2]?.labels as string[]
    expect(labels.some((l) => l.startsWith('area:'))).toBe(false)
  })
})

// ── SPEC-006 / Phase 7 (US5) — backfillAreaRouting helpers + tests ────

interface SeedTaskArgs {
  id?: number
  workspaceId: number
  projectId: number
  githubRepo?: string | null
  githubIssueNumber?: number | null
  tags?: string[] | null | string
  status?: string
  priority?: string
}

function seedTask(db: Database.Database, args: SeedTaskArgs): number {
  const tagsValue =
    args.tags === null
      ? null
      : typeof args.tags === 'string'
        ? args.tags
        : JSON.stringify(args.tags ?? [])
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, title, status, priority, created_by,
      created_at, updated_at, tags, metadata,
      github_issue_number, github_repo, github_synced_at,
      project_id, workspace_id
    ) VALUES (?, ?, ?, ?, 'github-sync', unixepoch(), unixepoch(), ?, '{}', ?, ?, unixepoch(), ?, ?)
  `)
  const info = stmt.run(
    args.id ?? null,
    `Task ${args.githubIssueNumber ?? args.id ?? 'x'}`,
    args.status ?? 'backlog',
    args.priority ?? 'p2',
    tagsValue,
    args.githubIssueNumber ?? null,
    args.githubRepo ?? null,
    args.projectId,
    args.workspaceId,
  )
  return Number(info.lastInsertRowid)
}

function getBackfillCompletedAt(
  db: Database.Database,
  workspaceId: number,
): number | string | null {
  const row = db
    .prepare(`SELECT feature_flags FROM workspaces WHERE id = ?`)
    .get(workspaceId) as { feature_flags: string | null } | undefined
  if (!row?.feature_flags) return null
  try {
    const parsed = JSON.parse(row.feature_flags) as Record<string, unknown>
    const v = parsed.area_label_routing_backfill_completed_at
    if (typeof v === 'number' || typeof v === 'string') return v
    return null
  } catch {
    return null
  }
}

function installFailingTrigger(db: Database.Database, name: string, condition: string): void {
  db.prepare(
    `CREATE TRIGGER ${name}
     BEFORE INSERT ON activities
     WHEN ${condition}
     BEGIN SELECT RAISE(ABORT, 'forced-failure'); END;`,
  ).run()
}

// ── T050 — per-task transaction atomicity (FR-021) ──────────────────────
describe('SPEC-006 / T050 — backfillAreaRouting per-task transaction (FR-021)', () => {
  it('(a) success case sets project_id, area_routing_backfilled_at, AND writes activity in one COMMIT', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 500,
      tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)

    const t = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(t.project_id).toBe(qaId)
    expect(t.area_routing_backfilled_at).not.toBeNull()
    expect(typeof t.area_routing_backfilled_at).toBe('number')

    const activity = db
      .prepare(`SELECT type, data FROM activities WHERE entity_id = ? AND type LIKE 'area_routing_%'`)
      .get(taskId) as { type: string; data: string }
    expect(activity.type).toBe('area_routing_resolved')
    const data = JSON.parse(activity.data) as { source: string; reason: string }
    expect(data.source).toBe('backfill')
    expect(data.reason).toBe('single_match')
  })

  it('(b) activity-INSERT failure rolls back: project_id and area_routing_backfilled_at stay unchanged', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 501, tags: ['area:qa'],
    })
    installFailingTrigger(
      db, 'backfill_activity_fail',
      `NEW.type LIKE 'area_routing_%' AND NEW.data LIKE '%"source":"backfill"%'`,
    )
    getDatabaseMock.mockReturnValue(db)

    expect(() => backfillAreaRouting(db, 1)).not.toThrow()

    const t = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(t.project_id).toBe(ownerId)
    expect(t.area_routing_backfilled_at).toBeNull()
    expect(qaId).toBeGreaterThan(0)
  })

  it('(c) NULL tags → no_label → routes to triage with reason=no_label and source=backfill', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const triageId = seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 502, tags: null,
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)

    const t = db.prepare(`SELECT project_id FROM tasks WHERE id = ?`).get(taskId) as { project_id: number }
    expect(t.project_id).toBe(triageId)
    const activity = db
      .prepare(`SELECT type, data FROM activities WHERE entity_id = ? AND type LIKE 'area_routing_%'`)
      .get(taskId) as { type: string; data: string }
    expect(activity.type).toBe('area_routing_unresolved')
    const data = JSON.parse(activity.data) as { reason: string; source: string }
    expect(data.reason).toBe('no_label')
    expect(data.source).toBe('backfill')
  })

  it('(d) malformed-JSON tags → identical to NULL (no abort)', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const triageId = seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 503,
      tags: 'not valid json {{[',
    })
    getDatabaseMock.mockReturnValue(db)

    expect(() => backfillAreaRouting(db, 1)).not.toThrow()

    const t = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(t.project_id).toBe(triageId)
    expect(t.area_routing_backfilled_at).not.toBeNull()
  })

  it('(e) task already in correct project → marker still set, no project_id change', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: qaId,
      githubRepo: 'org/repo', githubIssueNumber: 504, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)

    const t = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(t.project_id).toBe(qaId)
    expect(t.area_routing_backfilled_at).not.toBeNull()
  })
})

// ── T051 — area_routing_backfilled_at monotonicity (FR-021a, FR-056) ────
describe('SPEC-006 / T051 — area_routing_backfilled_at monotonicity', () => {
  it('once set, the marker is never reset to NULL or decreased across full sync cycles', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 600, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)
    const t1 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    expect(t1.area_routing_backfilled_at).not.toBeNull()
    const v1 = t1.area_routing_backfilled_at

    fetchIssueMock.mockResolvedValue(makeIssue({ number: 600, labels: [] }))
    updateIssueMock.mockResolvedValue(undefined)
    await pushTaskToGitHub(
      {
        id: taskId, title: 'x', status: 'in_progress', priority: 'p2',
        github_issue_number: 600, github_repo: 'org/repo',
        workspace_id: 1, project_id: qaId,
      },
      { id: qaId, github_repo: 'org/repo', github_sync_enabled: 1 },
    )
    const t2 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    expect(t2.area_routing_backfilled_at).toBe(v1)

    fetchIssuesMock.mockResolvedValueOnce([
      makeIssue({ number: 600, labels: ['area:dev'], updatedAt: '2026-06-01T10:00:00Z' }),
    ])
    await pullFromGitHub(
      { id: ownerId, github_repo: 'org/repo', github_sync_enabled: 1 }, 1,
    )
    const t3 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    expect(t3.area_routing_backfilled_at).toBe(v1)

    backfillAreaRouting(db, 1)
    const t4 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    expect(t4.area_routing_backfilled_at).toBe(v1)
  })
})

// ── T052 — first-flag-on bootstrap fires once ──────────────────────────
describe('SPEC-006 / T052 — first-flag-on bootstrap (FR-019, FR-022)', () => {
  it('flag transitions OFF→ON: poller invokes backfill exactly once and marker prevents re-invocation', async () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 700, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([])

    const { runSyncTickForTest } = await import('../github-sync-poller')
    await runSyncTickForTest()

    const marker1 = getBackfillCompletedAt(db, 1)
    expect(marker1).not.toBeNull()
    const tAfterFirst = db
      .prepare(`SELECT project_id FROM tasks WHERE github_issue_number = 700`)
      .get() as { project_id: number }
    expect(tAfterFirst.project_id).toBe(qaId)

    const activityCountBefore = (
      db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'area_routing_resolved'`)
        .get() as { c: number }
    ).c
    await runSyncTickForTest()
    const activityCountAfter = (
      db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'area_routing_resolved'`)
        .get() as { c: number }
    ).c
    expect(activityCountAfter).toBe(activityCountBefore)
  })
})

// ── T053 — backfill completion-marker semantics (FR-022) ────────────────
describe('SPEC-006 / T053 — completion marker (FR-022)', () => {
  it('(a) marker set ONLY after pending count = 0', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 800, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)
    expect(getBackfillCompletedAt(db, 1)).not.toBeNull()
  })

  it('(b) per-task failure leaves the marker unset', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 801, tags: ['area:qa'],
    })
    installFailingTrigger(
      db, 'block_backfill_activity_for_marker_test',
      `NEW.type LIKE 'area_routing_%' AND NEW.data LIKE '%"source":"backfill"%'`,
    )
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)
    expect(getBackfillCompletedAt(db, 1)).toBeNull()
  })

  it('(d) if marker UPDATE fails after the loop, the next bootstrap finds zero pending and sets the marker without reprocessing', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 802, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)
    db.prepare(
      `UPDATE workspaces SET feature_flags = json_remove(feature_flags, '$.area_label_routing_backfill_completed_at') WHERE id = ?`,
    ).run(1)

    const t1 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    const v1 = t1.area_routing_backfilled_at

    backfillAreaRouting(db, 1)
    const t2 = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number }
    expect(t2.area_routing_backfilled_at).toBe(v1)
    expect(getBackfillCompletedAt(db, 1)).not.toBeNull()
  })
})

// ── T054 — idempotent resume (FR-023) ───────────────────────────────────
describe('SPEC-006 / T054 — idempotent resume (FR-023)', () => {
  it('resumed scan only touches tasks where area_routing_backfilled_at IS NULL', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    for (let i = 0; i < 25; i++) {
      const tid = seedTask(db, {
        workspaceId: 1, projectId: qaId,
        githubRepo: 'org/repo', githubIssueNumber: 900 + i, tags: ['area:qa'],
      })
      db.prepare(`UPDATE tasks SET area_routing_backfilled_at = ? WHERE id = ?`)
        .run(1000 + i, tid)
    }
    for (let i = 0; i < 25; i++) {
      seedTask(db, {
        workspaceId: 1, projectId: ownerId,
        githubRepo: 'org/repo', githubIssueNumber: 1000 + i, tags: ['area:qa'],
      })
    }
    getDatabaseMock.mockReturnValue(db)

    const before = db
      .prepare(`SELECT COUNT(*) as c FROM tasks WHERE workspace_id = 1 AND area_routing_backfilled_at IS NULL`)
      .get() as { c: number }
    expect(before.c).toBe(25)

    backfillAreaRouting(db, 1)

    const after = db
      .prepare(`SELECT COUNT(*) as c FROM tasks WHERE workspace_id = 1 AND area_routing_backfilled_at IS NULL`)
      .get() as { c: number }
    expect(after.c).toBe(0)
    const preserved = db
      .prepare(`SELECT COUNT(*) as c FROM tasks WHERE workspace_id = 1 AND area_routing_backfilled_at < 2000`)
      .get() as { c: number }
    expect(preserved.c).toBe(25)
  })
})

// ── T055 — single-task-failure isolation (FR-021, FR-027b) ─────────────
describe('SPEC-006 / T055 — single-task-failure isolation', () => {
  it('one failing task does NOT abort the run; subsequent tasks COMMIT', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const failingId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 1100, tags: ['area:qa'],
    })
    const goodId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 1101, tags: ['area:qa'],
    })
    installFailingTrigger(
      db, 'fail_for_specific_task',
      `NEW.type LIKE 'area_routing_%' AND NEW.data LIKE '%"source":"backfill"%' AND NEW.entity_id = ${failingId}`,
    )
    getDatabaseMock.mockReturnValue(db)

    expect(() => backfillAreaRouting(db, 1)).not.toThrow()

    const failing = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(failingId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(failing.area_routing_backfilled_at).toBeNull()

    const good = db
      .prepare(`SELECT project_id, area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(goodId) as { project_id: number; area_routing_backfilled_at: number | null }
    expect(good.project_id).toBe(qaId)
    expect(good.area_routing_backfilled_at).not.toBeNull()
  })
})

// ── T056 — repeat failures keep retrying (no permanent skip) ───────────
describe('SPEC-006 / T056 — repeat failures, no permanent skip (FR-022)', () => {
  it('re-runs continue to retry the same failing task across cycles', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    seedProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 1200, tags: ['area:qa'],
    })
    installFailingTrigger(
      db, 'repeat_fail',
      `NEW.type LIKE 'area_routing_%' AND NEW.data LIKE '%"source":"backfill"%'`,
    )
    getDatabaseMock.mockReturnValue(db)

    backfillAreaRouting(db, 1)
    backfillAreaRouting(db, 1)
    backfillAreaRouting(db, 1)

    const t = db.prepare(`SELECT area_routing_backfilled_at FROM tasks WHERE id = ?`)
      .get(taskId) as { area_routing_backfilled_at: number | null }
    expect(t.area_routing_backfilled_at).toBeNull()
    expect(getBackfillCompletedAt(db, 1)).toBeNull()
  })
})

// ── T057 — UNIQUE-constraint preservation regression (FR-008, FR-050) ──
describe('SPEC-006 / T057 — same-repo-different-projects regression (FR-008/FR-050)', () => {
  it('moves a task between two projects sharing (workspace_id, github_repo) without UNIQUE violation', () => {
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const ownerId = seedProject(db, {
      workspaceId: 1, slug: 'p-owner', githubRepo: 'org/repo',
      isRepoSyncOwner: 1, githubSyncEnabled: 1,
    })
    const qaId = seedProject(db, {
      workspaceId: 1, slug: 'p-qa', githubRepo: 'org/repo',
      areaSlug: 'qa', isRepoSyncOwner: 0,
    })
    seedProject(db, { workspaceId: 1, slug: 'p-triage', isTriageProject: 1 })
    const taskId = seedTask(db, {
      workspaceId: 1, projectId: ownerId,
      githubRepo: 'org/repo', githubIssueNumber: 1300, tags: ['area:qa'],
    })
    getDatabaseMock.mockReturnValue(db)

    expect(() => backfillAreaRouting(db, 1)).not.toThrow()

    const t = db.prepare(`SELECT project_id FROM tasks WHERE id = ?`)
      .get(taskId) as { project_id: number }
    expect(t.project_id).toBe(qaId)

    const activities = db
      .prepare(`SELECT data FROM activities WHERE entity_id = ? AND type = 'area_routing_resolved'`)
      .all(taskId) as Array<{ data: string }>
    expect(activities).toHaveLength(1)
    const data = JSON.parse(activities[0].data) as { reason: string; source: string }
    expect(data.reason).toBe('single_match')
    expect(data.source).toBe('backfill')
  })
})
