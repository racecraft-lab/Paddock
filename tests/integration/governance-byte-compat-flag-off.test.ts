/**
 * SPEC-008 — Byte-compat with flag OFF (T270). Per FR-008, FR-238, P7-AC1.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

let testDb: Database.Database | null = null

afterEach(() => {
  testDb?.close()
  testDb = null
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/command')
  vi.doUnmock('@/lib/config')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

function createFlagOffDispatchDb(): Database.Database {
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
      workspace_id INTEGER,
      scope TEXT NOT NULL DEFAULT 'workspace',
      status TEXT NOT NULL DEFAULT 'offline',
      config TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'agent',
      soul_content TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      resolution TEXT,
      outcome TEXT,
      assigned_to TEXT,
      created_by TEXT NOT NULL DEFAULT 'creator',
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      project_ticket_no INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      metadata TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      ticket_prefix TEXT
    );
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
  db.prepare(
    'INSERT INTO workspaces (id, slug, feature_flags) VALUES (?, ?, ?)',
  ).run(1, 'alpha', '{"FEATURE_RESOURCE_GOVERNANCE":false}')
  db.prepare(
    'INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (?, ?, ?)',
  ).run(1, 1, 'ALP')
  return db
}

async function importTaskDispatchWithDb(
  db: Database.Database,
  runOpenClaw = vi.fn().mockResolvedValue({
    stdout: JSON.stringify({ payloads: [{ text: 'Completed legacy dispatch path' }], sessionId: 'session-1' }),
  }),
) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: {
      logActivity: vi.fn((type, entityType, entityId, actor, description, data, workspaceId) => {
        db.prepare(`
          INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
      }),
    },
  }))
  vi.doMock('@/lib/command', () => ({ runOpenClaw }))
  vi.doMock('@/lib/config', () => ({
    config: { openclawHome: '/tmp/openclaw', openclawBin: 'openclaw' },
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }))

  const taskDispatch = await import('@/lib/task-dispatch')
  return { ...taskDispatch, runOpenClaw }
}

describe('SPEC-008 byte-compat flag-off (T270)', () => {
  it('legacy LIMIT 3 assigned-dispatch batch is unchanged when FEATURE_RESOURCE_GOVERNANCE is OFF', async () => {
    testDb = createFlagOffDispatchDb()
    testDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, status, hidden, role, config)
      VALUES (10, 'Builder', 1, 'idle', 0, 'coder', '{"openclawId":"builder"}')
    `).run()
    const insertTask = testDb.prepare(`
      INSERT INTO tasks
        (id, title, description, status, priority, assigned_to, workspace_id, project_id, project_ticket_no, created_at, updated_at, metadata)
      VALUES (?, ?, 'Legacy dispatch smoke', 'assigned', 'high', 'Builder', 1, 1, ?, ?, ?, '{}')
    `)
    for (let id = 1; id <= 4; id += 1) {
      insertTask.run(id, `Assigned task ${id}`, id, id, id)
    }

    const { dispatchAssignedTasks, runOpenClaw } = await importTaskDispatchWithDb(testDb)

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 3/3 tasks' })
    expect(runOpenClaw).toHaveBeenCalledTimes(3)
    expect(
      testDb.prepare('SELECT id, status FROM tasks ORDER BY id').all(),
    ).toEqual([
      { id: 1, status: 'review' },
      { id: 2, status: 'review' },
      { id: 3, status: 'review' },
      { id: 4, status: 'assigned' },
    ])
    expect(
      testDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_dispatched'").get(),
    ).toEqual({ count: 3 })
  })

  it('"3+ in_progress" auto-routing capacity rule is preserved without governance tables', async () => {
    testDb = createFlagOffDispatchDb()
    testDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, status, hidden, role, config)
      VALUES
        (10, 'BusyBuilder', 1, 'idle', 0, 'coder', '{"capabilities":["governance"]}'),
        (11, 'AvailableBuilder', 1, 'idle', 0, 'coder', '{}')
    `).run()
    const insertTask = testDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, assigned_to, workspace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'high', ?, 1, ?, ?)
    `)
    insertTask.run(100, 'Implement governance follow-up', 'governance coding task', 'inbox', null, 100, 100)
    for (let id = 1; id <= 3; id += 1) {
      insertTask.run(id, `Busy task ${id}`, 'already active', 'in_progress', 'BusyBuilder', id, id)
    }

    const { autoRouteInboxTasks } = await importTaskDispatchWithDb(testDb)

    const result = await autoRouteInboxTasks()

    expect(result).toEqual({ ok: true, message: 'Auto-routed 1/1 inbox task(s)' })
    expect(
      testDb.prepare('SELECT status, assigned_to FROM tasks WHERE id = 100').get(),
    ).toEqual({ status: 'assigned', assigned_to: 'AvailableBuilder' })
    expect(
      testDb.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'resource_governance_%'").get(),
    ).toEqual({ count: 0 })
  })
})
