import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireLifecycleLease,
  completeLifecycleRun,
  deriveLifecycleHealthSummary,
  getLifecycleStatusForScope,
  releaseLifecycleLease,
  recordLifecycleRunStarted,
  upsertLifecycleControl,
} from '../github-sync-lifecycle'
import {
  createLifecycleTestDb,
  DEFAULT_REPO,
  DEFAULT_WORKSPACE_ID,
  LIFECYCLE_NOW,
  seedLifecycleControl,
} from './fixtures/github-sync-lifecycle-fixtures'
import type Database from 'better-sqlite3'

let db: Database.Database | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

describe('github sync lifecycle service', () => {
  it('persists control state separately from run history and emits control activity', () => {
    db = createLifecycleTestDb()

    const control = upsertLifecycleControl(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      enabled: true,
      interval_seconds: 600,
      max_pages: 20,
      max_issues: 2000,
      max_duration_seconds: 90,
      owner_project_id: 99,
      now: LIFECYCLE_NOW,
    })

    expect(control).toMatchObject({
      enabled: true,
      interval_seconds: 600,
      owner_project_id: 99,
      next_eligible_at: new Date((LIFECYCLE_NOW + 600) * 1000).toISOString(),
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM github_sync_lifecycle_runs').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT type, workspace_id, data FROM activities').get()).toMatchObject({
      type: 'github_sync_automation_enabled',
      workspace_id: DEFAULT_WORKSPACE_ID,
    })
  })

  it('acquires, blocks, releases, and stale-recovers durable leases', () => {
    db = createLifecycleTestDb()
    seedLifecycleControl(db)

    const acquired = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_run_1',
      lease_owner: 'scheduler:one',
      now: LIFECYCLE_NOW,
      max_duration_seconds: 45,
    })
    expect(acquired.acquired).toBe(true)

    const blocked = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_run_2',
      lease_owner: 'scheduler:two',
      now: LIFECYCLE_NOW + 10,
      max_duration_seconds: 45,
    })
    expect(blocked).toMatchObject({
      acquired: false,
      conflict: {
        run_id: 'ghsync_run_1',
        retry_after_seconds: 110,
      },
    })

    expect(releaseLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_run_1',
      now: LIFECYCLE_NOW + 20,
    })).toBe(true)

    const reacquired = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_run_2',
      lease_owner: 'scheduler:two',
      now: LIFECYCLE_NOW + 21,
      max_duration_seconds: 45,
    })
    expect(reacquired.acquired).toBe(true)

    const recovered = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_run_3',
      lease_owner: 'scheduler:three',
      now: LIFECYCLE_NOW + 500,
      max_duration_seconds: 45,
    })
    expect(recovered).toMatchObject({
      acquired: true,
      stale_recovered_from_run_id: 'ghsync_run_2',
    })
    expect(db.prepare("SELECT type FROM activities WHERE type = 'github_sync_stale_recovered'").get()).toEqual({
      type: 'github_sync_stale_recovered',
    })
  })

  it('records run history, updates counters, preserves failed cursors, and derives health', () => {
    db = createLifecycleTestDb()
    seedLifecycleControl(db, {
      last_success_cursor: '2026-05-22T23:49:59.000Z',
    })

    recordLifecycleRunStarted(db, {
      run_id: 'ghsync_run_failure',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'automatic',
      lease_owner: 'scheduler:one',
      cursor_before: '2026-05-22T23:49:59.000Z',
      now: LIFECYCLE_NOW,
    })

    completeLifecycleRun(db, {
      run_id: 'ghsync_run_failure',
      result: 'failed',
      failure_reason: 'github_http_5xx',
      failure_message: 'GitHub API returned a server error',
      cursor_after: '2026-05-22T23:49:59.000Z',
      backoff_seconds: 120,
      next_retry_at: LIFECYCLE_NOW + 120,
      now: LIFECYCLE_NOW + 3,
    })

    const status = getLifecycleStatusForScope(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      now: LIFECYCLE_NOW + 4,
    })

    expect(status).toMatchObject({
      last_success_cursor: '2026-05-22T23:49:59.000Z',
      last_error: 'GitHub API returned a server error',
      backoff: {
        seconds: 120,
        next_retry_at: new Date((LIFECYCLE_NOW + 120) * 1000).toISOString(),
      },
      counters: {
        failures: 1,
      },
      diagnostics: {
        failure: {
          category: 'github_http_5xx',
          sanitized_message: 'GitHub API returned a server error',
        },
      },
    })
    expect(status.last_run).toMatchObject({
      run_id: 'ghsync_run_failure',
      result: 'failed',
      cursor_advanced: false,
    })
    expect(deriveLifecycleHealthSummary(status).severity).toBe('amber')
    expect(db.prepare("SELECT type FROM activities WHERE type = 'github_sync_run_failed'").get()).toEqual({
      type: 'github_sync_run_failed',
    })
  })
})
