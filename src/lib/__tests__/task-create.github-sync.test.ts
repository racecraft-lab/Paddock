import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      project_id INTEGER,
      project_ticket_no INTEGER,
      assigned_to TEXT,
      created_by TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      tags TEXT,
      metadata TEXT,
      workspace_id INTEGER NOT NULL,
      github_issue_number INTEGER,
      github_repo TEXT,
      github_synced_at INTEGER
    );
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  return db
}

async function importCreateTask(db: Database.Database) {
  const broadcast = vi.fn()
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast } }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: false, autoSync: false, repoPath: '' } } }))
  const taskCreateModule = await import('@/lib/task-create')
  return { ...taskCreateModule, broadcast, runtime: { broadcast, gnap: { enabled: false, autoSync: false, repoPath: '' } } }
}

afterEach(() => {
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/config')
  vi.resetModules()
})

describe('createTask github_sync source profile', () => {
  it('stores canonical GitHub columns and records sync-created activity without broadcast or outbound effects', async () => {
    const db = createDb()
    const { createTask, broadcast, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'github_sync',
      db,
      runtime,
      title: 'Synced issue',
      description: 'Issue body',
      status: 'backlog',
      priority: 'low',
      created_by: 'github-sync',
      workspace_id: 1,
      project_id: 99,
      tags: ['external'],
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 8,
      github_synced_at: 123,
      activity: {
        description: 'Synced from GitHub: racecraft-lab/Paddock#8',
        data: { github_issue: 8, github_repo: 'racecraft-lab/Paddock' },
      },
    } as any)

    expect(result).toMatchObject({
      taskId: 1,
      activityIds: [1],
      notificationIds: [],
      subscriptionRecipients: [],
      outboundSync: { githubQueued: false, gatewayQueued: false },
    })
    expect(db.prepare('SELECT github_repo, github_issue_number, github_synced_at, project_ticket_no FROM tasks WHERE id = 1').get()).toEqual({
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 8,
      github_synced_at: 123,
      project_ticket_no: null,
    })
    expect(db.prepare('SELECT entity_id, actor FROM activities').get()).toEqual({ entity_id: 1, actor: 'github-sync' })
    expect(broadcast).not.toHaveBeenCalledWith('task.created', expect.anything())
  })

  it('treats an existing canonical GitHub issue as a duplicate import', async () => {
    const db = createDb()
    db.prepare(`
      INSERT INTO tasks (id, title, status, priority, created_by, created_at, updated_at, tags, metadata, workspace_id, github_repo, github_issue_number)
      VALUES (3, 'Existing sync', 'backlog', 'medium', 'github-sync', 1, 1, '[]', '{}', 1, 'racecraft-lab/Paddock', 8)
    `).run()
    const { createTask, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'github_sync',
      db,
      runtime,
      title: 'Synced issue',
      workspace_id: 1,
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 8,
    } as any)

    expect(result).toMatchObject({ taskId: 3, duplicate: true, activityIds: [] })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 })
  })
})
