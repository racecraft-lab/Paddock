import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  advanceTaskChainMock,
  createIssueMock,
  createLabelMock,
  createNotificationMock,
  ensureLabelsMock,
  fetchIssueMock,
  fetchIssuesMock,
  getDatabaseMock,
  logActivityMock,
  updateIssueMock,
} = vi.hoisted(() => ({
  advanceTaskChainMock: vi.fn(),
  createIssueMock: vi.fn(),
  createLabelMock: vi.fn(),
  createNotificationMock: vi.fn(),
  ensureLabelsMock: vi.fn(),
  fetchIssueMock: vi.fn(),
  fetchIssuesMock: vi.fn(),
  getDatabaseMock: vi.fn(),
  logActivityMock: vi.fn(),
  updateIssueMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: getDatabaseMock,
  db_helpers: {
    logActivity: logActivityMock,
    createNotification: createNotificationMock,
    ensureTaskSubscription: vi.fn(),
  },
}))

vi.mock('@/lib/github', () => ({
  fetchIssues: fetchIssuesMock,
  fetchIssue: fetchIssueMock,
  updateIssue: updateIssueMock,
  createIssue: createIssueMock,
  ensureLabels: ensureLabelsMock,
  createLabel: createLabelMock,
}))

vi.mock('@/lib/task-dispatch', () => ({
  advanceTaskChain: advanceTaskChainMock,
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn() },
}))

vi.mock('@/lib/config', () => ({
  config: { gnap: { enabled: false, autoSync: false, repoPath: '' } },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { runMigrations } from '../migrations'
import { pullFromGitHub } from '../github-sync-engine'
import type { GitHubIssue } from '../github'

const openDbs: Database.Database[] = []

beforeEach(() => {
  advanceTaskChainMock.mockReset()
  createIssueMock.mockReset()
  createLabelMock.mockReset()
  createNotificationMock.mockReset()
  ensureLabelsMock.mockReset()
  fetchIssueMock.mockReset()
  fetchIssuesMock.mockReset()
  getDatabaseMock.mockReset()
  logActivityMock.mockReset()
  updateIssueMock.mockReset()
})

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  getDatabaseMock.mockReturnValue(db)
  logActivityMock.mockImplementation((type, entityType, entityId, actor, description, data, workspaceId) => {
    db.prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(type, entityType, entityId, actor, description, JSON.stringify(data), workspaceId)
  })
  createNotificationMock.mockImplementation((recipient, type, title, message, sourceType, sourceId, workspaceId) => {
    db.prepare(`
      INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(recipient, type, title, message, sourceType, sourceId, workspaceId)
  })
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1').run(JSON.stringify({
    FEATURE_AREA_LABEL_ROUTING: false,
    FEATURE_TWO_STEP_TERMINAL: true,
  }))
  return db
}

function seedProject(db: Database.Database): number {
  return Number(db.prepare(`
    INSERT INTO projects (
      workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled, status
    )
    VALUES (1, 'Ready Owner Project', 'ready-owner-project', 'ROP', 'owner/repo', 1, 'active')
  `).run().lastInsertRowid)
}

function seedReadyForOwnerTask(db: Database.Database, projectId: number, overrides: Partial<{
  githubIssueNumber: number
  githubPrNumber: number | null
  assignedTo: string | null
  createdBy: string
}> = {}) {
  const templateId = Number(db.prepare(`
    INSERT INTO workflow_templates (
      workspace_id, name, slug, description, task_prompt, agent_role, produces_pr, external_terminal_event, created_by
    )
    VALUES (
      1, 'PR Template', 'pr-template', 'Produces PR', 'Do the PR work', 'developer', 1, 'github_pr_merged', 'system'
    )
  `).run().lastInsertRowid)
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, status, priority, assigned_to, created_by,
      workspace_id, project_id, workflow_template_id, workflow_template_slug,
      github_repo, github_issue_number, github_pr_number, updated_at, tags, metadata
    )
    VALUES (
      500, 'Ready task', 'Waiting for merge', 'ready_for_owner', 'high', ?, ?,
      1, ?, ?, 'pr-template', 'owner/repo', ?, ?, 1, '[]', '{}'
    )
  `).run(
    Object.prototype.hasOwnProperty.call(overrides, 'assignedTo') ? overrides.assignedTo : 'builder',
    overrides.createdBy ?? 'creator',
    projectId,
    templateId,
    overrides.githubIssueNumber ?? 90,
    Object.prototype.hasOwnProperty.call(overrides, 'githubPrNumber') ? overrides.githubPrNumber : 12,
  )
}

function makeIssue(state: 'open' | 'closed' = 'closed'): GitHubIssue {
  return {
    number: 90,
    title: 'Ready task',
    body: 'Waiting for merge',
    state,
    labels: [{ name: 'mc:ready-for-owner' }],
    assignee: null,
    html_url: 'https://github.com/owner/repo/issues/90',
    created_at: '2030-01-01T00:00:00Z',
    updated_at: '2030-01-01T00:00:00Z',
  }
}

describe('SPEC-005 GitHub ready_for_owner terminal reconciliation', () => {
  it('keeps production pullFromGitHub callsites fixture-free while accepting a test-only webhookFixture option', async () => {
    const root = process.cwd()
    for (const relative of [
      'src/app/api/github/sync/route.ts',
      'src/app/api/github/route.ts',
      'src/lib/github-sync-poller.ts',
    ]) {
      const source = readFileSync(join(root, relative), 'utf8')
      expect(source).toMatch(/pullFromGitHub\(project,\s*(?:workspaceId|project\.workspace_id)\)/)
      expect(source).not.toMatch(/pullFromGitHub\(project,\s*(?:workspaceId|project\.workspace_id),/)
    }

    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: { number: 12, state: 'closed', merged: true },
      },
    })

    expect(db.prepare('SELECT status FROM tasks WHERE id = 500').get()).toEqual({ status: 'done' })
  })

  it('moves ready_for_owner to done only when merged PR evidence matches github_repo and github_pr_number', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: { number: 12, state: 'closed', merged_at: '2030-01-01T00:10:00Z' },
      },
    })

    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 500').get()).toEqual({
      status: 'done',
      completed_at: expect.any(Number),
    })
  })

  it('leaves closed linked issues in ready_for_owner and dedupes reconciliation activity and notification without merged PR evidence', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId, { githubPrNumber: null, assignedTo: null, createdBy: 'creator' })
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })
    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })

    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 500').get()).toEqual({
      status: 'ready_for_owner',
      completed_at: null,
    })
    expect(db.prepare(`
      SELECT type, actor, data FROM activities
      WHERE type = 'github_terminal_reconciliation_required'
    `).all()).toEqual([
      {
        type: 'github_terminal_reconciliation_required',
        actor: 'github-sync',
        data: JSON.stringify({
          task_id: 500,
          workspace_id: 1,
          github_repo: 'owner/repo',
          github_issue_number: 90,
          github_pr_number: null,
          reason: 'linked_issue_closed_without_merged_pr',
          source: 'github_sync',
        }),
      },
    ])
    expect(db.prepare('SELECT recipient, type, title, source_type, source_id FROM notifications').all()).toEqual([
      {
        recipient: 'creator',
        type: 'task_ready_for_owner',
        title: 'Owner merge reconciliation required',
        source_type: 'task',
        source_id: 500,
      },
    ])
    expect(advanceTaskChainMock).not.toHaveBeenCalled()
  })

  it('advances the task chain only after a verified PR merge successfully writes done with github_pr_merged', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: { number: 12, state: 'closed', merge_commit_sha: 'abc123' },
      },
    })

    expect(db.prepare('SELECT status FROM tasks WHERE id = 500').get()).toEqual({ status: 'done' })
    expect(advanceTaskChainMock).toHaveBeenCalledWith({
      taskId: 500,
      workspaceId: 1,
      previousStatus: 'ready_for_owner',
      trigger: 'github_pr_merged',
    })
  })
})
