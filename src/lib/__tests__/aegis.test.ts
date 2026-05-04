import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAegis, hasGlobalAegisCandidate } from '@/lib/aegis'
import {
  expandFeatureFlagCascade,
  isFeatureFlagKey,
  type FeatureFlagKey,
} from '@/lib/feature-flags'

let db: Database.Database

function createAegisTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      feature_flags TEXT
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER,
      scope TEXT NOT NULL DEFAULT 'workspace',
      status TEXT NOT NULL DEFAULT 'offline',
      config TEXT
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  testDb.prepare('INSERT INTO workspaces (id, slug, tenant_id, feature_flags) VALUES (?, ?, ?, ?)').run(1, 'alpha', 1, null)
  testDb.prepare('INSERT INTO workspaces (id, slug, tenant_id, feature_flags) VALUES (?, ?, ?, ?)').run(2, 'beta', 1, null)
  return testDb
}

function insertWorkspace(id: number, slug: string, tenantId: number): void {
  db.prepare('INSERT INTO workspaces (id, slug, tenant_id, feature_flags) VALUES (?, ?, ?, ?)').run(id, slug, tenantId, null)
}

function setWorkspaceFlags(workspaceId: number, flags: string | Record<string, unknown> | null): void {
  const expanded = typeof flags === 'string' || flags === null
    ? flags
    : Object.entries(flags).reduce<Record<string, unknown>>((next, [key, value]) => {
        if (isFeatureFlagKey(key) && typeof value === 'boolean') {
          Object.assign(next, expandFeatureFlagCascade(key as FeatureFlagKey, value))
        } else {
          next[key] = value
        }
        return next
      }, {})
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    .run(typeof expanded === 'string' ? expanded : expanded ? JSON.stringify(expanded) : null, workspaceId)
}

function insertAegis(row: {
  id: number
  workspaceId?: number | null
  scope?: 'workspace' | 'global'
  status?: string
  config?: string | null
  name?: string
}): void {
  db.prepare(`
    INSERT INTO agents (id, name, workspace_id, scope, status, config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.name ?? 'Aegis',
    row.workspaceId ?? null,
    row.scope ?? 'workspace',
    row.status ?? 'offline',
    row.config ?? null,
  )
}

beforeEach(() => {
  db = createAegisTestDb()
})

afterEach(() => {
  db.close()
})

describe('getAegis', () => {
  it('returns the gateway fallback shape when no database Aegis row exists', () => {
    expect(getAegis(db, 1)).toEqual({
      name: 'aegis',
      config: null,
      agent_config: null,
      workspace_id: 1,
      scope: null,
    })
  })

  it('keeps flag-off resolution workspace-first before global fallback', () => {
    insertAegis({ id: 10, workspaceId: 1, config: '{"openclawId":"local-aegis"}' })
    insertAegis({ id: 20, scope: 'global', config: '{"openclawId":"global-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 10,
      name: 'Aegis',
      config: '{"openclawId":"local-aegis"}',
      agent_config: '{"openclawId":"local-aegis"}',
      workspace_id: 1,
      scope: 'workspace',
    })
  })

  it('falls back to global Aegis when the flag is off and no local row exists', () => {
    insertAegis({ id: 20, scope: 'global', config: '{"openclawId":"global-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 20,
      agent_config: '{"openclawId":"global-aegis"}',
      workspace_id: null,
      scope: 'global',
    })
  })

  it('prefers global Aegis when the workspace flag is on', () => {
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    insertAegis({ id: 10, workspaceId: 1, config: '{"openclawId":"local-aegis"}' })
    insertAegis({ id: 20, scope: 'global', config: '{"openclawId":"global-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 20,
      agent_config: '{"openclawId":"global-aegis"}',
      workspace_id: null,
      scope: 'global',
    })
  })

  it('falls back to local Aegis when the flag is on and no global row exists', () => {
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    insertAegis({ id: 10, workspaceId: 1, config: '{"openclawId":"local-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 10,
      agent_config: '{"openclawId":"local-aegis"}',
      workspace_id: 1,
      scope: 'workspace',
    })
  })

  it('defaults malformed workspace flag JSON to flag-off precedence', () => {
    setWorkspaceFlags(1, '{not json')
    insertAegis({ id: 10, workspaceId: 1, config: '{"openclawId":"local-aegis"}' })
    insertAegis({ id: 20, scope: 'global', config: '{"openclawId":"global-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({ id: 10, scope: 'workspace' })
  })

  it('uses lowest id tie breaking within the canonical global scope and does not filter by status', () => {
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    insertAegis({ id: 30, scope: 'global', status: 'idle' })
    insertAegis({ id: 20, scope: 'global', status: 'error' })

    expect(getAegis(db, 1)).toMatchObject({ id: 20, status: 'error' })
  })

  it('records one shadow audit row when global Aegis supersedes local Aegis', () => {
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    insertAegis({ id: 10, workspaceId: 1 })
    insertAegis({ id: 20, scope: 'global' })

    getAegis(db, 1)
    getAegis(db, 1)

    const rows = db.prepare(`
      SELECT type, entity_type, entity_id, actor, workspace_id, data
      FROM activities
      WHERE type = 'aegis_local_shadowed'
    `).all() as Array<{
      type: string
      entity_type: string
      entity_id: number
      actor: string
      workspace_id: number
      data: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'aegis_local_shadowed',
      entity_type: 'agent',
      entity_id: 10,
      actor: 'system',
      workspace_id: 1,
    })
    expect(JSON.parse(rows[0].data)).toEqual({
      feature_flag: 'FEATURE_GLOBAL_AEGIS',
      global_agent_id: 20,
      local_agent_id: 10,
      workspace_id: 1,
    })
  })

  it('does not treat a post-M53-backfill row (workspace_id set, scope=global) as a local Aegis', () => {
    insertAegis({ id: 10, workspaceId: 1, scope: 'global', config: '{"openclawId":"backfilled-global"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 10,
      scope: 'global',
      workspace_id: 1,
    })

    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    const result = getAegis(db, 1)
    expect(result).toMatchObject({ id: 10, scope: 'global' })
    const auditRows = db.prepare(`SELECT id FROM activities WHERE type = 'aegis_local_shadowed'`).all()
    expect(auditRows).toHaveLength(0)
  })

  it('does not route across tenants when only M53-backfilled global rows exist', () => {
    insertWorkspace(10, 'tenant-2-product-line', 2)
    insertAegis({ id: 5, workspaceId: 10, scope: 'global', config: '{"openclawId":"tenant-2-aegis"}' })
    insertAegis({ id: 50, workspaceId: 1, scope: 'global', config: '{"openclawId":"tenant-1-aegis"}' })

    expect(getAegis(db, 1)).toMatchObject({
      id: 50,
      scope: 'global',
      workspace_id: 1,
      agent_config: '{"openclawId":"tenant-1-aegis"}',
    })

    expect(getAegis(db, 10)).toMatchObject({
      id: 5,
      scope: 'global',
      workspace_id: 10,
      agent_config: '{"openclawId":"tenant-2-aegis"}',
    })
  })

  it('prefers a canonical global (workspace_id IS NULL) over any backfilled row', () => {
    insertWorkspace(10, 'tenant-2-product-line', 2)
    insertAegis({ id: 5, workspaceId: 10, scope: 'global' })
    insertAegis({ id: 50, workspaceId: 1, scope: 'global' })
    insertAegis({ id: 99, scope: 'global', config: '{"openclawId":"canonical"}' })

    expect(getAegis(db, 1)).toMatchObject({ id: 99, workspace_id: null })
    expect(getAegis(db, 10)).toMatchObject({ id: 99, workspace_id: null })
  })

  it('does not double-write shadow audit rows under repeated calls (atomic insert)', () => {
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    insertAegis({ id: 10, workspaceId: 1 })
    insertAegis({ id: 20, scope: 'global' })

    for (let i = 0; i < 25; i += 1) {
      getAegis(db, 1)
    }

    const count = (db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'aegis_local_shadowed'`)
      .get() as { c: number }).c
    expect(count).toBe(1)
  })
})

describe('hasGlobalAegisCandidate', () => {
  it('returns false when no global Aegis row exists', () => {
    expect(hasGlobalAegisCandidate(db, 1)).toBe(false)
  })

  it('returns true for a canonical global Aegis row', () => {
    insertAegis({ id: 99, scope: 'global' })
    expect(hasGlobalAegisCandidate(db, 1)).toBe(true)
  })

  it('returns true for a backfilled global Aegis in the same tenant', () => {
    insertAegis({ id: 50, workspaceId: 1, scope: 'global' })
    expect(hasGlobalAegisCandidate(db, 1)).toBe(true)
  })

  it('returns false when only cross-tenant backfilled global Aegis rows exist', () => {
    insertWorkspace(10, 'tenant-2', 2)
    insertAegis({ id: 5, workspaceId: 10, scope: 'global' })
    expect(hasGlobalAegisCandidate(db, 1)).toBe(false)
  })
})
