/**
 * SPEC-008 — auth-gate unit tests for the per-test admin endpoints.
 *
 * Asserts every admin route refuses with 403 unless BOTH:
 *   1. PADDOCK_TEST_MODE=1 is set in the environment
 *   2. requireRole(req, 'admin') succeeds
 *
 * Verifies that the gate is enforced at the route entry point so the
 * surface is unreachable in production deployments. We exercise every
 * route once through its POST/DELETE handler.
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RoleResult = { user: { role: string } } | { error: string; status: 401 | 403 }
const requireRoleMock = vi.fn<(req: Request, role: string) => RoleResult>()

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: (req: Request, role: string): RoleResult => requireRoleMock(req, role),
}))

// Stub the DB so handlers don't crash when the gate accidentally lets
// a request through during a test setup mistake. The gate itself runs
// before any DB call.
vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(() => {
    throw new Error('test stub: getDatabase should not be called when gate denies')
  }),
}))

const ORIGINAL_ENV = { ...process.env }

function makeRequest(url: string, method: 'POST' | 'DELETE' = 'POST', body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: method === 'DELETE' ? null : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

interface RouteCase {
  modulePath: string
  method: 'POST' | 'DELETE'
  url: string
  needsParams?: boolean
}

const ROUTES: RouteCase[] = [
  { modulePath: '@/app/api/admin/spec-008/seed-fixture/route', method: 'POST', url: '/api/admin/spec-008/seed-fixture' },
  { modulePath: '@/app/api/admin/spec-008/seed-fixture/[id]/route', method: 'DELETE', url: '/api/admin/spec-008/seed-fixture/1', needsParams: true },
  { modulePath: '@/app/api/admin/spec-008/seed-state/route', method: 'POST', url: '/api/admin/spec-008/seed-state' },
  { modulePath: '@/app/api/admin/spec-008/aegis-state/route', method: 'POST', url: '/api/admin/spec-008/aegis-state' },
  { modulePath: '@/app/api/admin/spec-008/breaker-state/route', method: 'POST', url: '/api/admin/spec-008/breaker-state' },
  { modulePath: '@/app/api/admin/spec-008/bulk-promote-state/route', method: 'POST', url: '/api/admin/spec-008/bulk-promote-state' },
  { modulePath: '@/app/api/admin/spec-008/calibration-state/route', method: 'POST', url: '/api/admin/spec-008/calibration-state' },
  { modulePath: '@/app/api/admin/spec-008/emit-decision/route', method: 'POST', url: '/api/admin/spec-008/emit-decision' },
  { modulePath: '@/app/api/admin/spec-008/emit-dispatch/route', method: 'POST', url: '/api/admin/spec-008/emit-dispatch' },
  { modulePath: '@/app/api/admin/spec-008/override-grant-state/route', method: 'POST', url: '/api/admin/spec-008/override-grant-state' },
  { modulePath: '@/app/api/admin/spec-008/budget-utilization/route', method: 'POST', url: '/api/admin/spec-008/budget-utilization' },
  { modulePath: '@/app/api/admin/workspaces/[id]/feature-flags/route', method: 'POST', url: '/api/admin/workspaces/1/feature-flags', needsParams: true },
]

async function callRoute(route: RouteCase, req: NextRequest): Promise<Response> {
  const mod = (await import(/* @vite-ignore */ route.modulePath)) as Record<string, unknown>
  const handler = mod[route.method] as ((r: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>) | undefined
  if (typeof handler !== 'function') throw new Error(`route ${route.modulePath} has no ${route.method} export`)
  if (route.needsParams === true) {
    return handler(req, { params: Promise.resolve({ id: '1' }) })
  }
  return handler(req)
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  requireRoleMock.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('SPEC-008 admin endpoints — test-mode + admin auth gating', () => {
  for (const route of ROUTES) {
    describe(`${route.method} ${route.url}`, () => {
      it('refuses with 403 when PADDOCK_TEST_MODE != 1', async () => {
        delete process.env['PADDOCK_TEST_MODE']
        requireRoleMock.mockReturnValue({ user: { role: 'admin' } })
        const res = await callRoute(route, makeRequest(route.url, route.method))
        expect(res.status).toBe(403)
        const body = (await res.json()) as { code: string }
        expect(body.code).toBe('forbidden')
      })

      it('refuses with 403 when admin auth fails (test-mode is set)', async () => {
        process.env['PADDOCK_TEST_MODE'] = '1'
        requireRoleMock.mockReturnValue({ error: 'Authentication required', status: 401 })
        const res = await callRoute(route, makeRequest(route.url, route.method))
        expect(res.status).toBe(403)
        const body = (await res.json()) as { code: string }
        expect(body.code).toBe('forbidden')
      })
    })
  }
})
