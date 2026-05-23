import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getDatabase: vi.fn(),
  loggerError: vi.fn(),
  githubSyncAutomationEnabled: true,
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/db', () => ({ getDatabase: mocks.getDatabase }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }))
vi.mock('@/lib/feature-flags', () => ({
  resolveFlag: vi.fn((name: string) => {
    if (name === 'FEATURE_WORKSPACE_SWITCHER') return true
    if (name === 'FEATURE_GITHUB_SYNC_AUTOMATION') return mocks.githubSyncAutomationEnabled
    return false
  }),
  evaluateFeatureFlagCore: vi.fn((name: string) => ({
    key: name,
    value: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' ? mocks.githubSyncAutomationEnabled : name === 'FEATURE_WORKSPACE_SWITCHER',
    reason: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' && !mocks.githubSyncAutomationEnabled
      ? 'default_off'
      : 'workspace_override',
    envLocked: false,
    envValue: null,
    storedValue: name === 'FEATURE_GITHUB_SYNC_AUTOMATION' ? mocks.githubSyncAutomationEnabled : true,
  })),
}))

import { PATCH } from '../route'
import { runMigrations } from '../../../../../../lib/migrations'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.githubSyncAutomationEnabled = true
  mocks.requireRole.mockReturnValue({
    user: { id: 7, username: 'admin', role: 'operator', tenant_id: 1, workspace_id: 2 },
  })
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  db.prepare(`
    INSERT OR REPLACE INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES
      (2, 'facility', 'Facility', 1, '{"FEATURE_WORKSPACE_SWITCHER":true}', unixepoch(), unixepoch()),
      (4, 'mission-control', 'Mission Control', 1, '{"FEATURE_WORKSPACE_SWITCHER":true}', unixepoch(), unixepoch())
  `).run()
  return db
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/github/sync/control', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function seedLifecycleControl(db: Database.Database, values: {
  enabled?: number
  interval_seconds?: number
  backoff_seconds?: number
  next_retry_at?: number | null
  next_retry_reason?: string | null
  lease_run_id?: string | null
  lease_started_at?: number | null
  lease_expires_at?: number | null
} = {}): void {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, next_retry_at, next_retry_reason, backoff_seconds,
      lease_run_id, lease_owner, lease_started_at, lease_expires_at, created_at, updated_at
    )
    VALUES (4, 'org/repo', ?, ?, 10, 1000, 45, ?, ?, ?, ?, 'scheduler:test', ?, ?, 1779500000, 1779500000)
  `).run(
    values.enabled ?? 1,
    values.interval_seconds ?? 300,
    values.next_retry_at ?? null,
    values.next_retry_reason ?? null,
    values.backoff_seconds ?? 0,
    values.lease_run_id ?? null,
    values.lease_started_at ?? null,
    values.lease_expires_at ?? null,
  )
}

describe('PATCH /api/github/sync/control', () => {
  it('enables a scoped lifecycle control with bounded settings', async () => {
    const db = freshMigratedDb()
    mocks.getDatabase.mockReturnValue(db)

    const res = await PATCH(request({
      workspace_id: 4,
      github_repo: 'org/repo',
      enabled: true,
      interval_seconds: 300,
      max_pages: 10,
      max_issues: 1000,
      max_duration_seconds: 45,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      control: expect.objectContaining({
        workspace_id: 4,
        github_repo: 'org/repo',
        enabled: true,
        interval_seconds: 300,
        max_pages: 10,
        max_issues: 1000,
        max_duration_seconds: 45,
        backoff_seconds: 0,
      }),
    }))
  })

  it('returns feature_flag_disabled when enabling while automation is disabled', async () => {
    mocks.githubSyncAutomationEnabled = false
    const db = freshMigratedDb()
    mocks.getDatabase.mockReturnValue(db)

    const res = await PATCH(request({
      workspace_id: 4,
      github_repo: 'org/repo',
      enabled: true,
      interval_seconds: 300,
      max_pages: 10,
      max_issues: 1000,
      max_duration_seconds: 45,
    }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'feature_flag_disabled',
    })
  })

  it('validates interval and bounds before mutating controls', async () => {
    const db = freshMigratedDb()
    mocks.getDatabase.mockReturnValue(db)

    const res = await PATCH(request({
      workspace_id: 4,
      github_repo: 'org/repo',
      enabled: true,
      interval_seconds: 59,
      max_pages: 10,
      max_issues: 1000,
      max_duration_seconds: 45,
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'interval_out_of_bounds',
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM github_sync_lifecycle_controls').get()).toEqual({ count: 0 })
  })

  it('resets backoff idempotently without changing enablement', async () => {
    const db = freshMigratedDb()
    seedLifecycleControl(db, {
      enabled: 1,
      backoff_seconds: 120,
      next_retry_at: 1779500120,
      next_retry_reason: 'exponential_backoff',
    })
    mocks.getDatabase.mockReturnValue(db)

    const res = await PATCH(request({
      workspace_id: 4,
      github_repo: 'org/repo',
      reset_backoff: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.control).toMatchObject({
      enabled: true,
      backoff_seconds: 0,
    })
    expect(db.prepare(`
      SELECT backoff_seconds, next_retry_at, next_retry_reason, consecutive_failures
      FROM github_sync_lifecycle_controls
      WHERE workspace_id = 4 AND github_repo = 'org/repo'
    `).get()).toEqual({
      backoff_seconds: 0,
      next_retry_at: null,
      next_retry_reason: null,
      consecutive_failures: 0,
    })
  })

  it('disables future automatic ticks while an active run remains visible', async () => {
    const db = freshMigratedDb()
    seedLifecycleControl(db, {
      enabled: 1,
      backoff_seconds: 120,
      next_retry_at: 1779500120,
      next_retry_reason: 'exponential_backoff',
      lease_run_id: 'ghsync_active_1',
      lease_started_at: 1779500000,
      lease_expires_at: 1779500120,
    })
    db.prepare(`
      INSERT INTO github_sync_lifecycle_runs (
        run_id, workspace_id, github_repo, trigger, lease_owner, started_at,
        result, cursor_before, cursor_after, diagnostics_json
      )
      VALUES ('ghsync_active_1', 4, 'org/repo', 'automatic', 'scheduler:test', 1779500000,
        'running', 'cursor-1', 'cursor-1', '{"cursor_effect":"unchanged"}')
    `).run()
    mocks.getDatabase.mockReturnValue(db)

    const res = await PATCH(request({
      workspace_id: 4,
      github_repo: 'org/repo',
      enabled: false,
      disabled_reason: 'operator_disabled',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      control: {
        workspace_id: 4,
        github_repo: 'org/repo',
        enabled: false,
        disabled_reason: 'operator_disabled',
        next_eligible_at: null,
        backoff_seconds: 0,
      },
      active_run: {
        run_id: 'ghsync_active_1',
        trigger: 'automatic',
        lease_expires_at: new Date(1779500120 * 1000).toISOString(),
      },
    })
  })
})
