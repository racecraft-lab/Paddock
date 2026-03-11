import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test.describe('Chat Session Preferences API', () => {
  test('PATCH + GET roundtrip for local session rename and color tag', async ({ request }) => {
    const key = `codex-cli:e2e-${uid()}`

    const patchRes = await request.patch('/api/chat/session-prefs', {
      headers: API_KEY_HEADER,
      data: {
        key,
        name: 'E2E Session Name',
        color: 'teal',
      },
    })

    expect(patchRes.status()).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.ok).toBeTruthy()
    expect(patchBody.pref?.name).toBe('E2E Session Name')
    expect(patchBody.pref?.color).toBe('teal')

    const getRes = await request.get('/api/chat/session-prefs', { headers: API_KEY_HEADER })
    expect(getRes.status()).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.prefs?.[key]?.name).toBe('E2E Session Name')
    expect(getBody.prefs?.[key]?.color).toBe('teal')

    const clearRes = await request.patch('/api/chat/session-prefs', {
      headers: API_KEY_HEADER,
      data: {
        key,
        name: null,
        color: null,
      },
    })
    expect(clearRes.status()).toBe(200)
    const clearBody = await clearRes.json()
    expect(clearBody.ok).toBeTruthy()
    expect(clearBody.pref).toBeNull()

    const getAfterClear = await request.get('/api/chat/session-prefs', { headers: API_KEY_HEADER })
    const afterBody = await getAfterClear.json()
    expect(afterBody.prefs?.[key]).toBeUndefined()
  })

  test('PATCH rejects invalid color', async ({ request }) => {
    const key = `claude-code:e2e-${uid()}`

    const res = await request.patch('/api/chat/session-prefs', {
      headers: API_KEY_HEADER,
      data: {
        key,
        color: 'magenta',
      },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid color')
  })
})
