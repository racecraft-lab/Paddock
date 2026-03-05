import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Agent Diagnostics API', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  test('self access is allowed with x-agent-name', async ({ request }) => {
    const { id, name } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.get(`/api/agents/${name}/diagnostics?section=summary`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.agent.name).toBe(name)
    expect(body.summary).toBeDefined()
  })

  test('cross-agent access is denied by default', async ({ request }) => {
    const a = await createTestAgent(request)
    const b = await createTestAgent(request)
    cleanup.push(a.id, b.id)

    const res = await request.get(`/api/agents/${a.name}/diagnostics?section=summary`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': b.name },
    })

    expect(res.status()).toBe(403)
  })

  test('cross-agent access is allowed with privileged=1 for admin', async ({ request }) => {
    const a = await createTestAgent(request)
    const b = await createTestAgent(request)
    cleanup.push(a.id, b.id)

    const res = await request.get(`/api/agents/${a.name}/diagnostics?section=summary&privileged=1`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': b.name },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.agent.name).toBe(a.name)
    expect(body.summary).toBeDefined()
  })

  test('invalid section query is rejected', async ({ request }) => {
    const { id, name } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.get(`/api/agents/${name}/diagnostics?section=summary,invalid`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })

    expect(res.status()).toBe(400)
  })

  test('invalid hours query is rejected', async ({ request }) => {
    const { id, name } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.get(`/api/agents/${name}/diagnostics?hours=0`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })

    expect(res.status()).toBe(400)
  })
})
