import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAegis } from '@/lib/aegis'

let db: Database.Database

function createAegisTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
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
  testDb.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (?, ?, ?)').run(1, 'alpha', null)
  testDb.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (?, ?, ?)').run(2, 'beta', null)
  return testDb
}

function setWorkspaceFlags(workspaceId: number, flags: string | Record<string, unknown> | null): void {
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    .run(typeof flags === 'string' ? flags : flags ? JSON.stringify(flags) : null, workspaceId)
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

  it('uses lowest id tie breaking within the selected scope and does not filter by status', () => {
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
    // M53 backfill promotes existing per-workspace Aegis rows to scope='global' while preserving
    // their workspace_id. findWorkspaceAegis must not match these — they are global, not local.
    insertAegis({ id: 10, workspaceId: 1, scope: 'global', config: '{"openclawId":"backfilled-global"}' })

    // Flag off: local lookup should return null; global fallback picks up the backfilled row.
    expect(getAegis(db, 1)).toMatchObject({
      id: 10,
      scope: 'global',
      workspace_id: 1,
    })

    // Flag on: global lookup returns the row directly; no self-shadow audit is written.
    setWorkspaceFlags(1, { FEATURE_GLOBAL_AEGIS: true })
    const result = getAegis(db, 1)
    expect(result).toMatchObject({ id: 10, scope: 'global' })
    const auditRows = db.prepare(`SELECT id FROM activities WHERE type = 'aegis_local_shadowed'`).all()
    expect(auditRows).toHaveLength(0)
  })
})
