import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'
import type { RuntimeInventoryEnvelope } from '@/lib/harness-adapters/types'

const runtimeInventoryRoutePath = '@/app/api/agents/runtime-inventory/route'

interface OpenApiPathItem {
  readonly get?: unknown
}

interface OpenApiDoc {
  readonly paths: Partial<Record<string, OpenApiPathItem>>
}

interface FakeScopeError extends Error {
  readonly scopeStatus: 400 | 403
  readonly scopeMessage: string
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init)
}

function loadOpenApiDoc(): OpenApiDoc {
  return JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as OpenApiDoc
}

function scopeError(status: 400 | 403, message: string): FakeScopeError {
  return Object.assign(new Error(message), {
    scopeStatus: status,
    scopeMessage: message,
  })
}

function createFakeDb() {
  return {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn((...params: unknown[]) => {
        if (sql.includes('sqlite_master')) {
          const table = params[0]
          return ['projects', 'tasks', 'project_agent_assignments'].includes(String(table)) ? { ok: 1 } : undefined
        }
        if (sql.includes('FROM projects')) {
          return params[0] === 10 ? { id: 10 } : undefined
        }
        if (sql.includes('FROM tasks')) {
          return params[0] === 100 ? { id: 100 } : undefined
        }
        if (sql.includes('FROM project_agent_assignments')) {
          return params.at(-1) === 'builder' ? { role: 'builder' } : undefined
        }
        return undefined
      }),
      all: vi.fn(() => []),
    })),
  }
}

const runtimeInventoryEnvelope: RuntimeInventoryEnvelope = {
  schema_version: 'runtime_inventory.v1',
  generated_at: '2026-06-03T00:00:00.000Z',
  scope: {
    kind: 'productLine',
    workspace_id: '1',
    workspace_ids: ['1'],
  },
  feature_flag: {
    name: 'FEATURE_AGENT_RUNNER_SANDBOXES',
    enabled: true,
    source: 'workspace',
  },
  entries: [],
  summary: {
    total: 0,
    visible: 0,
    unassigned: 0,
    assigned: 0,
    eligible: 0,
    blocked: 0,
  },
  diagnostics: {
    truncated: false,
    warnings: [],
  },
}

async function importRuntimeInventoryRoute() {
  const fakeDb = createFakeDb()
  const buildRuntimeInventoryFromDatabase = vi.fn(() => runtimeInventoryEnvelope)

  vi.doMock('@/lib/db', () => ({ getDatabase: () => fakeDb }))
  vi.doMock('@/lib/auth', () => ({
    requireRole: vi.fn((routeRequest: Request, minRole: 'viewer' | 'operator' | 'admin') => {
      expect(minRole).toBe('viewer')
      if (routeRequest.headers.get('x-test-auth') === 'none') {
        return { error: 'Authentication required', status: 401 }
      }
      if (routeRequest.headers.get('x-test-auth') === 'operator-only') {
        return { error: 'Forbidden', status: 403 }
      }
      return {
        user: {
          id: 1,
          username: 'viewer',
          display_name: 'Viewer',
          role: 'viewer',
          workspace_id: 1,
          tenant_id: 1,
          created_at: 1,
          updated_at: 1,
          last_login_at: null,
        },
      }
    }),
  }))
  vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn((_db: unknown, routeRequest: NextRequest) => {
      const params = routeRequest.nextUrl.searchParams
      if (params.has('workspace_id') && params.has('workspace_scope')) {
        throw scopeError(400, 'workspace_id and workspace_scope cannot be combined')
      }
      if (params.get('workspace_id') === '2') {
        throw scopeError(403, 'Workspace access denied')
      }
      return {
        kind: 'productLine',
        workspaceId: 1,
        workspaceIds: [1],
      }
    }),
    workspaceScopeError: vi.fn((error: unknown) => {
      if (error instanceof Error && 'scopeStatus' in error && 'scopeMessage' in error) {
        const scoped = error as FakeScopeError
        return { status: scoped.scopeStatus, error: scoped.scopeMessage }
      }
      return null
    }),
    workspaceScopePredicate: vi.fn(() => ({ sql: 'workspace_id IN (?)', params: [1] })),
  }))
  vi.doMock('@/lib/harness-adapters/runtime-inventory', async () => {
    const actual = await vi.importActual<typeof import('@/lib/harness-adapters/runtime-inventory')>('@/lib/harness-adapters/runtime-inventory')
    return {
      ...actual,
      buildRuntimeInventoryFromDatabase,
    }
  })

  const route = await import(runtimeInventoryRoutePath) as { GET: (routeRequest: NextRequest) => Promise<Response> }
  return { route, fakeDb, buildRuntimeInventoryFromDatabase }
}

afterEach(() => {
  vi.doUnmock('@/lib/auth')
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/logger')
  vi.doUnmock('@/lib/workspaces')
  vi.doUnmock('@/lib/harness-adapters/runtime-inventory')
  vi.resetModules()
})

describe('GET /api/agents/runtime-inventory', () => {
  it('requires viewer auth and rejects mixed or unauthorized scope before deriving entries', async () => {
    const { route, buildRuntimeInventoryFromDatabase } = await importRuntimeInventoryRoute()

    const unauthenticated = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1', {
      headers: { 'x-test-auth': 'none' },
    }))
    await expect(unauthenticated.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'authentication_required',
    })
    expect(unauthenticated.status).toBe(401)

    const forbiddenRole = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1', {
      headers: { 'x-test-auth': 'operator-only' },
    }))
    await expect(forbiddenRole.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'authorization_denied',
      reason_code: 'authorization_denied',
    })
    expect(forbiddenRole.status).toBe(403)

    const mixedScope = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1&workspace_scope=facility'))
    await expect(mixedScope.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'invalid_scope',
      details: { fields: ['workspace_id', 'workspace_scope'] },
    })
    expect(mixedScope.status).toBe(400)

    const unauthorized = await route.GET(request('/api/agents/runtime-inventory?workspace_id=2'))
    await expect(unauthorized.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'authorization_denied',
      reason_code: 'authorization_denied',
    })
    expect(unauthorized.status).toBe(403)
    expect(buildRuntimeInventoryFromDatabase).not.toHaveBeenCalled()
  })

  it('returns a read-only runtime_inventory.v1 envelope and passes bounded filters to the builder', async () => {
    const { route, fakeDb, buildRuntimeInventoryFromDatabase } = await importRuntimeInventoryRoute()

    const response = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1&project_id=10&task_id=100&role=builder&requested_capability=launch&manifest_id=paddock_owned_sandbox_fake'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(runtimeInventoryEnvelope)
    expect(buildRuntimeInventoryFromDatabase).toHaveBeenCalledWith(fakeDb, {
      scope: {
        kind: 'productLine',
        workspaceId: 1,
        workspaceIds: [1],
      },
      filters: {
        projectId: 10,
        taskId: 100,
        role: 'builder',
        requestedCapability: 'launch',
        manifestId: 'paddock_owned_sandbox_fake',
      },
    })
  })

  it('fails invalid filters closed with bounded runtime_inventory_error.v1 responses', async () => {
    const { route } = await importRuntimeInventoryRoute()

    const unknownCapability = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1&requested_capability=raw_shell'))
    expect(unknownCapability.status).toBe(422)
    await expect(unknownCapability.json()).resolves.toEqual({
      schema_version: 'runtime_inventory_error.v1',
      error: 'invalid_filter',
      reason_code: 'capability_unsupported',
      details: {
        field_path: 'requested_capability',
        code: 'unknown_capability',
        reason_code: 'capability_unsupported',
      },
    })

    const unknownRole = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1&project_id=10&role=missing_role'))
    expect(unknownRole.status).toBe(422)
    await expect(unknownRole.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'invalid_filter',
      details: {
        field_path: 'role',
        code: 'unknown_role',
      },
    })

    const unknownProject = await route.GET(request('/api/agents/runtime-inventory?workspace_id=1&project_id=999'))
    expect(unknownProject.status).toBe(403)
    await expect(unknownProject.json()).resolves.toMatchObject({
      schema_version: 'runtime_inventory_error.v1',
      error: 'authorization_denied',
      reason_code: 'authorization_denied',
      details: { scope: 'project' },
    })
  })

  it('keeps GET /api/agents compatible and documents the dedicated route in API index and OpenAPI', async () => {
    const agentsRouteSource = readFileSync(join(process.cwd(), 'src/app/api/agents/route.ts'), 'utf8')
    expect(agentsRouteSource).not.toContain('runtime_inventory')
    expect(agentsRouteSource).not.toContain('runtime-inventory')

    const apiIndex = await getApiIndex().json() as { endpoints: Array<{ path: string; methods: string[]; auth: string; description: string }> }
    const endpoint = apiIndex.endpoints.find((entry) => entry.path === '/api/agents/runtime-inventory')
    expect(endpoint).toMatchObject({ methods: ['GET'], auth: 'viewer' })
    expect(endpoint?.description).toMatch(/runtime inventory/i)
    expect(endpoint?.description).toMatch(/read-only/i)

    const openApi = loadOpenApiDoc()
    expect(openApi.paths['/api/agents/runtime-inventory']?.get).toBeDefined()
    expect(JSON.stringify(openApi.paths['/api/agents/runtime-inventory'])).toContain('runtime_inventory.v1')
  })
})
