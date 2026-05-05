import {
  findReviewComment,
  parseReviewCommentBody,
} from './visual-review-state.mjs'

const DEFAULT_GITHUB_API_URL = 'https://api.github.com'
const DEFAULT_GITHUB_SERVER_URL = 'https://github.com'

export function githubApiHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function normalizeSourcePullRequest(pullRequest, {
  baseUrl,
  githubServerUrl = DEFAULT_GITHUB_SERVER_URL,
  repository,
} = {}) {
  const number = String(pullRequest?.number || '')
  if (!number) return null

  return {
    baseRef: String(pullRequest?.base?.ref || pullRequest?.baseRef || ''),
    headRef: String(pullRequest?.head?.ref || pullRequest?.headRef || ''),
    headSha: String(pullRequest?.head?.sha || pullRequest?.headSha || ''),
    indexHref: `${String(baseUrl || '').replace(/\/+$/, '')}/pr/${number}/`,
    mergeCommitSha: String(pullRequest?.merge_commit_sha || pullRequest?.mergeCommitSha || ''),
    number,
    title: String(pullRequest?.title || `PR #${number}`),
    url: String(pullRequest?.html_url || `${githubServerUrl}/${repository}/pull/${number}`),
  }
}

export function pullRequestNumberFromText(text) {
  const value = String(text || '')
  const patterns = [
    /Merge pull request #(\d+)\b/,
    /\(#(\d+)\)\s*$/,
    /\(#(\d+)\)/,
    /\/pull\/(\d+)\b/,
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) return match[1]
  }
  return ''
}

export function titleFromCommitMessage(message, prNumber) {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines[0]?.startsWith(`Merge pull request #${prNumber}`) && lines[1]) {
    return lines[1]
  }

  const firstLine = lines[0] || ''
  return firstLine.replace(new RegExp(`\\s*\\(#${prNumber}\\)\\s*$`), '').trim()
}

export function sourcePullRequestFromEvent(event, {
  baseUrl,
  githubServerUrl = DEFAULT_GITHUB_SERVER_URL,
  repository,
} = {}) {
  const eventPullRequest = normalizeSourcePullRequest(event?.pull_request, {
    baseUrl,
    githubServerUrl,
    repository,
  })
  if (eventPullRequest) return eventPullRequest

  const messages = [
    event?.head_commit?.message,
    ...(Array.isArray(event?.commits) ? event.commits.map((commit) => commit?.message) : []),
  ].filter(Boolean)

  for (const message of messages) {
    const number = pullRequestNumberFromText(message)
    if (!number) continue
    return normalizeSourcePullRequest({
      html_url: `${githubServerUrl}/${repository}/pull/${number}`,
      number,
      title: titleFromCommitMessage(message, number) || `PR #${number}`,
    }, { baseUrl, githubServerUrl, repository })
  }

  return null
}

export async function sourcePullRequestFromCommit({
  baseUrl,
  fetch = globalThis.fetch,
  githubApiUrl = DEFAULT_GITHUB_API_URL,
  githubServerUrl = DEFAULT_GITHUB_SERVER_URL,
  headSha,
  repository,
  token,
  warn = console.warn,
}) {
  if (!token || !headSha || headSha === 'unknown' || typeof fetch !== 'function') return null

  const { owner, repo } = repoParts(repository)
  const endpoint = `${githubApiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(headSha)}/pulls?per_page=10`
  const response = await fetch(endpoint, {
    headers: githubApiHeaders(token),
  })

  if (!response.ok) {
    warn(`[visual-review-pages] unable to resolve source PR for ${headSha}: GitHub API ${response.status}`)
    return null
  }

  const pullRequests = await response.json()
  if (!Array.isArray(pullRequests) || pullRequests.length === 0) return null
  return normalizeSourcePullRequest(
    pullRequests.find((pullRequest) => pullRequest?.merged_at) || pullRequests[0],
    { baseUrl, githubServerUrl, repository }
  )
}

export async function commitHistoryShasFromGitHub({
  fetch = globalThis.fetch,
  githubApiUrl = DEFAULT_GITHUB_API_URL,
  headRef,
  headSha,
  repository,
  token,
  warn = console.warn,
}) {
  const startRef = headSha && headSha !== 'unknown' ? headSha : headRef
  if (!token || !startRef || startRef === 'unknown' || typeof fetch !== 'function') return []

  const { owner, repo } = repoParts(repository)
  const endpoint = `${githubApiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(startRef)}&per_page=25`
  const response = await fetch(endpoint, {
    headers: githubApiHeaders(token),
  })

  if (!response.ok) {
    warn(`[visual-review-pages] unable to load commit history for ${startRef}: GitHub API ${response.status}`)
    return []
  }

  const commits = await response.json()
  if (!Array.isArray(commits)) return []
  return uniqueStrings(commits.map((commit) => String(commit?.sha || '')))
}

export async function initialReviewStateFromPullRequest({
  fetch = globalThis.fetch,
  githubApiUrl = DEFAULT_GITHUB_API_URL,
  repository,
  sourcePullRequest,
  token,
  warn = console.warn,
}) {
  if (!token || !sourcePullRequest?.number || typeof fetch !== 'function') return null

  const { owner, repo } = repoParts(repository)
  const comments = []
  for (let page = 1; page <= 10; page += 1) {
    const endpoint = `${githubApiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(sourcePullRequest.number)}/comments?per_page=100&page=${page}`
    const response = await fetch(endpoint, {
      headers: githubApiHeaders(token),
    })

    if (!response.ok) {
      warn(
        `[visual-review-pages] unable to load source PR #${sourcePullRequest.number} review state: GitHub API ${response.status}`
      )
      return null
    }

    const pageComments = await response.json()
    if (Array.isArray(pageComments)) comments.push(...pageComments)
    if (!responseHasNextPage(response)) break
  }

  const comment = findReviewComment(comments)
  const state = parseReviewCommentBody(comment?.body)
  if (!comment || !state) return null

  return {
    author: String(comment.user?.login || ''),
    commentId: comment.id || null,
    state,
  }
}

export function reviewItemId(item, variant) {
  const fileName = itemFileName(item)
  return fileName ? `${variant}-${fileName}`.replace(/[=?&]/g, '-') : ''
}

export function reviewableReportItemIds(payload) {
  return uniqueStrings([
    ...reportItems(payload, 'failedItems').map((item) => reviewItemId(item, 'changed')),
    ...reportItems(payload, 'newItems').map((item) => reviewItemId(item, 'new')),
    ...reportItems(payload, 'deletedItems').map((item) => reviewItemId(item, 'deleted')),
  ])
}

export function reviewStateCoversReport({ state, surface, payload }) {
  const surfaceState = state?.surfaces?.[surface]
  if (!surfaceState || typeof surfaceState !== 'object') return false

  const reviewableIds = reviewableReportItemIds(payload)
  if (reviewableIds.length === 0) return true

  const decisions = surfaceState.decisions && typeof surfaceState.decisions === 'object'
    ? surfaceState.decisions
    : {}
  return reviewableIds.every((id) => {
    const decision = decisions[id]?.decision
    return decision === 'approved' || decision === 'rejected'
  })
}

export async function coveredInitialReviewState({
  fetch = globalThis.fetch,
  githubApiUrl = DEFAULT_GITHUB_API_URL,
  payload,
  repository,
  sourcePullRequest,
  surface,
  token,
  warn = console.warn,
}) {
  const initialReviewState = await initialReviewStateFromPullRequest({
    fetch,
    githubApiUrl,
    repository,
    sourcePullRequest,
    token,
    warn,
  })
  if (!initialReviewState) return null
  if (!reviewStateCoversReport({ state: initialReviewState.state, surface, payload })) return null
  return initialReviewState
}

export async function resolveInitialReviewStateSource({
  baseUrl,
  event = {},
  fetch = globalThis.fetch,
  githubApiUrl = DEFAULT_GITHUB_API_URL,
  githubServerUrl = DEFAULT_GITHUB_SERVER_URL,
  headRef,
  headSha,
  options = {},
  payload,
  repository,
  surface,
  token,
  warn = console.warn,
}) {
  const shared = {
    baseUrl,
    fetch,
    githubApiUrl,
    githubServerUrl,
    payload,
    repository,
    surface,
    token,
    warn,
  }
  const explicit = normalizeSourcePullRequest({
    html_url: options['source-pr-url'],
    number: options['source-pr-number'],
    title: options['source-pr-title'],
  }, { baseUrl, githubServerUrl, repository })
  if (explicit) return sourceWithState({ ...shared, sourcePullRequest: explicit })

  const exact = await sourcePullRequestFromCommit({ ...shared, headSha })
  if (exact) return sourceWithState({ ...shared, sourcePullRequest: exact })

  const eventPullRequest = sourcePullRequestFromEvent(event, { baseUrl, githubServerUrl, repository })
  if (eventPullRequest) return sourceWithState({ ...shared, sourcePullRequest: eventPullRequest })

  const triedPullRequests = new Set()
  const historyShas = await commitHistoryShasFromGitHub({
    fetch,
    githubApiUrl,
    headRef,
    headSha,
    repository,
    token,
    warn,
  })
  for (const candidateSha of historyShas.filter((candidate) => candidate !== headSha)) {
    const candidate = await sourcePullRequestFromCommit({ ...shared, headSha: candidateSha })
    if (!candidate || triedPullRequests.has(candidate.number)) continue
    triedPullRequests.add(candidate.number)

    const initialReviewState = await coveredInitialReviewState({
      ...shared,
      sourcePullRequest: candidate,
    })
    if (initialReviewState) {
      return { initialReviewState, sourcePullRequest: candidate }
    }
  }

  return { initialReviewState: null, sourcePullRequest: null }
}

async function sourceWithState(args) {
  return {
    initialReviewState: await coveredInitialReviewState(args),
    sourcePullRequest: args.sourcePullRequest,
  }
}

function repoParts(repository) {
  const [owner, repo] = String(repository || '').split('/')
  if (!owner || !repo) {
    throw new Error('repository must be set to owner/repo')
  }

  return { owner, repo }
}

function responseHasNextPage(response) {
  const link = response.headers?.get?.('link') || ''
  return /\brel="next"/.test(link)
}

function reportItems(payload, key) {
  return Array.isArray(payload?.[key]) ? payload[key] : []
}

function itemFileName(item) {
  const fileName = item?.encoded || item?.raw
  return typeof fileName === 'string' && fileName.length > 0 ? fileName : null
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)))
}
