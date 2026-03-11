import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('API Index / Discovery', () => {
  test('GET /api/index returns structured catalog', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('endpoints')
    expect(body).toHaveProperty('total_endpoints')
    expect(Array.isArray(body.endpoints)).toBe(true)
    expect(body.total_endpoints).toBe(body.endpoints.length)
    expect(body.total_endpoints).toBeGreaterThan(50)
  })

  test('each endpoint has required fields', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    const body = await res.json()

    for (const ep of body.endpoints) {
      expect(ep).toHaveProperty('path')
      expect(ep).toHaveProperty('methods')
      expect(ep).toHaveProperty('tag')
      expect(ep).toHaveProperty('description')
      expect(ep).toHaveProperty('auth')
      expect(ep.path).toMatch(/^\/api\//)
      expect(Array.isArray(ep.methods)).toBe(true)
      expect(ep.methods.length).toBeGreaterThan(0)
    }
  })

  test('known routes are present', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    const body = await res.json()
    const paths = body.endpoints.map((ep: any) => ep.path)

    expect(paths).toContain('/api/tasks')
    expect(paths).toContain('/api/agents')
    expect(paths).toContain('/api/projects')
    expect(paths).toContain('/api/status')
    expect(paths).toContain('/api/chat/messages')
    expect(paths).toContain('/api/webhooks')
    expect(paths).toContain('/api/index')
  })

  test('event_stream metadata is present', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    const body = await res.json()

    expect(body).toHaveProperty('event_stream')
    expect(body.event_stream.path).toBe('/api/events')
    expect(body.event_stream.protocol).toBe('SSE')
    expect(typeof body.event_stream.description).toBe('string')
  })

  test('docs metadata is present', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    const body = await res.json()

    expect(body).toHaveProperty('docs')
    expect(body.docs.openapi).toBe('/api/docs')
  })

  test('tags are consistent strings', async ({ request }) => {
    const res = await request.get('/api/index', { headers: API_KEY_HEADER })
    const body = await res.json()
    const tags = new Set(body.endpoints.map((ep: any) => ep.tag))

    // Should have multiple distinct tags
    expect(tags.size).toBeGreaterThan(10)

    // Key tags exist
    expect(tags.has('Tasks')).toBe(true)
    expect(tags.has('Agents')).toBe(true)
    expect(tags.has('Projects')).toBe(true)
    expect(tags.has('Auth')).toBe(true)
    expect(tags.has('System')).toBe(true)
  })
})
