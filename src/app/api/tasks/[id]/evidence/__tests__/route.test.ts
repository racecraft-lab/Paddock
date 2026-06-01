import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeTaskEvidenceDb,
  createTaskEvidenceDb,
  seedEligiblePilotEvidence,
  seedLocalOnlyTask,
  snapshotEvidenceCounts,
} from '@/lib/__tests__/task-evidence.fixtures'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
  resolveWorkspaceScopeFromRequest: vi.fn(),
  workspaceScopePredicate: vi.fn(),
  workspaceScopeError: vi.fn(),
  resolveFlag: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/db', () => ({ getDatabase: mocks.getDatabase }))
vi.mock('@/lib/feature-flags', () => ({ resolveFlag: mocks.resolveFlag }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }))
vi.mock('@/lib/workspaces', () => ({
  resolveWorkspaceScopeFromRequest: mocks.resolveWorkspaceScopeFromRequest,
  workspaceScopePredicate: mocks.workspaceScopePredicate,
  workspaceScopeError: mocks.workspaceScopeError,
}))

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    closeTaskEvidenceDb(openDbs.pop() as Database.Database)
  }
  vi.clearAllMocks()
})

function makeDb(): Database.Database {
  const db = createTaskEvidenceDb()
  openDbs.push(db)
  mocks.getDatabase.mockReturnValue(db)
  return db
}

function allowWorkspace(workspaceId = 1): void {
  mocks.requireRole.mockReturnValue({ user: { id: 1, username: 'viewer', role: 'viewer', workspace_id: workspaceId } })
  mocks.resolveWorkspaceScopeFromRequest.mockResolvedValue({ kind: 'workspace', workspaceId, workspaceIds: [workspaceId] })
  mocks.workspaceScopePredicate.mockReturnValue({ sql: 't.workspace_id = ?', params: [workspaceId] })
  mocks.workspaceScopeError.mockReturnValue(null)
  mocks.resolveFlag.mockReturnValue(true)
}

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

describe('GET /api/tasks/[id]/evidence', () => {
  it('returns the v1 task evidence envelope for an authorized task without writes', async () => {
    const db = makeDb()
    const taskId = seedEligiblePilotEvidence(db)
    allowWorkspace()
    const before = snapshotEvidenceCounts(db)
    const route = await import('../route')

    const response = await route.GET(request(`/api/tasks/${String(taskId)}/evidence`), {
      params: Promise.resolve({ id: String(taskId) }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.schema_version).toBe('task_evidence.v1')
    expect(payload.identity.issue.url).toBe('https://github.com/racecraft-lab/Paddock/issues/50')
    expect(payload.pilot_eligibility.state).toBe('eligible')
    expect(snapshotEvidenceCounts(db)).toEqual(before)
  })

  it('returns 200 domain states for readable local-only tasks', async () => {
    const db = makeDb()
    const taskId = seedLocalOnlyTask(db)
    allowWorkspace()
    const route = await import('../route')

    const response = await route.GET(request(`/api/tasks/${String(taskId)}/evidence`), {
      params: Promise.resolve({ id: String(taskId) }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.pilot_eligibility.state).toBe('not_eligible')
    expect(payload.identity.state).toBe('missing')
  })

  it('maps auth and workspace boundary failures to the exact error codes', async () => {
    makeDb()
    const route = await import('../route')

    mocks.requireRole.mockReturnValueOnce({ error: 'Authentication required', status: 401 })
    let response = await route.GET(request('/api/tasks/500/evidence'), { params: Promise.resolve({ id: '500' }) })
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' })

    mocks.requireRole.mockReturnValue({ user: { id: 1, username: 'viewer', role: 'viewer' } })
    mocks.resolveWorkspaceScopeFromRequest.mockRejectedValueOnce(new Error('bad workspace'))
    mocks.workspaceScopeError.mockReturnValueOnce({ status: 400, error: 'invalid_workspace_scope' })
    response = await route.GET(request('/api/tasks/500/evidence?workspace_id=bad'), {
      params: Promise.resolve({ id: '500' }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_workspace_scope' })

    mocks.resolveWorkspaceScopeFromRequest.mockRejectedValueOnce(new Error('forbidden workspace'))
    mocks.workspaceScopeError.mockReturnValueOnce({ status: 403, error: 'forbidden_workspace_scope' })
    response = await route.GET(request('/api/tasks/500/evidence?workspace_id=2'), {
      params: Promise.resolve({ id: '500' }),
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'forbidden_workspace_scope' })
  })

  it('masks missing and cross-workspace tasks as task_not_found', async () => {
    const db = makeDb()
    const taskId = seedEligiblePilotEvidence(db)
    allowWorkspace(2)
    const route = await import('../route')

    const crossWorkspace = await route.GET(request(`/api/tasks/${String(taskId)}/evidence?workspace_id=2`), {
      params: Promise.resolve({ id: String(taskId) }),
    })
    expect(crossWorkspace.status).toBe(404)
    await expect(crossWorkspace.json()).resolves.toEqual({ error: 'task_not_found' })

    allowWorkspace(1)
    const missing = await route.GET(request('/api/tasks/9999/evidence'), {
      params: Promise.resolve({ id: '9999' }),
    })
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toEqual({ error: 'task_not_found' })
  })
})
