import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'
import { reconcileAndAcquireTaskStageClaim } from '../task-claim-reconciliation'
import { activityTypes, openTaskClaimDb, seedClaimableTask } from './task-claim-reconciliation-fixtures'

const routePath = '@/app/api/tasks/[id]/claim-control/route'
const openDbs: ReturnType<typeof openTaskClaimDb>[] = []
const mutationLimiterMock = vi.fn<() => NextResponse | null>(() => null)

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  mutationLimiterMock.mockReset()
  mutationLimiterMock.mockReturnValue(null)
  vi.doUnmock('@/lib/auth')
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/logger')
  vi.doUnmock('@/lib/rate-limit')
  vi.doUnmock('@/lib/workspaces')
  vi.resetModules()
})

async function importRoute(db: ReturnType<typeof openTaskClaimDb>) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/auth', () => ({
    requireRole: vi.fn((request: Request, minRole: 'viewer' | 'operator' | 'admin') => {
      expect(minRole).toBe('operator')
      const auth = request.headers.get('x-test-auth')
      if (auth === 'none') return { error: 'unauthenticated', status: 401 }
      if (auth === 'viewer') return { error: 'forbidden', status: 403 }
      return {
        user: {
          id: auth === 'admin' ? 3 : 2,
          username: auth ?? 'operator',
          role: auth === 'admin' ? 'admin' : 'operator',
          workspace_id: 1,
          tenant_id: 1,
        },
      }
    }),
  }))
  vi.doMock('@/lib/rate-limit', () => ({ mutationLimiter: mutationLimiterMock }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn((_db, request: Request) => {
      const url = new URL(request.url)
      const workspaceId = url.searchParams.get('workspace_id') ?? '1'
      if (workspaceId === 'bad') {
        const error = new Error('invalid workspace scope')
        ;(error as Error & { status?: number }).status = 400
        throw error
      }
      if (workspaceId !== '1') {
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
  return import(routePath) as Promise<{ POST: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response> }>
}

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-auth': 'operator',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function retryBody(claimId: number | null, attemptId: number | null) {
  return {
    action: 'retry',
    stage_key: 'dev_implementation',
    expected: {
      claim_id: claimId === null ? null : String(claimId),
      claim_run_id: claimId === null ? null : 'claim-run-1',
      attempt_id: attemptId === null ? null : String(attemptId),
      attempt_status: 'running',
      operator_action_activity_id: null,
    },
    override_backoff: false,
    override_reason: null,
    reason: 'operator verified retry',
    client_correlation_id: 'route-test',
  }
}

function activityCount(db: ReturnType<typeof openTaskClaimDb>) {
  return (db.prepare('SELECT COUNT(*) as count FROM activities').get() as { count: number }).count
}

function openApiDoc() {
  return JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as {
    paths: Record<string, unknown>
  }
}

describe('SPEC-013C claim-control API documentation', () => {
  it('documents the mutation endpoint, idempotency header, and read-model extension', async () => {
    const doc = openApiDoc()
    const mutationPath = doc.paths['/api/tasks/{id}/claim-control']
    expect(mutationPath).toBeDefined()
    expect(JSON.stringify(mutationPath)).toContain('Idempotency-Key')
    expect(JSON.stringify(mutationPath)).toContain('task_claim_control.v1')
    expect(JSON.stringify(mutationPath)).toContain('operator')

    const readPath = doc.paths['/api/tasks/{id}/claim-reconciliation']
    expect(JSON.stringify(readPath)).toContain('claim_control')
    expect(JSON.stringify(readPath)).toContain('expected_state')

    const index = await getApiIndex().json() as { endpoints: { path: string; methods: string[]; auth: string; description: string }[] }
    expect(index.endpoints.find((entry) => entry.path === '/api/tasks/:id/claim-control')).toMatchObject({
      methods: ['POST'],
      auth: 'operator',
    })
  })
})

describe('POST /api/tasks/[id]/claim-control', () => {
  it('applies auth, rate-limit, and idempotency-key checks before task audit writes', async () => {
    const claimDb = openTaskClaimDb()
    openDbs.push(claimDb)
    seedClaimableTask(claimDb)
    const route = await importRoute(claimDb)

    const unauthenticated = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', {}, {
      'x-test-auth': 'none',
      'idempotency-key': 'auth-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(unauthenticated.status).toBe(401)

    const forbidden = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', {}, {
      'x-test-auth': 'viewer',
      'idempotency-key': 'viewer-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(forbidden.status).toBe(403)

    const missingKey = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', {}, {
      'x-test-auth': 'operator',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(missingKey.status).toBe(400)

    mutationLimiterMock.mockReturnValueOnce(NextResponse.json({ error: 'rate_limited' }, { status: 429 }))
    const limited = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', {}, {
      'idempotency-key': 'rate-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(limited.status).toBe(429)

    expect(activityCount(claimDb)).toBe(0)
  })

  it('executes retry once, replays same-key same-body responses, and rejects body mismatch without duplicate audit', async () => {
    const claimDb = openTaskClaimDb()
    openDbs.push(claimDb)
    seedClaimableTask(claimDb)
    const acquired = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'claim-run-1',
      now: 1770000000,
    })
    const route = await importRoute(claimDb)
    const body = retryBody(acquired.active_claim_id, acquired.task_stage_attempt_id)

    const first = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', body, {
      'idempotency-key': 'retry-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(first.status).toBe(200)
    const firstPayload: unknown = await first.json()
    expect(firstPayload).toMatchObject({
      schema_version: 'task_claim_control.v1',
      outcome: 'retry_ready',
      idempotency: { replayed: false },
    })
    expect(JSON.stringify(firstPayload)).not.toContain('retry-key')
    const afterFirst = activityCount(claimDb)

    const replay = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', body, {
      'idempotency-key': 'retry-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toMatchObject({
      outcome: 'retry_ready',
      idempotency: { replayed: true },
    })
    expect(activityCount(claimDb)).toBe(afterFirst)

    const mismatch = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', {
      ...body,
      reason: 'different operator reason',
    }, {
      'idempotency-key': 'retry-key',
    }), { params: Promise.resolve({ id: '100' }) })
    expect(mismatch.status).toBe(422)
    await expect(mismatch.json()).resolves.toMatchObject({
      outcome: 'validation_error',
      diagnostics: { sanitized_error_category: 'idempotency_key_body_mismatch' },
    })
    expect(activityCount(claimDb)).toBe(afterFirst)
  })

  it('rolls back the mutation when successful idempotency recording fails', async () => {
    const claimDb = openTaskClaimDb()
    openDbs.push(claimDb)
    seedClaimableTask(claimDb)
    const acquired = reconcileAndAcquireTaskStageClaim(claimDb, {
      taskId: 100,
      workspaceId: 1,
      leaseOwner: 'scheduler',
      claimRunId: 'claim-run-1',
      now: 1770000000,
    })
    claimDb.exec(`
      CREATE TRIGGER task_claim_control_idempotency_insert_failure
      BEFORE INSERT ON task_claim_control_idempotency_keys
      BEGIN
        SELECT RAISE(ABORT, 'idempotency storage unavailable');
      END;
    `)
    const route = await importRoute(claimDb)

    const response = await route.POST(request('/api/tasks/100/claim-control?workspace_id=1', retryBody(
      acquired.active_claim_id,
      acquired.task_stage_attempt_id,
    ), {
      'idempotency-key': 'failing-storage-key',
    }), { params: Promise.resolve({ id: '100' }) })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      outcome: 'validation_error',
      diagnostics: { sanitized_error_category: 'idempotency_storage_unavailable' },
    })
    expect(claimDb.prepare(`
      SELECT claim_state, release_reason
      FROM task_stage_claims
      WHERE id = ?
    `).get(acquired.active_claim_id)).toEqual({
      claim_state: 'active',
      release_reason: null,
    })
    expect(activityTypes(claimDb)).toEqual(['task_stage_claim_acquired'])
  })
})
