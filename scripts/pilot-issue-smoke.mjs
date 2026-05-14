#!/usr/bin/env node

export const PILOT_REPO = 'racecraft-lab/mission-control'
export const SYNTHETIC_TITLE = '[mc-pilot] synthetic e2e issue'
export const SYNTHETIC_LABELS = ['mc:inbox', 'priority:medium', 'area:dev']

export async function findOrCreateSyntheticPilotIssue(options) {
  const client = options.client
  const repository = options.repository ?? PILOT_REPO
  const existing = await client.findOpenIssueByTitle(repository, SYNTHETIC_TITLE)

  if (existing) {
    const missingLabels = missingSyntheticLabels(existing.labels ?? [])
    if (missingLabels.length > 0) {
      return redactPilotSmokeValue({
        ok: false,
        error: 'synthetic_issue_label_mismatch',
        mutation_status: 'not_mutated',
        operation: 'synthetic_fallback',
        evidence: {
          repository,
          issueNumber: existing.number,
          missing_labels: missingLabels,
        },
      })
    }

    return {
      ok: true,
      created: false,
      mutation_status: 'not_mutated',
      issue: safeIssue(existing),
    }
  }

  if (options.allowLiveMutation !== true) {
    return {
      ok: false,
      error: 'missing_live_mutation_opt_in',
      mutation_status: 'not_mutated',
      operation: 'synthetic_fallback',
      evidence: { repository, title: SYNTHETIC_TITLE },
    }
  }

  if (!String(options.token ?? '').trim()) {
    return {
      ok: false,
      error: 'missing_credentials',
      mutation_status: 'not_mutated',
      operation: 'synthetic_fallback',
      evidence: { repository, token_set: false },
    }
  }

  try {
    const issue = await client.createIssue({
      repository,
      title: SYNTHETIC_TITLE,
      labels: [...SYNTHETIC_LABELS],
    })
    return {
      ok: true,
      created: true,
      mutation_status: 'created_issue',
      issue: safeIssue(issue),
    }
  } catch (error) {
    return redactPilotSmokeValue({
      ok: false,
      error: isPermissionError(error) ? 'insufficient_permissions' : 'synthetic_issue_create_failed',
      mutation_status: 'not_mutated',
      operation: 'synthetic_fallback',
      evidence: {
        repository,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

export async function runOperatorPilotSync(options) {
  try {
    const result = await options.sync({
      repository: options.repository,
      issueNumber: options.issueNumber,
    })
    return {
      ok: true,
      operation: 'operator_sync',
      evidence: {
        repository: options.repository,
        issueNumber: options.issueNumber,
        result,
      },
    }
  } catch (error) {
    return redactPilotSmokeValue({
      ok: false,
      error: 'sync_failed',
      operation: 'operator_sync',
      evidence: {
        repository: options.repository,
        issueNumber: options.issueNumber,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

export function createGitHubPilotSmokeClient(token, fetchImpl = fetch) {
  return {
    async findOpenIssueByTitle(repository, title) {
      const response = await githubFetch(token, `/repos/${repository}/issues?state=open&per_page=100`, {}, fetchImpl)
      const issues = await response.json()
      return issues.find((issue) => issue.title === title && !issue.pull_request) ?? null
    },
    async createIssue(payload) {
      const response = await githubFetch(token, `/repos/${payload.repository}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: payload.title, labels: payload.labels }),
      }, fetchImpl)
      return response.json()
    },
  }
}

export function redactPilotSmokeValue(value) {
  if (Array.isArray(value)) return value.map((item) => redactPilotSmokeValue(item))
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? redactString(value) : value
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/token|authorization|api[_-]?key|secret|credential|header/i.test(key)) {
      return [key, '[redacted]']
    }
    return [key, redactPilotSmokeValue(entry)]
  }))
}

function missingSyntheticLabels(labels) {
  const normalized = new Set(labels.map(labelName).filter(Boolean))
  return SYNTHETIC_LABELS.filter((label) => !normalized.has(label))
}

function safeIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: Array.isArray(issue.labels) ? issue.labels.map(labelName).filter(Boolean) : [],
    html_url: issue.html_url,
  }
}

function labelName(label) {
  if (typeof label === 'string') return label.toLowerCase()
  if (label && typeof label === 'object' && typeof label.name === 'string') return label.name.toLowerCase()
  return ''
}

function isPermissionError(error) {
  const status = typeof error === 'object' && error !== null ? error.status : undefined
  return status === 401 || status === 403
}

function redactString(value) {
  return value
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
}

async function main() {
  const allowLiveMutation = process.argv.includes('--allow-live-mutation')
  const token = process.env.GITHUB_TOKEN ?? ''
  const client = createGitHubPilotSmokeClient(token)

  const result = await findOrCreateSyntheticPilotIssue({ client, allowLiveMutation, token })
  console.log(JSON.stringify(redactPilotSmokeValue(result), null, 2))
  process.exitCode = result.ok ? 0 : 1
}

async function githubFetch(token, path, init = {}, fetchImpl = fetch) {
  if (!token) throw new Error('GITHUB_TOKEN not configured')
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'MissionControlPilotSmoke/1.0',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    const error = new Error(`GitHub API error ${response.status}`)
    error.status = response.status
    throw error
  }
  return response
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify(redactPilotSmokeValue({
      ok: false,
      error: 'github_api_failure',
      mutation_status: 'not_mutated',
      message: error instanceof Error ? error.message : String(error),
    }), null, 2))
    process.exitCode = 1
  })
}
