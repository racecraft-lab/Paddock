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
      status TEXT NOT NULL DEFAULT 'offline',
      config TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      resolution TEXT,
      assigned_to TEXT,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      project_ticket_no INTEGER,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
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
})
