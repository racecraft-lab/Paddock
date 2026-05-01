import { performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_repo TEXT, github_sync_enabled INTEGER DEFAULT 0);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT, workspace_id INTEGER);
    CREATE TABLE project_agent_assignments (project_id INTEGER, role TEXT, agent_name TEXT, workspace_id INTEGER);
    CREATE TABLE workflow_templates (id INTEGER PRIMARY KEY, name TEXT, task_prompt TEXT, workspace_id INTEGER, slug TEXT, agent_role TEXT, next_template_slug TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT DEFAULT 'medium',
      assigned_to TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1,
      project_id INTEGER,
      project_ticket_no INTEGER,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER
    );
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, entity_type TEXT, entity_id INTEGER, actor TEXT, description TEXT, data TEXT, workspace_id INTEGER);
  `)
  db.prepare('INSERT INTO workspaces (id, feature_flags) VALUES (1, ?), (2, ?)').run(
    JSON.stringify({ FEATURE_TASK_PIPELINES: false }),
    JSON.stringify({ FEATURE_TASK_PIPELINES: true }),
  )
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 2, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 2)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 2)').run('builder', 'builder')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, next_template_slug) VALUES (1, ?, ?, 2, ?, ?, ?)').run('start', 'Start', 'start', 'builder', 'next')
  db.prepare('INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role) VALUES (2, ?, ?, 2, ?, ?)').run('next', 'Next', 'next', 'builder')
  return db
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function addTask(db: Database.Database, workspaceId: number, templateId: number | null): number {
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, assigned_to, project_id, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES ('Parent', 'done', 'high', 'builder', ?, ?, ?, ?)
  `).run(workspaceId === 2 ? 10 : null, workspaceId, templateId, templateId ? 'start' : null)
  return Number(result.lastInsertRowid)
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
}

describe('advanceTaskChain terminal-success overhead', () => {
  it('keeps flag-off, null-chain, and eligible advancement paths inside a bounded p95 smoke budget', async () => {
    const db = createDb()
    const { advanceTaskChain } = await importDispatch(db)
    const samples: Record<string, number[]> = { flagOff: [], nullChain: [], eligible: [] }

    for (let i = 0; i < 8; i += 1) {
      const flagOffId = addTask(db, 1, null)
      let start = performance.now()
      advanceTaskChain({ taskId: flagOffId, workspaceId: 1, previousStatus: 'review', trigger: 'bulk_task_update' })
      samples.flagOff.push(performance.now() - start)

      const nullChainId = addTask(db, 2, null)
      start = performance.now()
      advanceTaskChain({ taskId: nullChainId, workspaceId: 2, previousStatus: 'review', trigger: 'bulk_task_update' })
      samples.nullChain.push(performance.now() - start)

      const eligibleId = addTask(db, 2, 1)
      start = performance.now()
      advanceTaskChain({ taskId: eligibleId, workspaceId: 2, previousStatus: 'review', trigger: 'bulk_task_update' })
      samples.eligible.push(performance.now() - start)
    }

    expect(p95(samples.flagOff)).toBeLessThan(25)
    expect(p95(samples.nullChain)).toBeLessThan(25)
    expect(p95(samples.eligible)).toBeLessThan(50)
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id IS NOT NULL').get()).toEqual({ count: 8 })
  })
})
