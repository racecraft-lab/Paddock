import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Sessions Continue API', () => {
  test('requires auth', async ({ request }) => {
    const res = await request.post('/api/sessions/continue', {
      data: {
        kind: 'claude-code',
        id: 'abc123',
        prompt: 'ping',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects invalid kind', async ({ request }) => {
    const res = await request.post('/api/sessions/continue', {
      headers: API_KEY_HEADER,
      data: {
        kind: 'gateway',
        id: 'abc123',
        prompt: 'ping',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects invalid session id', async ({ request }) => {
    const res = await request.post('/api/sessions/continue', {
      headers: API_KEY_HEADER,
      data: {
        kind: 'codex-cli',
        id: 'abc/../bad',
        prompt: 'ping',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects empty prompt', async ({ request }) => {
    const res = await request.post('/api/sessions/continue', {
      headers: API_KEY_HEADER,
      data: {
        kind: 'claude-code',
        id: 'abc123',
        prompt: '   ',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects oversized prompt', async ({ request }) => {
    const res = await request.post('/api/sessions/continue', {
      headers: API_KEY_HEADER,
      data: {
        kind: 'codex-cli',
        id: 'abc123',
        prompt: 'x'.repeat(6001),
      },
    })
    expect(res.status()).toBe(400)
  })
})
