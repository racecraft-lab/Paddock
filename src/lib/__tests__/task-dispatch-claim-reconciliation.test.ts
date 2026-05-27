import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.doUnmock('@/lib/task-claim-reconciliation')
  vi.resetModules()
})

function openDispatchDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      role TEXT NOT NULL DEFAULT 'dev',
      config TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      ticket_prefix TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_to TEXT,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      project_ticket_no INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      github_synced_at INTEGER,
      tags TEXT,
      metadata TEXT,
      outcome TEXT,
      resolution TEXT,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL
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
  db.prepare('INSERT INTO agents (id, name, workspace_id, status, role) VALUES (1, ?, 1, ?, ?)').run('builder', 'idle', 'dev')
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('MC')
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, status, priority, assigned_to, workspace_id, project_id,
      workflow_template_slug, github_repo, github_issue_number, github_synced_at
    ) VALUES (100, 'Duplicate launch candidate', 'Dispatch me', 'assigned', 'high', 'builder', 1, 10, 'dev', 'racecraft-lab/mission-control', 123, 1770000000)
  `).run()
  return db
}

async function importDispatch(
  db: Database.Database,
  admission: unknown,
  options: {
    readonly runOpenClaw?: ReturnType<typeof vi.fn>
    readonly releaseTaskStageClaim?: ReturnType<typeof vi.fn>
    readonly boundaryCategory?: string
  } = {},
) {
  const reconcileAndAcquireTaskStageClaim = vi.fn(() => {
    if (admission instanceof Error) throw admission
    return admission
  })
  const releaseTaskStageClaim = options.releaseTaskStageClaim ?? vi.fn(() => true)
  const runOpenClaw = options.runOpenClaw ?? vi.fn().mockResolvedValue({
    stdout: JSON.stringify({ payloads: [{ text: 'Agent completed implementation.' }], sessionId: 'session-1' }),
    stderr: '',
    code: 0,
  })
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
  vi.doMock('@/lib/config', () => ({ config: { openclawHome: '/tmp/openclaw' } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  vi.doMock('@/lib/task-claim-reconciliation', () => ({
    classifyClaimBoundaryError: vi.fn(() => options.boundaryCategory ?? 'sqlite_database_error'),
    deriveTaskStageKey: vi.fn(() => 'dev'),
    reconcileAndAcquireTaskStageClaim,
    releaseTaskStageClaim,
  }))
  const taskDispatchModule = await import('@/lib/task-dispatch')
  return { ...taskDispatchModule, reconcileAndAcquireTaskStageClaim, releaseTaskStageClaim, runOpenClaw }
}

describe('dispatchAssignedTasks SPEC-013B claim boundary', () => {
  it('skips launch when claim reconciliation reports a duplicate active claim', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks, runOpenClaw } = await importDispatch(db, {
      outcome: 'duplicate_prevented',
      stage_key: 'dev',
      active_claim_id: 88,
      task_stage_attempt_id: 9,
      reason: 'active_claim_exists',
    })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'assigned' })
    expect(db.prepare("SELECT COUNT(*) as count FROM activities WHERE type = 'task_dispatched'").get()).toEqual({ count: 0 })
    expect(runOpenClaw).not.toHaveBeenCalled()
  })

  it('marks legacy flag-off admission as a normal dispatch path', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks, releaseTaskStageClaim, runOpenClaw } = await importDispatch(db, {
      outcome: 'flag_off_legacy',
      stage_key: 'dev',
      active_claim_id: null,
      task_stage_attempt_id: null,
      reason: 'feature_flag_off',
    })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(db.prepare('SELECT status, outcome FROM tasks WHERE id = 100').get()).toEqual({ status: 'review', outcome: 'success' })
    expect(db.prepare("SELECT COUNT(*) as count FROM activities WHERE type = 'task_dispatched'").get()).toEqual({ count: 1 })
    expect(runOpenClaw).toHaveBeenCalledTimes(1)
    expect(releaseTaskStageClaim).not.toHaveBeenCalled()
  })

  it('releases the owning claim after a successful launch handoff', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks, releaseTaskStageClaim, runOpenClaw } = await importDispatch(db, {
      outcome: 'claim_acquired',
      stage_key: 'dev',
      active_claim_id: 77,
      task_stage_attempt_id: 12,
      reason: 'claim_acquired',
    })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(runOpenClaw).toHaveBeenCalledTimes(1)
    interface ReleaseInput {
      claimId: number
      workspaceId: number
      taskId: number
      stageKey: string
      claimRunId: string
      releasedByRunId: string
      reason: string
    }
    const releaseCalls = releaseTaskStageClaim.mock.calls as unknown as [unknown, ReleaseInput][]
    const releaseInput = releaseCalls[0]?.[1]
    expect(releaseInput).toBeDefined()
    expect(releaseInput).toMatchObject({
      claimId: 77,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      reason: 'launch_handoff_completed',
    })
    expect(releaseInput.claimRunId).toMatch(/^dispatch-100-\d+$/)
    expect(releaseInput.releasedByRunId).toBe(releaseInput.claimRunId)
  })

  it('records a boundary deferral and continues the scheduler tick when claim admission throws', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks, runOpenClaw } = await importDispatch(db, new Error('SQLITE_BUSY: database is locked'))

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'assigned' })
    const boundaryRow = db.prepare(`
      SELECT type, data
      FROM activities
      WHERE type = 'task_stage_claim_boundary_deferred'
    `).get() as { type: string; data: string } | undefined
    expect(boundaryRow?.type).toBe('task_stage_claim_boundary_deferred')
    expect(boundaryRow?.data).toContain('"boundary_error_category":"sqlite_database_error"')
    expect(runOpenClaw).not.toHaveBeenCalled()
  })

  it('records duplicate-prevented evidence instead of boundary deferral for SQLite constraint races', async () => {
    const db = openDispatchDb()
    const { dispatchAssignedTasks, runOpenClaw } = await importDispatch(db, new Error('SQLITE_CONSTRAINT_UNIQUE: idx_task_stage_claims_active_unique'), {
      boundaryCategory: 'sqlite_constraint_race',
    })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(db.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'assigned' })
    expect(db.prepare("SELECT COUNT(*) as count FROM activities WHERE type = 'task_stage_claim_boundary_deferred'").get()).toEqual({ count: 0 })
    const duplicateRow = db.prepare(`
      SELECT type, data
      FROM activities
      WHERE type = 'task_stage_claim_duplicate_prevented'
    `).get() as { type: string; data: string } | undefined
    expect(duplicateRow?.type).toBe('task_stage_claim_duplicate_prevented')
    expect(duplicateRow?.data).toContain('"outcome":"duplicate_prevented"')
    expect(duplicateRow?.data).toContain('"boundary_error_category":"sqlite_constraint_race"')
    expect(runOpenClaw).not.toHaveBeenCalled()
  })

  it('records a release compare boundary when claim release compare-and-set fails', async () => {
    const db = openDispatchDb()
    const releaseTaskStageClaim = vi.fn(() => false)
    const { dispatchAssignedTasks, runOpenClaw } = await importDispatch(db, {
      outcome: 'claim_acquired',
      stage_key: 'dev',
      active_claim_id: 77,
      task_stage_attempt_id: 12,
      reason: 'claim_acquired',
    }, { releaseTaskStageClaim })

    const result = await dispatchAssignedTasks()

    expect(result).toEqual({ ok: true, message: 'Dispatched 1/1 tasks' })
    expect(runOpenClaw).toHaveBeenCalledTimes(1)
    expect(releaseTaskStageClaim).toHaveBeenCalledTimes(1)
    const boundaryRow = db.prepare(`
      SELECT type, data
      FROM activities
      WHERE type = 'task_stage_claim_boundary_deferred'
    `).get() as { type: string; data: string } | undefined
    expect(boundaryRow?.type).toBe('task_stage_claim_boundary_deferred')
    expect(boundaryRow?.data).toContain('"boundary_error_category":"release_compare_failed"')
  })
})
