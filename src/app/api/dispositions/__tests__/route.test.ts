/**
 * SPEC-007 — GET /api/dispositions (US5)
 *
 * Covers FR-080 / FR-081 / FR-122 / FR-123:
 *   - 503 when FEATURE_DISPOSITION_LOGGING is OFF (precedence: flag wins over auth/scope/cursor)
 *   - 400 `workspace_id_required` when non-Facility caller omits workspace_id
 *   - 400 `invalid_cursor` for malformed cursor
 *   - 200 happy path: rows returned in (triaged_at DESC, id DESC) order
 *     with cursor pagination and response shape { dispositions, next_cursor, has_more }
 *
 * Mirrors the mocking style used by `src/app/api/projects/[id]/__tests__/route.test.ts`.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ───────────────────────────────────────────
const {
  getDatabaseMock,
  requireRoleMock,
  resolveWorkspaceScopeMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  requireRoleMock: vi.fn(),
  resolveWorkspaceScopeMock: vi.fn(),
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
    workspaceScopePredicate: actual.workspaceScopePredicate,
    workspaceScopeError: actual.workspaceScopeError,
  }
})

import { runMigrations } from '../../../../lib/migrations'
import { GET } from '../route'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  getDatabaseMock.mockReset()
  requireRoleMock.mockReset()
  resolveWorkspaceScopeMock.mockReset()
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

function setWorkspaceFlag(db: Database.Database, workspaceId: number, on: boolean): void {
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_DISPOSITION_LOGGING: on }),
    workspaceId,
  )
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

function setupScopeProductLine(workspaceId: number): void {
  resolveWorkspaceScopeMock.mockResolvedValue({
    kind: 'productLine',
    tenantId: 1,
    workspaceIds: [workspaceId],
    workspaceId,
    explicit: true,
    featureEnabled: true,
  })
}

function buildRequest(query = ''): NextRequest {
  const url = `http://localhost/api/dispositions${query ? `?${query}` : ''}`
  return new Request(url, { method: 'GET' }) as unknown as NextRequest
}

interface SeedDispositionArgs {
  workspaceId: number
  taskId: number
  disposition: string
  reason?: string | null
  triagedByAgentId?: number | null
  triagedAt: number // unix epoch seconds
}

function seedTask(db: Database.Database, workspaceId: number, title = 'task'): number {
  const info = db.prepare(`
    INSERT INTO tasks (workspace_id, title, description, status)
    VALUES (?, ?, '', 'pending')
  `).run(workspaceId, title)
  return Number(info.lastInsertRowid)
}

function seedDisposition(db: Database.Database, args: SeedDispositionArgs): number {
  const info = db.prepare(`
    INSERT INTO task_dispositions (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    args.taskId,
    args.disposition,
    args.reason ?? null,
    args.triagedByAgentId ?? null,
    args.triagedAt,
    args.workspaceId,
  )
  return Number(info.lastInsertRowid)
}

// Seed a non-Facility workspace and return its id.
function seedProductLineWorkspace(db: Database.Database, slug = 'pl-a', name = 'PL A'): number {
  const info = db.prepare(`
    INSERT INTO workspaces (slug, name, tenant_id) VALUES (?, ?, 1)
  `).run(slug, name)
  return Number(info.lastInsertRowid)
}

// ── 503 — Flag OFF wins per FR-122 ───────────────────────────────────

describe('SPEC-007 / US5 — GET /api/dispositions (FR-080, FR-081, FR-122)', () => {
  it('returns 503 disposition_logging_disabled when flag is OFF (precedence over auth/scope/cursor)', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    // Flag explicitly stays OFF (default-off, no workspace_flags set).
    getDatabaseMock.mockReturnValue(db)
    // Pre-auth flag check should NOT depend on requireRole; do not configure auth.
    const req = buildRequest(`workspace_id=${wsId}`)
    const res = await GET(req)
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('disposition_logging_disabled')
  })

  // ── 400 workspace_id_required ──────────────────────────────────────

  it('returns 400 workspace_id_required when non-Facility caller omits workspace_id', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    // Without workspace_id query, flag check falls back to caller's auth workspace.
    // But we want to assert: even with flag ON globally, missing workspace_id for a
    // non-Facility caller is a 400. Set the auth workspace's flag ON so 503 doesn't fire.
    setWorkspaceFlag(db, 1, true)
    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)
    const req = buildRequest('') // no workspace_id
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('workspace_id_required')
  })

  // ── 400 invalid_cursor ─────────────────────────────────────────────

  it('returns 400 invalid_cursor when cursor parameter is malformed', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)
    const req = buildRequest(`workspace_id=${wsId}&cursor=not-a-real-cursor!@#`)
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('invalid_cursor')
  })

  // ── 200 happy path: ordering + cursor pagination ───────────────────

  it('returns rows in (triaged_at DESC, id DESC) order with cursor pagination', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)

    const taskA = seedTask(db, wsId, 'A')
    const taskB = seedTask(db, wsId, 'B')
    const taskC = seedTask(db, wsId, 'C')

    // 3 dispositions across 2 timestamps. Newest-first expected order: d3, d2, d1.
    const d1 = seedDisposition(db, { workspaceId: wsId, taskId: taskA, disposition: 'closed', triagedAt: 1_700_000_000 })
    const d2 = seedDisposition(db, { workspaceId: wsId, taskId: taskB, disposition: 'rejected', triagedAt: 1_700_000_100 })
    const d3 = seedDisposition(db, { workspaceId: wsId, taskId: taskC, disposition: 'closed', triagedAt: 1_700_000_100 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    // Page 1: limit=2 → expect [d3, d2] with has_more=true and a next_cursor.
    const reqPage1 = buildRequest(`workspace_id=${wsId}&limit=2`)
    const resPage1 = await GET(reqPage1)
    expect(resPage1.status).toBe(200)
    const page1 = await resPage1.json() as {
      dispositions: Array<{ id: number; task_id: number; disposition: string; triaged_at: number }>
      next_cursor: string | null
      has_more: boolean
    }
    expect(page1.dispositions).toHaveLength(2)
    expect(page1.dispositions[0]?.id).toBe(d3)
    expect(page1.dispositions[1]?.id).toBe(d2)
    expect(page1.has_more).toBe(true)
    expect(typeof page1.next_cursor).toBe('string')
    expect(page1.next_cursor).not.toBeNull()

    // Page 2: pass next_cursor → expect [d1] with has_more=false.
    const reqPage2 = buildRequest(`workspace_id=${wsId}&limit=2&cursor=${encodeURIComponent(page1.next_cursor!)}`)
    const resPage2 = await GET(reqPage2)
    expect(resPage2.status).toBe(200)
    const page2 = await resPage2.json() as {
      dispositions: Array<{ id: number }>
      next_cursor: string | null
      has_more: boolean
    }
    expect(page2.dispositions).toHaveLength(1)
    expect(page2.dispositions[0]?.id).toBe(d1)
    expect(page2.has_more).toBe(false)
    expect(page2.next_cursor).toBeNull()
  })

  // ── 200 happy path: filter by disposition multi-select + since ─────

  it('filters by disposition multi-select and since (ISO 8601)', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)

    const taskA = seedTask(db, wsId, 'A')
    const taskB = seedTask(db, wsId, 'B')
    const taskC = seedTask(db, wsId, 'C')

    // Below cut-off — should be excluded by since.
    seedDisposition(db, { workspaceId: wsId, taskId: taskA, disposition: 'closed', triagedAt: 1_700_000_000 })
    // Above cut-off — but disposition not in {closed, rejected}; excluded.
    seedDisposition(db, { workspaceId: wsId, taskId: taskB, disposition: 'duplicate', triagedAt: 1_700_001_000 })
    // Above cut-off and matching disposition — included.
    const dHit = seedDisposition(db, { workspaceId: wsId, taskId: taskC, disposition: 'rejected', triagedAt: 1_700_001_500 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    const sinceIso = new Date(1_700_000_500 * 1000).toISOString()
    const req = buildRequest(`workspace_id=${wsId}&disposition=closed,rejected&since=${encodeURIComponent(sinceIso)}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { dispositions: Array<{ id: number }>; has_more: boolean }
    expect(body.dispositions.map((d) => d.id)).toEqual([dHit])
    expect(body.has_more).toBe(false)
  })
})
