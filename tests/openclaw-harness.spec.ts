import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

const EXPECT_GATEWAY = process.env.E2E_GATEWAY_EXPECTED === '1'

test.describe('OpenClaw Offline Harness', () => {
  test('capabilities expose OpenClaw state dir/config in offline test mode', async ({ request }) => {
    const res = await request.get('/api/status?action=capabilities', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.openclawHome).toBe(true)
    expect(Boolean(body.claudeHome)).toBeTruthy()
    expect(Boolean(body.gateway)).toBe(EXPECT_GATEWAY)
  })

  test('sessions API reads fixture sessions without OpenClaw install', async ({ request }) => {
    const res = await request.get('/api/sessions', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body.sessions)).toBe(true)
    expect(body.sessions.length).toBeGreaterThan(0)
    expect(body.sessions[0]).toHaveProperty('agent')
    expect(body.sessions[0]).toHaveProperty('tokens')
  })

  test('cron API reads fixture jobs', async ({ request }) => {
    const res = await request.get('/api/cron?action=list', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body.jobs)).toBe(true)
    expect(body.jobs.length).toBeGreaterThan(0)
    expect(body.jobs[0]).toHaveProperty('name')
    expect(body.jobs[0]).toHaveProperty('schedule')
  })

  test('gateway config API reads fixture config', async ({ request }) => {
    const res = await request.get('/api/gateway-config', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(typeof body.path).toBe('string')
    expect(body.path.endsWith('openclaw.json')).toBe(true)
    expect(body.config).toHaveProperty('agents')
  })
})
