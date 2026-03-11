import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Agent Optimize API', () => {
  test('GET /api/agents/optimize returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/agents/optimize?agent=test')
    expect(res.status()).toBe(401)
  })

  test('GET /api/agents/optimize returns 400 without agent param', async ({ request }) => {
    const res = await request.get('/api/agents/optimize', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('agent')
  })

  test('GET /api/agents/optimize returns 200 with agent param', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/optimize?agent=${agent.name}`, { headers: API_KEY_HEADER })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('agent')
      expect(body).toHaveProperty('efficiency')
      expect(body).toHaveProperty('toolPatterns')
      expect(body).toHaveProperty('performance')
      expect(body).toHaveProperty('recommendations')
      expect(body.agent).toBe(agent.name)
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  test('efficiency has expected fields', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/optimize?agent=${agent.name}`, { headers: API_KEY_HEADER })
      const body = await res.json()
      expect(body.efficiency).toHaveProperty('tokensPerTask')
      expect(body.efficiency).toHaveProperty('fleetAverage')
      expect(body.efficiency).toHaveProperty('percentile')
      expect(body.efficiency).toHaveProperty('costPerTask')
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  test('toolPatterns has mostUsed and leastEffective arrays', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/optimize?agent=${agent.name}`, { headers: API_KEY_HEADER })
      const body = await res.json()
      expect(Array.isArray(body.toolPatterns.mostUsed)).toBe(true)
      expect(Array.isArray(body.toolPatterns.leastEffective)).toBe(true)
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })

  test('recommendations is an array', async ({ request }) => {
    const agent = await createTestAgent(request)
    try {
      const res = await request.get(`/api/agents/optimize?agent=${agent.name}`, { headers: API_KEY_HEADER })
      const body = await res.json()
      expect(Array.isArray(body.recommendations)).toBe(true)
    } finally {
      await deleteTestAgent(request, agent.id)
    }
  })
})
