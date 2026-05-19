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
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      project_id INTEGER,
      assigned_to TEXT,
      created_by TEXT NOT NULL DEFAULT 'creator',
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
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
    CREATE TABLE task_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL,
      schema_version TEXT,
      storage_kind TEXT NOT NULL,
      content_json TEXT,
      mime_type TEXT,
      redaction_status TEXT NOT NULL DEFAULT 'pending',
      security_scan_status TEXT NOT NULL DEFAULT 'pending',
      supersedes_artifact_id INTEGER,
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
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify({
    FEATURE_TASK_PIPELINES: true,
    FEATURE_TWO_STEP_TERMINAL: false,
  }))
  db.prepare(`
    INSERT INTO workflow_templates (id, workspace_id, slug, produces_pr, external_terminal_event)
    VALUES (10, 1, 'pr-template', 1, 'github_pr_merged'),
           (11, 1, 'non-pr-template', 0, NULL),
           (12, 1, 'mission-control_dev_implementation', 1, 'github_pr_merged')
  `).run()
  db.prepare(`
    INSERT INTO tasks (id, title, status, assigned_to, created_by, workspace_id, workflow_template_id)
    VALUES (100, 'Review me', 'quality_review', 'builder', 'creator', 1, 10)
  `).run()
  return db
}

function insertC3DevTask(db: Database.Database, id = 102): void {
  db.prepare(`
    INSERT INTO tasks (
      id, title, status, assigned_to, created_by, workspace_id, workflow_template_id,
      github_repo, github_issue_number, github_pr_number
    )
    VALUES (?, 'C3 dev task', 'quality_review', 'builder', 'creator', 1, 12,
      'racecraft-lab/mission-control', 99, 42)
  `).run(id)
}

async function importRouteWithDb(
  db: Database.Database,
  resolveTransitionSpy: (input: ResolveTaskTerminalTransitionInput) => TaskTerminalTransitionResult
) {
  const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
  const actualTaskDispatch = await vi.importActual<typeof import('@/lib/task-dispatch')>('@/lib/task-dispatch')
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
      createNotification: vi.fn((recipient, type, title, message, sourceType, sourceId, workspaceId) => {
        db.prepare(`
          INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(recipient, type, title, message, sourceType, sourceId, workspaceId)
      }),
      createTaskReadyForOwnerNotification: vi.fn((task) => {
        const recipient = task.assigned_to?.trim() || task.created_by?.trim()
        if (!recipient) return null
        const message = task.github_repo && task.github_pr_number
          ? `Owner action required: ${task.title} is ready for owner merge.`
          : `Owner action required: ${task.title} is ready for owner merge but needs explicit GitHub PR linkage.`
        db.prepare(`
          INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          recipient,
          'task_ready_for_owner',
          'Ready for owner merge',
          message,
          'task',
          task.id,
          task.workspace_id,
        )
        return null
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
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/task-dispatch', () => ({
    ...actualTaskDispatch,
    advanceTaskChain,
  }))
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

  it('keeps flag-on non-PR approval on the direct done path', async () => {
    const db = createDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
      .run(JSON.stringify({ FEATURE_TASK_PIPELINES: true, FEATURE_TWO_STEP_TERMINAL: true }))
    db.prepare(`
      INSERT INTO tasks (id, title, status, assigned_to, created_by, workspace_id, workflow_template_id)
      VALUES (101, 'Non-PR review', 'quality_review', 'builder', 'creator', 1, 11)
    `).run()
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { route, advanceTaskChain } = await importRouteWithDb(db, resolveTransitionSpy)

    const response = await route.POST(new NextRequest('http://localhost/api/quality-review', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 101,
        reviewer: 'operator',
        status: 'approved',
        notes: 'Looks good',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(db.prepare('SELECT status FROM tasks WHERE id = 101').get()).toEqual({ status: 'done' })
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 101,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: false,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    }))
    expect(advanceTaskChain).toHaveBeenCalledWith({
      taskId: 101,
      workspaceId: 1,
      previousStatus: 'quality_review',
      trigger: 'quality_review',
    })
  })

  it('routes flag-on PR-producing approval to ready_for_owner without chain advancement', async () => {
    const db = createDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
      .run(JSON.stringify({ FEATURE_TASK_PIPELINES: true, FEATURE_TWO_STEP_TERMINAL: true }))
    db.prepare("UPDATE tasks SET github_repo = 'owner/repo', github_pr_number = 42 WHERE id = 100").run()
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
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'ready_for_owner' })
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 100,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    }))
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(db.prepare('SELECT recipient, type, title, message, source_type, source_id FROM notifications').all())
      .toEqual([
        {
          recipient: 'builder',
          type: 'task_ready_for_owner',
          title: 'Ready for owner merge',
          message: 'Owner action required: Review me is ready for owner merge.',
          source_type: 'task',
          source_id: 100,
        },
      ])
    expect(advanceTaskChain).not.toHaveBeenCalled()
  })

  it('returns a side-effect-free conflict when approval tries to complete a PR-producing task already waiting for owner merge', async () => {
    const db = createDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
      .run(JSON.stringify({ FEATURE_TASK_PIPELINES: true, FEATURE_TWO_STEP_TERMINAL: true }))
    db.prepare(`
      UPDATE tasks
      SET status = 'ready_for_owner', github_repo = 'owner/repo', github_pr_number = 42
      WHERE id = 100
    `).run()
    const beforeTask = db.prepare('SELECT status, updated_at FROM tasks WHERE id = 100').get()
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { route, advanceTaskChain } = await importRouteWithDb(db, resolveTransitionSpy)

    const response = await route.POST(new NextRequest('http://localhost/api/quality-review', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 100,
        reviewer: 'operator',
        status: 'approved',
        notes: 'Trying to close it',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toEqual({
      error: 'transition_conflict',
      reason: 'ready_for_owner_pr_merge_required',
      task_ids: [100],
    })
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 100,
      currentStatus: 'ready_for_owner',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    }))
    expect(db.prepare('SELECT status, updated_at FROM tasks WHERE id = 100').get()).toEqual(beforeTask)
    expect(db.prepare('SELECT COUNT(*) AS count FROM quality_reviews').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM activities').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()).toEqual({ count: 0 })
    expect(advanceTaskChain).not.toHaveBeenCalled()
  })

  it('records non-aegis C3 approvals without marking the dev implementation task ready_for_owner', async () => {
    const db = createDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
      .run(JSON.stringify({ FEATURE_TASK_PIPELINES: true, FEATURE_TWO_STEP_TERMINAL: true }))
    insertC3DevTask(db)
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { route, advanceTaskChain } = await importRouteWithDb(db, resolveTransitionSpy)

    const response = await route.POST(new NextRequest('http://localhost/api/quality-review', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 102,
        reviewer: 'operator',
        status: 'approved',
        notes: 'Looks good but is not Aegis',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(db.prepare('SELECT status FROM tasks WHERE id = 102').get()).toEqual({ status: 'quality_review' })
    expect(db.prepare('SELECT reviewer, status FROM quality_reviews WHERE task_id = 102').all())
      .toEqual([{ reviewer: 'operator', status: 'approved' }])
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(advanceTaskChain).not.toHaveBeenCalled()
  })

  it('records aegis C3 approvals but blocks owner-ready side effects until required evidence exists', async () => {
    const db = createDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
      .run(JSON.stringify({ FEATURE_TASK_PIPELINES: true, FEATURE_TWO_STEP_TERMINAL: true }))
    insertC3DevTask(db)
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { route, advanceTaskChain } = await importRouteWithDb(db, resolveTransitionSpy)

    const response = await route.POST(new NextRequest('http://localhost/api/quality-review', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 102,
        reviewer: 'aegis',
        status: 'approved',
        notes: 'Aegis approved but artifacts are absent',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(db.prepare('SELECT status FROM tasks WHERE id = 102').get()).toEqual({ status: 'quality_review' })
    expect(db.prepare('SELECT reviewer, status FROM quality_reviews WHERE task_id = 102').all())
      .toEqual([{ reviewer: 'aegis', status: 'approved' }])
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(advanceTaskChain).not.toHaveBeenCalled()
  })
})
