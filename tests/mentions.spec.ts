import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent, createTestTask, deleteTestTask, createTestUser, deleteTestUser } from './helpers'

test.describe('Mentions (@users + @agents)', () => {
  const createdTaskIds: number[] = []
  const createdAgentIds: number[] = []
  const createdUserIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const taskId of createdTaskIds.splice(0)) {
      await deleteTestTask(request, taskId)
    }
    for (const agentId of createdAgentIds.splice(0)) {
      await deleteTestAgent(request, agentId)
    }
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(request, userId)
    }
  })

  test('task description mentions notify both user and agent', async ({ request }) => {
    const { id: agentId, name: agentName } = await createTestAgent(request)
    createdAgentIds.push(agentId)

    const { id: userId, username } = await createTestUser(request)
    createdUserIds.push(userId)

    const taskRes = await request.post('/api/tasks', {
      headers: API_KEY_HEADER,
      data: {
        title: `e2e-mention-task-${Date.now()}`,
        description: `Please review @${username} and @${agentName}`,
      },
    })

    expect(taskRes.status()).toBe(201)
    const taskBody = await taskRes.json()
    const taskId = Number(taskBody.task?.id)
    createdTaskIds.push(taskId)

    const userNotifsRes = await request.get(`/api/notifications?recipient=${encodeURIComponent(username)}`, {
      headers: API_KEY_HEADER,
    })
    expect(userNotifsRes.status()).toBe(200)
    const userNotifsBody = await userNotifsRes.json()
    expect(userNotifsBody.notifications.some((n: any) => n.type === 'mention' && n.source_type === 'task' && n.source_id === taskId)).toBe(true)

    const agentNotifsRes = await request.get(`/api/notifications?recipient=${encodeURIComponent(agentName)}`, {
      headers: API_KEY_HEADER,
    })
    expect(agentNotifsRes.status()).toBe(200)
    const agentNotifsBody = await agentNotifsRes.json()
    expect(agentNotifsBody.notifications.some((n: any) => n.type === 'mention' && n.source_type === 'task' && n.source_id === taskId)).toBe(true)
  })

  test('rejects unknown mention in task description', async ({ request }) => {
    const res = await request.post('/api/tasks', {
      headers: API_KEY_HEADER,
      data: {
        title: `e2e-mention-invalid-${Date.now()}`,
        description: 'invalid mention @does-not-exist-xyz',
      },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(String(body.error || '')).toContain('Unknown mentions')
  })

  test('rejects unknown mention in comments', async ({ request }) => {
    const { id: taskId } = await createTestTask(request)
    createdTaskIds.push(taskId)

    const res = await request.post(`/api/tasks/${taskId}/comments`, {
      headers: API_KEY_HEADER,
      data: {
        author: 'system',
        content: 'hello @not-a-real-target-zz',
      },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(String(body.error || '')).toContain('Unknown mentions')
  })
})
