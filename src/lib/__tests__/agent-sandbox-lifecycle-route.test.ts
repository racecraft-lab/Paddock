import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'
import { createSandboxLifecycle, prepareSandboxLifecycle } from '../agent-sandbox-lifecycle'
import { openAgentSandboxLifecycleDb, sandboxLifecycleInput, tableCount } from './agent-sandbox-lifecycle-fixtures'

const routePath = '@/app/api/tasks/[id]/sandbox-lifecycles/route'
const openDbs: ReturnType<typeof openAgentSandboxLifecycleDb>[] = []

interface OpenApiOperation {
  readonly responses: Record<string, {
    readonly content?: Record<string, {
      readonly schema: {
        readonly properties?: Record<string, unknown>
      }
    }>
  }>
}

interface OpenApiPathItem {
  readonly get?: OpenApiOperation
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
  readonly paths: Partial<Record<string, OpenApiPathItem>>
} {
  return JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as {
    paths: Partial<Record<string, OpenApiPathItem>>
  }
}

async function importRoute(db: ReturnType<typeof openAgentSandboxLifecycleDb>) {
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
      const workspaceId = url.searchParams.get('workspace_id')
      if (workspaceId === 'bad') {
        const error = new Error('invalid workspace scope')
        ;(error as Error & { status?: number }).status = 400
        throw error
      }
      if (workspaceId !== null && workspaceId !== '1') {
        const error = new Error('forbidden workspace scope')
        ;(error as Error & { status?: number }).status = 403
        throw error
      }
      return { workspaceId: 1 }
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

function readSideEffectCounts(db: ReturnType<typeof openAgentSandboxLifecycleDb>) {
  const tables = [
    'tasks',
    'task_stage_claims',
    'task_stage_attempts',
    'activities',
    'agent_sandbox_lifecycles',
    'agent_sandbox_lifecycle_events',
  ] as const
  return Object.fromEntries(tables.map((table) => [table, tableCount(db, table)])) as Record<(typeof tables)[number], number>
}

describe('SPEC-014A sandbox lifecycle API documentation', () => {
  it('documents the read-only OpenAPI contract and API index entry', async () => {
    const doc = loadOpenApiDoc()
    const pathItem = doc.paths['/api/tasks/{id}/sandbox-lifecycles']
    expect(pathItem).toBeDefined()
    if (!pathItem) throw new Error('OpenAPI path /api/tasks/{id}/sandbox-lifecycles is missing')
    expect(Object.keys(pathItem).sort()).toEqual(['get'])
    expect(JSON.stringify(pathItem).toLowerCase()).toContain('read-only')
    expect(JSON.stringify(pathItem).toLowerCase()).toContain('viewer')
    expect(pathItem.get?.responses['200']?.content?.['application/json']?.schema.properties?.['schema_version']).toMatchObject({
      const: 'sandbox_lifecycle.v1',
    })
    const schemaProperties = pathItem.get?.responses['200']?.content?.['application/json']?.schema.properties
    expect(schemaProperties?.['task']).toMatchObject({
      type: 'object',
      required: ['id', 'workspace_id', 'stage_key'],
    })
    expect(JSON.stringify(schemaProperties?.['lifecycles'])).toContain('sandbox_key')
    expect(JSON.stringify(schemaProperties?.['lifecycles'])).toContain('task_stage_attempt_id')
    expect(JSON.stringify(schemaProperties?.['lifecycles'])).toContain('observed_at')
    expect(schemaProperties?.['diagnostics']).toMatchObject({
      type: 'object',
      required: ['warnings'],
    })

    const response = getApiIndex()
    const payload = await response.json() as { endpoints: { path: string; methods: string[]; auth: string; description: string }[] }
    const endpoint = payload.endpoints.find((entry) => entry.path === '/api/tasks/:id/sandbox-lifecycles')
    expect(endpoint).toMatchObject({ methods: ['GET'], auth: 'viewer' })
    expect(endpoint?.description).toMatch(/read-only/i)
  })
})

describe('GET /api/tasks/[id]/sandbox-lifecycles', () => {
  it('requires viewer auth, enforces workspace scope, supports lifecycle filtering, and performs no writes', async () => {
    const db = openAgentSandboxLifecycleDb(true)
    openDbs.push(db)
    const created = createSandboxLifecycle(db, sandboxLifecycleInput())
    if (!created.lifecycle) throw new Error('missing lifecycle')
    prepareSandboxLifecycle(db, Number(created.lifecycle.id))
    const route = await importRoute(db)

    const unauthenticated = await route.GET(request('/api/tasks/100/sandbox-lifecycles?workspace_id=1', {
      headers: { 'x-test-auth': 'none' },
    }), { params: Promise.resolve({ id: '100' }) })
    expect(unauthenticated.status).toBe(401)

    const malformed = await route.GET(request('/api/tasks/100/sandbox-lifecycles?workspace_id=bad'), {
      params: Promise.resolve({ id: '100' }),
    })
    expect(malformed.status).toBe(400)

    const crossWorkspace = await route.GET(request('/api/tasks/100/sandbox-lifecycles?workspace_id=2'), {
      params: Promise.resolve({ id: '100' }),
    })
    expect(crossWorkspace.status).toBe(403)

    const invalidTask = await route.GET(request('/api/tasks/not-a-number/sandbox-lifecycles?workspace_id=1'), {
      params: Promise.resolve({ id: 'not-a-number' }),
    })
    expect(invalidTask.status).toBe(404)

    const before = readSideEffectCounts(db)
    const unfiltered = await route.GET(request('/api/tasks/100/sandbox-lifecycles?workspace_id=1'), {
      params: Promise.resolve({ id: '100' }),
    })
    expect(unfiltered.status).toBe(200)
    await expect(unfiltered.json()).resolves.toMatchObject({
      lifecycles: [{ id: created.lifecycle.id, owner: 'mission_control' }],
    })

    const response = await route.GET(request(`/api/tasks/100/sandbox-lifecycles?workspace_id=1&lifecycle_id=${created.lifecycle.id}`), {
      params: Promise.resolve({ id: '100' }),
    })
    const after = readSideEffectCounts(db)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      schema_version: 'sandbox_lifecycle.v1',
      task: { id: '100', workspace_id: '1' },
      feature_flag: { key: 'FEATURE_AGENT_RUNNER_SANDBOXES', enabled: true },
      lifecycles: [{ id: created.lifecycle.id, owner: 'mission_control' }],
    })
    expect(after).toEqual(before)
  })

  it('keeps reads available with disabled-state evidence when the flag is off', async () => {
    const db = openAgentSandboxLifecycleDb(true)
    const created = createSandboxLifecycle(db, sandboxLifecycleInput())
    if (!created.lifecycle) throw new Error('missing lifecycle')
    db.prepare("UPDATE workspaces SET feature_flags = '{\"FEATURE_AGENT_RUNNER_SANDBOXES\":false}' WHERE id = 1").run()
    openDbs.push(db)
    const route = await importRoute(db)

    const response = await route.GET(request('/api/tasks/100/sandbox-lifecycles?workspace_id=1'), {
      params: Promise.resolve({ id: '100' }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      feature_flag: { enabled: false, mutation_state: 'disabled' },
      lifecycles: [{ id: created.lifecycle.id }],
    })
  })
})
