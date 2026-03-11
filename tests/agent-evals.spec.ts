import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Agent Evals API', () => {
  // ── Auth ─────────────────────────────────────

  test('GET /api/agents/evals returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/agents/evals?agent=test')
    expect(res.status()).toBe(401)
  })

  test('GET /api/agents/evals returns 400 without agent param', async ({ request }) => {
    const res = await request.get('/api/agents/evals', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('agent')
  })

  // ── GET — latest evals ────────────────────────

  test('GET /api/agents/evals returns expected shape', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/evals?agent=${agent.name}`, { headers: API_KEY_HEADER })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('agent')
      expect(body).toHaveProperty('layers')
      expect(body).toHaveProperty('drift')
      expect(body.agent).toBe(agent.name)
      expect(Array.isArray(body.layers)).toBe(true)
      expect(body.drift).toHaveProperty('hasDrift')
      expect(body.drift).toHaveProperty('metrics')
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  // ── GET — history mode ────────────────────────

  test('GET with action=history returns history and driftTimeline', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/evals?agent=${agent.name}&action=history`, { headers: API_KEY_HEADER })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('history')
      expect(body).toHaveProperty('driftTimeline')
      expect(Array.isArray(body.history)).toBe(true)
      expect(Array.isArray(body.driftTimeline)).toBe(true)
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  // ── POST — run evals ──────────────────────────

  test('POST with action=run executes evals and returns results', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.post('/api/agents/evals', {
        headers: API_KEY_HEADER,
        data: { action: 'run', agent: agent.name },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('agent')
      expect(body).toHaveProperty('results')
      expect(Array.isArray(body.results)).toBe(true)
      expect(body.agent).toBe(agent.name)
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  test('POST with action=run and specific layer runs only that layer', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.post('/api/agents/evals', {
        headers: API_KEY_HEADER,
        data: { action: 'run', agent: agent.name, layer: 'output' },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      for (const r of body.results) {
        expect(r.layer).toBe('output')
      }
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  // ── POST — golden set ─────────────────────────

  test('POST with action=golden-set creates a golden set', async ({ request }) => {
    const name = `e2e-golden-${Date.now()}`
    const res = await request.post('/api/agents/evals', {
      headers: API_KEY_HEADER,
      data: {
        action: 'golden-set',
        name,
        entries: [{ input: 'test', expected: 'response' }],
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.name).toBe(name)
  })

  test('POST with action=golden-set requires name', async ({ request }) => {
    const res = await request.post('/api/agents/evals', {
      headers: API_KEY_HEADER,
      data: { action: 'golden-set' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST with unknown action returns 400', async ({ request }) => {
    const res = await request.post('/api/agents/evals', {
      headers: API_KEY_HEADER,
      data: { action: 'nonexistent' },
    })
    expect(res.status()).toBe(400)
  })
})
