/**
 * SPEC-006 / Phase 9 — PUT /api/projects/[id] post-commit initializeLabels trigger
 *
 * T073 — Post-PUT trigger gating (FR-038, FR-060). Asserts that AFTER the
 * single transaction commits, `initializeLabels(repo, workspaceId, { trigger:
 * 'area_slug_change' })` is invoked exactly once IFF the committed transaction
 * CHANGED the value of `projects.area_slug` (NULL→value, value→NULL, A→B) OR
 * `projects.is_triage_project` (0→1 or 1→0).
 *
 * Required matrix:
 *   - area_slug NULL→value: trigger
 *   - area_slug value→NULL: trigger
 *   - area_slug A→B: trigger
 *   - is_triage_project 0→1 or 1→0: trigger
 *   - is_repo_sync_owner ALONE (incl. transfer_owner): NO trigger
 *   - idempotent slug write (parsed value == stored): NO trigger
 *   - combined area_slug + is_repo_sync_owner: trigger exactly once
 *
 * Per the broader user-story requirements, when the workspace has multiple
 * `is_repo_sync_owner=1` projects with distinct `github_repo`, the trigger
 * fires once per (deduplicated) owned repo in the workspace.
 *
 * Maps to FR-038, FR-060.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ───────────────────────────────────────────
const {
  getDatabaseMock,
  requireRoleMock,
  mutationLimiterMock,
  resolveWorkspaceScopeMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerInfoMock,
  initializeLabelsMock,
  pullFromGitHubMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  requireRoleMock: vi.fn(),
  mutationLimiterMock: vi.fn(() => null),
  resolveWorkspaceScopeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  initializeLabelsMock: vi.fn(async () => undefined),
  pullFromGitHubMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock }
})
vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))
vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: mutationLimiterMock,
}))
vi.mock('@/lib/logger', () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: loggerInfoMock,
  },
}))
vi.mock('@/lib/workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspaces')>(
    '@/lib/workspaces',
  )
  return {
    ...actual,
    resolveWorkspaceScopeFromRequest: resolveWorkspaceScopeMock,
  }
})
vi.mock('@/lib/github-sync-engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github-sync-engine')>(
    '@/lib/github-sync-engine',
  )
  return {
    ...actual,
    initializeLabels: initializeLabelsMock,
    pullFromGitHub: pullFromGitHubMock,
  }
})

import { runMigrations } from '../../../../../lib/migrations'
import { PUT } from '../route'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  getDatabaseMock.mockReset()
  requireRoleMock.mockReset()
  mutationLimiterMock.mockClear()
  mutationLimiterMock.mockReturnValue(null)
  resolveWorkspaceScopeMock.mockReset()
  loggerErrorMock.mockClear()
  loggerWarnMock.mockClear()
  loggerInfoMock.mockClear()
  initializeLabelsMock.mockReset()
  initializeLabelsMock.mockResolvedValue(undefined)
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
  githubRepo?: string | null
  isRepoSyncOwner?: number
  isTriageProject?: number
  areaSlug?: string | null
}

function seedProject(db: Database.Database, args: SeedProjectArgs): number {
  const stmt = db.prepare(`
    INSERT INTO projects (
      workspace_id, name, slug, ticket_prefix,
      area_slug, github_repo, is_repo_sync_owner, is_triage_project, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `)
  const info = stmt.run(
    args.workspaceId,
    args.slug,
    args.slug,
    args.slug.slice(0, 4).toUpperCase(),
    args.areaSlug ?? null,
    args.githubRepo ?? null,
    args.isRepoSyncOwner ?? 0,
    args.isTriageProject ?? 0,
  )
  return Number(info.lastInsertRowid)
}

function setWorkspaceFlag(db: Database.Database, workspaceId: number, on: boolean): void {
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_AREA_LABEL_ROUTING: on }),
    workspaceId,
  )
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/projects/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function buildParams(id: number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) }
}

function setupAuthOk(): void {
  requireRoleMock.mockReturnValue({
    user: {
      id: 7,
      username: 'op',
      role: 'operator',
      tenant_id: 1,
      workspace_id: 1,
    },
  })
}

function setupScopeOk(workspaceId: number): void {
  resolveWorkspaceScopeMock.mockResolvedValue({
    kind: 'productLine',
    tenantId: 1,
    workspaceIds: [workspaceId],
    workspaceId,
    explicit: true,
    featureEnabled: true,
  })
}

// ── Helpers ──────────────────────────────────────────

async function runPut(body: Record<string, unknown>, projectId: number) {
  const req = buildRequest(body)
  return PUT(req, buildParams(projectId))
}

// ── T073 — TRIGGER cases ─────────────────────────────

describe('SPEC-006 / T073 — initializeLabels TRIGGERS on area_slug or is_triage_project change (FR-060)', () => {
  it('area_slug NULL→value triggers', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, areaSlug: null,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ area_slug: 'qa' }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalled()
    const calls = initializeLabelsMock.mock.calls as unknown as Array<
      [string, number, { trigger?: string } | undefined]
    >
    // exactly one call per owned repo (here: just org/repo)
    expect(calls).toHaveLength(1)
    const call = calls[0]
    expect(call?.[0]).toBe('org/repo')
    expect(call?.[1]).toBe(1)
    expect(call?.[2]?.trigger).toBe('area_slug_change')
  })

  it('area_slug value→NULL triggers', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, areaSlug: 'qa',
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ area_slug: null }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
  })

  it('area_slug A→B triggers', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, areaSlug: 'qa',
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ area_slug: 'dev' }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
  })

  it('is_triage_project 0→1 triggers', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ is_triage_project: true }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
  })

  it('is_triage_project 1→0 triggers', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, isTriageProject: 1,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ is_triage_project: false }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
  })

  it('combined area_slug + is_repo_sync_owner change triggers exactly once', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const target = seedProject(db, {
      workspaceId: 1, slug: 'target', githubRepo: 'org/repo', isRepoSyncOwner: 0, areaSlug: null,
    })
    seedProject(db, {
      workspaceId: 1, slug: 'prev', githubRepo: 'org/repo', isRepoSyncOwner: 1, areaSlug: null,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut(
      { area_slug: 'qa', is_repo_sync_owner: true, transfer_owner: true },
      target,
    )
    expect(res.status).toBe(200)
    // Exactly one initializeLabels call (deduplicated by owned-repo set).
    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
  })
})

// ── T073 — NO-TRIGGER cases ──────────────────────────

describe('SPEC-006 / T073 — initializeLabels does NOT trigger on owner-only or idempotent writes (FR-060)', () => {
  it('owner-only change (transfer_owner) does NOT trigger', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const target = seedProject(db, {
      workspaceId: 1, slug: 'target', githubRepo: 'org/repo', isRepoSyncOwner: 0,
    })
    seedProject(db, {
      workspaceId: 1, slug: 'prev', githubRepo: 'org/repo', isRepoSyncOwner: 1,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut(
      { is_repo_sync_owner: true, transfer_owner: true },
      target,
    )
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).not.toHaveBeenCalled()
  })

  it('idempotent area_slug write (parsed value equals stored) does NOT trigger', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, areaSlug: 'qa',
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ area_slug: 'qa' }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).not.toHaveBeenCalled()
  })

  it('idempotent is_triage_project write does NOT trigger', async () => {
    setupAuthOk(); setupScopeOk(1)
    const db = freshMigratedDb()
    setWorkspaceFlag(db, 1, true)
    const id = seedProject(db, {
      workspaceId: 1, slug: 'p1', githubRepo: 'org/repo', isRepoSyncOwner: 1, isTriageProject: 1,
    })
    getDatabaseMock.mockReturnValue(db)
    const res = await runPut({ is_triage_project: true }, id)
    expect(res.status).toBe(200)
    expect(initializeLabelsMock).not.toHaveBeenCalled()
  })
})
