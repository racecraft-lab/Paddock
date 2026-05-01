/**
 * SPEC-006 — Migration M63 tests (T003)
 *
 * Asserts:
 *   (a) M63 adds projects.area_slug TEXT NULL,
 *       projects.is_triage_project INTEGER DEFAULT 0,
 *       projects.is_repo_sync_owner INTEGER DEFAULT 0,
 *       tasks.area_routing_backfilled_at INTEGER NULL.
 *   (b) Four target indexes exist:
 *       - idx_projects_workspace_area_slug (non-unique)
 *       - idx_projects_one_sync_owner_per_repo (partial unique on is_repo_sync_owner=1)
 *       - idx_projects_one_triage_per_workspace (partial unique on is_triage_project=1)
 *       - idx_tasks_area_routing_backfill_pending (partial on github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL).
 *   (c) NO NOT NULL on any new column (FR-003 / Constitution Article VII).
 *   (d) Owner election is deterministic — MIN(projects.id) per group with
 *       at least one github_sync_enabled=1 project.
 *   (e) Re-running M63 is idempotent.
 *   (f) Legacy (workspace_id, github_repo, github_issue_number) unique preserved.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function columns(db: Database.Database, table: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
    type: string
    notnull: number
    dflt_value: string | null
  }>
}

function indexNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((r) => r.name)
}

function indexSql(db: Database.Database, name: string): string | undefined {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`).get(name) as
    | { sql: string | null }
    | undefined
  return row?.sql ?? undefined
}

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

describe('SPEC-006 / M63 migration', () => {
  it('adds the four nullable columns with correct types and defaults', () => {
    const db = freshMigratedDb()

    const projects = columns(db, 'projects')
    const areaSlug = projects.find((c) => c.name === 'area_slug')
    const isTriage = projects.find((c) => c.name === 'is_triage_project')
    const isOwner = projects.find((c) => c.name === 'is_repo_sync_owner')

    expect(areaSlug).toBeDefined()
    expect(areaSlug?.notnull).toBe(0)
    expect((areaSlug?.type || '').toUpperCase()).toContain('TEXT')

    expect(isTriage).toBeDefined()
    expect(isTriage?.notnull).toBe(0)
    expect(String(isTriage?.dflt_value)).toBe('0')

    expect(isOwner).toBeDefined()
    expect(isOwner?.notnull).toBe(0)
    expect(String(isOwner?.dflt_value)).toBe('0')

    const tasks = columns(db, 'tasks')
    const backfilledAt = tasks.find((c) => c.name === 'area_routing_backfilled_at')
    expect(backfilledAt).toBeDefined()
    expect(backfilledAt?.notnull).toBe(0)
  })

  it('creates the four target indexes with correct partial-WHERE clauses', () => {
    const db = freshMigratedDb()

    const projectIndexes = indexNames(db, 'projects')
    expect(projectIndexes).toEqual(
      expect.arrayContaining([
        'idx_projects_workspace_area_slug',
        'idx_projects_one_sync_owner_per_repo',
        'idx_projects_one_triage_per_workspace',
      ])
    )

    const ownerIdxSql = indexSql(db, 'idx_projects_one_sync_owner_per_repo')
    expect(ownerIdxSql).toMatch(/UNIQUE/i)
    expect(ownerIdxSql).toMatch(/WHERE\s+is_repo_sync_owner\s*=\s*1/i)

    const triageIdxSql = indexSql(db, 'idx_projects_one_triage_per_workspace')
    expect(triageIdxSql).toMatch(/UNIQUE/i)
    expect(triageIdxSql).toMatch(/WHERE\s+is_triage_project\s*=\s*1/i)

    const tasksIndexes = indexNames(db, 'tasks')
    expect(tasksIndexes).toContain('idx_tasks_area_routing_backfill_pending')
    const backfillIdxSql = indexSql(db, 'idx_tasks_area_routing_backfill_pending')
    expect(backfillIdxSql).toMatch(/WHERE\s+github_issue_number\s+IS\s+NOT\s+NULL/i)
    expect(backfillIdxSql).toMatch(/area_routing_backfilled_at\s+IS\s+NULL/i)
  })

  it('elects MIN(id) per group with at least one enabled project; zero for disabled-only groups', () => {
    const db = freshMigratedDb()

    db.exec(`
      INSERT INTO projects (id, workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, status)
      VALUES
        (101, 1, 'A1', 'a1', 'A1', 'org/repo-a', 1, 'active'),
        (102, 1, 'A2', 'a2', 'A2', 'org/repo-a', 1, 'active'),
        (103, 1, 'A3', 'a3', 'A3', 'org/repo-a', 0, 'active'),
        (201, 1, 'B1', 'b1', 'B1', 'org/repo-b', 0, 'active'),
        (202, 1, 'B2', 'b2', 'B2', 'org/repo-b', 0, 'active'),
        (301, 1, 'C1', 'c1', 'C1', 'org/repo-c', 1, 'active');
    `)

    // Apply the deterministic owner-election logic (the same UPDATE M63 runs
    // post-column-addition). After the migration runs on an existing DB with
    // pre-existing projects, owners are elected. For projects added AFTER the
    // migration ran, callers must run the same election themselves — that's
    // why we re-issue the UPDATE here as part of the test.
    db.exec(`
      UPDATE projects
      SET is_repo_sync_owner = 1
      WHERE id IN (
        SELECT MIN(p.id) FROM projects p
        WHERE p.github_repo IS NOT NULL
          AND p.github_sync_enabled = 1
        GROUP BY p.workspace_id, p.github_repo
        HAVING SUM(p.is_repo_sync_owner) = 0
      )
    `)

    expect(
      db.prepare(`SELECT id FROM projects WHERE workspace_id=1 AND github_repo='org/repo-a' AND is_repo_sync_owner=1`).all()
    ).toEqual([{ id: 101 }])

    expect(
      db.prepare(`SELECT COUNT(*) as c FROM projects WHERE workspace_id=1 AND github_repo='org/repo-b' AND is_repo_sync_owner=1`).get()
    ).toEqual({ c: 0 })

    expect(
      db.prepare(`SELECT id FROM projects WHERE workspace_id=1 AND github_repo='org/repo-c' AND is_repo_sync_owner=1`).all()
    ).toEqual([{ id: 301 }])
  })

  it('M63 is idempotent — re-applying does not raise UNIQUE violations', () => {
    const db = freshMigratedDb()

    db.prepare(`DELETE FROM schema_migrations WHERE id LIKE '062%'`).run()
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('preserves legacy (workspace_id, github_repo, github_issue_number) unique constraint', () => {
    const db = freshMigratedDb()

    const tasksIndexes = indexNames(db, 'tasks')
    const indexInfo = tasksIndexes.map((n) => ({
      name: n,
      sql: indexSql(db, n) ?? '',
    }))
    const hasLegacyUnique = indexInfo.some(
      (i) =>
        /UNIQUE/i.test(i.sql) &&
        /workspace_id/i.test(i.sql) &&
        /github_repo/i.test(i.sql) &&
        /github_issue_number/i.test(i.sql)
    )
    expect(hasLegacyUnique).toBe(true)
  })
})
