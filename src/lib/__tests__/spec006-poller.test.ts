/**
 * SPEC-006 — Poller flag-OFF parity + per-row resolveFlag wiring
 * (T008 / T013 / T015, FR-002, FR-018 OFF branch, FR-052, US1-AC1, P5-AC1)
 *
 * Asserts:
 *   (T008) With FEATURE_AREA_LABEL_ROUTING unset for every workspace,
 *     the poller's candidate-project SELECT does NOT reference
 *     `is_repo_sync_owner` and selects per-project as today.
 *   (T013) Mixed-tenant guard against the mass-mode pitfall:
 *     resolveFlag is invoked per-(workspace_id, github_repo) candidate row
 *     so an ON-workspace's flag value cannot leak into an OFF workspace's
 *     selection branch.
 *
 * The owner-only branch (flag-ON SQL change) is deferred to T027 (US2).
 * For US1, the test pins:
 *   (a) source-level: legacy SELECT still present, no `is_repo_sync_owner`
 *       reference in the OFF-branch source path
 *   (b) runtime-level: a per-workspace `feature_flags` cache exists and
 *       `resolveFlag` is invoked at least once per workspace per tick
 *
 * Uses relative imports per the worktree convention.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Module mocks ─────────────────────────────────────
const { getDatabaseMock, pullFromGitHubMock, resolveFlagSpy } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  pullFromGitHubMock: vi.fn(async () => ({ pulled: 0, pushed: 0 })),
  resolveFlagSpy: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    ...actual,
    getDatabase: getDatabaseMock,
  }
})

vi.mock('@/lib/github-sync-engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github-sync-engine')>(
    '@/lib/github-sync-engine',
  )
  return {
    ...actual,
    pullFromGitHub: pullFromGitHubMock,
  }
})

vi.mock('@/lib/feature-flags', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feature-flags')>(
    '@/lib/feature-flags',
  )
  return {
    ...actual,
    resolveFlag: (...args: Parameters<typeof actual.resolveFlag>) => {
      resolveFlagSpy(...args)
      return actual.resolveFlag(...args)
    },
  }
})

import { runMigrations } from '../migrations'
import { runSyncTickForTest } from '../github-sync-poller'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  getDatabaseMock.mockReset()
  pullFromGitHubMock.mockClear()
  resolveFlagSpy.mockClear()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function pollerSource(): string {
  return readFileSync(join(__dirname, '..', 'github-sync-poller.ts'), 'utf8')
}

// ── T008 — flag-OFF poller-selection (source-level) ─────────────

describe('SPEC-006 / T008 — flag-OFF poller selection (FR-002, FR-018 OFF)', () => {
  it('legacy SELECT is preserved in the poller source', () => {
    const src = pollerSource()
    expect(src).toMatch(
      /SELECT id, github_repo, github_sync_enabled, github_default_branch, workspace_id\s+FROM projects\s+WHERE github_sync_enabled\s*=\s*1\s+AND github_repo IS NOT NULL\s+AND status\s*=\s*'active'/,
    )
  })

  it('does not unconditionally reference is_repo_sync_owner in the candidate selection SQL', () => {
    const src = pollerSource()
    // The owner-filter SQL change is deferred to T027 (US2). For US1 the
    // poller must NOT have introduced an unconditional `is_repo_sync_owner`
    // predicate on the candidate-row selection.
    const firstSelect = src.match(
      /SELECT[^;`]*FROM projects[^;`]*WHERE[^;`]*github_sync_enabled[^;`]*/i,
    )
    expect(firstSelect).not.toBeNull()
    expect(firstSelect?.[0]).not.toMatch(/is_repo_sync_owner\s*=\s*1/i)
  })
})

// ── T013 / FR-052 — Mixed-tenant per-row resolveFlag ──────────

describe('SPEC-006 / T013 — mixed-tenant per-row resolveFlag (FR-052, P5-AC1)', () => {
  it('invokes resolveFlag for FEATURE_AREA_LABEL_ROUTING during the tick (per-workspace, cached)', async () => {
    const db = freshMigratedDb()

    // Seed a second workspace and toggle the flag ON for it via feature_flags.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    ).run(2, 'ws-2', 'Workspace 2')

    db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
      JSON.stringify({ FEATURE_AREA_LABEL_ROUTING: true }),
      2,
    )

    db.exec(`
      INSERT INTO projects (workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, status)
      VALUES
        (1, 'P-WS1', 'p-ws1', 'P1', 'org/repo-ws1', 1, 'active'),
        (2, 'P-WS2', 'p-ws2', 'P2', 'org/repo-ws2', 1, 'active');
    `)

    getDatabaseMock.mockReturnValue(db)

    await runSyncTickForTest()

    // FR-052 per-row wiring: resolveFlag must have been called for each
    // candidate row's workspace at least once.
    const callsForFlag = resolveFlagSpy.mock.calls.filter(
      (call) => call[0] === 'FEATURE_AREA_LABEL_ROUTING',
    )
    expect(callsForFlag.length).toBeGreaterThanOrEqual(2)

    // OFF-branch behavior preserved byte-for-byte: pullFromGitHub still
    // invoked for every candidate project. The ON-branch owner-filter SQL
    // change is deferred to T027 (US2).
    expect(pullFromGitHubMock).toHaveBeenCalledTimes(2)
  })

  it('uses a per-workspace feature_flags cache (not one DB read per row)', async () => {
    const db = freshMigratedDb()

    // Three projects in WS-1 (one workspace, three candidate rows). With a
    // proper cache, the workspaces.feature_flags row should be read at most
    // once across all three projects.
    db.exec(`
      INSERT INTO projects (workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, status)
      VALUES
        (1, 'P-A', 'p-a', 'PA', 'org/repo-a', 1, 'active'),
        (1, 'P-B', 'p-b', 'PB', 'org/repo-b', 1, 'active'),
        (1, 'P-C', 'p-c', 'PC', 'org/repo-c', 1, 'active');
    `)

    // Spy on prepare() — count calls that read feature_flags from workspaces.
    let featureFlagsReads = 0
    const origPrepare = db.prepare.bind(db)
    db.prepare = ((sql: string) => {
      if (/SELECT\s+feature_flags\s+FROM\s+workspaces/i.test(sql)) {
        const stmt = origPrepare(sql)
        const origGet = stmt.get.bind(stmt)
        stmt.get = ((...args: unknown[]) => {
          featureFlagsReads += 1
          // better-sqlite3 .get accepts variadic params; we forward through
          // a typed tuple at the call site.
          return (origGet as (...a: unknown[]) => unknown)(...args)
        }) as typeof stmt.get
        return stmt
      }
      return origPrepare(sql)
    }) as typeof db.prepare

    getDatabaseMock.mockReturnValue(db)

    await runSyncTickForTest()

    // Cache: at most ONE read of feature_flags for the single workspace.
    expect(featureFlagsReads).toBeLessThanOrEqual(1)
    expect(pullFromGitHubMock).toHaveBeenCalledTimes(3)
  })
})
