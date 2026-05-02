import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolveTaskTerminalTransitionInput, TaskTerminalTransitionResult } from '@/lib/task-status'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.resetModules()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      workflow_template_id INTEGER,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE quality_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      reviewer TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({
    FEATURE_TASK_PIPELINES: true,
    FEATURE_TWO_STEP_TERMINAL: false,
  }))
  db.prepare(`
    INSERT INTO workflow_templates (id, workspace_id, slug, produces_pr, external_terminal_event)
    VALUES (10, 1, 'pr-template', 1, 'github_pr_merged')
  `).run()
  db.prepare(`
    INSERT INTO tasks (id, title, status, workspace_id, workflow_template_id)
    VALUES (100, 'Review me', 'quality_review', 1, 10)
  `).run()
  return db
}

async function importRouteWithDb(
  db: Database.Database,
  resolveTransitionSpy: (input: ResolveTaskTerminalTransitionInput) => TaskTerminalTransitionResult
) {
  const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
  const advanceTaskChain = vi.fn()

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
  vi.doMock('@/lib/auth', () => ({ requireRole: vi.fn(() => ({ user: { username: 'operator', role: 'operator' } })) }))
  vi.doMock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
  vi.doMock('@/lib/workspaces', () => ({
    resolveWorkspaceScopeFromRequest: vi.fn(async () => ({ kind: 'workspace', workspaceId: 1 })),
    workspaceScopePredicate: vi.fn((_scope, column = 'workspace_id') => ({ sql: `${column} = ?`, params: [1] })),
    workspaceScopeError: vi.fn(() => null),
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
  vi.doMock('@/lib/task-dispatch', () => ({ advanceTaskChain }))
  vi.doMock('@/lib/task-status', () => ({
    ...actualTaskStatus,
    resolveTaskTerminalTransition: resolveTransitionSpy,
  }))

  return {
    route: await import('@/app/api/quality-review/route'),
    advanceTaskChain,
  }
}

describe('POST /api/quality-review ready_for_owner flag-off behavior', () => {
  it('keeps flag-off approval for PR-producing work on done through the shared transition guard', async () => {
    const db = createDb()
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { route, advanceTaskChain } = await importRouteWithDb(db, resolveTransitionSpy)

    const response = await route.POST(new NextRequest('http://localhost/api/quality-review', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 100,
        reviewer: 'operator',
        status: 'approved',
        notes: 'Looks good',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'done' })
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 100,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: false,
      transitionIntent: 'approval',
    }))
    expect(advanceTaskChain).toHaveBeenCalledWith({
      taskId: 100,
      workspaceId: 1,
      previousStatus: 'quality_review',
      trigger: 'quality_review',
    })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
  })
})
