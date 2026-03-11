import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Diagnostics API', () => {
  // ── Auth ─────────────────────────────────────

  test('GET /api/diagnostics returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/diagnostics')
    expect(res.status()).toBe(401)
  })

  // ── Response shape ───────────────────────────

  test('GET returns diagnostics with all expected sections', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('security')
    expect(body).toHaveProperty('database')
    expect(body).toHaveProperty('agents')
    expect(body).toHaveProperty('sessions')
    expect(body).toHaveProperty('gateway')
    expect(body).toHaveProperty('system')
  })

  test('version contains app version string', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.version).toHaveProperty('app')
    expect(typeof body.version.app).toBe('string')
  })

  test('security contains score as number', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(typeof body.security.score).toBe('number')
    expect(body.security).toHaveProperty('checks')
    expect(Array.isArray(body.security.checks)).toBe(true)
  })

  test('database contains sizeBytes and migrationVersion', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.database).toHaveProperty('sizeBytes')
    expect(typeof body.database.sizeBytes).toBe('number')
    expect(body.database).toHaveProperty('migrationVersion')
  })

  test('system contains nodeVersion and platform', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.system).toHaveProperty('nodeVersion')
    expect(body.system).toHaveProperty('platform')
    expect(body.system).toHaveProperty('arch')
    expect(typeof body.system.nodeVersion).toBe('string')
  })

  test('gateway reports configured and reachable status', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.gateway).toHaveProperty('configured')
    expect(body.gateway).toHaveProperty('reachable')
    expect(typeof body.gateway.configured).toBe('boolean')
    expect(typeof body.gateway.reachable).toBe('boolean')
  })

  test('agents reports total and byStatus', async ({ request }) => {
    const res = await request.get('/api/diagnostics', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.agents).toHaveProperty('total')
    expect(body.agents).toHaveProperty('byStatus')
    expect(typeof body.agents.total).toBe('number')
  })
})
