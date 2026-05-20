import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEffectiveEnvValueMock } = vi.hoisted(() => ({
  getEffectiveEnvValueMock: vi.fn<
    (key: string) => Promise<string>
  >(),
}))

vi.mock('@/lib/runtime-env', () => ({
  getEffectiveEnvValue: getEffectiveEnvValueMock,
}))

import { GitHubUrlValidationError, fetchIssues, githubFetch } from '@/lib/github'

describe('githubFetch URL validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()

    getEffectiveEnvValueMock.mockImplementation(async (key: string) => {
      if (key === 'GITHUB_TOKEN') return 'test-token'
      if (key === 'GITHUB_API_BASE_URL') return ''
      return ''
    })
  })

  it('allows normal API paths under the GitHub API base', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('/repos/foo/bar/issues')).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/foo/bar/issues',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('rejects protocol-relative escape paths', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('//evil.com/path')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects absolute external URLs', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('https://evil.com/path')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects absolute URLs even when they target the GitHub API host', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('https://api.github.com/repos/foo/bar/issues')).rejects.toThrow(
      GitHubUrlValidationError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects protocol downgrade attempts to the GitHub API host', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('http://api.github.com/repos/foo/bar/issues')).rejects.toThrow(
      GitHubUrlValidationError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects repository slugs that would escape the expected API path', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchIssues('owner/repo/../../user')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects repository slugs that inject query syntax into the API path', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchIssues('owner/repo?per_page=100')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('URL-encodes validated repository slugs before fetching issues', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchIssues('owner-name/repo.name')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner-name/repo.name/issues?per_page=30&page=1',
      expect.any(Object)
    )
  })
})
