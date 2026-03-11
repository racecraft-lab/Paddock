import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Session Controls API', () => {
  // ── GET /api/sessions ─────────────────────────

  test('GET /api/sessions returns sessions', async ({ request }) => {
    const res = await request.get('/api/sessions', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('sessions')
    expect(Array.isArray(body.sessions)).toBe(true)
  })

  // ── POST /api/sessions – set-thinking ─────────

  test('POST set-thinking requires sessionKey and level', async ({ request }) => {
    // Missing sessionKey
    const res1 = await request.post('/api/sessions?action=set-thinking', {
      headers: API_KEY_HEADER,
      data: { level: 'high' },
    })
    expect(res1.status()).toBe(400)
    const body1 = await res1.json()
    expect(body1.error).toContain('session key')

    // Missing level
    const res2 = await request.post('/api/sessions?action=set-thinking', {
      headers: API_KEY_HEADER,
      data: { sessionKey: 'test-session' },
    })
    expect(res2.status()).toBe(400)
    const body2 = await res2.json()
    expect(body2.error).toContain('thinking level')
  })

  test('POST set-thinking rejects invalid level', async ({ request }) => {
    const res = await request.post('/api/sessions?action=set-thinking', {
      headers: API_KEY_HEADER,
      data: { sessionKey: 'test-session', level: 'turbo' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('thinking level')
  })

  // ── POST /api/sessions – set-verbose ──────────

  test('POST set-verbose requires sessionKey', async ({ request }) => {
    const res = await request.post('/api/sessions?action=set-verbose', {
      headers: API_KEY_HEADER,
      data: { level: 'on' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('session key')
  })

  test('POST set-verbose rejects invalid level', async ({ request }) => {
    const res = await request.post('/api/sessions?action=set-verbose', {
      headers: API_KEY_HEADER,
      data: { sessionKey: 'test-session', level: 'maximum' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('verbose level')
  })

  // ── POST /api/sessions – set-label ────────────

  test('POST set-label requires sessionKey and label', async ({ request }) => {
    // Missing sessionKey
    const res1 = await request.post('/api/sessions?action=set-label', {
      headers: API_KEY_HEADER,
      data: { label: 'my-label' },
    })
    expect(res1.status()).toBe(400)
    const body1 = await res1.json()
    expect(body1.error).toContain('session key')

    // Missing label (numeric instead of string)
    const res2 = await request.post('/api/sessions?action=set-label', {
      headers: API_KEY_HEADER,
      data: { sessionKey: 'test-session', label: 12345 },
    })
    expect(res2.status()).toBe(400)
    const body2 = await res2.json()
    expect(body2.error).toContain('Label')
  })

  // ── POST /api/sessions – invalid action ───────

  test('POST with invalid action returns 400', async ({ request }) => {
    const res = await request.post('/api/sessions?action=do-magic', {
      headers: API_KEY_HEADER,
      data: { sessionKey: 'test-session' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid action')
  })

  // ── DELETE /api/sessions ──────────────────────

  test('DELETE requires sessionKey', async ({ request }) => {
    const res = await request.delete('/api/sessions', {
      headers: API_KEY_HEADER,
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('session key')
  })

  test('DELETE rejects invalid sessionKey format', async ({ request }) => {
    const res = await request.delete('/api/sessions', {
      headers: API_KEY_HEADER,
      data: { sessionKey: '../../etc/passwd' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('session key')
  })

  // ── Auth guard ────────────────────────────────

  test('GET /api/sessions without auth is rejected', async ({ request }) => {
    const res = await request.get('/api/sessions')
    expect([401, 403]).toContain(res.status())
  })

  test('POST /api/sessions without auth is rejected', async ({ request }) => {
    const res = await request.post('/api/sessions?action=set-thinking', {
      data: { sessionKey: 'test', level: 'high' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('DELETE /api/sessions without auth is rejected', async ({ request }) => {
    const res = await request.delete('/api/sessions', {
      data: { sessionKey: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })
})
