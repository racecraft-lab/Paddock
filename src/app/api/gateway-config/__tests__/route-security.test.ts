import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireRoleMock = vi.fn()
const readFileMock = vi.fn()
const writeFileMock = vi.fn()
const logAuditEventMock = vi.fn()
const mutationLimiterMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
  },
  readFile: readFileMock,
  writeFile: writeFileMock,
}))

vi.mock('@/lib/db', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('@/lib/config', () => ({
  config: {
    openclawConfigPath: '/tmp/openclaw.json',
    gatewayHost: '127.0.0.1',
    gatewayPort: 19888,
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter: mutationLimiterMock,
}))

vi.mock('@/lib/gateway-runtime', () => ({
  getDetectedGatewayToken: vi.fn(() => null),
}))

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/gateway-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/gateway-config security boundaries', () => {
  beforeEach(() => {
    vi.resetModules()
    requireRoleMock.mockReset()
    readFileMock.mockReset()
    writeFileMock.mockReset()
    logAuditEventMock.mockReset()
    mutationLimiterMock.mockReset()

    requireRoleMock.mockReturnValue({ user: { id: 1, username: 'admin', role: 'admin' } })
    mutationLimiterMock.mockReturnValue(null)
    readFileMock.mockResolvedValue(JSON.stringify({
      gateway: { host: '127.0.0.1' },
      logging: { redactSensitive: 'none' },
    }))
  })

  it.each([
    'logging.__proto__.polluted',
    'gateway.constructor.prototype.polluted',
    '__proto__.polluted',
  ])('rejects prototype-polluting update path %s without writing the config', async (path) => {
    const { PUT } = await import('@/app/api/gateway-config/route')

    const response = await PUT(makePutRequest({
      updates: {
        [path]: true,
      },
    }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Invalid configuration path')
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
