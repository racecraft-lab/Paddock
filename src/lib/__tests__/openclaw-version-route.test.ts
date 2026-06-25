import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runOpenClaw = vi.fn()

vi.mock('@/lib/command', () => ({
  runOpenClaw,
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('/api/openclaw/version', () => {
  beforeEach(() => {
    vi.resetModules()
    runOpenClaw.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports update available when installed is behind latest stable tag', async () => {
    runOpenClaw.mockResolvedValue({
      stdout: 'openclaw 2026.6.5',
      stderr: '',
      code: 0,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          tag_name: 'v2026.6.15',
          html_url: 'https://github.com/openclaw/openclaw/releases/tag/v2026.6.15',
          body: 'Stable bugfix release',
        })
      )
    )

    const { GET } = await import('@/app/api/openclaw/version/route')
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      installed: '2026.6.5',
      latest: '2026.6.15',
      updateAvailable: true,
      releaseUrl: 'https://github.com/openclaw/openclaw/releases/tag/v2026.6.15',
      releaseNotes: 'Stable bugfix release',
      updateCommand: 'openclaw update --channel stable',
    })
  })

  it('ignores pre-release tags when checking updates', async () => {
    runOpenClaw.mockResolvedValue({
      stdout: 'openclaw 2026.6.5',
      stderr: '',
      code: 0,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          tag_name: 'v2026.6.15-alpha.1',
          html_url: 'https://github.com/openclaw/openclaw/releases/tag/v2026.6.15-alpha.1',
          body: 'Alpha release',
        })
      )
    )

    const { GET } = await import('@/app/api/openclaw/version/route')
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      installed: '2026.6.5',
      latest: null,
      updateAvailable: false,
    })
    expect(payload.releaseUrl).toBe('https://github.com/openclaw/openclaw/releases/tag/v2026.6.15-alpha.1')
  })

  it('returns no update if release tag is malformed', async () => {
    runOpenClaw.mockResolvedValue({
      stdout: 'openclaw 2026.6.5',
      stderr: '',
      code: 0,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ tag_name: 'release-2026.6.15', body: 'weird tag' })))

    const { GET } = await import('@/app/api/openclaw/version/route')
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      installed: '2026.6.5',
      latest: null,
      updateAvailable: false,
    })
  })

  it('returns null installed and no update when version command is unavailable', async () => {
    runOpenClaw.mockRejectedValue(new Error('not found'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ tag_name: 'v2026.6.15' })))

    const { GET } = await import('@/app/api/openclaw/version/route')
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ installed: null, latest: null, updateAvailable: false })
  })
})
