/**
 * SPEC-007 — GET /api/dispositions/rollup (US4 — T901 / T904)
 *
 * Covers FR-070 / FR-071 / FR-072 / FR-139:
 *   - 503 when FEATURE_DISPOSITION_LOGGING is OFF (parity with /api/dispositions)
 *   - Rollup shape: { days: [{date, total, by_disposition}], total } for the
 *     last 7 calendar days (today + 6 back), zero-filled for empty days
 *   - 'unknown' is its own segment (FR-139)
 *   - 15-second process-local cache keyed on (workspace_id, day_bucket):
 *     two reads inside the TTL hit the cache (no second DB scan); after the
 *     TTL elapses the cache is refreshed from the DB
 *
 * NOTE: Cache invalidation on disposition INSERT (T905 / T211) is intentionally
 * deferred — this scope (US4) only guarantees TTL freshness. The widget's
 * 30-second poll cycle in dashboard.tsx absorbs the worst-case 15s lag.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks (mirror route.test.ts) ─────────────────────────────────────
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
import { GET, __resetRollupCacheForTests } from '../rollup/route'

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
  __resetRollupCacheForTests()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function setWorkspaceFlag(
  db: Database.Database,
  workspaceId: number,
  on: boolean,
): void {
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
  const url = `http://localhost/api/dispositions/rollup${query ? `?${query}` : ''}`
  return new Request(url, { method: 'GET' }) as unknown as NextRequest
}

function seedProductLineWorkspace(
  db: Database.Database,
  slug = 'pl-a',
  name = 'PL A',
): number {
  const info = db.prepare(`
    INSERT INTO workspaces (slug, name, tenant_id) VALUES (?, ?, 1)
  `).run(slug, name)
  return Number(info.lastInsertRowid)
}

function seedTask(
  db: Database.Database,
  workspaceId: number,
  title = 'task',
): number {
  const info = db.prepare(`
    INSERT INTO tasks (workspace_id, title, description, status)
    VALUES (?, ?, '', 'pending')
  `).run(workspaceId, title)
  return Number(info.lastInsertRowid)
}

function seedDisposition(
  db: Database.Database,
  args: {
    workspaceId: number
    taskId: number
    disposition: string
    triagedAt: number
  },
): number {
  const info = db.prepare(`
    INSERT INTO task_dispositions (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(args.taskId, args.disposition, args.triagedAt, args.workspaceId)
  return Number(info.lastInsertRowid)
}

interface RollupResponse {
  days: Array<{
    date: string
    total: number
    by_disposition: Record<string, number>
  }>
  total: number
}

// ── 503 — Flag OFF parity with /api/dispositions ─────────────────────

describe('SPEC-007 / US4 — GET /api/dispositions/rollup (FR-070, FR-071, FR-072, FR-139)', () => {
  it('returns 503 disposition_logging_disabled when flag is OFF', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    // Flag explicitly OFF (default).
    getDatabaseMock.mockReturnValue(db)
    const req = buildRequest(`workspace_id=${String(wsId)}`)
    const res = await GET(req)
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('disposition_logging_disabled')
  })

  it('returns 7 days zero-filled when workspace has no dispositions', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)
    const req = buildRequest(`workspace_id=${String(wsId)}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as RollupResponse
    expect(body.days).toHaveLength(7)
    expect(body.total).toBe(0)
    for (const day of body.days) {
      expect(day.total).toBe(0)
      expect(day.by_disposition).toEqual({})
      // YYYY-MM-DD shape
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('aggregates dispositions per day with by_disposition counts and grand total', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    const t1 = seedTask(db, wsId, 'T1')
    const t2 = seedTask(db, wsId, 'T2')
    const t3 = seedTask(db, wsId, 'T3')
    const t4 = seedTask(db, wsId, 'T4')
    const t5 = seedTask(db, wsId, 'T5')

    const now = Math.floor(Date.now() / 1000)
    // Today: 2x closed, 1x rejected
    seedDisposition(db, { workspaceId: wsId, taskId: t1, disposition: 'closed', triagedAt: now - 60 })
    seedDisposition(db, { workspaceId: wsId, taskId: t2, disposition: 'closed', triagedAt: now - 120 })
    seedDisposition(db, { workspaceId: wsId, taskId: t3, disposition: 'rejected', triagedAt: now - 180 })
    // 1 day ago: 1x merged
    seedDisposition(db, { workspaceId: wsId, taskId: t4, disposition: 'merged', triagedAt: now - (24 * 3600) - 100 })
    // 2 days ago: 1x duplicate
    seedDisposition(db, { workspaceId: wsId, taskId: t5, disposition: 'duplicate', triagedAt: now - (2 * 24 * 3600) - 100 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    const req = buildRequest(`workspace_id=${String(wsId)}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as RollupResponse

    expect(body.days).toHaveLength(7)
    expect(body.total).toBe(5)

    // Sum across all days equals grand total.
    const sumPerDay = body.days.reduce((acc, d) => acc + d.total, 0)
    expect(sumPerDay).toBe(5)

    // Sum across all dispositions equals grand total.
    const counts: Record<string, number> = {}
    for (const day of body.days) {
      for (const [k, v] of Object.entries(day.by_disposition)) {
        counts[k] = (counts[k] ?? 0) + v
      }
    }
    expect(counts.closed).toBe(2)
    expect(counts.rejected).toBe(1)
    expect(counts.merged).toBe(1)
    expect(counts.duplicate).toBe(1)
  })

  it("treats 'unknown' as its own segment (FR-139)", async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    const t1 = seedTask(db, wsId, 'T1')
    const t2 = seedTask(db, wsId, 'T2')

    const now = Math.floor(Date.now() / 1000)
    seedDisposition(db, { workspaceId: wsId, taskId: t1, disposition: 'unknown', triagedAt: now - 60 })
    seedDisposition(db, { workspaceId: wsId, taskId: t2, disposition: 'closed', triagedAt: now - 90 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    const req = buildRequest(`workspace_id=${String(wsId)}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as RollupResponse

    const counts: Record<string, number> = {}
    for (const day of body.days) {
      for (const [k, v] of Object.entries(day.by_disposition)) {
        counts[k] = (counts[k] ?? 0) + v
      }
    }
    expect(counts.unknown).toBe(1)
    expect(counts.closed).toBe(1)
    expect(body.total).toBe(2)
  })

  it('serves second read from process-local cache within 15s TTL', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    const t1 = seedTask(db, wsId, 'T1')
    const now = Math.floor(Date.now() / 1000)
    seedDisposition(db, { workspaceId: wsId, taskId: t1, disposition: 'closed', triagedAt: now - 60 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    // First call — populates cache.
    const res1 = await GET(buildRequest(`workspace_id=${String(wsId)}`))
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as RollupResponse
    expect(body1.total).toBe(1)

    // Mutate the DB to detect whether the second call hits the DB or the cache.
    db.prepare(
      `INSERT INTO task_dispositions (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
       VALUES (?, 'rejected', NULL, NULL, ?, ?)`,
    ).run(t1, now - 30, wsId)

    // Second call — should still see total === 1 because the cache is fresh.
    setupAuthOk()
    setupScopeProductLine(wsId)
    const res2 = await GET(buildRequest(`workspace_id=${String(wsId)}`))
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as RollupResponse
    expect(body2.total).toBe(1)
  })

  it('refreshes from DB after cache is reset (TTL-elapsed simulation)', async () => {
    const db = freshMigratedDb()
    const wsId = seedProductLineWorkspace(db)
    setWorkspaceFlag(db, wsId, true)
    const t1 = seedTask(db, wsId, 'T1')
    const now = Math.floor(Date.now() / 1000)
    seedDisposition(db, { workspaceId: wsId, taskId: t1, disposition: 'closed', triagedAt: now - 60 })

    getDatabaseMock.mockReturnValue(db)
    setupAuthOk()
    setupScopeProductLine(wsId)

    const res1 = await GET(buildRequest(`workspace_id=${String(wsId)}`))
    const body1 = await res1.json() as RollupResponse
    expect(body1.total).toBe(1)

    // Insert another disposition.
    db.prepare(
      `INSERT INTO task_dispositions (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
       VALUES (?, 'rejected', NULL, NULL, ?, ?)`,
    ).run(t1, now - 30, wsId)

    // Simulate 15s TTL elapsing by clearing the cache.
    __resetRollupCacheForTests()

    setupAuthOk()
    setupScopeProductLine(wsId)
    const res2 = await GET(buildRequest(`workspace_id=${String(wsId)}`))
    const body2 = await res2.json() as RollupResponse
    expect(body2.total).toBe(2)
  })
})
