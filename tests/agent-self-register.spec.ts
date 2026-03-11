import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, deleteTestAgent } from './helpers'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test.describe('Agent Self-Registration', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  // ── POST /api/agents/register ─────────────────────────

  test('POST registers a new agent', async ({ request }) => {
    const name = `self-reg-${uid()}`
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name, role: 'coder' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.registered).toBe(true)
    expect(body.agent.name).toBe(name)
    expect(body.agent.role).toBe('coder')
    expect(body.agent.status).toBe('idle')
    cleanup.push(body.agent.id)
  })

  test('POST is idempotent for existing agent', async ({ request }) => {
    const name = `self-reg-idem-${uid()}`
    // First registration
    const res1 = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name, role: 'coder' },
    })
    expect(res1.status()).toBe(201)
    const body1 = await res1.json()
    cleanup.push(body1.agent.id)

    // Second registration — should return existing
    const res2 = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name, role: 'coder' },
    })
    expect(res2.status()).toBe(200)
    const body2 = await res2.json()
    expect(body2.registered).toBe(false)
    expect(body2.agent.id).toBe(body1.agent.id)
  })

  test('POST rejects missing name', async ({ request }) => {
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { role: 'coder' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST rejects invalid name characters', async ({ request }) => {
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name: '../bad-agent', role: 'coder' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST rejects name starting with dot', async ({ request }) => {
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name: '.hidden-agent', role: 'coder' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST rejects invalid role', async ({ request }) => {
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name: `agent-${uid()}`, role: 'superuser' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('role')
  })

  test('POST defaults role to agent', async ({ request }) => {
    const name = `default-role-${uid()}`
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.agent.role).toBe('agent')
    cleanup.push(body.agent.id)
  })

  test('POST accepts capabilities and framework', async ({ request }) => {
    const name = `capable-${uid()}`
    const res = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: {
        name,
        role: 'coder',
        capabilities: ['code-review', 'testing'],
        framework: 'claude-sdk',
      },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.agent.name).toBe(name)
    cleanup.push(body.agent.id)

    // Verify capabilities stored in config
    const agentRes = await request.get('/api/agents', { headers: API_KEY_HEADER })
    const agentBody = await agentRes.json()
    const found = agentBody.agents.find((a: any) => a.name === name)
    expect(found).toBeDefined()
    expect(found.config.capabilities).toEqual(['code-review', 'testing'])
    expect(found.config.framework).toBe('claude-sdk')
  })

  test('POST appears in agents list after registration', async ({ request }) => {
    const name = `listed-${uid()}`
    const regRes = await request.post('/api/agents/register', {
      headers: API_KEY_HEADER,
      data: { name, role: 'tester' },
    })
    const regBody = await regRes.json()
    cleanup.push(regBody.agent.id)

    const listRes = await request.get('/api/agents', { headers: API_KEY_HEADER })
    const listBody = await listRes.json()
    const found = listBody.agents.find((a: any) => a.name === name)
    expect(found).toBeDefined()
    expect(found.role).toBe('tester')
    expect(found.status).toBe('idle')
  })
})
