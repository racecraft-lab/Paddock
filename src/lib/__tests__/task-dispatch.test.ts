import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveGatewayAgentIdForReviewAgent, resolveTaskDispatchModelOverride } from '@/lib/task-dispatch'
import type { ResolveTaskTerminalTransitionInput, TaskTerminalTransitionResult } from '@/lib/task-status'

describe('resolveTaskDispatchModelOverride', () => {
  it('returns null when the agent has no explicit dispatch model override', () => {
    expect(resolveTaskDispatchModelOverride({ agent_config: null })).toBeNull()
    expect(resolveTaskDispatchModelOverride({ agent_config: '{"openclawId":"main"}' })).toBeNull()
  })

  it('returns the explicit dispatch model override when present', () => {
    expect(
      resolveTaskDispatchModelOverride({
        agent_config: '{"openclawId":"main","dispatchModel":"openai-codex/gpt-5.4"}',
      })
    ).toBe('openai-codex/gpt-5.4')
  })

  it('ignores malformed agent config payloads', () => {
    expect(resolveTaskDispatchModelOverride({ agent_config: '{not json' })).toBeNull()
  })
})

describe('resolveGatewayAgentIdForReviewAgent', () => {
  it('uses the dedicated Aegis openclawId when present', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{"openclawId":"aegis"}',
      })
    ).toBe('aegis')
  })

  it('falls back to the Aegis record name when no openclawId is configured', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{"dispatchModel":"openai-codex/gpt-5.4"}',
      })
    ).toBe('aegis')
  })

  it('ignores malformed reviewer config payloads and still falls back to aegis', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{not json',
      })
    ).toBe('aegis')
  })

  it('uses database-backed config and falls back to gateway aegis when no row is available', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'Aegis',
        agent_config: '{"openclawId":"global-aegis"}',
      })
    ).toBe('global-aegis')

    expect(resolveGatewayAgentIdForReviewAgent(null)).toBe('aegis')
  })
})

let dispatchDb: Database.Database | null = null

afterEach(() => {
  dispatchDb?.close()
  dispatchDb = null
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/command')
  vi.doUnmock('@/lib/config')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

function createDispatchDb(): Database.Database {
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
      role TEXT NOT NULL DEFAULT 'agent',
      status TEXT NOT NULL DEFAULT 'offline',
      hidden INTEGER NOT NULL DEFAULT 0,
      config TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags TEXT,
      resolution TEXT,
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
      github_synced_at INTEGER,
      parent_task_id INTEGER,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      ticket_prefix TEXT
    );
    CREATE TABLE quality_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      reviewer TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (?, ?, ?)').run(1, 'alpha', '{"FEATURE_GLOBAL_AEGIS":true}')
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (?, ?, ?)').run(1, 1, 'ALP')
  db.prepare(`
    INSERT INTO workflow_templates (id, workspace_id, slug, produces_pr, external_terminal_event)
    VALUES (1, 1, 'pr-template', 1, 'github_pr_merged'),
           (2, 1, 'non-pr-template', 0, NULL)
  `).run()
  return db
}

async function importTaskDispatchWithDb(
  db: Database.Database,
  runOpenClaw = vi.fn(),
  resolveTransitionSpy?: (input: ResolveTaskTerminalTransitionInput) => TaskTerminalTransitionResult
) {
  const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
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
  vi.doMock('@/lib/command', () => ({ runOpenClaw }))
  vi.doMock('@/lib/config', () => ({ config: { openclawHome: '/tmp/openclaw' } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  vi.doMock('@/lib/task-status', () => ({
    ...actualTaskStatus,
    resolveTaskTerminalTransition: resolveTransitionSpy ?? actualTaskStatus.resolveTaskTerminalTransition,
  }))

  return import('@/lib/task-dispatch')
}

describe('autoRouteInboxTasks pilot hold', () => {
  it('holds GitHub-linked Mission Control pilot tasks while routing ordinary inbox tasks', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ PILOT_MISSION_CONTROL_E2E: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, role, status, config)
      VALUES (10, 'HAL', 1, 'workspace', 'agent', 'idle', NULL)
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (
        id, title, description, status, priority, assigned_to, workspace_id,
        project_id, github_repo, github_issue_number, github_synced_at,
        parent_task_id, created_at
      )
      VALUES
        (100, 'Pilot issue', 'Hold for SPEC-009C1 evidence', 'inbox', 'medium', NULL, 1,
          1, 'racecraft-lab/mission-control', 39, 12345, NULL, 1),
        (101, 'Ordinary inbox task', 'Can be routed', 'inbox', 'medium', NULL, 1,
          1, NULL, NULL, NULL, NULL, 2)
    `).run()

    const { autoRouteInboxTasks } = await importTaskDispatchWithDb(dispatchDb)

    const result = await autoRouteInboxTasks()

    expect(result.ok).toBe(true)
    expect(dispatchDb.prepare('SELECT status, assigned_to FROM tasks WHERE id = 100').get())
      .toEqual({ status: 'inbox', assigned_to: null })
    expect(dispatchDb.prepare('SELECT status, assigned_to FROM tasks WHERE id = 101').get())
      .toEqual({ status: 'assigned', assigned_to: 'HAL' })
    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity_id = 100 AND type = 'task_auto_routed'").get())
      .toEqual({ count: 0 })
    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity_id = 101 AND type = 'task_auto_routed'").get())
      .toEqual({ count: 1 })
  })
})

describe('runAegisReviews resolver integration', () => {
  it('preserves review gate writes while sourcing Aegis through the shared resolver', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"local-aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (20, 'Aegis', NULL, 'global', '{"openclawId":"global-aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no)
      VALUES (100, 'Review me', 'Do the work', 'review', 'high', 'Done', 'builder', 1, 1, 7)
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw)

    const result = await runAegisReviews()

    expect(result.ok).toBe(true)
    expect(runOpenClaw).toHaveBeenCalledTimes(1)
    const params = JSON.parse(runOpenClaw.mock.calls[0][0][7])
    expect(params.agentId).toBe('global-aegis')
    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 100').get()).toEqual({ status: 'done' })
    expect(dispatchDb.prepare('SELECT reviewer, status, workspace_id FROM quality_reviews').all()).toEqual([
      { reviewer: 'aegis', status: 'approved', workspace_id: 1 },
    ])
  })

  it('does not duplicate shadow audit rows across review ticks and preserves no-row gateway fallback', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"local-aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (20, 'Aegis', NULL, 'global', '{"openclawId":"global-aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no)
      VALUES (100, 'First review', 'Do the work', 'review', 'high', 'Done', 'builder', 1, 1, 7)
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no)
      VALUES (101, 'Second review', 'Do the work again', 'review', 'high', 'Done', 'builder', 1, 1, 8)
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw)

    await runAegisReviews()
    dispatchDb.prepare('DELETE FROM agents').run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no)
      VALUES (102, 'Fallback review', 'No Aegis row', 'review', 'high', 'Done', 'builder', 1, 1, 9)
    `).run()
    await runAegisReviews()

    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'aegis_local_shadowed'").get()).toEqual({ count: 1 })
    const fallbackParams = JSON.parse(runOpenClaw.mock.calls.at(-1)?.[0][7])
    expect(fallbackParams.agentId).toBe('aegis')
  })

  it('keeps flag-off PR-producing and non-PR Aegis approvals on the done path through the shared transition guard', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug)
      VALUES
        (200, 'PR task', 'Produces PR', 'review', 'high', 'Done', 'builder', 1, 1, 20, 1, 'pr-template'),
        (201, 'Non-PR task', 'No PR', 'review', 'high', 'Done', 'builder', 1, 1, 21, 2, 'non-pr-template')
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw, resolveTransitionSpy)

    const result = await runAegisReviews()

    expect(result.ok).toBe(true)
    expect(dispatchDb.prepare('SELECT id, status FROM tasks ORDER BY id').all()).toEqual([
      { id: 200, status: 'done' },
      { id: 201, status: 'done' },
    ])
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 200,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: false,
      transitionIntent: 'approval',
    }))
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 201,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: false,
      twoStepTerminalEnabled: false,
      transitionIntent: 'approval',
    }))
  })

  it('keeps flag-on non-PR Aegis approvals on the direct done path', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ FEATURE_GLOBAL_AEGIS: true, FEATURE_TWO_STEP_TERMINAL: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
	    dispatchDb.prepare(`
	      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug)
	      VALUES (210, 'Non-PR task', 'No PR required', 'review', 'high', 'Done', 'builder', 1, 1, 22, 2, 'non-pr-template')
	    `).run()
	    dispatchDb.prepare('UPDATE tasks SET workflow_template_id = NULL, workflow_template_slug = NULL WHERE id = 210').run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw, resolveTransitionSpy)

    const result = await runAegisReviews()

    expect(result.ok).toBe(true)
    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 210').get()).toEqual({ status: 'done' })
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 210,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: false,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    }))
  })

  it('routes flag-on PR-producing Aegis approvals to ready_for_owner', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ FEATURE_GLOBAL_AEGIS: true, FEATURE_TWO_STEP_TERMINAL: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug, github_repo, github_pr_number)
      VALUES (220, 'PR task', 'PR required', 'review', 'high', 'Done', 'builder', 1, 1, 23, 1, 'pr-template', 'owner/repo', 7)
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const actualTaskStatus = await vi.importActual<typeof import('@/lib/task-status')>('@/lib/task-status')
    const resolveTransitionSpy = vi.fn(actualTaskStatus.resolveTaskTerminalTransition)
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw, resolveTransitionSpy)

    const result = await runAegisReviews()

    expect(result.ok).toBe(true)
    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 220').get()).toEqual({ status: 'ready_for_owner' })
    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_ready_for_owner'").get())
      .toEqual({ count: 0 })
    expect(dispatchDb.prepare('SELECT recipient, type, title, message, source_type, source_id FROM notifications').all())
      .toEqual([
        {
          recipient: 'builder',
          type: 'task_ready_for_owner',
          title: 'Ready for owner merge',
          message: 'Owner action required: PR task is ready for owner merge.',
          source_type: 'task',
          source_id: 220,
        },
      ])
    expect(resolveTransitionSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 220,
      currentStatus: 'quality_review',
      requestedStatus: 'done',
      producesPr: true,
      twoStepTerminalEnabled: true,
      transitionIntent: 'approval',
    }))
  })

  it('records missing explicit PR linkage when flag-on PR-producing Aegis approval enters ready_for_owner', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ FEATURE_GLOBAL_AEGIS: true, FEATURE_TWO_STEP_TERMINAL: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, created_by, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug)
      VALUES (230, 'PR task without link', 'PR required', 'review', 'high', 'Done', 'builder', 'creator', 1, 1, 24, 1, 'pr-template')
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw)

    const result = await runAegisReviews()

    expect(result.ok).toBe(true)
    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 230').get()).toEqual({ status: 'ready_for_owner' })
    expect(dispatchDb.prepare("SELECT type, actor, data FROM activities WHERE type = 'task_ready_for_owner'").all())
      .toEqual([
        expect.objectContaining({
          type: 'task_ready_for_owner',
          actor: 'aegis',
          data: JSON.stringify({
            task_id: 230,
            workspace_id: 1,
            reason: 'missing_explicit_pr_linkage',
            github_repo: null,
            github_pr_number: null,
          }),
        }),
      ])
    expect(dispatchDb.prepare('SELECT recipient, type, title, message, source_type, source_id FROM notifications').all())
      .toEqual([
        {
          recipient: 'builder',
          type: 'task_ready_for_owner',
          title: 'Ready for owner merge',
          message: expect.stringContaining('Owner action required'),
          source_type: 'task',
          source_id: 230,
        },
      ])
  })

  it('does not advance task chains when flag-on PR-producing Aegis approval enters ready_for_owner', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ FEATURE_GLOBAL_AEGIS: true, FEATURE_TWO_STEP_TERMINAL: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug, github_repo, github_pr_number)
      VALUES (240, 'PR task', 'PR required', 'review', 'high', 'Done', 'builder', 1, 1, 25, 1, 'pr-template', 'owner/repo', 8)
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw)

    await runAegisReviews()

    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 240').get()).toEqual({ status: 'ready_for_owner' })
    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_pipeline_advancement'").get())
      .toEqual({ count: 0 })
  })

  it('does not write an Aegis approval or done state when the shared merge guard rejects completion', async () => {
    dispatchDb = createDispatchDb()
    dispatchDb.prepare(`
      UPDATE workspaces
      SET feature_flags = ?
      WHERE id = 1
    `).run(JSON.stringify({ FEATURE_GLOBAL_AEGIS: true, FEATURE_TWO_STEP_TERMINAL: true }))
    dispatchDb.prepare(`
      INSERT INTO agents (id, name, workspace_id, scope, config)
      VALUES (10, 'Aegis', 1, 'workspace', '{"openclawId":"aegis"}')
    `).run()
    dispatchDb.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, resolution, assigned_to, workspace_id, project_id, project_ticket_no, workflow_template_id, workflow_template_slug, github_repo, github_pr_number)
      VALUES (250, 'Guarded PR task', 'PR required', 'review', 'high', 'Done', 'builder', 1, 1, 26, 1, 'pr-template', 'owner/repo', 9)
    `).run()
    const runOpenClaw = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ payloads: [{ text: 'VERDICT: APPROVED\nNOTES: pass' }] }),
    })
    const resolveTransitionSpy = vi.fn(() => ({
      ok: false,
      status: 409,
      body: {
        error: 'transition_conflict',
        reason: 'ready_for_owner_pr_merge_required',
        task_ids: [250],
      },
    } satisfies TaskTerminalTransitionResult))
    const { runAegisReviews } = await importTaskDispatchWithDb(dispatchDb, runOpenClaw, resolveTransitionSpy)

    const result = await runAegisReviews()

    expect(result.ok).toBe(false)
    expect(result.message).toContain('1 error')
    expect(dispatchDb.prepare('SELECT status FROM tasks WHERE id = 250').get()).toEqual({ status: 'quality_review' })
    expect(dispatchDb.prepare('SELECT COUNT(*) AS count FROM quality_reviews').get()).toEqual({ count: 0 })
    expect(dispatchDb.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'task_pipeline_advancement'").get())
      .toEqual({ count: 0 })
  })
})
