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
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    mocks.getDatabase.mockReturnValue(db)

    const { GET } = await import('./route')
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0]).toMatchObject({
      family: 'paddock',
      workspace_id: 1,
      mode: 'import_apply',
      mutation_status: 'applied',
    })
    expect(body.last_known_good_available).toBe(true)
    expect(body.last_successful_apply).toMatchObject({
      snapshot_id: 1,
      canonical_object_hash: expect.stringMatching(/^workflow-contract-hash-v1:sha256:/),
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

  it('rejects malformed workspace ids instead of silently falling back', async () => {
    mocks.getDatabase.mockReturnValue(makeWorkflowDb())
    const { GET } = await import('./route')
    const response = await GET(request('/api/workflow-contracts/diagnostics?workspace_id=abc'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/workspace_id/i)
  })
})
