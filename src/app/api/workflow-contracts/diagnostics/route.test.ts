import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { makeContract, makeWorkflowDb } from '@/lib/__tests__/workflow-contracts/test-helpers'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/db', () => ({ getDatabase: mocks.getDatabase }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

function request(path = '/api/workflow-contracts/diagnostics?workspace_id=1') {
  return new NextRequest(`http://localhost${path}`)
}

describe('/api/workflow-contracts/diagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.requireRole.mockReturnValue({ user: { id: 1, role: 'viewer', username: 'viewer' } })
  })

  it('returns read-only workflow contract diagnostics for a workspace', async () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract(), { mode: 'dry-run', sourcePath: 'contract.yaml' })
    mocks.getDatabase.mockReturnValue(db)

    const { GET } = await import('./route')
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0]).toMatchObject({
      family: 'mission-control',
      workspace_id: 1,
      mode: 'import_dry_run',
      mutation_status: 'dry_run',
    })
    expect(JSON.stringify(body)).not.toMatch(/apply_import|dispatch|governance_override/)
    db.close()
  })

  it('requires viewer access', async () => {
    mocks.requireRole.mockReturnValue({ error: 'Unauthorized', status: 401 })
    const { GET } = await import('./route')
    const response = await GET(request())
    expect(response.status).toBe(401)
  })
})
