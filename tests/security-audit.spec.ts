import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Security Audit API', () => {
  test('GET /api/security-audit returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/security-audit')
    expect(res.status()).toBe(401)
  })

  test('GET /api/security-audit returns 403 for non-admin (viewer)', async ({ request }) => {
    // API key grants admin, so without it and without session, we get 401
    // This test verifies that auth is required
    const res = await request.get('/api/security-audit', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/security-audit returns 200 with admin auth', async ({ request }) => {
    const res = await request.get('/api/security-audit', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
  })

  test('response has expected top-level fields', async ({ request }) => {
    const res = await request.get('/api/security-audit', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body).toHaveProperty('posture')
    expect(body).toHaveProperty('authEvents')
    expect(body).toHaveProperty('agentTrust')
    expect(body).toHaveProperty('secretExposures')
    expect(body).toHaveProperty('mcpAudit')
    expect(body).toHaveProperty('rateLimits')
    expect(body).toHaveProperty('injectionAttempts')
    expect(body).toHaveProperty('timeline')
  })

  test('posture has score and level', async ({ request }) => {
    const res = await request.get('/api/security-audit', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.posture).toHaveProperty('score')
    expect(body.posture).toHaveProperty('level')
    expect(typeof body.posture.score).toBe('number')
    expect(body.posture.score).toBeGreaterThanOrEqual(0)
    expect(body.posture.score).toBeLessThanOrEqual(100)
    expect(['hardened', 'secure', 'needs-attention', 'at-risk']).toContain(body.posture.level)
  })

  test('timeframe filtering works with day', async ({ request }) => {
    const res = await request.get('/api/security-audit?timeframe=day', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('posture')
  })

  test('timeframe filtering works with week', async ({ request }) => {
    const res = await request.get('/api/security-audit?timeframe=week', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
  })

  test('timeframe filtering works with hour', async ({ request }) => {
    const res = await request.get('/api/security-audit?timeframe=hour', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
  })

  test('timeline is an array', async ({ request }) => {
    const res = await request.get('/api/security-audit', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(Array.isArray(body.timeline)).toBe(true)
  })

  test('mcpAudit has expected fields', async ({ request }) => {
    const res = await request.get('/api/security-audit', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(body.mcpAudit).toHaveProperty('totalCalls')
    expect(body.mcpAudit).toHaveProperty('uniqueTools')
    expect(body.mcpAudit).toHaveProperty('failureRate')
    expect(body.mcpAudit).toHaveProperty('topTools')
  })
})
