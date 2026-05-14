import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
  pullFromGitHub: vi.fn(async () => ({ pulled: 1, pushed: 0 })),
  getSyncPollerStatus: vi.fn(() => ({ running: false })),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/db', () => ({ getDatabase: mocks.getDatabase }))
vi.mock('@/lib/github-sync-engine', () => ({ pullFromGitHub: mocks.pullFromGitHub }))
vi.mock('@/lib/github-sync-poller', () => ({ getSyncPollerStatus: mocks.getSyncPollerStatus }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }))

import { POST } from '../route'
import { runMigrations } from '../../../../../lib/migrations'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pullFromGitHub.mockResolvedValue({ pulled: 1, pushed: 0 })
  mocks.getSyncPollerStatus.mockReturnValue({ running: false })
  mocks.requireRole.mockReturnValue({
    user: { id: 7, username: 'admin', role: 'admin', tenant_id: 1, workspace_id: 2 },
  })
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
  seedWorkspace(db, 4, 'mission-control', 'Mission Control', '{"FEATURE_WORKSPACE_SWITCHER":true,"FEATURE_AREA_LABEL_ROUTING":true}')
}

function seedGithubProject(db: Database.Database): void {
  db.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
  `).run(3, 4, 'QA', 'qa', 'QA', 'org/repo', 1)
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/github/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

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
})
