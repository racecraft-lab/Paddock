import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const {
  getDatabaseMock,
  runGitHubSyncAutomationTickMock,
  pullFromGitHubMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  runGitHubSyncAutomationTickMock: vi.fn(async () => ({ ok: true, message: 'GitHub sync automation tick complete' })),
  pullFromGitHubMock: vi.fn(async () => ({ pulled: 0, pushed: 0 })),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock, logAuditEvent: vi.fn() }
})

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/agent-sync', () => ({
  syncAgentsFromConfig: vi.fn(async () => ({ created: 0, updated: 0, synced: 0 })),
}))

vi.mock('@/lib/config', () => ({
  config: {
    dbPath: ':memory:',
    retention: {
      activities: 0,
      auditLog: 0,
      notifications: 0,
      pipelineRuns: 0,
      tokenUsage: 0,
      gatewaySessions: 0,
    },
    tokensPath: '/tmp/tokens.json',
  },
  ensureDirExists: vi.fn(),
}))

vi.mock('@/lib/webhooks', () => ({
  processWebhookRetries: vi.fn(async () => ({ ok: true, message: 'No retries' })),
}))

vi.mock('@/lib/claude-sessions', () => ({
  syncClaudeSessions: vi.fn(async () => ({ ok: true, message: 'No sessions' })),
}))

vi.mock('@/lib/sessions', () => ({
  pruneGatewaySessionsOlderThan: vi.fn(() => ({ deleted: 0 })),
  getAgentLiveStatuses: vi.fn(() => new Map()),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn() },
}))

vi.mock('@/lib/skill-sync', () => ({
  syncSkillsFromDisk: vi.fn(async () => ({ ok: true, message: 'No skills' })),
}))

vi.mock('@/lib/local-agent-sync', () => ({
  syncLocalAgents: vi.fn(async () => ({ ok: true, message: 'No local agents' })),
}))

vi.mock('@/lib/task-dispatch', () => ({
  dispatchAssignedTasks: vi.fn(async () => ({ ok: true, message: 'No tasks' })),
  runAegisReviews: vi.fn(async () => ({ ok: true, message: 'No reviews' })),
  requeueStaleTasks: vi.fn(async () => ({ ok: true, message: 'No stale tasks' })),
  autoRouteInboxTasks: vi.fn(async () => ({ ok: true, message: 'No inbox tasks' })),
}))

vi.mock('@/lib/recurring-tasks', () => ({
  spawnRecurringTasks: vi.fn(async () => ({ ok: true, message: 'No recurring tasks' })),
}))

vi.mock('@/lib/github-sync-poller', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github-sync-poller')>('@/lib/github-sync-poller')
  return {
    ...actual,
    runGitHubSyncAutomationTick: runGitHubSyncAutomationTickMock,
  }
})

vi.mock('@/lib/github-sync-engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github-sync-engine')>('@/lib/github-sync-engine')
  return {
    ...actual,
    pullFromGitHub: pullFromGitHubMock,
  }
})

import { runMigrations } from '../migrations'
import { runGitHubSyncAutomationTickForTest } from '../github-sync-poller'

const openDbs: Database.Database[] = []

function source(path: string): string {
  return readFileSync(join(__dirname, '..', path), 'utf8')
}

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function seedAutomationScope(
  db: Database.Database,
  overrides: Partial<{
    workspaceId: number
    projectId: number
    repo: string
    nextRetryAt: number
    lastSuccessCursor: string | null
    maxPages: number
    maxIssues: number
    maxDurationSeconds: number
  }> = {},
) {
  const workspaceId = overrides.workspaceId ?? 1
  const projectId = overrides.projectId ?? workspaceId * 10
  const repo = overrides.repo ?? `org/repo-${workspaceId}`
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, is_repo_sync_owner, status)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'active')
  `).run(projectId, workspaceId, `Project ${projectId}`, `project-${projectId}`, `P${projectId}`, repo)
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, owner_project_id, next_retry_at, last_success_cursor,
      created_at, updated_at
    ) VALUES (?, ?, 1, 300, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
  `).run(
    workspaceId,
    repo,
    overrides.maxPages ?? 3,
    overrides.maxIssues ?? 7,
    overrides.maxDurationSeconds ?? 9,
    projectId,
    overrides.nextRetryAt ?? 1,
    overrides.lastSuccessCursor ?? '2026-05-22T23:49:59.000Z',
  )
  return { workspaceId, projectId, repo }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  getDatabaseMock.mockReset()
  runGitHubSyncAutomationTickMock.mockClear()
  pullFromGitHubMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

describe('SPEC-013A1 / T023 scheduler-owned GitHub sync automation', () => {
  it('registers github_sync_automation as a scheduler task without making the singleton poller the product contract', async () => {
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)

    const scheduler = await import('../scheduler')
    scheduler.initScheduler()

    expect(scheduler.getSchedulerStatus()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'github_sync_automation',
          name: 'GitHub Sync Automation',
          enabled: true,
          running: false,
        }),
      ]),
    )
    expect(source('scheduler.ts')).toMatch(/runGitHubSyncAutomationTick/)
    expect(source('scheduler.ts')).not.toMatch(/startSyncPoller\(/)

    scheduler.stopScheduler()
  })

  it('stops future scheduler-owned GitHub sync automation ticks after shutdown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'))
    const db = freshMigratedDb()
    getDatabaseMock.mockReturnValue(db)

    const scheduler = await import('../scheduler')
    scheduler.initScheduler()

    await vi.advanceTimersByTimeAsync(61_000)
    expect(runGitHubSyncAutomationTickMock).toHaveBeenCalledTimes(1)

    scheduler.stopScheduler()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(runGitHubSyncAutomationTickMock).toHaveBeenCalledTimes(1)
  })

  it('re-checks the automation flag and lifecycle control before acquiring automatic work', async () => {
    const db = freshMigratedDb()
    seedAutomationScope(db)
    getDatabaseMock.mockReturnValue(db)

    await runGitHubSyncAutomationTickForTest({ now: 1_779_500_000 })
    expect(pullFromGitHubMock).not.toHaveBeenCalled()

    db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = 1`).run(
      JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }),
    )

    await runGitHubSyncAutomationTickForTest({ now: 1_779_500_060 })

    expect(pullFromGitHubMock).toHaveBeenCalledTimes(1)
    expect(pullFromGitHubMock).toHaveBeenCalledWith(
      expect.objectContaining({ github_repo: 'org/repo-1', github_sync_enabled: 1 }),
      1,
      expect.objectContaining({
        automatic: {
          cursor: '2026-05-22T23:49:59.000Z',
          maxPages: 3,
          maxIssues: 7,
          maxDurationMs: 9_000,
        },
      }),
    )
  })

  it('limits automatic candidate selection per scheduler tick', async () => {
    const db = freshMigratedDb()
    db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = 1`).run(
      JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }),
    )
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, slug, name, feature_flags, created_at, updated_at)
       VALUES (2, 'ws-2', 'Workspace 2', ?, unixepoch(), unixepoch())`,
    ).run(JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }))
    db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = 2`).run(
      JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }),
    )
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, slug, name, feature_flags, created_at, updated_at)
       VALUES (3, 'ws-3', 'Workspace 3', ?, unixepoch(), unixepoch())`,
    ).run(JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }))
    db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = 3`).run(
      JSON.stringify({ FEATURE_GITHUB_SYNC_AUTOMATION: true }),
    )
    seedAutomationScope(db, { workspaceId: 1, projectId: 11, repo: 'org/repo-a', nextRetryAt: 10 })
    seedAutomationScope(db, { workspaceId: 2, projectId: 22, repo: 'org/repo-b', nextRetryAt: 20 })
    seedAutomationScope(db, { workspaceId: 3, projectId: 33, repo: 'org/repo-c', nextRetryAt: 30 })
    getDatabaseMock.mockReturnValue(db)

    const result = await runGitHubSyncAutomationTickForTest({
      now: 1_779_500_000,
      candidateLimit: 2,
    })

    expect(result).toMatchObject({ ok: true, scopesConsidered: 2 })
    expect(pullFromGitHubMock).toHaveBeenCalledTimes(2)
    const calls = pullFromGitHubMock.mock.calls as unknown as Array<
      [{ github_repo: string }, ...unknown[]]
    >
    expect(calls.map((call) => call[0].github_repo)).toEqual([
      'org/repo-a',
      'org/repo-b',
    ])
  })
})
