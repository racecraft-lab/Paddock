import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0, updated_at INTEGER);
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
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER
    );
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, type TEXT, title TEXT, message TEXT, source_type TEXT, source_id INTEGER, workspace_id INTEGER);
    CREATE TABLE task_subscriptions (task_id INTEGER, agent_name TEXT, UNIQUE(task_id, agent_name));
  `)
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix, ticket_counter, github_repo, github_sync_enabled) VALUES (10, 1, ?, 9, ?, 1)').run('OPS', 'racecraft-lab/Paddock')
  db.prepare(`
    INSERT INTO tasks (id, title, status, priority, project_id, project_ticket_no, created_by, created_at, updated_at, tags, metadata, workspace_id, workflow_template_id, workflow_template_slug, root_task_id, chain_id, chain_stage)
    VALUES (100, 'Parent', 'done', 'high', 10, 9, 'operator', 1, 1, '[]', '{}', 1, 1, 'intake', 100, 'chain-1', 0)
  `).run()
  return db
}

async function importCreateTask(db: Database.Database) {
  const pushTaskToGitHub = vi.fn(() => Promise.resolve())
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ pushTaskToGitHub }))
  vi.doMock('@/lib/config', () => ({ config: { gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' } } }))
  vi.doMock('@/lib/gnap-sync', () => ({ pushTaskToGnap: vi.fn() }))
  const taskCreateModule = await import('@/lib/task-create')
  return {
    ...taskCreateModule,
    pushTaskToGitHub,
    runtime: {
      broadcast: vi.fn(),
      pushTaskToGitHub,
      pushTaskToGnap: vi.fn(),
      gnap: { enabled: true, autoSync: true, repoPath: '/tmp/gnap' },
    },
  }
}

afterEach(() => {
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/config')
  vi.doUnmock('@/lib/gnap-sync')
  vi.resetModules()
})

describe('createTask pipeline successor profile and seam', () => {
  it('creates a successor inside the caller transaction and returns deferred outbound intent', async () => {
    const db = createDb()
    const { createTask, pushTaskToGitHub, runtime } = await importCreateTask(db)

    const result: any = db.transaction(() => createTask({
      source: 'pipeline_successor',
      db,
      runtime,
      transaction: 'caller',
      deferOutboundSync: true,
      title: 'Implement target stage',
      description: 'Follow-up',
      status: 'assigned',
      priority: 'high',
      project_id: 10,
      assigned_to: 'builder',
      created_by: 'task-pipeline',
      workspace_id: 1,
      workflow_template_id: 2,
      workflow_template_slug: 'build',
      parent_task_id: 100,
      root_task_id: 100,
      chain_id: 'chain-1',
      chain_stage: 1,
      metadata: { task_pipeline: { parent_task_id: 100, target_template_slug: 'build' } },
    } as any))()

    expect(result).toMatchObject({
      taskId: 101,
      ticket: 'OPS-010',
      outboundSync: { githubQueued: true, gatewayQueued: true, deferred: true },
    })
    expect(db.prepare('SELECT parent_task_id, root_task_id, chain_id, chain_stage FROM tasks WHERE id = 101').get()).toEqual({
      parent_task_id: 100,
      root_task_id: 100,
      chain_id: 'chain-1',
      chain_stage: 1,
    })
    expect(pushTaskToGitHub).not.toHaveBeenCalled()
  })

  it('returns the existing successor for a duplicate parent without inserting another task', async () => {
    const db = createDb()
    db.prepare(`
      INSERT INTO tasks (id, title, status, priority, project_id, project_ticket_no, created_by, created_at, updated_at, tags, metadata, workspace_id, parent_task_id)
      VALUES (101, 'Existing successor', 'assigned', 'high', 10, 10, 'task-pipeline', 1, 1, '[]', '{}', 1, 100)
    `).run()
    const { createTask, runtime } = await importCreateTask(db)

    const result: any = createTask({
      source: 'pipeline_successor',
      db,
      runtime,
      title: 'Implement target stage',
      workspace_id: 1,
      parent_task_id: 100,
    } as any)

    expect(result).toMatchObject({ taskId: 101, duplicate: true, activityIds: [], notificationIds: [] })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = 100').get()).toEqual({ count: 1 })
  })

  it('exposes a task-dispatch seam that delegates successor creation exactly once', async () => {
    const createTask = vi.fn(() => ({ taskId: 10, activityIds: [], notificationIds: [], subscriptionRecipients: [], outboundSync: { githubQueued: false, gatewayQueued: false } }))
    vi.doMock('@/lib/task-create', () => ({ createTask }))
    vi.doMock('@/lib/db', () => ({ getDatabase: () => createDb(), db_helpers: { logActivity: vi.fn() } }))
    vi.doMock('@/lib/command', () => ({ runOpenClaw: vi.fn() }))
    vi.doMock('@/lib/config', () => ({ config: { openclawHome: '/tmp/openclaw' } }))
    vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
    vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
    vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

    const { createPipelineSuccessorTask } = await import('@/lib/task-dispatch')
    const result = createPipelineSuccessorTask({ title: 'Next', workspace_id: 1, parent_task_id: 100 } as any)

    expect(result).toEqual(expect.objectContaining({ taskId: 10 }))
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ source: 'pipeline_successor', parent_task_id: 100 }))
  })
})
