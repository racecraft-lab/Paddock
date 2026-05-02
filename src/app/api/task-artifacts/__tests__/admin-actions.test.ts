/**
 * SPEC-007 US10 — POST /api/task-artifacts/[id] admin actions.
 *
 * Verifies:
 *   - 403 forbidden_admin_required when caller is not admin (FR-124).
 *   - 401 unauthenticated when no session.
 *   - 503 artifact_store_disabled when FEATURE_TASK_ARTIFACTS is OFF (FR-122).
 *   - 200 happy path for { action: 'quarantine' }.
 *   - 409 already_quarantined / not_quarantined transitions.
 *   - 404 artifact_not_found.
 *   - 400 bad_request when action is unknown.
 */

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

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
  const actual = await vi.importActual<typeof import('@/lib/workspaces')>('@/lib/workspaces')
  return {
    ...actual,
    resolveWorkspaceScopeFromRequest: resolveWorkspaceScopeMock,
    workspaceScopePredicate: actual.workspaceScopePredicate,
    workspaceScopeError: actual.workspaceScopeError,
  }
})

import { runMigrations } from '../../../../lib/migrations'
import { POST } from '../[id]/route'

const openDbs: Database.Database[] = []
const PRODUCT_LINE_WORKSPACE_ID = 2
const PRODUCER_TASK_ID = 100

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
  // Seed a product-line workspace with the flag ON.
  const tenantRow = db.prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get() as
    | { id: number }
    | undefined
  const tenantId = tenantRow?.id ?? 1
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    PRODUCT_LINE_WORKSPACE_ID,
    'pl-1',
    'Product Line One',
    tenantId,
    JSON.stringify({ FEATURE_TASK_ARTIFACTS: true }),
  )
  // Force flag ON regardless of migration seed.
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_TASK_ARTIFACTS: true }),
    PRODUCT_LINE_WORKSPACE_ID,
  )
  // Seed a task.
  db.prepare(
    `INSERT OR IGNORE INTO tasks (id, workspace_id, title, description, status) VALUES (?, ?, ?, '', 'queued')`,
  ).run(PRODUCER_TASK_ID, PRODUCT_LINE_WORKSPACE_ID, 'producer task')
  return db
}

function seedArtifact(
  db: Database.Database,
  redactionStatus: 'pending' | 'clean' | 'quarantined' = 'clean',
): number {
  const info = db
    .prepare(
      `INSERT INTO task_artifacts (
         task_id, workspace_id, artifact_type, storage_kind, content_json,
         mime_type, byte_size, sha256, redaction_status, security_scan_status
       ) VALUES (?, ?, 'triage_outcome', 'inline_json', '{"k":"v"}', 'application/json', 7, 'abc', ?, 'pending')`,
    )
    .run(PRODUCER_TASK_ID, PRODUCT_LINE_WORKSPACE_ID, redactionStatus)
  return Number(info.lastInsertRowid)
}

function setupAdminAuth(): void {
  requireRoleMock.mockReturnValue({
    user: {
      id: 7,
      username: 'admin',
      role: 'admin',
      tenant_id: 1,
      workspace_id: PRODUCT_LINE_WORKSPACE_ID,
    },
  })
}

function setupNonAdminAuth(): void {
  requireRoleMock.mockReturnValue({ error: 'Requires admin role or higher', status: 403 })
}

function setupUnauthenticated(): void {
  requireRoleMock.mockReturnValue({ error: 'Authentication required', status: 401 })
}

function setupScope(): void {
  resolveWorkspaceScopeMock.mockResolvedValue({
    kind: 'productLine',
    tenantId: 1,
    workspaceIds: [PRODUCT_LINE_WORKSPACE_ID],
    workspaceId: PRODUCT_LINE_WORKSPACE_ID,
    explicit: true,
    featureEnabled: true,
  })
}

function buildRequest(id: number, body: unknown): NextRequest {
  const url = `http://localhost/api/task-artifacts/${String(id)}`
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function ctx(id: number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) }
}

describe('POST /api/task-artifacts/[id] admin actions', () => {
  it('returns 403 forbidden_admin_required for a non-admin caller', async () => {
    setupNonAdminAuth()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db)
    const res = await POST(buildRequest(id, { action: 'quarantine' }), ctx(id))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('forbidden_admin_required')
    // No state mutation — row still 'clean'.
    const row = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id) as {
      redaction_status: string
    }
    expect(row.redaction_status).toBe('clean')
  })

  it('returns 401 unauthenticated when no session is present', async () => {
    setupUnauthenticated()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db)
    const res = await POST(buildRequest(id, { action: 'quarantine' }), ctx(id))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthenticated')
  })

  it('returns 503 artifact_store_disabled when FEATURE_TASK_ARTIFACTS is OFF', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(
      JSON.stringify({ FEATURE_TASK_ARTIFACTS: false }),
      PRODUCT_LINE_WORKSPACE_ID,
    )
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db)
    const res = await POST(buildRequest(id, { action: 'quarantine' }), ctx(id))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('artifact_store_disabled')
  })

  it('returns 200 + ok:true on quarantine happy path', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db, 'clean')
    const res = await POST(buildRequest(id, { action: 'quarantine', reason: 'leak' }), ctx(id))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; redaction_status: string }
    expect(body.ok).toBe(true)
    expect(body.redaction_status).toBe('quarantined')
    // Activity row exists.
    const act = db
      .prepare(
        "SELECT COUNT(*) AS c FROM activities WHERE type = 'artifact_quarantined' AND entity_id = ?",
      )
      .get(id) as { c: number }
    expect(act.c).toBe(1)
  })

  it('returns 409 already_quarantined for re-quarantine', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db, 'quarantined')
    const res = await POST(buildRequest(id, { action: 'quarantine' }), ctx(id))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('already_quarantined')
  })

  it('returns 409 not_quarantined when un-quarantining a non-quarantined row', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db, 'clean')
    const res = await POST(buildRequest(id, { action: 'unquarantine' }), ctx(id))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('not_quarantined')
  })

  it('returns 404 artifact_not_found for an unknown id', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const res = await POST(buildRequest(99999, { action: 'quarantine' }), ctx(99999))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('artifact_not_found')
  })

  it('returns 400 bad_request for an unknown action', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db)
    const res = await POST(buildRequest(id, { action: 'fly_to_moon' }), ctx(id))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('bad_request')
  })

  it('archive action sets redaction_status=superseded and writes artifact_archived', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db, 'clean')
    const res = await POST(buildRequest(id, { action: 'archive' }), ctx(id))
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id) as {
      redaction_status: string
    }
    expect(row.redaction_status).toBe('superseded')
    const act = db
      .prepare(
        "SELECT COUNT(*) AS c FROM activities WHERE type = 'artifact_archived' AND entity_id = ?",
      )
      .get(id) as { c: number }
    expect(act.c).toBe(1)
  })

  it('hash_verify on an inline row returns outcome=skipped_inline', async () => {
    setupAdminAuth()
    setupScope()
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)
    const id = seedArtifact(db, 'clean')
    const res = await POST(buildRequest(id, { action: 'hash_verify' }), ctx(id))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { outcome: string }
    expect(body.outcome).toBe('skipped_inline')
  })
})
