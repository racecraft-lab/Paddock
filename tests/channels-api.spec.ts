import { expect, test } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Channels API', () => {
  test('GET /api/channels returns channels array or error', async ({ request }) => {
    const res = await request.get('/api/channels', {
      headers: API_KEY_HEADER,
    })
    // Gateway may be unreachable; the route still returns 200 with empty state
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('channels')
    expect(body).toHaveProperty('channelOrder')
    expect(body).toHaveProperty('channelLabels')
    expect(Array.isArray(body.channelOrder)).toBe(true)
    expect(typeof body.connected).toBe('boolean')
  })

  test('GET /api/channels without auth is rejected', async ({ request }) => {
    const res = await request.get('/api/channels', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/channels requires action param', async ({ request }) => {
    const res = await request.post('/api/channels', {
      headers: API_KEY_HEADER,
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('action required')
  })

  test('POST /api/channels with unknown action returns 400', async ({ request }) => {
    const res = await request.post('/api/channels', {
      headers: API_KEY_HEADER,
      data: { action: 'nonexistent-action-e2e' },
    })
    // Either 400 for unknown action, or 502 if gateway is unreachable
    expect([400, 502]).toContain(res.status())

    const body = await res.json()
    expect(body).toHaveProperty('error')
    if (res.status() === 400) {
      expect(body.error).toContain('Unknown action')
    }
  })
})
