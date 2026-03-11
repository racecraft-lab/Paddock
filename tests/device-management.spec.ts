import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Device Management API', () => {
  // ── GET /api/nodes ────────────────────────────

  test('GET /api/nodes returns nodes list', async ({ request }) => {
    const res = await request.get('/api/nodes', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Gateway may be down; endpoint gracefully returns empty list
    expect(body).toHaveProperty('nodes')
    expect(Array.isArray(body.nodes)).toBe(true)
  })

  test('GET /api/nodes?action=devices returns devices', async ({ request }) => {
    const res = await request.get('/api/nodes?action=devices', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('devices')
    expect(Array.isArray(body.devices)).toBe(true)
  })

  test('GET /api/nodes with unknown action returns 400', async ({ request }) => {
    const res = await request.get('/api/nodes?action=bogus', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Unknown action')
  })

  // ── POST /api/nodes – input validation ────────

  test('POST /api/nodes approve requires requestId', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: { action: 'approve' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('requestId')
  })

  test('POST /api/nodes reject requires requestId', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: { action: 'reject' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('requestId')
  })

  test('POST /api/nodes rotate-token requires deviceId', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: { action: 'rotate-token' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('deviceId')
  })

  test('POST /api/nodes revoke-token requires deviceId', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: { action: 'revoke-token' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('deviceId')
  })

  test('POST /api/nodes with unknown action returns 400', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: { action: 'self-destruct' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid action')
  })

  test('POST /api/nodes without action returns 400', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      headers: API_KEY_HEADER,
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid action')
  })

  // ── Auth guard ────────────────────────────────

  test('GET /api/nodes without auth is rejected', async ({ request }) => {
    const res = await request.get('/api/nodes')
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/nodes without auth is rejected', async ({ request }) => {
    const res = await request.post('/api/nodes', {
      data: { action: 'approve', requestId: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })
})
