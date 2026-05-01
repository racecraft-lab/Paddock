import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
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
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix, ticket_counter) VALUES (10, 1, ?, 2)').run('OPS')
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, project_id, created_by, created_at, updated_at, tags, metadata, workspace_id)
    VALUES (100, 'Daily check', 'Template', 'inbox', 'medium', 10, 'operator', 1, 1, '[]', ?, 1)
  `).run(JSON.stringify({ recurrence: { enabled: true, cron_expr: '* * * * *', last_spawned_at: null, spawn_count: 0, parent_task_id: null } }))
  return db
}

async function importCreateTask(db: Database.Database) {
  const broadcast = vi.fn()
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast } }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' } } }))
  const taskCreateModule = await import('@/lib/task-create')
  return { ...taskCreateModule, broadcast, runtime: { broadcast, gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' } } }
}

afterEach(() => {
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/config')
  vi.resetModules()
})

describe('createTask recurring source profile', () => {
  it('allocates project tickets inside caller-owned recurrence transactions without external effects', async () => {
    const db = createDb()
    const { createTask, broadcast, runtime } = await importCreateTask(db)
    const tx = db.transaction(() => {
      const result: any = createTask({
        source: 'recurring',
        db,
        runtime,
        transaction: 'caller',
        title: 'Daily check - May 01',
        description: 'Template',
        status: 'assigned',
        priority: 'medium',
        project_id: 10,
        assigned_to: 'builder',
        created_by: 'scheduler',
        workspace_id: 1,
        tags: [],
        metadata: { recurrence: { parent_task_id: 100, spawned_from_cron: '* * * * *' } },
        activity: {
          description: 'Recurring task spawned: Daily check - May 01',
          data: { parent_task_id: 100, cron_expr: '* * * * *' },
        },
      } as any)
      db.prepare('UPDATE tasks SET metadata = ? WHERE id = 100').run(JSON.stringify({
        recurrence: { enabled: true, cron_expr: '* * * * *', last_spawned_at: 10, spawn_count: 1, parent_task_id: null },
      }))
      return result
    })

    const result: any = tx()

    expect(result).toMatchObject({
      taskId: 101,
      ticket: 'OPS-003',
      activityIds: [1],
      notificationIds: [],
      subscriptionRecipients: [],
      outboundSync: { githubQueued: false, gatewayQueued: false },
    })
    expect(db.prepare('SELECT project_ticket_no FROM tasks WHERE id = 101').get()).toEqual({ project_ticket_no: 3 })
    expect(db.prepare('SELECT ticket_counter FROM projects WHERE id = 10').get()).toEqual({ ticket_counter: 3 })
    expect(broadcast).not.toHaveBeenCalledWith('task.created', expect.anything())
  })

  it('rolls child task creation back when the caller-owned recurrence transaction fails', async () => {
    const db = createDb()
    const { createTask, runtime } = await importCreateTask(db)

    expect(() => db.transaction(() => {
      createTask({
        source: 'recurring',
        db,
        runtime,
        transaction: 'caller',
        title: 'Daily check - May 01',
        status: 'inbox',
        priority: 'medium',
        project_id: 10,
        created_by: 'scheduler',
        workspace_id: 1,
      } as any)
      throw new Error('template metadata update failed')
    })()).toThrow('template metadata update failed')

    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT ticket_counter FROM projects WHERE id = 10').get()).toEqual({ ticket_counter: 2 })
  })
})
