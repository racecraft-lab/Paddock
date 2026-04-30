import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFeatureFlagPreflight, getFeatureFlagMutationBlockers } from '@/lib/feature-flag-service'

let db: Database.Database

const SCHEMA_DDL = [
  `CREATE TABLE workspaces (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    feature_flags TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE agents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    workspace_id INTEGER,
    scope TEXT NOT NULL DEFAULT 'workspace',
    status TEXT NOT NULL DEFAULT 'offline',
    config TEXT
  )`,
  `CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    actor TEXT NOT NULL,
    description TEXT NOT NULL,
    data TEXT,
    workspace_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_id INTEGER,
    target_type TEXT,
    target_id INTEGER,
    detail TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
]

function createPreflightTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  for (const ddl of SCHEMA_DDL) testDb.prepare(ddl).run()

  const insertWorkspace = testDb.prepare(
    'INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)',
  )
  insertWorkspace.run(1, 'product-line-a', 'Product Line A', 1, '{"FEATURE_WORKSPACE_SWITCHER":true}')
  insertWorkspace.run(2, 'facility', 'Facility', 1, null)
  insertWorkspace.run(3, 'tenant-2-product-line', 'Other Tenant Product Line', 2, '{"FEATURE_WORKSPACE_SWITCHER":true}')
  return testDb
}

beforeEach(() => {
  db = createPreflightTestDb()
})

afterEach(() => {
  db.close()
})

describe('getFeatureFlagPreflight runtime readiness (Finding F3)', () => {
  it('blocks FEATURE_GLOBAL_AEGIS enable when no global Aegis row exists', () => {
    const result = getFeatureFlagPreflight(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')

    const runtimeCheck = result.checks.find((c) => c.id === 'runtime-readiness')
    expect(runtimeCheck?.status).toBe('fail')
    expect(runtimeCheck?.detail).toMatch(/No global Aegis row is reachable/)
    expect(result.can_enable).toBe(false)
    expect(result.blockers).toContain(runtimeCheck?.detail)
  })

  it('passes runtime readiness when a canonical global Aegis row exists', () => {
    db.prepare('INSERT INTO agents (id, name, scope, status) VALUES (?, ?, ?, ?)')
      .run(99, 'Aegis', 'global', 'idle')

    const result = getFeatureFlagPreflight(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')

    const runtimeCheck = result.checks.find((c) => c.id === 'runtime-readiness')
    expect(runtimeCheck?.status).toBe('pass')
    expect(result.can_enable).toBe(true)
  })

  it('passes runtime readiness when only a tenant-scoped backfilled global exists', () => {
    db.prepare('INSERT INTO agents (id, name, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?)')
      .run(50, 'Aegis', 1, 'global', 'idle')

    const result = getFeatureFlagPreflight(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')

    const runtimeCheck = result.checks.find((c) => c.id === 'runtime-readiness')
    expect(runtimeCheck?.status).toBe('pass')
    expect(result.can_enable).toBe(true)
  })

  it('fails runtime readiness when only a different-tenant backfilled global exists', () => {
    db.prepare('INSERT INTO agents (id, name, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?)')
      .run(5, 'Aegis', 3, 'global', 'idle')

    const result = getFeatureFlagPreflight(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')

    const runtimeCheck = result.checks.find((c) => c.id === 'runtime-readiness')
    expect(runtimeCheck?.status).toBe('fail')
    expect(result.can_enable).toBe(false)
  })

  it('rejects facility-row enable via scope blocker even when runtime ready', () => {
    db.prepare('INSERT INTO agents (id, name, scope, status) VALUES (?, ?, ?, ?)')
      .run(99, 'Aegis', 'global', 'idle')

    const result = getFeatureFlagPreflight(db, 1, 2, 'FEATURE_GLOBAL_AEGIS')

    expect(result.can_enable).toBe(false)
    expect(result.blockers.some((b) => /facility workspace row/i.test(b))).toBe(true)
  })
})

describe('getFeatureFlagMutationBlockers (Finding F2)', () => {
  it('returns scope blocker when targeting facility row with productLineWorkspace flag', () => {
    const blockers = getFeatureFlagMutationBlockers(db, 1, 2, 'FEATURE_GLOBAL_AEGIS')
    expect(blockers.some((b) => /facility workspace row/i.test(b))).toBe(true)
  })

  it('returns no blockers when targeting a real Product Line workspace', () => {
    const blockers = getFeatureFlagMutationBlockers(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')
    expect(blockers).toEqual([])
  })

  it('blocks mutation when env forces flag OFF', () => {
    process.env.FEATURE_GLOBAL_AEGIS = '0'
    try {
      const blockers = getFeatureFlagMutationBlockers(db, 1, 1, 'FEATURE_GLOBAL_AEGIS')
      expect(blockers).toContain('Deployment configuration forces this flag OFF')
    } finally {
      delete process.env.FEATURE_GLOBAL_AEGIS
    }
  })

  it('blocks mutation when flag is not admin-manageable', () => {
    const blockers = getFeatureFlagMutationBlockers(db, 1, 1, 'FEATURE_TASK_PIPELINES')
    expect(blockers).toContain('This flag is not admin-manageable yet')
  })
})
