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
  fetchPullRequestMock,
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
  fetchPullRequestMock: vi.fn(),
  getDatabaseMock: vi.fn(),
  logActivityMock: vi.fn(),
  updateIssueMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: getDatabaseMock,
  db_helpers: {
    logActivity: logActivityMock,
    createNotification: createNotificationMock,
    createTaskReadyForOwnerNotification: vi.fn((task, options = {}) => {
      const recipient = task.assigned_to?.trim() || task.created_by?.trim()
      if (!recipient) return null
      const reason = options.reason ?? 'linked_issue_closed_without_merged_pr'
      const title = options.kind === 'reconciliation'
        ? 'Owner merge reconciliation required'
        : 'Ready for owner merge'
      const message = options.kind === 'reconciliation'
        ? `Owner action required: ${task.title} has a closed linked GitHub issue #${task.github_issue_number ?? 'unknown'} without merged PR evidence. Reason: ${reason}.`
        : task.github_repo && task.github_pr_number
          ? `Owner action required: ${task.title} is ready for owner merge.`
          : `Owner action required: ${task.title} is ready for owner merge but needs explicit GitHub PR linkage.`
      return createNotificationMock(recipient, 'task_ready_for_owner', title, message, 'task', task.id, task.workspace_id)
    }),
    ensureTaskSubscription: vi.fn(),
  },
}))

vi.mock('@/lib/github', () => ({
  fetchIssues: fetchIssuesMock,
  fetchIssue: fetchIssueMock,
  fetchPullRequest: fetchPullRequestMock,
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
import { pullFromGitHub, pushTaskToGitHub, syncTaskOutbound } from '../github-sync-engine'
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
  fetchPullRequestMock.mockReset()
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
  id: number
  status: string
  title: string
  description: string
  githubRepo: string
  githubIssueNumber: number
  githubPrNumber: number | null
  assignedTo: string | null
  createdBy: string
  producesPr: number
  externalTerminalEvent: string | null
}> = {}) {
  const templateId = Number(db.prepare(`
    INSERT INTO workflow_templates (
      workspace_id, name, slug, description, task_prompt, agent_role, produces_pr, external_terminal_event, created_by
    )
    VALUES (
      1, 'PR Template', 'pr-template', 'Produces PR', 'Do the PR work', 'developer', ?, ?, 'system'
    )
  `).run(overrides.producesPr ?? 1, overrides.externalTerminalEvent ?? 'github_pr_merged').lastInsertRowid)
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, status, priority, assigned_to, created_by,
      workspace_id, project_id, workflow_template_id, workflow_template_slug,
      github_repo, github_issue_number, github_pr_number, updated_at, tags, metadata
    )
    VALUES (
      ?, ?, ?, ?, 'high', ?, ?,
      1, ?, ?, 'pr-template', ?, ?, ?, 1, '[]', '{}'
    )
  `).run(
    overrides.id ?? 500,
    overrides.title ?? 'Ready task',
    overrides.description ?? 'Waiting for merge',
    overrides.status ?? 'ready_for_owner',
    Object.prototype.hasOwnProperty.call(overrides, 'assignedTo') ? overrides.assignedTo : 'builder',
    overrides.createdBy ?? 'creator',
    projectId,
    templateId,
    overrides.githubRepo ?? 'owner/repo',
    overrides.githubIssueNumber ?? 90,
    Object.prototype.hasOwnProperty.call(overrides, 'githubPrNumber') ? overrides.githubPrNumber : 12,
  )
}

function makeIssue(
  state: 'open' | 'closed' = 'closed',
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
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
    ...overrides,
  }
}

function exactMergedPrEvidence(number = 12) {
  return { number, state: 'closed' as const, merged: true }
}

function supportingOnlyClosedPrEvidence(number = 12) {
  return { number, state: 'closed' as const, merge_commit_sha: 'supporting-only-sha' }
}

function mismatchedMergedPrEvidence(number = 99) {
  return { number, state: 'closed' as const, merged: true }
}

function closedIssueWithoutMergedPrEvidence() {
  return { repo: 'owner/repo', issue_number: 90, pull_request: null }
}

function failedSyncEvidence(error = new Error('GitHub API error 503: upstream unavailable')) {
  fetchIssuesMock.mockRejectedValue(error)
  return error
}

function activityRows(db: Database.Database) {
  return db.prepare(`
    SELECT type, entity_type, entity_id, actor, description, data, workspace_id
    FROM activities
    ORDER BY id
  `).all()
}

function notificationRows(db: Database.Database) {
  return db.prepare(`
    SELECT recipient, type, title, message, source_type, source_id, workspace_id
    FROM notifications
    ORDER BY id
  `).all()
}

function seedOwnerReadyNotification(db: Database.Database, taskId = 500) {
  db.prepare(`
    INSERT INTO notifications (recipient, type, title, message, source_type, source_id, workspace_id)
    VALUES (?, 'task_ready_for_owner', 'Ready for owner merge', ?, 'task', ?, 1)
  `).run('builder', 'Owner action required: Ready task is ready for owner merge.', taskId)
}

function projectedLabelSets() {
  return updateIssueMock.mock.calls
    .map((call) => call[2])
    .filter((payload): payload is { labels: string[] } => Array.isArray(payload?.labels))
    .map((payload) => payload.labels)
}

function taskChainCalls() {
  return advanceTaskChainMock.mock.calls.map(([call]) => call)
}

function expectNoTerminalSideEffects(db: Database.Database, taskId = 500) {
  expect(db.prepare(`
    SELECT status, completed_at
    FROM tasks
    WHERE id = ?
  `).get(taskId)).toEqual({ status: 'ready_for_owner', completed_at: null })
  expect(projectedLabelSets().some((labels) => labels.includes('mc:done'))).toBe(false)
  expect(projectedLabelSets().some((labels) => !labels.includes('mc:ready-for-owner'))).toBe(false)
  expect(activityRows(db).filter((row: any) => {
    if (row.type !== 'task_updated' || typeof row.data !== 'string') return false
    return row.data.includes('"terminal_event":"github_pr_merged"')
  })).toEqual([])
  expect(taskChainCalls()).toEqual([])
  expect(createIssueMock).not.toHaveBeenCalled()
  expect(activityRows(db).filter((row: any) => row.type === 'github_terminal_cleanup')).toEqual([])
}

function expectSuccessfulTerminalEvidence(db: Database.Database, options: {
  taskId?: number
  repo?: string
  issueNumber?: number
  prNumber?: number
} = {}) {
  const taskId = options.taskId ?? 500
  const repo = options.repo ?? 'owner/repo'
  const issueNumber = options.issueNumber ?? 90
  const prNumber = options.prNumber ?? 12
  expect(db.prepare(`
    SELECT status, completed_at, github_repo, github_issue_number, github_pr_number, github_synced_at
    FROM tasks
    WHERE id = ?
  `).get(taskId)).toEqual({
    status: 'done',
    completed_at: expect.any(Number),
    github_repo: repo,
    github_issue_number: issueNumber,
    github_pr_number: prNumber,
    github_synced_at: expect.any(Number),
  })
  expect(projectedLabelSets()).toContainEqual(expect.arrayContaining(['mc:done']))
  expect(projectedLabelSets().some((labels) => labels.includes('mc:ready-for-owner'))).toBe(false)
  expect(activityRows(db)).toContainEqual(expect.objectContaining({
    type: 'task_updated',
    entity_type: 'task',
    entity_id: taskId,
    actor: 'github-sync',
    data: JSON.stringify({
      github_issue: issueNumber,
      github_repo: repo,
      github_pr_number: prNumber,
      terminal_event: 'github_pr_merged',
    }),
    workspace_id: 1,
  }))
  expect(notificationRows(db).filter((row: any) => row.source_id === taskId).length).toBeLessThanOrEqual(1)
  expect(taskChainCalls()).toEqual([{
    taskId,
    workspaceId: 1,
    previousStatus: 'ready_for_owner',
    trigger: 'github_pr_merged',
  }])
}

describe('SPEC-009C4 RED harness for owner merge reconciliation', () => {
  it('keeps a linked ready_for_owner task at the owner gate until explicit G_PILOT_MERGE evidence exists', async () => {
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

    expectNoTerminalSideEffects(db)
  })

  it('records reconciliation-required evidence for an unmerged exact PR without completing the linked task', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: { number: 12, state: 'closed', merged: false, merge_commit_sha: 'closed-not-merged' },
      },
    })

    expectNoTerminalSideEffects(db)
    expect(activityRows(db)).toContainEqual(expect.objectContaining({
      type: 'github_terminal_reconciliation_required',
      entity_type: 'task',
      entity_id: 500,
      actor: 'github-sync',
      data: JSON.stringify({
        task_id: 500,
        workspace_id: 1,
        github_repo: 'owner/repo',
        github_issue_number: 90,
        github_pr_number: 12,
        reason: 'linked_issue_closed_without_merged_pr',
        source: 'github_sync',
      }),
      workspace_id: 1,
    }))
  })

  it('treats supporting-only closed PR metadata as insufficient terminal merge evidence', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: supportingOnlyClosedPrEvidence(12),
      },
    })

    expectNoTerminalSideEffects(db)
  })

  it('requires fresh SPEC-009C4 live smoke evidence instead of reusing SPEC-009C3 PR 49', () => {
    const checklist = readFileSync(join(process.cwd(), 'docs/qa/pilot-smoke-checklist.md'), 'utf8')

    expect(checklist).toMatch(/SPEC-009C4/i)
    expect(checklist).toMatch(/fresh synthetic (?:C4|SPEC-009C4) PR/i)
    expect(checklist).toMatch(/pre-merge [`']?ready_for_owner[`']? state/i)
    expect(checklist).toMatch(/G_PILOT_MERGE/)
    expect(checklist).toMatch(/manual(?:ly)? merge/i)
    expect(checklist).toMatch(/SPEC-009C3 PR #49/i)
    expect(checklist).toMatch(/must not (?:reuse|use|be used)|non-use/i)
  })

  it('reconciles exact merged PR evidence for the linked repo and PR from ready_for_owner to done', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    const result = await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(result).toEqual({ pulled: 1, pushed: 0 })
    expectSuccessfulTerminalEvidence(db)
  })

  it('projects mc:done and removes stale mc:ready-for-owner after successful reconciliation', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed', {
      labels: [
        { name: 'customer:keep' },
        { name: 'mc:ready-for-owner' },
        { name: 'priority:high' },
      ],
    })])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(projectedLabelSets()).toContainEqual(['customer:keep', 'mc:done', 'priority:high'])
    expect(projectedLabelSets().some((labels) => labels.includes('mc:ready-for-owner'))).toBe(false)
  })

  it('records terminal github_pr_merged activity and keeps notification evidence bounded', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    seedOwnerReadyNotification(db)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(activityRows(db).filter((row: any) => {
      if (row.type !== 'task_updated') return false
      const data = JSON.parse(row.data)
      return data.terminal_event === 'github_pr_merged'
        && data.github_repo === 'owner/repo'
        && data.github_issue === 90
        && data.github_pr_number === 12
    })).toHaveLength(1)
    expect(notificationRows(db).filter((row: any) => row.source_id === 500)).toEqual([
      expect.objectContaining({
        recipient: 'builder',
        type: 'task_ready_for_owner',
        title: 'Ready for owner merge',
        source_type: 'task',
        source_id: 500,
      }),
    ])
    expect(notificationRows(db).some((row: any) => row.type === 'task_terminal_done')).toBe(false)
  })

  it('advances the task chain only after exact merged PR evidence and emits one successor outcome', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: { number: 12, state: 'closed', merged: false },
      },
    })

    expect(taskChainCalls()).toEqual([])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(taskChainCalls()).toEqual([{
      taskId: 500,
      workspaceId: 1,
      previousStatus: 'ready_for_owner',
      trigger: 'github_pr_merged',
    }])
    expect(createIssueMock).not.toHaveBeenCalled()
  })

  it('keeps POST /api/github/sync trigger contract on the shared pullFromGitHub project path', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/github/sync/route.ts'), 'utf8')

    expect(source).toMatch(/POST \/api\/github\/sync/)
    expect(source).toMatch(/Body: \{ action: 'trigger', project_id: number \}/)
    expect(source).toMatch(/const \{ action, project_id \} = body/)
    expect(source).toMatch(/action === 'trigger' && typeof project_id === 'number'/)
    expect(source).toMatch(/SELECT id, github_repo, github_sync_enabled, github_default_branch/)
    expect(source).toMatch(/await pullFromGitHub\(project, workspaceId\)/)
    expect(source).not.toMatch(/pullFromGitHub\(project,\s*workspaceId,\s*\{/)
    expect(source).not.toMatch(/webhookFixture/)
  })

  it('leaves closed issue evidence and supporting-only PR metadata at ready_for_owner', async () => {
    for (const pull_request of [
      closedIssueWithoutMergedPrEvidence().pull_request,
      { number: 12, state: 'closed' as const, merged_at: '2030-01-01T00:10:00Z' },
      supportingOnlyClosedPrEvidence(12),
    ]) {
      const db = freshDb()
      const projectId = seedProject(db)
      seedReadyForOwnerTask(db, projectId)
      fetchIssuesMock.mockResolvedValueOnce([makeIssue('closed')])
      fetchPullRequestMock.mockResolvedValueOnce({ number: 12, state: 'closed', merged: false })

      await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
        webhookFixture: {
          repo: 'owner/repo',
          issue_number: 90,
          pull_request,
        },
      })

      expectNoTerminalSideEffects(db)
      expect(activityRows(db)).toContainEqual(expect.objectContaining({
        type: 'github_terminal_reconciliation_required',
        entity_type: 'task',
        entity_id: 500,
        actor: 'github-sync',
      }))
    }
  })

  it('rejects merged PR evidence with the wrong PR number for the linked task', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])
    fetchPullRequestMock.mockResolvedValue({ number: 12, state: 'closed', merged: false })

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: mismatchedMergedPrEvidence(99),
      },
    })

    expect(fetchPullRequestMock).toHaveBeenCalledWith('owner/repo', 12)
    expectNoTerminalSideEffects(db)
    expect(activityRows(db)).toContainEqual(expect.objectContaining({
      type: 'github_terminal_reconciliation_required',
      entity_id: 500,
      actor: 'github-sync',
    }))
  })

  it('rejects merged PR evidence from the wrong repository for the linked task', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])
    fetchPullRequestMock.mockResolvedValue({ number: 12, state: 'closed', merged: false })

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'other/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(fetchPullRequestMock).toHaveBeenCalledWith('owner/repo', 12)
    expectNoTerminalSideEffects(db)
    expect(activityRows(db)).toContainEqual(expect.objectContaining({
      type: 'github_terminal_reconciliation_required',
      entity_id: 500,
      actor: 'github-sync',
    }))
  })

  it('records failed-sync evidence without terminal side effects when GitHub fetch fails', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    failedSyncEvidence(new Error('GitHub API error 429: rate limit exceeded'))

    const result = await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1)

    expect(result).toEqual({ pulled: 0, pushed: 0 })
    expect(db.prepare(`
      SELECT status, error, project_id, changes_pushed, changes_pulled, workspace_id
      FROM github_syncs
      ORDER BY id DESC
      LIMIT 1
    `).get()).toEqual({
      status: 'error',
      error: 'GitHub API error 429: rate limit exceeded',
      project_id: projectId,
      changes_pushed: 0,
      changes_pulled: 0,
      workspace_id: 1,
    })
    expectNoTerminalSideEffects(db)
  })

  it('keeps fixture and mocked PR evidence out of production API, poller, and UI callsites', () => {
    const root = process.cwd()
    const productionCallsites = [
      'src/app/api/github/sync/route.ts',
      'src/app/api/github/route.ts',
      'src/lib/github-sync-poller.ts',
      'src/components/panels/github-sync-panel.tsx',
    ]

    for (const relative of productionCallsites) {
      const source = readFileSync(join(root, relative), 'utf8')
      expect(source).not.toMatch(/webhookFixture|GitHubTerminalFixture|pull_request|merged_at|merge_commit_sha/)
    }
    expect(readFileSync(join(root, 'src/app/api/github/sync/route.ts'), 'utf8')).toMatch(
      /await pullFromGitHub\(project, workspaceId\)/,
    )
    expect(readFileSync(join(root, 'src/components/panels/github-sync-panel.tsx'), 'utf8')).toMatch(
      /JSON\.stringify\(\{ action: 'trigger', project_id: projectId \}\)/,
    )
  })

  it('rejects a local-only done mutation without current exact merged PR evidence', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId, { status: 'done' })
    db.prepare('UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = 500').run(2, 1)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed', {
      labels: [{ name: 'mc:done' }, { name: 'priority:high' }],
    })])
    fetchPullRequestMock.mockResolvedValue({ number: 12, state: 'closed', merged: false })

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1)

    expectNoTerminalSideEffects(db)
    expect(activityRows(db)).toContainEqual(expect.objectContaining({
      type: 'github_terminal_reconciliation_required',
      entity_type: 'task',
      entity_id: 500,
      actor: 'github-sync',
    }))
  })

  it('keeps duplicate manual sync stable at done without duplicate terminal completion', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    const first = await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })
    const completedAt = db.prepare('SELECT completed_at FROM tasks WHERE id = 500').get() as { completed_at: number }

    const second = await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(first).toEqual({ pulled: 1, pushed: 0 })
    expect(second).toEqual({ pulled: 0, pushed: 0 })
    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 500').get()).toEqual({
      status: 'done',
      completed_at: completedAt.completed_at,
    })
    expect(activityRows(db).filter((row: any) => {
      if (row.type !== 'task_updated') return false
      return JSON.parse(row.data).terminal_event === 'github_pr_merged'
    })).toHaveLength(1)
  })

  it('does not advance the task chain or launch downstream work more than once on duplicate sync', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })
    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(taskChainCalls()).toEqual([{
      taskId: 500,
      workspaceId: 1,
      previousStatus: 'ready_for_owner',
      trigger: 'github_pr_merged',
    }])
    expect(createIssueMock).not.toHaveBeenCalled()
  })

  it('bounds duplicate sync activities, notifications, reconciliation evidence, and cleanup evidence', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    seedOwnerReadyNotification(db)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })
    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: {
        repo: 'owner/repo',
        issue_number: 90,
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(activityRows(db).filter((row: any) => {
      if (row.type !== 'task_updated') return false
      return JSON.parse(row.data).terminal_event === 'github_pr_merged'
    })).toHaveLength(1)
    expect(notificationRows(db).filter((row: any) => row.type === 'task_ready_for_owner')).toHaveLength(1)
    expect(activityRows(db).filter((row: any) => row.type === 'github_terminal_reconciliation_required')).toHaveLength(0)
    expect(notificationRows(db).filter((row: any) => row.title === 'Owner merge reconciliation required')).toHaveLength(0)
    expect(activityRows(db).filter((row: any) => row.type === 'github_terminal_cleanup')).toHaveLength(0)
  })

  it('documents SPEC-009D handoff evidence sources without introducing a packet surface', () => {
    const checklist = readFileSync(join(process.cwd(), 'docs/qa/pilot-smoke-checklist.md'), 'utf8')

    expect(checklist).toMatch(/SPEC-009D handoff evidence sources/i)
    expect(checklist).toMatch(/tasks\.(?:status|completed_at|github_repo|github_issue_number|github_pr_number|github_synced_at)/i)
    expect(checklist).toMatch(/activities[\s\S]*task_updated[\s\S]*github_pr_merged/i)
    expect(checklist).toMatch(/notifications[\s\S]*task_ready_for_owner/i)
    expect(checklist).toMatch(/task_artifacts[\s\S]*spec-009c3\.v1/i)
    expect(checklist).toMatch(/quality_reviews.*aegis/i)
    expect(checklist).toMatch(/GitHub labels[\s\S]*mc:done[\s\S]*mc:ready-for-owner/i)
    expect(checklist).toMatch(/smoke checklist text[\s\S]*fresh synthetic C4 PR/i)
    expect(checklist).not.toMatch(/packet\.ya?ml|packet JSON|owner packet API|owner packet dashboard|owner packet UI/i)
  })

  it('documents the manual operator gate for SPEC-009C4 live UAT before marking it complete', () => {
    const checklist = readFileSync(join(process.cwd(), 'docs/qa/pilot-smoke-checklist.md'), 'utf8')

    expect(checklist).toMatch(/SPEC-009C4 Manual Operator Gate/i)
    expect(checklist).toMatch(/T045[\s\S]*fresh synthetic draft PR/i)
    expect(checklist).toMatch(/T046[\s\S]*G_PILOT_MERGE/i)
    expect(checklist).toMatch(/T047[\s\S]*manual GitHub sync/i)
    expect(checklist).toMatch(/T048[\s\S]*cleanup/i)
    expect(checklist).toMatch(/T049[\s\S]*cleanup fails/i)
    expect(checklist).toMatch(/blocked until an operator explicitly approves and\s+performs live GitHub mutation/i)
  })
})

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
        pull_request: exactMergedPrEvidence(12),
      },
    })

    expect(db.prepare('SELECT status, completed_at FROM tasks WHERE id = 500').get()).toEqual({
      status: 'done',
      completed_at: expect.any(Number),
    })
  })

  it('fetches live PR merge evidence by exact pull request number', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId)
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])
    fetchPullRequestMock.mockResolvedValue({ number: 12, state: 'closed', merged: true })

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1)

    expect(fetchPullRequestMock).toHaveBeenCalledWith('owner/repo', 12)
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
    expect(db.prepare('SELECT recipient, type, title, message, source_type, source_id FROM notifications').all()).toEqual([
      {
        recipient: 'creator',
        type: 'task_ready_for_owner',
        title: 'Owner merge reconciliation required',
        message: expect.stringContaining('Owner action required'),
        source_type: 'task',
        source_id: 500,
      },
    ])
    expect(advanceTaskChainMock).not.toHaveBeenCalled()
  })

  it('keys reconciliation notification dedupe on unchanged task, issue, and reason', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId, { assignedTo: 'builder', createdBy: 'creator' })
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })
    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })

    db.prepare('UPDATE tasks SET github_issue_number = ? WHERE id = 500').run(91)
    fetchIssuesMock.mockResolvedValue([{
      ...makeIssue('closed'),
      number: 91,
      html_url: 'https://github.com/owner/repo/issues/91',
    }])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 91, pull_request: null },
    })

    expect(db.prepare(`
      SELECT recipient, type, title, message, source_type, source_id
      FROM notifications
      ORDER BY id
    `).all()).toEqual([
      {
        recipient: 'builder',
        type: 'task_ready_for_owner',
        title: 'Owner merge reconciliation required',
        message: expect.stringContaining('GitHub issue #90'),
        source_type: 'task',
        source_id: 500,
      },
      {
        recipient: 'builder',
        type: 'task_ready_for_owner',
        title: 'Owner merge reconciliation required',
        message: expect.stringContaining('GitHub issue #91'),
        source_type: 'task',
        source_id: 500,
      },
    ])
  })

  it('does not duplicate reconciliation notifications when only the task title changes', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    seedReadyForOwnerTask(db, projectId, { assignedTo: 'builder', createdBy: 'creator' })
    fetchIssuesMock.mockResolvedValue([makeIssue('closed')])

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })

    db.prepare('UPDATE tasks SET title = ? WHERE id = 500').run('Ready task renamed')

    await pullFromGitHub({ id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 }, 1, {
      webhookFixture: { repo: 'owner/repo', issue_number: 90, pull_request: null },
    })

    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE type = 'task_ready_for_owner'
        AND title = 'Owner merge reconciliation required'
    `).get()).toEqual({ count: 1 })
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
        pull_request: exactMergedPrEvidence(12),
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

describe('SPEC-005 GitHub ready_for_owner label application', () => {
  it('replaces prior mc:* status labels with mc:ready-for-owner when updating a linked issue', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    fetchIssueMock.mockResolvedValue({
      ...makeIssue('open'),
      labels: [
        { name: 'mc:review' },
        { name: 'mc:quality-review' },
        { name: 'priority:medium' },
        { name: 'customer:keep' },
      ],
    })
    updateIssueMock.mockResolvedValue(undefined)

    await pushTaskToGitHub(
      {
        id: 501,
        title: 'Ready task',
        description: 'Ready for owner merge',
        status: 'ready_for_owner',
        priority: 'high',
        github_issue_number: 90,
        github_repo: 'owner/repo',
        workspace_id: 1,
        project_id: projectId,
      },
      { id: projectId, github_repo: 'owner/repo', github_sync_enabled: 1 },
    )

    expect(updateIssueMock).toHaveBeenCalledWith('owner/repo', 90, {
      title: 'Ready task',
      body: 'Ready for owner merge',
      state: 'open',
      labels: ['customer:keep', 'mc:ready-for-owner', 'priority:high'],
    })
  })

  it('applies mc:ready-for-owner through syncTaskOutbound without duplicating ready-owner notifications', async () => {
    const db = freshDb()
    const projectId = seedProject(db)
    fetchIssueMock.mockResolvedValue({
      ...makeIssue('open'),
      labels: [{ name: 'mc:quality-review' }, { name: 'owner:keep' }],
    })
    updateIssueMock.mockResolvedValue(undefined)

    syncTaskOutbound({
      id: 502,
      title: 'Outbound ready task',
      description: 'Ready for owner merge',
      status: 'ready_for_owner',
      priority: 'high',
      github_issue_number: 90,
      github_repo: 'owner/repo',
      workspace_id: 1,
      project_id: projectId,
    }, 1)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(updateIssueMock).toHaveBeenCalledWith('owner/repo', 90, expect.objectContaining({
      labels: ['owner:keep', 'mc:ready-for-owner', 'priority:high'],
    }))
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('keeps ready-for-owner entry callsites wired with github_issue_number for label updates', () => {
    const root = process.cwd()
    const taskDispatchSource = readFileSync(join(root, 'src/lib/task-dispatch.ts'), 'utf8')
    const qualityReviewSource = readFileSync(join(root, 'src/app/api/quality-review/route.ts'), 'utf8')

    expect(taskDispatchSource).toMatch(/t\.github_issue_number/)
    expect(qualityReviewSource).toMatch(/t\.github_issue_number/)
  })
})
