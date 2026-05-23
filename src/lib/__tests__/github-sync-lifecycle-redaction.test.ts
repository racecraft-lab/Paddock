import { describe, expect, it } from 'vitest'
import {
  classifyGitHubSyncFailure,
  completeLifecycleRun,
  getLifecycleStatusForScope,
  recordLifecycleRunStarted,
} from '../github-sync-lifecycle'
import {
  createLifecycleTestDb,
  DEFAULT_REPO,
  DEFAULT_WORKSPACE_ID,
  LIFECYCLE_NOW,
  seedLifecycleControl,
} from './fixtures/github-sync-lifecycle-fixtures'

describe('github sync lifecycle observability redaction', () => {
  it('stores sanitized failure diagnostics and activity evidence without token-shaped values', () => {
    const db = createLifecycleTestDb()
    seedLifecycleControl(db, {
      last_success_cursor: '2026-05-22T23:49:59.000Z',
    })
    recordLifecycleRunStarted(db, {
      run_id: 'ghsync_redaction',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'automatic',
      lease_owner: 'scheduler:test',
      cursor_before: '2026-05-22T23:49:59.000Z',
      now: LIFECYCLE_NOW,
    })
    const classified = classifyGitHubSyncFailure({
      status: 500,
      message: 'Authorization: Bearer ghp_1234567890abcdef1234567890abcdef1234 {"token":"sk-proj-secret"}',
    })

    completeLifecycleRun(db, {
      run_id: 'ghsync_redaction',
      result: 'failed',
      failure_reason: classified.category,
      failure_message: classified.sanitized_message,
      failure_redaction_applied: classified.redaction_applied,
      cursor_after: '2026-05-22T23:49:59.000Z',
      backoff_seconds: 60,
      next_retry_at: LIFECYCLE_NOW + 60,
      now: LIFECYCLE_NOW + 1,
    })

    const status = getLifecycleStatusForScope(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      now: LIFECYCLE_NOW + 2,
    })
    const activity = db.prepare(`
      SELECT data
      FROM activities
      WHERE type = 'github_sync_run_failed'
      ORDER BY id DESC
      LIMIT 1
    `).get() as { data: string }

    const serialized = JSON.stringify({ status, activity: JSON.parse(activity.data) })
    expect(serialized).not.toContain('ghp_')
    expect(serialized).not.toContain('sk-proj')
    expect(serialized).not.toContain('Authorization')
    expect(status.diagnostics.failure.redaction_applied).toBe(true)
    expect(status.last_success_cursor).toBe('2026-05-22T23:49:59.000Z')
  })
})
