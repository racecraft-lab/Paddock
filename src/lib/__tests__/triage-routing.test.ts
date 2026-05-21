import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { routeTriageDisposition, type TriageRoutingResult } from '@/lib/triage-routing'
import {
  SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS,
  TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE,
  TRIAGE_ROUTING_DISPOSITION_TO_LANE,
} from '@/lib/triage-routing-payloads'
import {
  closeTaskEvidenceDb,
  createTaskEvidenceDb,
  snapshotSpec009fDisposableCounts,
} from './task-evidence.fixtures'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    const database = openDbs.pop()
    if (database) closeTaskEvidenceDb(database)
  }
})

function db(): Database.Database {
  const next = createTaskEvidenceDb()
  openDbs.push(next)
  return next
}

function enablePilot(database: Database.Database): void {
  database
    .prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
    .run(JSON.stringify({ FEATURE_TASK_ARTIFACTS: true, PILOT_MISSION_CONTROL_E2E: true }))
}

function seedSourceTask(
  database: Database.Database,
  overrides: {
    readonly taskId?: number
    readonly workflowTemplateSlug?: string | null
    readonly githubRepo?: string | null
    readonly githubIssueNumber?: number | null
  } = {},
): number {
  const taskId = overrides.taskId ?? 9100
  database
    .prepare(`
      INSERT INTO tasks (
        id, workspace_id, title, description, status, priority, github_repo,
        github_issue_number, github_pr_number, github_synced_at, workflow_template_slug,
        created_at, updated_at
      )
      VALUES (?, 1, 'SPEC-009F source gate', 'Routing source fixture', 'done', 'medium',
        ?, ?, NULL, 1779400000, ?, 1779400000, 1779400100)
    `)
    .run(
      taskId,
      overrides.githubRepo ?? 'racecraft-lab/mission-control',
      overrides.githubIssueNumber ?? 900,
      overrides.workflowTemplateSlug ?? 'mission-control_issue_triage',
    )
  return taskId
}

function route(
  database: Database.Database,
  taskId: number,
  disposition: string,
): TriageRoutingResult {
  return routeTriageDisposition(database, {
    taskId,
    workspaceId: 1,
    disposition,
    rationale: 'Deterministic triage rationale for routing.',
  })
}

describe('SPEC-009F triage routing source gates', () => {
  it('fails closed when PILOT_MISSION_CONTROL_E2E is not enabled and performs no writes', () => {
    const database = db()
    const taskId = seedSourceTask(database)
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPEC')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'pilot_flag_disabled',
      effects: {
        createSuccessor: false,
        mutateExternal: false,
      },
      issues: [
        {
          code: 'pilot_flag_disabled',
          path: 'PILOT_MISSION_CONTROL_E2E',
        },
      ],
    })
    expect(after).toEqual(before)
  })

  it('fails closed for source tasks outside mission-control_issue_triage and performs no writes', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { workflowTemplateSlug: 'mission-control_remediation_plan' })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_HUMAN')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'unsupported_source_template',
      source: {
        taskId,
        workflowTemplateSlug: 'mission-control_remediation_plan',
        githubRepo: 'racecraft-lab/mission-control',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
      },
      issues: [
        {
          code: 'unsupported_source_template',
          path: 'task.workflow_template_slug',
        },
      ],
    })
    expect(after).toEqual(before)
  })

  it('fails closed for source tasks outside racecraft-lab/mission-control and performs no writes', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { githubRepo: 'racecraft-lab/other-repo' })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPECIALIST')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'unsupported_source_repo',
      source: {
        taskId,
        workflowTemplateSlug: 'mission-control_issue_triage',
        githubRepo: 'racecraft-lab/other-repo',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
      },
      issues: [
        {
          code: 'unsupported_source_repo',
          path: 'task.github_repo',
        },
      ],
    })
    expect(after).toEqual(before)
  })
})

describe('SPEC-009F triage routing disposition dispatch', () => {
  it.each(SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS)(
    'dispatches %s to a recordable lane without successors, external mutation, or writes',
    (disposition) => {
      const database = db()
      enablePilot(database)
      const taskId = seedSourceTask(database, { githubIssueNumber: 923 })
      const before = snapshotSpec009fDisposableCounts(database)

      const result = route(database, taskId, disposition)
      const after = snapshotSpec009fDisposableCounts(database)

      expect(result).toMatchObject({
        ok: true,
        status: 'recordable',
        disposition,
        source: {
          taskId,
          workspaceId: 1,
          workflowTemplateSlug: 'mission-control_issue_triage',
          githubRepo: 'racecraft-lab/mission-control',
          githubIssueNumber: 923,
        },
        route: {
          lane: TRIAGE_ROUTING_DISPOSITION_TO_LANE[disposition],
          artifactType: TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE[disposition],
        },
        effects: {
          createSuccessor: false,
          mutateExternal: false,
          publishArtifact: false,
          dispatchAgent: false,
        },
      })
      expect(after).toEqual(before)
    },
  )

  it('skips ACTIONABLE_REMEDIATION so the existing remediation successor flow is preserved', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database)
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'ACTIONABLE_REMEDIATION')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'skipped',
      reason: 'actionable_remediation_preserved',
      disposition: 'ACTIONABLE_REMEDIATION',
      preserveExistingRemediationFlow: true,
      source: {
        taskId,
        workspaceId: 1,
        workflowTemplateSlug: 'mission-control_issue_triage',
        githubRepo: 'racecraft-lab/mission-control',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: false,
        dispatchAgent: false,
      },
    })
    expect(after).toEqual(before)
  })

  it('fails closed for unsupported dispositions without echoing raw disposition text or writing rows', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database)
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'BAD_DISPOSITION_SECRET')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'unsupported_disposition',
      source: {
        taskId,
        workflowTemplateSlug: 'mission-control_issue_triage',
        githubRepo: 'racecraft-lab/mission-control',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
      },
      issues: [
        {
          code: 'unsupported_disposition',
          path: 'disposition',
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('BAD_DISPOSITION_SECRET')
    expect(after).toEqual(before)
  })
})
