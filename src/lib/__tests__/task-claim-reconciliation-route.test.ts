import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'
import { openTaskClaimDb, seedClaimableTask } from './task-claim-reconciliation-fixtures'

const routePath = '@/app/api/tasks/[id]/claim-reconciliation/route'
const openDbs: ReturnType<typeof openTaskClaimDb>[] = []

interface OpenApiOperation {
  responses: Record<string, {
    content?: Record<string, {
      schema: {
        properties?: Record<string, unknown>
      }
    }>
  }>
}

interface OpenApiPathItem {
  get?: OpenApiOperation
}

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  vi.doUnmock('@/lib/auth')
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/logger')
  vi.doUnmock('@/lib/workspaces')
  vi.resetModules()
})

function loadOpenApiDoc(): {
  paths: Partial<Record<string, OpenApiPathItem>>
} {
  return JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as {
    paths: Partial<Record<string, OpenApiPathItem>>
  }
}

async function importRoute(db: ReturnType<typeof openTaskClaimDb>) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/auth', () => ({
    requireRole: vi.fn((request: Request, minRole: 'viewer' | 'operator' | 'admin') => {
      expect(minRole).toBe('viewer')
      const auth = request.headers.get('x-test-auth')
      if (auth === 'none') return { error: 'unauthenticated', status: 401 }
      return { user: { id: 1, username: auth ?? 'viewer', role: auth ?? 'viewer', workspace_id: 1 } }
    }),
  }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn((_db, request: Request) => {
      const url = new URL(request.url)
      const workspaceIds = url.searchParams.getAll('workspace_id')
      if (workspaceIds.length > 1 || workspaceIds[0] === 'bad') {
        const error = new Error('invalid workspace scope')
        ;(error as Error & { status?: number }).status = 400
        throw error
      }
      const workspaceId = workspaceIds[0] ? Number(workspaceIds[0]) : 1
      if (workspaceId !== 1) {
        const error = new Error('forbidden workspace scope')
        ;(error as Error & { status?: number }).status = 403
        throw error
      }
      return { workspaceId }
    }),
    workspaceScopePredicate: vi.fn(() => ({ sql: 't.workspace_id = ?', params: [1] })),
    workspaceScopeError: vi.fn((error: Error & { status?: number }) => error.status ? { status: error.status } : null),
  }))
  vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
  return import(routePath) as Promise<{ GET: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response> }>
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init)
}

function readSideEffectCounts(db: ReturnType<typeof openTaskClaimDb>) {
  const tables = [
    'tasks',
    'task_stage_claims',
    'task_stage_attempts',
    'task_stage_attempt_events',
    'activities',
    'github_sync_lifecycle_controls',
    'github_sync_lifecycle_runs',
  ] as const
  return Object.fromEntries(tables.map((table) => [
    table,
    (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count,
  ])) as Record<(typeof tables)[number], number>
}

describe('SPEC-013B claim reconciliation API documentation', () => {
  it('documents the read-only OpenAPI contract and API index entry', async () => {
    const doc = loadOpenApiDoc()
    const pathItem = doc.paths['/api/tasks/{id}/claim-reconciliation']
    expect(pathItem).toBeDefined()
    if (!pathItem) throw new Error('OpenAPI path /api/tasks/{id}/claim-reconciliation is missing')
    expect(Object.keys(pathItem).sort()).toEqual(['get'])
    expect(JSON.stringify(pathItem).toLowerCase()).toContain('read-only')
    expect(JSON.stringify(pathItem).toLowerCase()).toContain('viewer')
    expect(pathItem.get?.responses['200']?.content?.['application/json']?.schema.properties?.schema_version).toMatchObject({
      const: 'task_claim_reconciliation.v1',
    })

    const response = getApiIndex()
    const payload = await response.json() as { endpoints: { path: string; methods: string[]; auth: string; description: string }[] }
    const endpoint = payload.endpoints.find((entry) => entry.path === '/api/tasks/:id/claim-reconciliation')
    expect(endpoint).toMatchObject({ methods: ['GET'], auth: 'viewer' })
    expect(endpoint?.description).toMatch(/read-only/i)
  })
})

describe('GET /api/tasks/[id]/claim-reconciliation', () => {
  it('requires viewer auth, enforces workspace scope, and returns the v1 envelope without writes', async () => {
    const claimDb = openTaskClaimDb()
    openDbs.push(claimDb)
    seedClaimableTask(claimDb)
    const route = await importRoute(claimDb)

    const unauthenticated = await route.GET(request('/api/tasks/100/claim-reconciliation?workspace_id=1', {
      headers: { 'x-test-auth': 'none' },
    }), { params: Promise.resolve({ id: '100' }) })
    expect(unauthenticated.status).toBe(401)
    await expect(unauthenticated.json()).resolves.toEqual({ error: 'unauthenticated' })

    const malformed = await route.GET(request('/api/tasks/100/claim-reconciliation?workspace_id=bad'), {
      params: Promise.resolve({ id: '100' }),
    })
    expect(malformed.status).toBe(400)

    const before = readSideEffectCounts(claimDb)
    const response = await route.GET(request('/api/tasks/100/claim-reconciliation?workspace_id=1'), {
      params: Promise.resolve({ id: '100' }),
    })
    const after = readSideEffectCounts(claimDb)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      schema_version: 'task_claim_reconciliation.v1',
      task: { id: '100', workspace_id: '1' },
      feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: true },
    })
    expect(after).toEqual(before)
  })

  it('reports caller mutation capability without turning the read route into an action route', async () => {
    const claimDb = openTaskClaimDb()
    openDbs.push(claimDb)
    seedClaimableTask(claimDb)
    const route = await importRoute(claimDb)

    const viewer = await route.GET(request('/api/tasks/100/claim-reconciliation?workspace_id=1', {
      headers: { 'x-test-auth': 'viewer' },
    }), { params: Promise.resolve({ id: '100' }) })
    expect(viewer.status).toBe(200)
    await expect(viewer.json()).resolves.toMatchObject({
      claim_control: {
        authorization: {
          current_role: 'viewer',
          can_mutate: false,
        },
        available_actions: [
          expect.objectContaining({ action: 'retry', enabled: false, unavailable_reason: 'insufficient_role' }),
          expect.objectContaining({ action: 'release', enabled: false, unavailable_reason: 'insufficient_role' }),
          expect.objectContaining({ action: 'cancel', enabled: false, unavailable_reason: 'insufficient_role' }),
        ],
      },
    })

    const operator = await route.GET(request('/api/tasks/100/claim-reconciliation?workspace_id=1', {
      headers: { 'x-test-auth': 'operator' },
    }), { params: Promise.resolve({ id: '100' }) })
    expect(operator.status).toBe(200)
    const payload: unknown = await operator.json()
    expect(payload).toMatchObject({
      claim_control: {
        authorization: {
          current_role: 'operator',
          can_mutate: true,
        },
      },
    })
    expect(JSON.stringify(payload)).not.toContain('/api/tasks/100/claim-control')
  })
})
