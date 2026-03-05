import { expect, test } from '@playwright/test'
import { API_KEY_HEADER, createTestTask, deleteTestTask } from './helpers'

test.describe('Task Queue API', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestTask(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  test('picks the next task and marks it in_progress for agent', async ({ request }) => {
    const low = await createTestTask(request, { priority: 'low', status: 'inbox' })
    const critical = await createTestTask(request, { priority: 'critical', status: 'inbox' })
    cleanup.push(low.id, critical.id)

    const res = await request.get('/api/tasks/queue?agent=queue-agent', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.reason).toBe('assigned')
    expect(body.task).toBeTruthy()
    expect(body.task.id).toBe(critical.id)
    expect(body.task.status).toBe('in_progress')
    expect(body.task.assigned_to).toBe('queue-agent')
  })

  test('returns current in_progress task as continue_current', async ({ request }) => {
    const task = await createTestTask(request, {
      status: 'in_progress',
      assigned_to: 'queue-agent-2',
      priority: 'high',
    })
    cleanup.push(task.id)

    const res = await request.get('/api/tasks/queue?agent=queue-agent-2', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.reason).toBe('continue_current')
    expect(body.task?.id).toBe(task.id)
  })

  test('validates max_capacity input', async ({ request }) => {
    const res = await request.get('/api/tasks/queue?agent=queue-agent-empty&max_capacity=999', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(400)
  })

  test('uses x-agent-name header when query param is omitted', async ({ request }) => {
    const task = await createTestTask(request, {
      status: 'assigned',
      assigned_to: 'header-agent',
      priority: 'high',
    })
    cleanup.push(task.id)

    const res = await request.get('/api/tasks/queue', {
      headers: { ...API_KEY_HEADER, 'x-agent-name': 'header-agent' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.reason).toBe('assigned')
    expect(body.agent).toBe('header-agent')
    expect(body.task?.id).toBe(task.id)
  })
})
