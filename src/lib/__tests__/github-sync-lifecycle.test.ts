import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireLifecycleLease,
  completeLifecycleRun,
  deriveLifecycleHealthSummary,
  getLifecycleStatusForScope,
  recordLifecycleRejectedOverlap,
  releaseLifecycleLease,
  recordLifecycleRunStarted,
  recordLifecycleSkippedOverlap,
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
    expect(db.prepare(`
      SELECT result, stale_recovered_from_run_id
      FROM github_sync_lifecycle_runs
      WHERE result = 'stale_recovered'
    `).get()).toEqual({
      result: 'stale_recovered',
      stale_recovered_from_run_id: 'ghsync_run_2',
    })
  })

  it('does not let a late stale run completion clear a replacement lease', () => {
    db = createLifecycleTestDb()
    seedLifecycleControl(db, {
      last_success_cursor: '2026-05-22T23:49:59.000Z',
    })

    const oldLease = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_stale_old',
      lease_owner: 'scheduler:old',
      now: LIFECYCLE_NOW,
      max_duration_seconds: 45,
    })
    expect(oldLease.acquired).toBe(true)
    recordLifecycleRunStarted(db, {
      run_id: 'ghsync_stale_old',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'automatic',
      lease_owner: 'scheduler:old',
      cursor_before: '2026-05-22T23:49:59.000Z',
      now: LIFECYCLE_NOW,
    })

    const replacementLease = acquireLifecycleLease(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      run_id: 'ghsync_replacement',
      lease_owner: 'scheduler:new',
      now: LIFECYCLE_NOW + 500,
      max_duration_seconds: 45,
    })
    expect(replacementLease).toMatchObject({
      acquired: true,
      stale_recovered_from_run_id: 'ghsync_stale_old',
    })

    completeLifecycleRun(db, {
      run_id: 'ghsync_stale_old',
      result: 'success',
      cursor_after: '2026-05-23T00:00:00.000Z',
      next_retry_at: LIFECYCLE_NOW + 800,
      now: LIFECYCLE_NOW + 501,
    })

    expect(db.prepare(`
      SELECT lease_run_id, lease_owner, total_successes, last_success_cursor
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = ? AND github_repo = ?
    `).get(DEFAULT_WORKSPACE_ID, DEFAULT_REPO)).toEqual({
      lease_run_id: 'ghsync_replacement',
      lease_owner: 'scheduler:new',
      total_successes: 0,
      last_success_cursor: '2026-05-22T23:49:59.000Z',
    })
    expect(db.prepare(`
      SELECT result, cursor_advanced
      FROM github_sync_lifecycle_runs
      WHERE run_id = 'ghsync_stale_old'
    `).get()).toEqual({
      result: 'success',
      cursor_advanced: 1,
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

  it('records manual fallback completion and failure activity while preserving failed cursors', () => {
    db = createLifecycleTestDb()
    seedLifecycleControl(db, {
      last_success_cursor: '2026-05-22T23:49:59.000Z',
    })

    recordLifecycleRunStarted(db, {
      run_id: 'ghsync_manual_success',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'manual',
      lease_owner: 'operator:manual',
      project_id: 17,
      cursor_before: '2026-05-22T23:49:59.000Z',
      now: LIFECYCLE_NOW,
    })
    completeLifecycleRun(db, {
      run_id: 'ghsync_manual_success',
      result: 'success',
      cursor_after: '2026-05-23T00:00:10.000Z',
      next_retry_at: LIFECYCLE_NOW + 300,
      now: LIFECYCLE_NOW + 2,
    })

    recordLifecycleRunStarted(db, {
      run_id: 'ghsync_manual_failure',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'manual',
      lease_owner: 'operator:manual',
      project_id: 17,
      cursor_before: '2026-05-23T00:00:10.000Z',
      now: LIFECYCLE_NOW + 10,
    })
    completeLifecycleRun(db, {
      run_id: 'ghsync_manual_failure',
      result: 'failed',
      failure_reason: 'github_http_5xx',
      failure_message: 'GitHub API returned a server error',
      cursor_after: '2026-05-23T00:00:10.000Z',
      backoff_seconds: 120,
      next_retry_at: LIFECYCLE_NOW + 130,
      now: LIFECYCLE_NOW + 12,
    })

    expect(db.prepare(`
      SELECT type
      FROM activities
      WHERE type IN ('github_sync_manual_fallback_completed', 'github_sync_manual_fallback_failed')
      ORDER BY id ASC
    `).all()).toEqual([
      { type: 'github_sync_manual_fallback_completed' },
      { type: 'github_sync_manual_fallback_failed' },
    ])
    expect(db.prepare(`
      SELECT result, cursor_before, cursor_after, cursor_advanced
      FROM github_sync_lifecycle_runs
      WHERE run_id = 'ghsync_manual_failure'
    `).get()).toEqual({
      result: 'failed',
      cursor_before: '2026-05-23T00:00:10.000Z',
      cursor_after: '2026-05-23T00:00:10.000Z',
      cursor_advanced: 0,
    })
    expect(db.prepare(`
      SELECT last_success_cursor, last_error, backoff_seconds, next_retry_at
      FROM github_sync_lifecycle_controls
    `).get()).toEqual({
      last_success_cursor: '2026-05-23T00:00:10.000Z',
      last_error: 'GitHub API returned a server error',
      backoff_seconds: 120,
      next_retry_at: LIFECYCLE_NOW + 130,
    })
  })

  it('records rejected and skipped overlap terminal detail with retry guidance and cursor preservation', () => {
    db = createLifecycleTestDb()
    seedLifecycleControl(db, {
      last_success_cursor: '2026-05-22T23:49:59.000Z',
      lease_run_id: 'ghsync_active',
      lease_owner: 'scheduler:active',
      lease_started_at: LIFECYCLE_NOW,
      lease_expires_at: LIFECYCLE_NOW + 120,
    })

    recordLifecycleRejectedOverlap(db, {
      run_id: 'ghsync_manual_rejected',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'manual',
      project_id: 17,
      cursor_before: '2026-05-22T23:49:59.000Z',
      conflicting_run_id: 'ghsync_active',
      retry_after_seconds: 90,
      lease_expires_at: LIFECYCLE_NOW + 120,
      now: LIFECYCLE_NOW + 30,
    })

    recordLifecycleSkippedOverlap(db, {
      run_id: 'ghsync_auto_skipped',
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      trigger: 'automatic',
      cursor_before: '2026-05-22T23:49:59.000Z',
      conflicting_run_id: 'ghsync_active',
      retry_after_seconds: 80,
      lease_expires_at: LIFECYCLE_NOW + 120,
      now: LIFECYCLE_NOW + 40,
    })

    expect(db.prepare(`
      SELECT run_id, result, trigger, cursor_before, cursor_after, cursor_advanced
      FROM github_sync_lifecycle_runs
      ORDER BY started_at ASC
    `).all()).toEqual([
      {
        run_id: 'ghsync_manual_rejected',
        result: 'rejected_overlap',
        trigger: 'manual',
        cursor_before: '2026-05-22T23:49:59.000Z',
        cursor_after: '2026-05-22T23:49:59.000Z',
        cursor_advanced: 0,
      },
      {
        run_id: 'ghsync_auto_skipped',
        result: 'skipped_overlap',
        trigger: 'automatic',
        cursor_before: '2026-05-22T23:49:59.000Z',
        cursor_after: '2026-05-22T23:49:59.000Z',
        cursor_advanced: 0,
      },
    ])

    expect(db.prepare(`
      SELECT type, data
      FROM activities
      WHERE type IN ('github_sync_rejected_overlap', 'github_sync_skipped_overlap')
      ORDER BY id ASC
    `).all().map((row) => {
      const typed = row as { type: string; data: string }
      return {
        ...typed,
        data: JSON.parse(typed.data) as Record<string, unknown>,
      }
    })).toEqual([
      {
        type: 'github_sync_rejected_overlap',
        data: {
          workspace_id: DEFAULT_WORKSPACE_ID,
          github_repo: DEFAULT_REPO,
          run_id: 'ghsync_manual_rejected',
          trigger: 'manual',
          result: 'rejected_overlap',
          project_id: 17,
          cursor_advanced: false,
          retry_after_seconds: 90,
          lease_expires_at: new Date((LIFECYCLE_NOW + 120) * 1000).toISOString(),
        },
      },
      {
        type: 'github_sync_skipped_overlap',
        data: {
          workspace_id: DEFAULT_WORKSPACE_ID,
          github_repo: DEFAULT_REPO,
          run_id: 'ghsync_auto_skipped',
          trigger: 'automatic',
          result: 'skipped_overlap',
          cursor_advanced: false,
          retry_after_seconds: 80,
          lease_expires_at: new Date((LIFECYCLE_NOW + 120) * 1000).toISOString(),
        },
      },
    ])

    const status = getLifecycleStatusForScope(db, {
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      now: LIFECYCLE_NOW + 41,
    })
    expect(status).toMatchObject({
      last_success_cursor: '2026-05-22T23:49:59.000Z',
      counters: { overlap_rejections: 2 },
      last_run: {
        run_id: 'ghsync_auto_skipped',
        result: 'skipped_overlap',
        cursor_advanced: false,
      },
      diagnostics: {
        cursor_effect: 'unchanged',
        health_summary: {
          severity: 'amber',
          state_drivers: ['overlap_blocked'],
        },
      },
    })

    const diagnostics = db.prepare(`
      SELECT diagnostics_json
      FROM github_sync_lifecycle_runs
      WHERE run_id = 'ghsync_auto_skipped'
    `).get() as { diagnostics_json: string }
    expect(JSON.parse(diagnostics.diagnostics_json)).toMatchObject({
      cursor_effect: 'unchanged',
      overlap: {
        conflicting_run_id: 'ghsync_active',
        retry_after_seconds: 80,
        lease_expires_at: new Date((LIFECYCLE_NOW + 120) * 1000).toISOString(),
      },
    })
  })
})
