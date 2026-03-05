import { expect, test } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Agent Attribution API', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  test('allows self-scope access using x-agent-name attribution header', async ({ request }) => {
    const { id, name } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.get(`/api/agents/${id}/attribution`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.agent_name).toBe(name)
    expect(body.access_scope).toBe('self')
  })

  test('denies cross-agent attribution access by default', async ({ request }) => {
    const primary = await createTestAgent(request)
    const other = await createTestAgent(request)
    cleanup.push(primary.id, other.id)

    const res = await request.get(`/api/agents/${primary.id}/attribution`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': other.name },
    })

    expect(res.status()).toBe(403)
  })

  test('allows privileged override for admin caller', async ({ request }) => {
    const primary = await createTestAgent(request)
    const other = await createTestAgent(request)
    cleanup.push(primary.id, other.id)

    const res = await request.get(`/api/agents/${primary.id}/attribution?privileged=1`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': other.name },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.access_scope).toBe('privileged')
  })

  test('validates section parameter and timeframe hours', async ({ request }) => {
    const { id, name } = await createTestAgent(request)
    cleanup.push(id)

    const sectionRes = await request.get(`/api/agents/${id}/attribution?section=identity&hours=48`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })
    expect(sectionRes.status()).toBe(200)
    const sectionBody = await sectionRes.json()
    expect(sectionBody.timeframe.hours).toBe(48)
    expect(sectionBody.identity).toBeDefined()
    expect(sectionBody.audit).toBeUndefined()
    expect(sectionBody.mutations).toBeUndefined()
    expect(sectionBody.cost).toBeUndefined()

    const invalidSection = await request.get(`/api/agents/${id}/attribution?section=unknown`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })
    expect(invalidSection.status()).toBe(400)

    const invalidHours = await request.get(`/api/agents/${id}/attribution?hours=0`, {
      headers: { ...API_KEY_HEADER, 'x-agent-name': name },
    })
    expect(invalidHours.status()).toBe(400)
  })
})
