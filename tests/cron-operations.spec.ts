import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Cron Operations API', () => {
  // ── GET /api/cron ─────────────────────────────

  test('GET /api/cron?action=list returns job list or empty array', async ({ request }) => {
    const res = await request.get('/api/cron?action=list', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('jobs')
    expect(Array.isArray(body.jobs)).toBe(true)
  })

  test('GET /api/cron without action returns 400', async ({ request }) => {
    const res = await request.get('/api/cron', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('GET /api/cron?action=history requires jobId', async ({ request }) => {
    const res = await request.get('/api/cron?action=history', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Job ID required')
  })

  test('GET /api/cron?action=history returns entries array', async ({ request }) => {
    const res = await request.get('/api/cron?action=history&jobId=nonexistent-job', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('entries')
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('hasMore')
  })

  test('GET /api/cron?action=logs requires job param', async ({ request }) => {
    const res = await request.get('/api/cron?action=logs', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Job ID required')
  })

  // ── POST /api/cron ────────────────────────────

  test('POST /api/cron clone requires jobId', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'clone' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Job ID required')
  })

  test('POST /api/cron trigger requires jobId', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'trigger' },
    })
    // Either 400 (missing ID) or 403 (triggers disabled) depending on env
    expect([400, 403]).toContain(res.status())
  })

  test('POST /api/cron toggle requires jobId', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'toggle' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('POST /api/cron remove requires jobId', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'remove' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('POST /api/cron add requires schedule, command, and name', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'add' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('required')
  })

  test('POST /api/cron invalid action returns 400', async ({ request }) => {
    const res = await request.post('/api/cron', {
      headers: API_KEY_HEADER,
      data: { action: 'nonexistent-action' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid action')
  })

  // ── Auth ──────────────────────────────────────

  test('GET without auth is rejected', async ({ request }) => {
    const res = await request.get('/api/cron?action=list')
    expect(res.status()).toBe(401)
  })

  test('POST without auth is rejected', async ({ request }) => {
    const res = await request.post('/api/cron', {
      data: { action: 'list' },
    })
    expect(res.status()).toBe(401)
  })
})
