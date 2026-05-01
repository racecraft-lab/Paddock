/**
 * SPEC-006 — Post-M62 EXPLAIN QUERY PLAN regression (T012, FR-002, P5-AC1)
 *
 * Asserts that after M62 applies (adding the four new SPEC-006 indexes), the
 * canonical legacy query set's planner output:
 *   (a) does not reference any of the four new indexes
 *   (b) is byte-identical to a "pre-M62" baseline DB (full migrations applied
 *       then the four new indexes dropped — the new columns are nullable
 *       additions and cannot influence any legacy plan).
 *
 * Source of truth: __fixtures__/explain-query-plan-pre-m62.json.
 *
 * Uses relative imports per the worktree convention.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runMigrations } from '../migrations'

interface FixtureQuery {
  name: string
  source: string
  sql: string
  params: Array<string | number>
}

interface Fixture {
  queries: FixtureQuery[]
  forbidden_indexes_post_m62: string[]
}

interface PlanRow {
  id: number
  parent: number
  notused: number
  detail: string
}

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function loadFixture(): Fixture {
  const path = join(__dirname, '__fixtures__', 'explain-query-plan-pre-m62.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture
}

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function freshPreM62Db(): Database.Database {
  const db = freshMigratedDb()
  db.exec(`DROP INDEX IF EXISTS idx_projects_workspace_area_slug`)
  db.exec(`DROP INDEX IF EXISTS idx_projects_one_sync_owner_per_repo`)
  db.exec(`DROP INDEX IF EXISTS idx_projects_one_triage_per_workspace`)
  db.exec(`DROP INDEX IF EXISTS idx_tasks_area_routing_backfill_pending`)
  return db
}

function capturePlan(db: Database.Database, sql: string, params: Array<string | number>): string {
  const stmt = db.prepare('EXPLAIN QUERY PLAN ' + sql)
  const rows = (params.length > 0 ? stmt.all(...params) : stmt.all()) as PlanRow[]
  return rows.map((r) => r.id + '|' + r.parent + '|' + r.detail).join('\n')
}

const fixture = loadFixture()

describe('SPEC-006 / T012 — EXPLAIN QUERY PLAN post-M62 regression', () => {
  it.each(fixture.queries)('legacy plan unchanged after M62: $name', ({ sql, params }) => {
    const preDb = freshPreM62Db()
    const postDb = freshMigratedDb()

    const prePlan = capturePlan(preDb, sql, params)
    const postPlan = capturePlan(postDb, sql, params)

    expect(postPlan).toBe(prePlan)
  })

  it.each(fixture.queries)('post-M62 plan does not reference any new SPEC-006 index: $name', ({ sql, params }) => {
    const db = freshMigratedDb()
    const plan = capturePlan(db, sql, params)

    for (const forbidden of fixture.forbidden_indexes_post_m62) {
      expect(plan).not.toContain(forbidden)
    }
  })
})
