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
const SCAFFOLDED_TRIAGE_ROUTING_DISPOSITIONS = SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS.filter(
  (disposition) => !['NEEDS_SPEC', 'NEEDS_HUMAN', 'NEEDS_SPECIALIST'].includes(disposition),
)

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
    readonly projectId?: number | null
  } = {},
): number {
  const taskId = overrides.taskId ?? 9100
  database
    .prepare(`
      INSERT INTO tasks (
        id, workspace_id, title, description, status, priority, github_repo,
        github_issue_number, github_pr_number, github_synced_at, project_id, workflow_template_slug,
        created_at, updated_at
      )
      VALUES (?, 1, 'SPEC-009F source gate', 'Routing source fixture', 'done', 'medium',
        ?, ?, NULL, 1779400000, ?, ?, 1779400000, 1779400100)
    `)
    .run(
      taskId,
      overrides.githubRepo ?? 'racecraft-lab/mission-control',
      overrides.githubIssueNumber ?? 900,
      overrides.projectId ?? null,
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

function readTask(database: Database.Database, taskId: number): {
  status: string
  workflow_template_slug: string | null
  github_synced_at: number | null
  assigned_to: string | null
} {
  return database
    .prepare('SELECT status, workflow_template_slug, github_synced_at, assigned_to FROM tasks WHERE id = ?')
    .get(taskId) as {
    status: string
    workflow_template_slug: string | null
    github_synced_at: number | null
    assigned_to: string | null
  }
}

function seedSpecialistMetadata(database: Database.Database, overrides: {
  readonly projectId?: number
  readonly areaSlug?: string | null
  readonly agentName?: string
  readonly agentStatus?: string
  readonly assignmentRole?: string
} = {}): void {
  const projectId = overrides.projectId ?? 9900
  database.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, slug, ticket_prefix, area_slug, github_repo,
      github_sync_enabled, status, created_at, updated_at
    )
    VALUES (?, 1, 'SPEC-009F QA', 'spec-009f-qa', 'FQA', ?,
      'racecraft-lab/mission-control', 1, 'active', 1779400000, 1779400000)
  `).run(projectId, overrides.areaSlug ?? 'qa')
  database.prepare(`
    INSERT INTO agents (id, name, role, workspace_id, status, config, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, '{}', 1779400000, 1779400000)
  `).run(projectId + 1, overrides.agentName ?? 'spec-009f-specialist', overrides.assignmentRole ?? 'qa-specialist', overrides.agentStatus ?? 'online')
  database.prepare(`
    INSERT INTO project_agent_assignments (id, project_id, agent_name, role, workspace_id, assigned_at)
    VALUES (?, ?, ?, ?, 1, 1779400000)
  `).run(projectId + 2, projectId, overrides.agentName ?? 'spec-009f-specialist', overrides.assignmentRole ?? 'qa-specialist')
}

function countRows(database: Database.Database, table: string): number {
  return (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
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
  it('records NEEDS_SPEC as a terminal SpecKit handoff without successors or external setup', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { githubIssueNumber: 923 })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPEC')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'recorded',
      disposition: 'NEEDS_SPEC',
      source: {
        taskId,
        workspaceId: 1,
        workflowTemplateSlug: 'mission-control_issue_triage',
        githubRepo: 'racecraft-lab/mission-control',
        githubIssueNumber: 923,
      },
      route: {
        lane: 'speckit_handoff',
        artifactType: 'triage_speckit_handoff',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: true,
        dispatchAgent: false,
      },
      artifact: {
        type: 'triage_speckit_handoff',
        schemaVersion: 'spec-009f.triage_routing.v1',
        idempotencyKey: `spec-009f.triage_routing.v1:1:${String(taskId)}:NEEDS_SPEC`,
      },
    })

    if (!result.ok || result.status !== 'recorded') {
      throw new Error('NEEDS_SPEC routing was not recorded')
    }

    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
      taskArtifacts: before.taskArtifacts + 1,
    })
    expect(readTask(database, taskId)).toEqual({
      status: 'done',
      workflow_template_slug: 'mission-control_issue_triage',
      github_synced_at: 1779400000,
      assigned_to: null,
    })
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ? OR root_task_id = ?').get(taskId, taskId),
    ).toEqual({ count: 0 })

    const artifact = database
      .prepare(`
        SELECT task_id, workspace_id, workflow_template_slug, artifact_type, schema_version,
               storage_kind, content_json, mime_type, redaction_status, security_scan_status
        FROM task_artifacts
        WHERE id = ?
      `)
      .get(result.artifact.id) as {
      task_id: number
      workspace_id: number
      workflow_template_slug: string | null
      artifact_type: string
      schema_version: string
      storage_kind: string
      content_json: string
      mime_type: string
      redaction_status: string
      security_scan_status: string
    }
    const payload = JSON.parse(artifact.content_json) as {
      schema_version: string
      artifact_type: string
      source_task_id: number
      workspace_id: number
      disposition: string
      lane: string
      routing_status: string
      idempotency_key: string
      deferred_side_effects: { side_effect: string; deferred: boolean }[]
      lane_detail: { deferred_setup_action: { automatic_setup: boolean } }
    }
    expect(artifact).toMatchObject({
      task_id: taskId,
      workspace_id: 1,
      workflow_template_slug: 'mission-control_issue_triage',
      artifact_type: 'triage_speckit_handoff',
      schema_version: 'spec-009f.triage_routing.v1',
      storage_kind: 'inline_json',
      mime_type: 'application/json',
      redaction_status: 'clean',
      security_scan_status: 'scanned_clean',
    })
    expect(payload).toMatchObject({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_speckit_handoff',
      source_task_id: taskId,
      workspace_id: 1,
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      idempotency_key: result.artifact.idempotencyKey,
      lane_detail: {
        deferred_setup_action: {
          automatic_setup: false,
        },
      },
    })
    expect(payload.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'speckit_setup', deferred: true }),
      ]),
    )

    const activity = database
      .prepare('SELECT type, entity_type, entity_id, actor, data FROM activities WHERE id = ?')
      .get(result.activity.id) as {
      type: string
      entity_type: string
      entity_id: number
      actor: string
      data: string
    }
    expect(activity).toMatchObject({
      type: 'triage_routing_recorded',
      entity_type: 'task',
      entity_id: taskId,
      actor: 'mission-control',
    })
    expect(JSON.parse(activity.data)).toMatchObject({
      source_task_id: taskId,
      workspace_id: 1,
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      artifact_id: result.artifact.id,
      idempotency_key: result.artifact.idempotencyKey,
      deferred_side_effects: {
        github_mutation: true,
        speckit_setup: true,
        successor_task: true,
      },
    })
  })

  it('records NEEDS_HUMAN as a clarification artifact without external messages or successors', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9200, githubIssueNumber: 924 })
    const before = snapshotSpec009fDisposableCounts(database)
    const notificationCountBefore = countRows(database, 'notifications')

    const result = route(database, taskId, 'NEEDS_HUMAN')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'recorded',
      disposition: 'NEEDS_HUMAN',
      route: {
        lane: 'clarification_request',
        artifactType: 'triage_clarification_request',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: true,
        dispatchAgent: false,
      },
    })
    if (!result.ok || result.status !== 'recorded') throw new Error('NEEDS_HUMAN routing was not recorded')

    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
      taskArtifacts: before.taskArtifacts + 1,
    })
    expect(countRows(database, 'notifications')).toBe(notificationCountBefore)
    expect(readTask(database, taskId)).toEqual({
      status: 'done',
      workflow_template_slug: 'mission-control_issue_triage',
      github_synced_at: 1779400000,
      assigned_to: null,
    })
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ? OR root_task_id = ?').get(taskId, taskId),
    ).toEqual({ count: 0 })

    const artifact = database.prepare('SELECT artifact_type, content_json FROM task_artifacts WHERE id = ?').get(result.artifact.id) as {
      artifact_type: string
      content_json: string
    }
    const payload = JSON.parse(artifact.content_json) as {
      disposition: string
      lane: string
      proposed_labels: { applied: boolean }[]
      deferred_side_effects: { side_effect: string; deferred: boolean }[]
      lane_detail: {
        no_external_message_sent: boolean
        blocking_questions: string[]
        evidence_needed: string[]
      }
    }
    expect(artifact.artifact_type).toBe('triage_clarification_request')
    expect(payload).toMatchObject({
      disposition: 'NEEDS_HUMAN',
      lane: 'clarification_request',
      lane_detail: {
        no_external_message_sent: true,
      },
    })
    expect(payload.lane_detail.blocking_questions.length).toBeGreaterThan(0)
    expect(payload.lane_detail.evidence_needed.length).toBeGreaterThan(0)
    expect(payload.proposed_labels.every((label) => !label.applied)).toBe(true)
    expect(payload.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_comment', deferred: true }),
        expect.objectContaining({ side_effect: 'successor_task', deferred: true }),
      ]),
    )
  })

  it('records NEEDS_SPECIALIST with a deterministic same-workspace recommendation without assigning or dispatching', () => {
    const database = db()
    enablePilot(database)
    seedSpecialistMetadata(database)
    const taskId = seedSourceTask(database, { taskId: 9300, githubIssueNumber: 925, projectId: 9900 })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPECIALIST')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'recorded',
      disposition: 'NEEDS_SPECIALIST',
      route: {
        lane: 'specialist_recommendation',
        artifactType: 'triage_specialist_recommendation',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: true,
        dispatchAgent: false,
      },
    })
    if (!result.ok || result.status !== 'recorded') throw new Error('NEEDS_SPECIALIST routing was not recorded')

    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
      taskArtifacts: before.taskArtifacts + 1,
    })
    expect(readTask(database, taskId).assigned_to).toBeNull()
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ? OR root_task_id = ?').get(taskId, taskId),
    ).toEqual({ count: 0 })

    const artifact = database.prepare('SELECT content_json FROM task_artifacts WHERE id = ?').get(result.artifact.id) as {
      content_json: string
    }
    const payload = JSON.parse(artifact.content_json) as {
      lane_detail: {
        specialist_state: string
        recommended_lane: string
        recommended_owner: string
        matching_confidence: string
        matching_basis: string[]
      }
      deferred_side_effects: { side_effect: string; deferred: boolean }[]
    }
    expect(payload.lane_detail).toMatchObject({
      specialist_state: 'recommended',
      recommended_lane: 'qa-specialist',
      recommended_owner: 'spec-009f-specialist',
      matching_confidence: 'deterministic',
    })
    expect(payload.lane_detail.matching_basis).toEqual(
      expect.arrayContaining(['project.area_slug=qa', 'area:qa', 'single same-workspace assignment']),
    )
    expect(payload.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_assignment', deferred: true }),
        expect.objectContaining({ side_effect: 'agent_dispatch', deferred: true }),
      ]),
    )
  })

  it('records NEEDS_SPECIALIST as unassigned when safe specialist metadata is missing', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9400, githubIssueNumber: 926 })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPECIALIST')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'recorded',
      disposition: 'NEEDS_SPECIALIST',
      route: {
        lane: 'specialist_recommendation',
        artifactType: 'triage_specialist_recommendation',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: true,
        dispatchAgent: false,
      },
    })
    if (!result.ok || result.status !== 'recorded') throw new Error('NEEDS_SPECIALIST routing was not recorded')

    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
      taskArtifacts: before.taskArtifacts + 1,
    })
    expect(readTask(database, taskId).assigned_to).toBeNull()

    const artifact = database.prepare('SELECT content_json FROM task_artifacts WHERE id = ?').get(result.artifact.id) as {
      content_json: string
    }
    const payload = JSON.parse(artifact.content_json) as {
      lane_detail: {
        specialist_state: string
        missing_metadata: string[]
        owner_action: string
      }
    }
    expect(payload.lane_detail).toMatchObject({
      specialist_state: 'unassigned',
      owner_action: 'Owner chooses or supplies specialist context.',
    })
    expect(payload.lane_detail.missing_metadata).toEqual(expect.arrayContaining(['missing_project']))
  })

  it.each(SCAFFOLDED_TRIAGE_ROUTING_DISPOSITIONS)(
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
