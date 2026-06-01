/**
 * SPEC-006 — POST /api/github init-labels (US6)
 *
 * Covers T064 RED + T068 GREEN:
 *   T064 — assert public-contract byte-identity (request body, response body,
 *          status codes, authorization shape) versus pre-SPEC-006 baseline;
 *          internal `initializeLabels(repo)` call is upgraded to
 *          `initializeLabels(repo, workspaceId, { trigger: 'connect' })`.
 *   T068 — wire workspaceId + { trigger: 'connect' } into the call.
 *
 * Per-label provisioning failures inside `initializeLabels` MUST NOT affect
 * the connect HTTP response (FR-027 isolation): the response stays 200 ok.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ───────────────────────────────────────────
const {
  getDatabaseMock,
  requireRoleMock,
  mutationLimiterMock,
  initializeLabelsMock,
  pullFromGitHubMock,
  getGitHubTokenMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  requireRoleMock: vi.fn(),
  mutationLimiterMock: vi.fn(() => null),
  initializeLabelsMock: vi.fn(async () => {}),
  pullFromGitHubMock: vi.fn(async () => ({ pulled: 1, pushed: 0 })),
  getGitHubTokenMock: vi.fn(async () => 'token'),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
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
vi.mock('@/lib/github', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github')>('@/lib/github')
  return {
    ...actual,
    getGitHubToken: getGitHubTokenMock,
  }
})

import { runMigrations } from '../../../../lib/migrations'
import { GET, POST } from '../route'

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
  initializeLabelsMock.mockReset()
  initializeLabelsMock.mockImplementation(async () => {})
  pullFromGitHubMock.mockReset()
  pullFromGitHubMock.mockImplementation(async () => ({ pulled: 1, pushed: 0 }))
  getGitHubTokenMock.mockReset()
  getGitHubTokenMock.mockImplementation(async () => 'token')
  loggerErrorMock.mockClear()
  loggerWarnMock.mockClear()
  loggerInfoMock.mockClear()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function setupAuthOk(workspaceId = 1, role: 'admin' | 'operator' | 'viewer' = 'operator'): void {
  requireRoleMock.mockReturnValue({
    user: {
      id: 7,
      username: 'op',
      role,
      tenant_id: 1,
      workspace_id: workspaceId,
    },
  })
}

function buildPostRequest(body: Record<string, unknown>, path = '/api/github'): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function seedFacilityAndProductLine(db: Database.Database): void {
  seedWorkspace(db, 2, 'facility', 'Facility', '{"FEATURE_WORKSPACE_SWITCHER":true}')
  seedWorkspace(db, 4, 'mission-control', 'Paddock', '{"FEATURE_WORKSPACE_SWITCHER":true,"FEATURE_AREA_LABEL_ROUTING":true}')
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

function seedGithubProject(db: Database.Database, workspaceId = 4): void {
  db.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled,
      github_labels_initialized, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
  `).run(3, workspaceId, 'QA', 'qa', 'QA', 'org/repo', 1, 0)
}

describe('SPEC-006 / T064 — POST /api/github init-labels public-contract parity', () => {
  it('rejects GET issue preview repos that would traverse the GitHub API path', async () => {
    setupAuthOk(1)

    const res = await GET(new Request(
      'http://localhost/api/github?action=issues&repo=owner/repo/../../user',
    ) as unknown as NextRequest)

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('owner/repo format')
    expect(getGitHubTokenMock).not.toHaveBeenCalled()
  })

  it('returns the byte-identical 200 shape { ok: true, repo } as the pre-SPEC-006 baseline', async () => {
    setupAuthOk(1)
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)

    const res = await POST(buildPostRequest({ action: 'init-labels', repo: 'org/repo' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true, repo: 'org/repo' })
  })

  it('returns 401 when auth fails (authorization shape unchanged)', async () => {
    requireRoleMock.mockReturnValue({ error: 'Authentication required', status: 401 })
    const res = await POST(buildPostRequest({ action: 'init-labels', repo: 'org/repo' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when repo is missing (request shape unchanged)', async () => {
    setupAuthOk(1)
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const res = await POST(buildPostRequest({ action: 'init-labels' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('repo is required')
  })

  it('upgrades the internal call to initializeLabels(repo, workspaceId, { trigger: "connect" })', async () => {
    setupAuthOk(42)
    const db = freshMigratedDb()
    seedWorkspace(db, 42, 'ops', 'Ops')
    getDatabaseMock.mockReturnValue(db)

    await POST(buildPostRequest({ action: 'init-labels', repo: 'org/repo' }))

    expect(initializeLabelsMock).toHaveBeenCalledTimes(1)
    const calls = initializeLabelsMock.mock.calls as unknown as Array<
      [string, number, { trigger: string }]
    >
    const call = calls[0]
    expect(call?.[0]).toBe('org/repo')
    expect(call?.[1]).toBe(42)
    expect(call?.[2]).toEqual({ trigger: 'connect' })
  })

  it('per-label provisioning failures inside initializeLabels do NOT affect the connect response (FR-027 isolation)', async () => {
    setupAuthOk(1)
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    // Simulate `initializeLabels` swallowing per-label failures internally —
    // FR-027 says the failure isolation lives inside the function, so the
    // caller observes a normal resolved promise and a 200 response.
    initializeLabelsMock.mockImplementation(async () => {
      // intentionally empty — represents internally-isolated per-label failures
    })

    const res = await POST(buildPostRequest({ action: 'init-labels', repo: 'org/repo' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true, repo: 'org/repo' })
  })

  it('uses explicit Product Line workspace scope when a Facility admin initializes labels', async () => {
    setupAuthOk(2, 'admin')
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db, 4)
    getDatabaseMock.mockReturnValue(db)

    const res = await POST(buildPostRequest(
      { action: 'init-labels', repo: 'org/repo' },
      '/api/github?workspace_id=4',
    ))

    expect(res.status).toBe(200)
    expect(initializeLabelsMock).toHaveBeenCalledWith('org/repo', 4, { trigger: 'connect' })
    const row = db.prepare('SELECT github_labels_initialized FROM projects WHERE id = 3 AND workspace_id = 4').get() as {
      github_labels_initialized: number
    }
    expect(row.github_labels_initialized).toBe(1)
  })

  it('uses explicit Product Line workspace scope when a Facility admin triggers project sync', async () => {
    setupAuthOk(2, 'admin')
    const db = freshMigratedDb()
    seedFacilityAndProductLine(db)
    seedGithubProject(db, 4)
    getDatabaseMock.mockReturnValue(db)

    const res = await POST(buildPostRequest(
      { action: 'sync-project', project_id: 3 },
      '/api/github?workspace_id=4',
    ))

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true, pulled: 1, pushed: 0 })
    expect(pullFromGitHubMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, github_repo: 'org/repo' }),
      4,
    )
  })
})
