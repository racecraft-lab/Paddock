import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import { getAegis } from '../../src/lib/aegis'

function createResolverDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      feature_flags TEXT
    );

    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      config TEXT,
      workspace_id INTEGER,
      scope TEXT,
      status TEXT
    );

    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (?, ?, ?)').run(1, 'product-line-a', null)
  return db
}

test.describe('SPEC-003 global Aegis resolver integration', () => {
  test('keeps workspace Aegis first while FEATURE_GLOBAL_AEGIS is off', () => {
    const db = createResolverDb()
    try {
      db.prepare('INSERT INTO agents (id, name, config, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(10, 'aegis', '{"openclawId":"local-aegis"}', 1, 'workspace', 'online')
      db.prepare('INSERT INTO agents (id, name, config, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(20, 'aegis', '{"openclawId":"global-aegis"}', null, 'global', 'online')

      expect(getAegis(db, 1)).toMatchObject({
        id: 10,
        agent_config: '{"openclawId":"local-aegis"}',
        scope: 'workspace',
        workspace_id: 1,
      })
    } finally {
      db.close()
    }
  })

  test('uses global Aegis first while flag is on and records one shadow audit', () => {
    const db = createResolverDb()
    try {
      db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
        .run('{"FEATURE_GLOBAL_AEGIS":true}', 1)
      db.prepare('INSERT INTO agents (id, name, config, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(10, 'aegis', '{"openclawId":"local-aegis"}', 1, 'workspace', 'online')
      db.prepare('INSERT INTO agents (id, name, config, workspace_id, scope, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(20, 'aegis', '{"openclawId":"global-aegis"}', null, 'global', 'online')

      expect(getAegis(db, 1)).toMatchObject({
        id: 20,
        agent_config: '{"openclawId":"global-aegis"}',
        scope: 'global',
        workspace_id: null,
      })
      expect(getAegis(db, 1).id).toBe(20)

      const auditRows = db.prepare(`
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

      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]).toMatchObject({
        entity_type: 'agent',
        entity_id: 10,
        actor: 'system',
        workspace_id: 1,
      })
      expect(JSON.parse(auditRows[0].data)).toEqual({
        feature_flag: 'FEATURE_GLOBAL_AEGIS',
        global_agent_id: 20,
        local_agent_id: 10,
        workspace_id: 1,
      })
    } finally {
      db.close()
    }
  })
})
