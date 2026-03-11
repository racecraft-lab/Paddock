import { expect, test } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Gateway Connect API', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await request.delete('/api/gateways', {
        headers: API_KEY_HEADER,
        data: { id },
      }).catch(() => {})
    }
    cleanup.length = 0
  })

  test('returns ws_url and token for selected gateway', async ({ request }) => {
    const createRes = await request.post('/api/gateways', {
      headers: API_KEY_HEADER,
      data: {
        name: `e2e-gw-${Date.now()}`,
        host: 'https://example.tailnet.ts.net:4443/sessions',
        port: 18789,
        token: 'gw-token-123',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json()
    const gatewayId = createBody.gateway?.id as number
    cleanup.push(gatewayId)

    const connectRes = await request.post('/api/gateways/connect', {
      headers: API_KEY_HEADER,
      data: { id: gatewayId },
    })
    expect(connectRes.status()).toBe(200)
    const connectBody = await connectRes.json()

    expect(connectBody.ws_url).toBe('wss://example.tailnet.ts.net:4443')
    expect(connectBody.token).toBe('gw-token-123')
    expect(connectBody.token_set).toBe(true)
  })

  test('returns 404 for unknown gateway', async ({ request }) => {
    const res = await request.post('/api/gateways/connect', {
      headers: API_KEY_HEADER,
      data: { id: 999999 },
    })
    expect(res.status()).toBe(404)
  })

  test('preserves token query param from gateway host URL', async ({ request }) => {
    const createRes = await request.post('/api/gateways', {
      headers: API_KEY_HEADER,
      data: {
        name: `e2e-gw-token-url-${Date.now()}`,
        host: 'https://example.tailnet.ts.net:4443/sessions?token=url-token-123&foo=bar',
        port: 18789,
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json()
    const gatewayId = createBody.gateway?.id as number
    cleanup.push(gatewayId)

    const connectRes = await request.post('/api/gateways/connect', {
      headers: API_KEY_HEADER,
      data: { id: gatewayId },
    })
    expect(connectRes.status()).toBe(200)
    const connectBody = await connectRes.json()

    expect(connectBody.ws_url).toBe('wss://example.tailnet.ts.net:4443?token=url-token-123')
    expect(connectBody.token).toBe('')
    expect(connectBody.token_set).toBe(false)
  })

  test('uses wss when forwarded proto indicates https behind proxy', async ({ request }) => {
    const createRes = await request.post('/api/gateways', {
      headers: API_KEY_HEADER,
      data: {
        name: `e2e-gw-forwarded-proto-${Date.now()}`,
        host: 'example.tailnet.ts.net',
        port: 18789,
        token: 'forwarded-proto-token',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json()
    const gatewayId = createBody.gateway?.id as number
    cleanup.push(gatewayId)

    const connectRes = await request.post('/api/gateways/connect', {
      headers: {
        ...API_KEY_HEADER,
        'x-forwarded-proto': 'https',
      },
      data: { id: gatewayId },
    })
    expect(connectRes.status()).toBe(200)
    const connectBody = await connectRes.json()

    expect(connectBody.ws_url).toBe('wss://example.tailnet.ts.net')
    expect(connectBody.token).toBe('forwarded-proto-token')
    expect(connectBody.token_set).toBe(true)
  })
})
