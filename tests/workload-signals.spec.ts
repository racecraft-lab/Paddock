import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent, createTestTask, deleteTestTask } from './helpers'

test.describe('Workload Signals API', () => {
  const agentCleanup: number[] = []
  const taskCleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of taskCleanup) {
      await deleteTestTask(request, id).catch(() => {})
    }
    taskCleanup.length = 0

    for (const id of agentCleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    agentCleanup.length = 0
  })

  test('returns normal recommendation under light load', async ({ request }) => {
    const { id } = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(id)

    const res = await request.get('/api/workload', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.recommendation.action).toBe('normal')
    expect(body.recommendation.submit_ok).toBe(true)
  })

  test('returns throttle recommendation at high busy ratio', async ({ request }) => {
    const idleAgent = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(idleAgent.id)
    for (let i = 0; i < 4; i++) {
      const busyAgent = await createTestAgent(request, { status: 'busy' })
      agentCleanup.push(busyAgent.id)
    }

    const res = await request.get('/api/workload', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.recommendation.action).toBe('throttle')
    expect(body.recommendation.submit_ok).toBe(true)
  })

  test('returns shed recommendation at critical busy ratio', async ({ request }) => {
    const idleAgent = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(idleAgent.id)
    for (let i = 0; i < 19; i++) {
      const busyAgent = await createTestAgent(request, { status: 'busy' })
      agentCleanup.push(busyAgent.id)
    }

    const res = await request.get('/api/workload', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.recommendation.action).toBe('shed')
    expect(body.recommendation.submit_ok).toBe(false)
  })

  test('returns pause recommendation when no agents are online', async ({ request }) => {
    const res = await request.get('/api/workload', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.agents.online).toBe(0)
    expect(body.recommendation.action).toBe('pause')
    expect(body.recommendation.submit_ok).toBe(false)
  })

  test('returns consistent response for low-signal conditions', async ({ request }) => {
    const { id } = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(id)

    const task = await createTestTask(request, { status: 'inbox' })
    taskCleanup.push(task.id)

    const res = await request.get('/api/workload', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.capacity.error_rate_5m).toBeGreaterThanOrEqual(0)
    expect(body.capacity.error_rate_5m).toBeLessThanOrEqual(1)
    expect(body.queue.by_status).toHaveProperty('inbox')
    expect(body.queue.by_status).toHaveProperty('assigned')
    expect(body.queue.by_status).toHaveProperty('in_progress')
    expect(body.queue.by_priority).toHaveProperty('critical')
    expect(body.queue.by_priority).toHaveProperty('high')
    expect(body.queue.by_priority).toHaveProperty('medium')
    expect(body.queue.by_priority).toHaveProperty('low')
    expect(['calculated', 'unknown']).toContain(body.queue.estimated_wait_confidence)
  })
})
