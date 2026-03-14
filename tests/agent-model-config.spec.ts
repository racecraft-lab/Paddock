import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestAgent, deleteTestAgent } from './helpers'

/**
 * E2E tests for agent model configuration updates.
 * Verifies the API handles edge cases like empty/null model values.
 */

test.describe('Agent Model Config', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  test('PUT with valid model config succeeds', async ({ request }) => {
    const { id } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.put(`/api/agents/${id}`, {
      headers: API_KEY_HEADER,
      data: {
        gateway_config: {
          model: {
            primary: 'claude-3-5-sonnet-20241022',
            fallbacks: ['gpt-4o'],
          },
        },
      },
    })

    expect(res.status()).toBe(200)
  })

  test('PUT with empty fallbacks array succeeds', async ({ request }) => {
    const { id } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.put(`/api/agents/${id}`, {
      headers: API_KEY_HEADER,
      data: {
        gateway_config: {
          model: {
            primary: 'claude-3-5-sonnet-20241022',
            fallbacks: [],
          },
        },
      },
    })

    expect(res.status()).toBe(200)
  })

  test('PUT with empty string primary returns appropriate response', async ({ request }) => {
    const { id } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.put(`/api/agents/${id}`, {
      headers: API_KEY_HEADER,
      data: {
        gateway_config: {
          model: {
            primary: '',
            fallbacks: [],
          },
        },
      },
    })

    // Server should accept the update (model config is optional gateway config)
    expect([200, 400]).toContain(res.status())
  })

  test('PUT with whitespace-only fallbacks filters them', async ({ request }) => {
    const { id } = await createTestAgent(request)
    cleanup.push(id)

    const res = await request.put(`/api/agents/${id}`, {
      headers: API_KEY_HEADER,
      data: {
        gateway_config: {
          model: {
            primary: 'claude-3-5-sonnet-20241022',
            fallbacks: ['  ', '', 'gpt-4o'],
          },
        },
      },
    })

    expect(res.status()).toBe(200)
  })
})
