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
      assigned_to TEXT,
      created_by TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      tags TEXT,
      metadata TEXT,
      workspace_id INTEGER NOT NULL,
      project_ticket_no INTEGER,
      project_id INTEGER,
      github_issue_number INTEGER,
      github_repo TEXT,
      github_synced_at INTEGER
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER
    );
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  return db
}

async function importCreateTask(db: Database.Database) {
  const broadcast = vi.fn()
  const pushTaskToGitHub = vi.fn()
  const pushTaskToGnap = vi.fn()
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ pushTaskToGitHub }))
  vi.doMock('@/lib/gnap-sync', () => ({ pushTaskToGnap }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' } } }))
  const taskCreateModule = await import('@/lib/task-create')
  return {
    ...taskCreateModule,
    broadcast,
    pushTaskToGitHub,
    pushTaskToGnap,
    runtime: {
      broadcast,
      pushTaskToGitHub,
      pushTaskToGnap,
      gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' },
    },
  }
}

afterEach(() => {
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/gnap-sync')
  vi.doUnmock('@/lib/config')
  vi.resetModules()
})

describe('createTask github_import source profile', () => {
  it('preserves GitHub metadata, broadcasts, and suppresses notification and outbound defaults', async () => {
    const db = createDb()
    const { createTask, broadcast, pushTaskToGitHub, pushTaskToGnap, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'github_import',
      db,
      runtime,
      title: 'Imported issue',
      description: 'Issue body',
      status: 'inbox',
      priority: 'high',
      assigned_to: 'builder',
      created_by: 'operator',
      workspace_id: 1,
      tags: ['bug'],
      metadata: {
        github_repo: 'racecraft/mission-control',
        github_issue_number: 42,
        github_issue_url: 'https://github.com/racecraft/mission-control/issues/42',
      },
      activity: {
        description: 'Imported from GitHub: racecraft/mission-control#42',
        data: { github_issue: 42, github_repo: 'racecraft/mission-control' },
      },
    } as any)

    expect(result).toMatchObject({
      taskId: 1,
      ticket: null,
      activityIds: [1],
      notificationIds: [],
      subscriptionRecipients: [],
      outboundSync: { githubQueued: false, gatewayQueued: false },
    })
    expect(result.task.metadata).toMatchObject({ github_repo: 'racecraft/mission-control', github_issue_number: 42 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_subscriptions').get()).toEqual({ count: 0 })
    expect(pushTaskToGitHub).not.toHaveBeenCalled()
    expect(pushTaskToGnap).not.toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith('task.created', expect.objectContaining({ id: 1 }))
  })

  it('returns an existing imported issue without duplicating the task', async () => {
    const db = createDb()
    db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, created_by, created_at, updated_at, tags, metadata, workspace_id)
      VALUES (7, 'Existing', '', 'inbox', 'medium', 'operator', 1, 1, '[]', ?, 1)
    `).run(JSON.stringify({ github_repo: 'racecraft/mission-control', github_issue_number: 42 }))
    const { createTask, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'github_import',
      db,
      runtime,
      title: 'Imported issue',
      workspace_id: 1,
      metadata: { github_repo: 'racecraft/mission-control', github_issue_number: 42 },
    } as any)

    expect(result).toMatchObject({ taskId: 7, duplicate: true, activityIds: [], notificationIds: [] })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 })
  })
})
