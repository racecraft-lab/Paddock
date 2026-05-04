#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  findReviewComment,
  normalizeRequiredSurfaces,
  parseReviewCommentBody,
  validateVisualApproval,
  visualReviewRequiredForFiles,
  VISUAL_REVIEW_STATUS_CONTEXT,
} from './visual-review-state.mjs'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const key = token.slice(2)
    if (key === 'set-status' || key === 'skip-if-no-visual-changes' || key === 'soft-fail') {
      args[key] = true
      continue
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`)
    args[key] = value
    i += 1
  }
  return args
}

async function readJsonIfPresent(filePath, fallback) {
  if (!filePath || !existsSync(filePath)) return fallback
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readGitHubEvent() {
  return readJsonIfPresent(process.env.GITHUB_EVENT_PATH, {})
}

function splitRepository(repository) {
  const [owner, repo] = String(repository || '').split('/')
  if (!owner || !repo) throw new Error('--repository or GITHUB_REPOSITORY must be owner/repo')
  return { owner, repo }
}

function actionRunUrl(repository) {
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const runId = process.env.GITHUB_RUN_ID
  return runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : ''
}

async function githubRequest(path, options = {}) {
  const token = options.token || process.env.GITHUB_TOKEN
  if (options.requireToken && !token) throw new Error('GITHUB_TOKEN is required')
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  if (token) headers.authorization = `Bearer ${token}`
  if (options.body) headers['content-type'] = 'application/json'

  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      detail = (await response.json()).message || detail
    } catch {
      // Use the status text.
    }
    throw new Error(`GitHub API ${response.status}: ${detail}`)
  }
  return response.status === 204 ? null : response.json()
}

async function resolvePrContext(args) {
  const event = await readGitHubEvent()
  const repository = args.repository || process.env.GITHUB_REPOSITORY
  const eventPr = event.pull_request || null
  const eventIssue = event.issue || null
  const issueIsPullRequest = Boolean(eventIssue?.pull_request)
  const prNumber = String(args['pr-number'] || eventPr?.number || (issueIsPullRequest ? eventIssue.number : '') || '')

  if (!prNumber && eventIssue && !issueIsPullRequest) {
    return { ignored: true, reason: 'issue_comment event is not for a pull request' }
  }
  if (!prNumber) throw new Error('--pr-number or pull_request event payload is required')

  let headSha = args['head-sha'] || eventPr?.head?.sha || ''
  if (!headSha && repository && (issueIsPullRequest || args['pr-number'])) {
    const pull = await githubRequest(`/repos/${repository}/pulls/${prNumber}`, { requireToken: true })
    headSha = pull.head?.sha || ''
  }
  if (!headSha) headSha = process.env.GITHUB_SHA || ''
  if (!headSha) throw new Error('--head-sha or pull_request.head.sha is required')

  return { headSha, prNumber, repository }
}

async function readComments(args, repository, prNumber) {
  if (args['comments-file']) {
    return JSON.parse(await readFile(args['comments-file'], 'utf8'))
  }
  const { owner, repo } = splitRepository(repository)
  return githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&sort=updated&direction=desc`, {
    requireToken: true,
  })
}

async function readPullRequestFiles(repository, prNumber) {
  const { owner, repo } = splitRepository(repository)
  const files = []
  for (let page = 1; page <= 10; page += 1) {
    const pageFiles = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { requireToken: true }
    )
    files.push(...pageFiles.map((file) => file.filename).filter(Boolean))
    if (pageFiles.length < 100) break
  }
  return files
}

async function postStatus({ args, context, result }) {
  if (!args['set-status']) return
  const { owner, repo } = splitRepository(context.repository)
  const state = result.approved ? 'success' : 'failure'
  const description = truncateStatusDescription(result.summary)
  const targetUrl = args['target-url'] || actionRunUrl(context.repository) || undefined

  await githubRequest(`/repos/${owner}/${repo}/statuses/${context.headSha}`, {
    body: {
      context: args.context || VISUAL_REVIEW_STATUS_CONTEXT,
      description,
      state,
      target_url: targetUrl,
    },
    method: 'POST',
    requireToken: true,
  })
}

function truncateStatusDescription(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim()
  return text.length <= 140 ? text : `${text.slice(0, 137)}...`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const context = await resolvePrContext(args)
  if (context.ignored) {
    console.log(`[visual-approval] ${context.reason}`)
    return
  }

  if (args['skip-if-no-visual-changes']) {
    const changedFiles = await readPullRequestFiles(context.repository, context.prNumber)
    if (!visualReviewRequiredForFiles(changedFiles)) {
      const result = {
        approved: true,
        failures: [],
        summary: 'Visual review not required for this PR',
      }
      await postStatus({ args, context, result })
      console.log(`[visual-approval] ${result.summary}`)
      return
    }
  }

  const comments = await readComments(args, context.repository, context.prNumber)
  const comment = findReviewComment(comments)
  const reviewState = comment ? parseReviewCommentBody(comment.body) : null
  const result = validateVisualApproval(reviewState, {
    headSha: context.headSha,
    prNumber: context.prNumber,
    repository: context.repository,
    requiredSurfaces: normalizeRequiredSurfaces(args['required-surfaces']),
  })

  await postStatus({ args, context, result })

  if (result.approved) {
    console.log(`[visual-approval] ${result.summary}`)
    return
  }

  console.error('[visual-approval] Visual review approval is blocked:')
  for (const failure of result.failures) {
    console.error(`- ${failure}`)
  }
  if (!args['soft-fail']) process.exitCode = 1
}

main().catch((error) => {
  console.error(`[visual-approval] ${error.stack || error.message}`)
  process.exitCode = 1
})
