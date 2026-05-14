import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PILOT_REPO,
  enableAreaRouting,
  makeGitHubIssue,
  makePilotCandidate,
  seedPilotRouting,
  seedProject,
} from './fixtures/pilot-issue-fixtures'

const {
  getDatabaseMock,
  fetchIssuesMock,
  fetchIssueMock,
  updateIssueMock,
  createIssueMock,
  ensureLabelsMock,
} = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  fetchIssuesMock: vi.fn(),
  fetchIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  createIssueMock: vi.fn(),
  ensureLabelsMock: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return { ...actual, getDatabase: getDatabaseMock }
})

vi.mock('@/lib/github', () => ({
  fetchIssues: fetchIssuesMock,
  fetchIssue: fetchIssueMock,
  updateIssue: updateIssueMock,
  createIssue: createIssueMock,
  ensureLabels: ensureLabelsMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn() },
}))

vi.mock('@/lib/config', () => ({
  config: { gnap: { enabled: false, autoSync: false, repoPath: '' } },
}))

import { pullFromGitHub } from '../github-sync-engine'
import { runMigrations } from '../migrations'
import {
  evaluatePilotIssueEligibility,
  getPilotRootTaskProof,
  isLocalOnlyTaskExcludedFromPilot,
  readPilotSideEffectSnapshot,
  summarizeOperatorSyncResult,
} from '../pilot-issue-eligibility'

const openDbs: Database.Database[] = []

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

beforeEach(() => {
  getDatabaseMock.mockReset()
  fetchIssuesMock.mockReset()
  fetchIssueMock.mockReset()
  updateIssueMock.mockReset()
  createIssueMock.mockReset()
  ensureLabelsMock.mockReset()
})

describe('SPEC-009C1 pilot issue eligibility', () => {
  it('admits one eligible pilot issue and proves exactly one GitHub-linked root task through existing sync', async () => {
    const db = freshDb()
    const { ownerProjectId, devProjectId } = seedPilotRouting(db)
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeGitHubIssue({ number: 501, labels: ['mc:inbox', 'priority:high', 'area:dev'] }),
    ])

    const decision = evaluatePilotIssueEligibility(db, 1, makePilotCandidate({ issueNumber: 501 }))
    expect(decision).toMatchObject({
      eligible: true,
      repository: PILOT_REPO,
      issueNumber: 501,
      areaSlug: 'dev',
      areaResolution: 'single_match',
      priorityLabels: ['priority:high'],
    })

    await pullFromGitHub({ id: ownerProjectId, github_repo: PILOT_REPO, github_sync_enabled: 1 }, 1)

    const proof = getPilotRootTaskProof(db, 1, PILOT_REPO, 501)
    expect(proof.count).toBe(1)
    expect(proof.task).toMatchObject({
      workspace_id: 1,
      github_repo: PILOT_REPO,
      github_issue_number: 501,
      parent_task_id: null,
      project_id: devProjectId,
      status: 'inbox',
      created_by: 'github-sync',
    })
    expect(proof.task?.github_synced_at).toEqual(expect.any(Number))
  })

  it('keeps repeated sync idempotent and reports duplicate synced task evidence', async () => {
    const db = freshDb()
    const { ownerProjectId } = seedPilotRouting(db)
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeGitHubIssue({ number: 502, labels: ['mc:inbox', 'priority:medium', 'area:dev'] }),
    ])

    await pullFromGitHub({ id: ownerProjectId, github_repo: PILOT_REPO, github_sync_enabled: 1 }, 1)
    await pullFromGitHub({ id: ownerProjectId, github_repo: PILOT_REPO, github_sync_enabled: 1 }, 1)

    const proof = getPilotRootTaskProof(db, 1, PILOT_REPO, 502)
    expect(proof.count).toBe(1)

    const decision = evaluatePilotIssueEligibility(db, 1, makePilotCandidate({ issueNumber: 502 }))
    expect(decision).toMatchObject({
      eligible: false,
      reason: 'duplicate_synced_task',
      duplicateTaskId: proof.task?.id,
    })
  })

  it('rejects local-only lookalike tasks from pilot evidence while preserving local task rows', () => {
    const db = freshDb()
    seedPilotRouting(db)
    db.prepare(`
      INSERT INTO tasks (
        title, description, status, priority, workspace_id,
        created_by, created_at, updated_at, tags, metadata
      ) VALUES (?, '', 'inbox', 'high', 1, 'operator', 1, 1, ?, ?)
    `).run(
      'Pilot issue',
      JSON.stringify(['mc:inbox', 'priority:high', 'area:dev']),
      JSON.stringify({ github_repo: PILOT_REPO, github_issue_number: 503 }),
    )

    const localTask = db.prepare(`SELECT * FROM tasks WHERE title = 'Pilot issue'`).get() as { id: number }
    expect(isLocalOnlyTaskExcludedFromPilot(localTask)).toBe(true)
    expect(getPilotRootTaskProof(db, 1, PILOT_REPO, 503)).toMatchObject({ count: 0, task: null })
    expect(db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_by = 'operator'`).get()).toEqual({ count: 1 })
  })

  it('records no dispatch, successor, run, disposition, artifact, or remediation side effects for an admitted pilot task', async () => {
    const db = freshDb()
    const { ownerProjectId } = seedPilotRouting(db)
    getDatabaseMock.mockReturnValue(db)
    fetchIssuesMock.mockResolvedValue([
      makeGitHubIssue({ number: 504, labels: ['mc:inbox', 'priority:medium', 'area:dev'] }),
    ])

    await pullFromGitHub({ id: ownerProjectId, github_repo: PILOT_REPO, github_sync_enabled: 1 }, 1)
    const proof = getPilotRootTaskProof(db, 1, PILOT_REPO, 504)
    expect(proof.task?.id).toEqual(expect.any(Number))

    const snapshot = readPilotSideEffectSnapshot(db, 1, proof.task!.id)
    expect(snapshot).toMatchObject({
      childTaskCount: 0,
      hasTaskChainLineage: false,
      dispatchAttempts: 0,
      assignedTo: null,
      linkedRunCount: 0,
      linkedDispositionCount: 0,
      linkedArtifactCount: 0,
      dispatchPipelineRemediationActivityCount: 0,
    })
    expect(snapshot.optionalFutureTableChecks.every((check) => check.matchingRows === 0)).toBe(true)
  })

  it.each([
    ['missing_mc_inbox', makePilotCandidate({ labels: ['priority:high', 'area:dev'] })],
    ['missing_priority', makePilotCandidate({ labels: ['mc:inbox', 'area:dev'] })],
    ['missing_area', makePilotCandidate({ labels: ['mc:inbox', 'priority:high'] })],
    ['multiple_areas', makePilotCandidate({ labels: ['mc:inbox', 'priority:high', 'area:dev', 'area:qa'] })],
    ['area_not_routable', makePilotCandidate({ labels: ['mc:inbox', 'priority:high', 'area:unknown'] })],
    ['linked_pr', makePilotCandidate({ linkedPullRequest: true })],
    ['terminal_status', makePilotCandidate({ labels: ['mc:inbox', 'priority:high', 'area:dev', 'mc:done'] })],
    ['terminal_status', makePilotCandidate({ state: 'closed' })],
    ['wrong_repository', makePilotCandidate({ repository: 'other/repo' })],
  ])('rejects unsafe candidate with reason %s', (reason, candidate) => {
    const db = freshDb()
    enableAreaRouting(db, 1)
    seedProject(db, { slug: 'pilot-dev', areaSlug: 'dev' })
    seedProject(db, { slug: 'pilot-qa', areaSlug: 'qa' })

    expect(evaluatePilotIssueEligibility(db, 1, candidate)).toMatchObject({
      eligible: false,
      reason,
    })
  })

  it('reports malformed candidate payloads and operator sync failures as distinct errors', () => {
    const db = freshDb()
    seedPilotRouting(db)

    expect(evaluatePilotIssueEligibility(db, 1, { repository: PILOT_REPO, issueNumber: 505 })).toMatchObject({
      eligible: false,
      error: 'malformed_issue_payload',
      operation: 'candidate_selection',
    })
    expect(summarizeOperatorSyncResult(PILOT_REPO, 505, new Error('network timeout'))).toMatchObject({
      eligible: false,
      error: 'sync_failed',
      operation: 'operator_sync',
      evidence: { repository: PILOT_REPO, issueNumber: 505 },
    })
  })

  it('redacts fine-grained GitHub PATs from operator sync failures', () => {
    const result = summarizeOperatorSyncResult(
      PILOT_REPO,
      506,
      new Error('sync failed with github_pat_11AAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    )

    expect(JSON.stringify(result)).not.toContain('github_pat_')
    expect(result).toMatchObject({
      eligible: false,
      error: 'sync_failed',
      evidence: { message: 'sync failed with [redacted]' },
    })
  })
})
