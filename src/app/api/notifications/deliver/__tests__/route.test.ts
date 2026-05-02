import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getDatabaseMock,
  requireRoleMock,
  logActivityMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  requireRoleMock: vi.fn(),
  logActivityMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: getDatabaseMock,
  db_helpers: { logActivity: logActivityMock },
}))

vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))

vi.mock('@/lib/command', () => ({
  runOpenClaw: vi.fn(),
}))

vi.mock('@/lib/workspaces', () => ({
  resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1, workspaceIds: [1] })),
  workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
  workspaceScopeError: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { POST } from '../route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/notifications/deliver', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('POST /api/notifications/deliver ready-for-owner formatting', () => {
  beforeEach(() => {
    getDatabaseMock.mockReset()
    requireRoleMock.mockReset()
    requireRoleMock.mockReturnValue({ user: { username: 'operator', role: 'operator' } })
    logActivityMock.mockReset()
  })

  it('includes Owner action required wording for task_ready_for_owner dry-run deliveries', async () => {
    const all = vi.fn(() => [{
      id: 7,
      recipient: 'owner-agent',
      type: 'task_ready_for_owner',
      title: 'Ready for owner merge',
      message: 'Merge the linked PR for Task A.',
      source_type: 'task',
      source_id: 44,
      created_at: 1893456000,
      workspace_id: 1,
      session_key: 'session-owner',
    }])
    const run = vi.fn()
    getDatabaseMock.mockReturnValue({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT n.*, a.session_key')) return { all }
        return { run, get: vi.fn(), all: vi.fn(() => []) }
      }),
    })

    const response = await POST(request({ dry_run: true, limit: 1 }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.delivery_results[0].message).toContain('Owner action required')
    expect(body.delivery_results[0].message).toContain('Ready for owner merge')
    expect(body.delivery_results[0].message).toContain('Related task ID: 44')
  })
})
