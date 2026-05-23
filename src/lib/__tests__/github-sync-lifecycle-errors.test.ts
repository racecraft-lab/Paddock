import { describe, expect, it } from 'vitest'
import {
  classifyGitHubSyncFailure,
  computeLifecycleRetry,
  sanitizeLifecycleMessage,
} from '../github-sync-lifecycle'
import { LIFECYCLE_NOW } from './fixtures/github-sync-lifecycle-fixtures'

describe('github sync lifecycle failure classification', () => {
  it.each([
    [{ name: 'AbortError', message: 'The operation timed out' }, 'transport_timeout'],
    [{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.github.com' }, 'transport_network'],
    [{ status: 403, headers: { 'x-ratelimit-remaining': '0' }, body: '{"token":"ghp_secret"}' }, 'github_rate_limited'],
    [{ status: 401, body: 'Bad credentials' }, 'github_auth_or_scope'],
    [{ status: 404, body: 'Not Found' }, 'github_not_found'],
    [{ status: 422, body: 'Validation failed' }, 'github_http_4xx'],
    [{ status: 502, body: 'Bad gateway' }, 'github_http_5xx'],
    [{ kind: 'malformed_json', message: 'Unexpected token' }, 'github_malformed_json'],
    [{ kind: 'unexpected_shape', message: 'Expected array' }, 'github_unexpected_shape'],
    [{ kind: 'issue_schema_invalid', message: 'Missing id' }, 'github_issue_schema_invalid'],
    [{ code: 'SQLITE_BUSY', message: 'database is locked' }, 'database_error'],
  ])('maps %o to %s', (input, category) => {
    expect(classifyGitHubSyncFailure(input).category).toBe(category)
  })

  it('sanitizes token, authorization, API key, and raw response body details', () => {
    const classified = classifyGitHubSyncFailure({
      status: 500,
      message: 'Authorization: Bearer ghp_1234567890abcdef1234567890abcdef1234 api_key=sk-proj-abc123 raw body {"secret":"value"}',
      body: '{"secret":"value","token":"ghp_1234567890abcdef1234567890abcdef1234"}',
    })

    expect(classified.category).toBe('github_http_5xx')
    expect(classified.sanitized_message).not.toContain('ghp_')
    expect(classified.sanitized_message).not.toContain('Authorization')
    expect(classified.sanitized_message).not.toContain('sk-proj')
    expect(classified.sanitized_message).not.toContain('{"secret"')
    expect(classified.redaction_applied).toBe(true)
    expect(sanitizeLifecycleMessage('safe short message').message).toBe('safe short message')
  })
})
describe('github sync lifecycle retry signals', () => {
  it('prefers valid Retry-After over rate-limit reset and exponential fallback', () => {
    const retry = computeLifecycleRetry({
      now: LIFECYCLE_NOW,
      failure_count: 2,
      max_backoff_seconds: 1800,
      headers: {
        'retry-after': '90',
        'x-ratelimit-reset': String(LIFECYCLE_NOW + 300),
      },
    })

    expect(retry).toMatchObject({
      seconds: 90,
      next_retry_at: LIFECYCLE_NOW + 90,
      reason: 'github_retry_after',
      signal_source: 'retry_after',
      cap_applied: false,
      fallback_applied: false,
    })
  })

  it('uses future X-RateLimit-Reset when Retry-After is invalid', () => {
    const retry = computeLifecycleRetry({
      now: LIFECYCLE_NOW,
      failure_count: 1,
      max_backoff_seconds: 1800,
      headers: {
        'retry-after': 'nope',
        'x-ratelimit-reset': String(LIFECYCLE_NOW + 240),
      },
    })

    expect(retry).toMatchObject({
      seconds: 240,
      reason: 'github_rate_limit_reset',
      signal_source: 'x_ratelimit_reset',
      fallback_applied: false,
    })
  })

  it('falls back to capped exponential backoff when GitHub retry signals are absent or stale', () => {
    const retry = computeLifecycleRetry({
      now: LIFECYCLE_NOW,
      failure_count: 8,
      max_backoff_seconds: 300,
      headers: {
        'x-ratelimit-reset': String(LIFECYCLE_NOW - 60),
      },
    })

    expect(retry).toMatchObject({
      seconds: 300,
      next_retry_at: LIFECYCLE_NOW + 300,
      reason: 'exponential_backoff',
      signal_source: 'exponential',
      cap_applied: true,
      fallback_applied: true,
    })
  })
})
