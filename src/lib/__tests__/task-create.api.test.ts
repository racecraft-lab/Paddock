import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createTaskDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      ticket_prefix TEXT,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      github_repo TEXT,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER
    );
    CREATE TABLE users (username TEXT PRIMARY KEY, display_name TEXT, workspace_id INTEGER NOT NULL);
    CREATE TABLE agents (name TEXT PRIMARY KEY, role TEXT, config TEXT, workspace_id INTEGER NOT NULL);
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
      due_date INTEGER,
      estimated_hours REAL,
      actual_hours REAL,
      outcome TEXT,
      error_message TEXT,
      resolution TEXT,
      feedback_rating INTEGER,
      feedback_notes TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      tags TEXT,
      metadata TEXT,
      workspace_id INTEGER NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER,
      github_issue_number INTEGER,
      github_repo TEXT,
      github_synced_at INTEGER
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER NOT NULL,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE task_subscriptions (
      task_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      UNIQUE(task_id, agent_name)
    );
  `)
  db.prepare(`
    INSERT INTO projects (id, workspace_id, ticket_prefix, ticket_counter, github_repo, github_sync_enabled)
    VALUES (10, 1, 'OPS', 4, 'racecraft/mission-control', 1)
  `).run()
  db.prepare('INSERT INTO users (username, display_name, workspace_id) VALUES (?, ?, ?)').run('operator', 'Operator', 1)
  db.prepare('INSERT INTO agents (name, role, config, workspace_id) VALUES (?, ?, ?, ?)').run('builder', 'coder', '{}', 1)
  db.prepare('INSERT INTO agents (name, role, config, workspace_id) VALUES (?, ?, ?, ?)').run('reviewer', 'reviewer', '{}', 1)
  return db
}

async function importCreateTask(db: Database.Database) {
  const broadcast = vi.fn()
  const pushTaskToGitHub = vi.fn(() => Promise.resolve())
  const pushTaskToGnap = vi.fn()
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ pushTaskToGitHub }))
  vi.doMock('@/lib/gnap-sync', () => ({ pushTaskToGnap }))
  vi.doMock('@/lib/config', () => ({
    config: { gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' } },
  }))
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
      resolveMentionRecipients: (text: string) => {
        const tokens = Array.from(text.matchAll(/@([A-Za-z0-9._-]+)/g)).map((match) => match[1])
        const known = new Set(['reviewer', 'builder', 'operator'])
        return {
          unresolved: tokens.filter((token) => !known.has(token)),
          recipients: tokens.filter((token) => known.has(token)),
        }
      },
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

describe('createTask api source profile', () => {
  it('allocates a ticket, stores bounded task data, and preserves API side effects', async () => {
    const db = createTaskDb()
    const { createTask, broadcast, pushTaskToGitHub, pushTaskToGnap, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'api',
      db,
      runtime,
      title: 'Wire shared creator',
      description: 'Please pair with @reviewer',
      status: 'assigned',
      priority: 'high',
      assigned_to: 'builder',
      created_by: 'operator',
      project_id: 10,
      workspace_id: 1,
      tags: ['spec-004'],
      metadata: { implementation_repo: 'racecraft/mission-control' },
    } as any)

    expect(result).toMatchObject({
      taskId: 1,
      ticket: 'OPS-005',
      activityIds: [1],
      notificationIds: [1, 2],
      subscriptionRecipients: ['operator', 'reviewer', 'builder'],
      outboundSync: { githubQueued: true, gatewayQueued: true },
    })
    expect(result.task).toMatchObject({
      id: 1,
      title: 'Wire shared creator',
      project_ticket_no: 5,
      ticket_ref: 'OPS-005',
      tags: ['spec-004'],
      metadata: { implementation_repo: 'racecraft/mission-control' },
    })
    expect(result.raw).toBeUndefined()

    expect(db.prepare('SELECT ticket_counter FROM projects WHERE id = 10').get()).toEqual({ ticket_counter: 5 })
    expect(db.prepare('SELECT type, actor, entity_id FROM activities').all()).toEqual([
      { type: 'task_created', actor: 'operator', entity_id: 1 },
    ])
    expect(db.prepare('SELECT agent_name FROM task_subscriptions ORDER BY agent_name').all()).toEqual([
      { agent_name: 'builder' },
      { agent_name: 'operator' },
      { agent_name: 'reviewer' },
    ])
    expect(db.prepare('SELECT recipient, type FROM notifications ORDER BY recipient, type').all()).toEqual([
      { recipient: 'builder', type: 'assignment' },
      { recipient: 'reviewer', type: 'mention' },
    ])
    expect(pushTaskToGitHub).toHaveBeenCalledTimes(1)
    expect(pushTaskToGnap).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith('task.created', expect.objectContaining({ id: 1 }))
  })

  it('rejects unresolved API mentions before inserting a task', async () => {
    const db = createTaskDb()
    const { createTask, UnknownMentionsError, runtime } = await importCreateTask(db)

    expect(() => createTask({
      source: 'api',
      db,
      runtime,
      title: 'Bad mention',
      description: 'Missing @nobody',
      created_by: 'operator',
      workspace_id: 1,
    } as any)).toThrow(/Unknown mentions: @nobody/)
    try {
      createTask({
        source: 'api',
        db,
        runtime,
        title: 'Bad mention',
        description: 'Missing @nobody',
        created_by: 'operator',
        workspace_id: 1,
      } as any)
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownMentionsError)
      expect((err as InstanceType<typeof UnknownMentionsError>).missingMentions).toEqual(['nobody'])
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 0 })
  })
})
