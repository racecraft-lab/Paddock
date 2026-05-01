/**
 * SPEC-006 / Phase 9 — label-provisioning failure isolation, throttle, and trigger
 *
 * T071 — Failure isolation: when `initializeLabels(repo, workspaceId)` is invoked
 *   under flag-ON and the per-label create call fails for some labels (429, 4xx,
 *   5xx, network, unknown) and succeeds for others, the function:
 *     - per-label structured log is emitted via console.error for EVERY failure
 *       with shape { event: 'label_provisioning_failed', workspace_id,
 *       github_repo, error_message (sanitized), error_class }.
 *     - aggregates ALL per-label failures into ONE
 *       `type='label_provisioning_failed'` activity row whose `data` is
 *       { workspace_id, github_repo, failed_labels: string[],
 *         error_count: number, sample_error: string (≤500 chars, sanitized),
 *         trigger: 'connect'|'area_slug_change'|'bootstrap' }.
 *     - returns successfully (no thrown exception) so the caller (sync run, PUT
 *       handler, connect handler) is not aborted.
 *
 * T072 — 24-hour throttle: a second invocation within 24h for the same
 *   (workspace_id, github_repo) emits per-label structured logs but does NOT
 *   write a second activity row. The throttle SQL uses
 *   `created_at >= unixepoch() - 86400`; we exercise the same-second `>=`
 *   boundary explicitly.
 *
 * Maps to FR-025, FR-026, FR-027, FR-027a, FR-027b, US7-AC4, P5-AC7.
 *
 * Uses relative imports per worktree convention.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ───────────────────────────────────────────
const {
  createLabelMock,
  ensureLabelsMock,
  getDatabaseMock,
} = vi.hoisted(() => ({
  createLabelMock: vi.fn(),
  ensureLabelsMock: vi.fn(async () => undefined),
  getDatabaseMock: vi.fn(),
}))

vi.mock('@/lib/github', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github')>('@/lib/github')
  return {
    ...actual,
    createLabel: createLabelMock,
    ensureLabels: ensureLabelsMock,
  }
})

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    ...actual,
    getDatabase: getDatabaseMock,
  }
})

import { runMigrations } from '../migrations'
import { initializeLabels } from '../github-sync-engine'
import { ALL_AREA_LABEL_NAMES } from '../github-label-map'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  vi.restoreAllMocks()
})

beforeEach(() => {
  createLabelMock.mockReset()
  ensureLabelsMock.mockReset()
  ensureLabelsMock.mockResolvedValue(undefined)
  getDatabaseMock.mockReset()
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function seedFlagOnWorkspace(db: Database.Database, workspaceId: number): void {
  // Migrations seed workspace 1; for any other ID, ensure it exists.
  if (workspaceId !== 1) {
    const tenantId = (db.prepare(`SELECT id FROM tenants ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined)?.id ?? 1
    db.prepare(`
      INSERT OR IGNORE INTO workspaces (id, tenant_id, slug, name)
      VALUES (?, ?, ?, ?)
    `).run(workspaceId, tenantId, `ws-${workspaceId}`, `Workspace ${workspaceId}`)
  }
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_AREA_LABEL_ROUTING: true }),
    workspaceId,
  )
}

// Helper exported via void reference to satisfy strict unused-symbol check;
// retained for test extensions that may seed workspace-defined area slugs
// alongside the static AREA_LABEL_MAP defaults.
function seedAreaSlug(db: Database.Database, workspaceId: number, slug: string, projectSlug: string): void {
  db.prepare(`
    INSERT INTO projects (workspace_id, name, slug, ticket_prefix, area_slug, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(workspaceId, projectSlug, projectSlug, projectSlug.toUpperCase(), slug)
}
void seedAreaSlug

class HttpStatusError extends Error {
  status: number
  constructor(status: number, body: string) {
    super(`GitHub API error ${status}: ${body}`)
    this.status = status
    this.name = 'Error'
  }
}

class NetworkErr extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'TypeError' // node fetch throws TypeError on network failure
  }
}

// ── T071 — failure isolation ──────────────────────────────

describe('SPEC-006 / T071 — initializeLabels failure isolation (FR-025/026/027/027a/027b)', () => {
  it('aggregates per-label failures into ONE activity row, logs each, returns successfully', async () => {
    const db = freshMigratedDb()
    seedFlagOnWorkspace(db, 1)
    getDatabaseMock.mockReturnValue(db)

    // Five labels: three succeed, two fail with different error classes.
    // We simulate by routing on label name. The label set used by initializeLabels
    // is the union of mc:* + priority:* + areaLabelsForWorkspace; we don't seed
    // any extra area_slug, so the area set is just the static AREA_LABEL_MAP (12).
    // We pick two specific area label names to fail and let the rest succeed.
    const failingNames = new Set([ALL_AREA_LABEL_NAMES[0], ALL_AREA_LABEL_NAMES[1]])
    const errorLog: string[] = []
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((..._args: unknown[]) => {
      // capture argument shape
      errorLog.push(JSON.stringify(_args[0]))
    })

    createLabelMock.mockImplementation(async (_repo: string, label: { name: string }) => {
      if (label.name === ALL_AREA_LABEL_NAMES[0]) {
        throw new HttpStatusError(429, '{"message":"rate limit"}')
      }
      if (label.name === ALL_AREA_LABEL_NAMES[1]) {
        throw new NetworkErr('fetch failed')
      }
      return undefined
    })

    // Should NOT throw
    await expect(initializeLabels('org/repo', 1, { trigger: 'connect' })).resolves.toBeUndefined()

    // 1 activity row aggregating both failures
    const rows = db.prepare(
      `SELECT type, data FROM activities WHERE type = 'label_provisioning_failed'`,
    ).all() as Array<{ type: string; data: string }>
    expect(rows).toHaveLength(1)
    const data = JSON.parse(rows[0].data) as Record<string, unknown>
    expect(data.workspace_id).toBe(1)
    expect(data.github_repo).toBe('org/repo')
    expect(Array.isArray(data.failed_labels)).toBe(true)
    const failed = data.failed_labels as string[]
    expect(new Set(failed)).toEqual(failingNames)
    expect(data.error_count).toBe(2)
    expect(typeof data.sample_error).toBe('string')
    expect((data.sample_error as string).length).toBeLessThanOrEqual(500)
    expect(data.trigger).toBe('connect')

    // FR-027b: structured log per failure
    const labelLogs = errorLog.filter((entry) => entry.includes('label_provisioning_failed'))
    expect(labelLogs.length).toBeGreaterThanOrEqual(2)
    for (const entry of labelLogs) {
      const obj = JSON.parse(entry) as Record<string, unknown>
      expect(obj.event).toBe('label_provisioning_failed')
      expect(obj.workspace_id).toBe(1)
      expect(obj.github_repo).toBe('org/repo')
      expect(typeof obj.error_class).toBe('string')
      expect(typeof obj.error_message).toBe('string')
    }

    consoleErrorSpy.mockRestore()
  })

  it('sample_error is sanitized (no Authorization header, no gh tokens, ≤500 chars) and trigger flows through', async () => {
    const db = freshMigratedDb()
    seedFlagOnWorkspace(db, 2)
    getDatabaseMock.mockReturnValue(db)

    const longBody = 'X'.repeat(800)
    const tokenLeak = 'ghp_ABCDEFGHijklmnop0123456789ABCDEFGHIJ'
    createLabelMock.mockImplementation(async (_repo: string, label: { name: string }) => {
      if (label.name === ALL_AREA_LABEL_NAMES[0]) {
        throw new HttpStatusError(
          500,
          `Authorization: Bearer ${tokenLeak}\n${longBody}`,
        )
      }
      return undefined
    })

    await initializeLabels('org/repo2', 2, { trigger: 'area_slug_change' })

    const rows = db.prepare(
      `SELECT data FROM activities WHERE type = 'label_provisioning_failed' AND workspace_id = 2`,
    ).all() as Array<{ data: string }>
    expect(rows).toHaveLength(1)
    const data = JSON.parse(rows[0].data) as Record<string, unknown>
    expect(data.trigger).toBe('area_slug_change')
    const sample = data.sample_error as string
    expect(sample.length).toBeLessThanOrEqual(500)
    expect(sample).not.toContain('ghp_')
    expect(sample.toLowerCase()).not.toContain('authorization:')
  })
})

// ── T072 — 24h throttle ──────────────────────────────

describe('SPEC-006 / T072 — initializeLabels 24h throttle (FR-027)', () => {
  it('second invocation within 24h emits structured logs but writes no second activity row', async () => {
    const db = freshMigratedDb()
    seedFlagOnWorkspace(db, 7)
    getDatabaseMock.mockReturnValue(db)

    createLabelMock.mockImplementation(async (_repo: string, label: { name: string }) => {
      if (label.name === ALL_AREA_LABEL_NAMES[0]) {
        throw new HttpStatusError(429, 'rate limited')
      }
      return undefined
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await initializeLabels('org/r', 7, { trigger: 'connect' })
    await initializeLabels('org/r', 7, { trigger: 'connect' })

    const rows = db.prepare(
      `SELECT id, created_at FROM activities
        WHERE type = 'label_provisioning_failed' AND workspace_id = 7`,
    ).all() as Array<{ id: number; created_at: number }>
    // Throttle: only 1 row despite 2 invocations.
    expect(rows).toHaveLength(1)

    // Per-failure logs from both invocations were still emitted.
    const labelLogs = consoleErrorSpy.mock.calls.filter((call) => {
      const arg = call[0]
      return typeof arg === 'object' && arg !== null && (arg as { event?: string }).event === 'label_provisioning_failed'
    })
    expect(labelLogs.length).toBeGreaterThanOrEqual(2)

    consoleErrorSpy.mockRestore()
  })

  it('honors the same-second `>=` boundary (does not write a duplicate at created_at == prev)', async () => {
    const db = freshMigratedDb()
    seedFlagOnWorkspace(db, 8)
    getDatabaseMock.mockReturnValue(db)

    createLabelMock.mockImplementation(async (_repo: string, label: { name: string }) => {
      if (label.name === ALL_AREA_LABEL_NAMES[0]) {
        throw new HttpStatusError(503, 'oops')
      }
      return undefined
    })

    await initializeLabels('o/r', 8, { trigger: 'bootstrap' })
    // Pin the existing row's created_at so the second call falls inside the
    // [now-86400, now] window even on slow systems.
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`UPDATE activities SET created_at = ? WHERE workspace_id = 8`).run(now)
    await initializeLabels('o/r', 8, { trigger: 'bootstrap' })

    const rows = db.prepare(
      `SELECT id FROM activities WHERE type = 'label_provisioning_failed' AND workspace_id = 8`,
    ).all() as Array<{ id: number }>
    expect(rows).toHaveLength(1)
  })
})
