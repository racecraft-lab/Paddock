import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Task Outcomes API', () => {
  test('POST /api/tasks with done status auto-populates completed_at and stores outcome fields', async ({ request }) => {
    const title = `e2e-outcome-task-${Date.now()}`
    const res = await request.post('/api/tasks', {
      headers: API_KEY_HEADER,
      data: {
        title,
        status: 'done',
        outcome: 'success',
        feedback_rating: 5,
        feedback_notes: 'Resolved cleanly',
        retry_count: 1,
      },
    })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.task.title).toBe(title)
    expect(body.task.status).toBe('done')
    expect(body.task.outcome).toBe('success')
    expect(body.task.feedback_rating).toBe(5)
    expect(body.task.retry_count).toBe(1)
    expect(typeof body.task.completed_at).toBe('number')
    expect(body.task.completed_at).toBeGreaterThan(0)
  })

  test('GET /api/tasks/outcomes returns summary and error patterns', async ({ request }) => {
    const base = Date.now()

    const successRes = await request.post('/api/tasks', {
      headers: API_KEY_HEADER,
      data: {
        title: `e2e-outcome-success-${base}`,
        status: 'done',
        assigned_to: 'outcome-agent-a',
        priority: 'high',
        outcome: 'success',
      },
    })
    expect(successRes.status()).toBe(201)

    const failedRes = await request.post('/api/tasks', {
      headers: API_KEY_HEADER,
      data: {
        title: `e2e-outcome-failed-${base}`,
        status: 'done',
        assigned_to: 'outcome-agent-b',
        priority: 'medium',
        outcome: 'failed',
        error_message: 'Dependency timeout',
        resolution: 'Increased timeout and retried',
        retry_count: 2,
      },
    })
    expect(failedRes.status()).toBe(201)

    const metrics = await request.get('/api/tasks/outcomes?timeframe=all', {
      headers: API_KEY_HEADER,
    })
    expect(metrics.status()).toBe(200)
    const body = await metrics.json()

    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('by_agent')
    expect(body).toHaveProperty('by_priority')
    expect(body).toHaveProperty('common_errors')

    expect(body.summary.total_done).toBeGreaterThanOrEqual(2)
    expect(body.summary.by_outcome.success).toBeGreaterThanOrEqual(1)
    expect(body.summary.by_outcome.failed).toBeGreaterThanOrEqual(1)
    expect(body.by_agent['outcome-agent-a'].success).toBeGreaterThanOrEqual(1)
    expect(body.by_agent['outcome-agent-b'].failed).toBeGreaterThanOrEqual(1)

    const timeoutError = body.common_errors.find((e: any) => e.error_message === 'Dependency timeout')
    expect(timeoutError).toBeTruthy()
  })

  test('GET /api/tasks/outcomes requires auth', async ({ request }) => {
    const res = await request.get('/api/tasks/outcomes?timeframe=all')
    expect(res.status()).toBe(401)
  })
})
