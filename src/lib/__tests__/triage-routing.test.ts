import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { routeTriageDisposition, type TriageRoutingResult } from '@/lib/triage-routing'
import {
  closeTaskEvidenceDb,
  createTaskEvidenceDb,
  snapshotSpec009fDisposableCounts,
} from './task-evidence.fixtures'

const openDbs: Database.Database[] = []
const FAKE_AKIA = 'AKIAIOSFODNN7EXAMPLE'

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
  return routeWith(database, taskId, disposition)
}

function routeWith(
  database: Database.Database,
  taskId: number,
  disposition: string,
  overrides: { rationale?: string | null } = {},
): TriageRoutingResult {
  return routeTriageDisposition(database, {
    taskId,
    workspaceId: 1,
    disposition,
    rationale: overrides.rationale ?? 'Deterministic triage rationale for routing.',
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

function latestActivity(database: Database.Database, taskId: number): { type: string; data: string | null } {
  return database
    .prepare('SELECT type, data FROM activities WHERE entity_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(taskId) as { type: string; data: string | null }
}

function artifactRow(database: Database.Database, artifactId: number): {
  id: number
  redaction_status: string
  supersedes_artifact_id: number | null
} {
  return database
    .prepare('SELECT id, redaction_status, supersedes_artifact_id FROM task_artifacts WHERE id = ?')
    .get(artifactId) as {
    id: number
    redaction_status: string
    supersedes_artifact_id: number | null
  }
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

  it('honors the PILOT_MISSION_CONTROL_E2E env force-on exception', () => {
    const original = process.env['PILOT_MISSION_CONTROL_E2E']
    process.env['PILOT_MISSION_CONTROL_E2E'] = '1'
    try {
      const database = db()
      database
        .prepare('UPDATE workspaces SET feature_flags = ? WHERE id = 1')
        .run(JSON.stringify({ FEATURE_TASK_ARTIFACTS: true, PILOT_MISSION_CONTROL_E2E: false }))
      const taskId = seedSourceTask(database)

      const result = route(database, taskId, 'NEEDS_SPEC')

      expect(result).toMatchObject({
        ok: true,
        status: 'recorded',
        disposition: 'NEEDS_SPEC',
      })
      expect(latestActivity(database, taskId).type).toBe('triage_routing_recorded')
    } finally {
      if (original === undefined) {
        delete process.env['PILOT_MISSION_CONTROL_E2E']
      } else {
        process.env['PILOT_MISSION_CONTROL_E2E'] = original
      }
    }
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
      redaction_status: 'pending',
      security_scan_status: 'pending',
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

  it.each([
    {
      disposition: 'DUPLICATE',
      expectedDetail: {
        closure_outcome: 'DUPLICATE',
        suspected_duplicate_target: 'https://github.com/racecraft-lab/mission-control/issues/42',
      },
    },
    {
      disposition: 'OBSOLETE',
      expectedDetail: {
        closure_outcome: 'OBSOLETE',
        superseding_condition: 'The referenced workflow contract has been replaced.',
      },
    },
    {
      disposition: 'INVALID',
      expectedDetail: {
        closure_outcome: 'INVALID',
        invalidity_reason: 'The report lacks a reproducible Mission Control state.',
      },
    },
  ])('records %s as a closure recommendation without external mutation or successors', ({ disposition, expectedDetail }) => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9500, githubIssueNumber: 927 })
    const before = snapshotSpec009fDisposableCounts(database)
    const notificationCountBefore = countRows(database, 'notifications')

    const result = route(database, taskId, disposition)
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: true,
      status: 'recorded',
      disposition,
      route: {
        lane: 'closure_recommendation',
        artifactType: 'triage_closure_recommendation',
      },
      effects: {
        createSuccessor: false,
        mutateExternal: false,
        publishArtifact: true,
        dispatchAgent: false,
      },
    })
    if (!result.ok || result.status !== 'recorded') throw new Error(`${disposition} routing was not recorded`)

    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
      taskArtifacts: before.taskArtifacts + 1,
    })
    expect(countRows(database, 'notifications')).toBe(notificationCountBefore)
    expect(readTask(database, taskId).assigned_to).toBeNull()
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ? OR root_task_id = ?').get(taskId, taskId),
    ).toEqual({ count: 0 })

    const artifact = database.prepare('SELECT artifact_type, content_json FROM task_artifacts WHERE id = ?').get(result.artifact.id) as {
      artifact_type: string
      content_json: string
    }
    const payload = JSON.parse(artifact.content_json) as {
      lane_detail: Record<string, unknown>
      proposed_labels: { applied: boolean }[]
      deferred_side_effects: { side_effect: string; deferred: boolean }[]
    }
    expect(artifact.artifact_type).toBe('triage_closure_recommendation')
    expect(payload.lane_detail).toMatchObject(expectedDetail)
    expect(payload.proposed_labels.every((label) => !label.applied)).toBe(true)
    expect(payload.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_close', deferred: true }),
        expect.objectContaining({ side_effect: 'github_comment', deferred: true }),
      ]),
    )
  })

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

  it('keeps unchanged same-outcome retries idempotent without duplicate artifacts or activities', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9600, githubIssueNumber: 928 })

    const first = route(database, taskId, 'NEEDS_SPEC')
    const afterFirst = snapshotSpec009fDisposableCounts(database)
    const second = route(database, taskId, 'NEEDS_SPEC')
    const afterSecond = snapshotSpec009fDisposableCounts(database)

    if (!first.ok || first.status !== 'recorded' || !second.ok || second.status !== 'recorded') {
      throw new Error('Expected both retries to resolve as recorded routes')
    }
    expect(second.artifact.id).toBe(first.artifact.id)
    expect(second.activity.id).toBe(first.activity.id)
    expect(afterSecond).toEqual(afterFirst)
  })

  it('supersedes the prior active artifact when same-outcome normalized payload content changes', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9601, githubIssueNumber: 929 })

    const first = routeWith(database, taskId, 'NEEDS_SPEC', { rationale: 'Original deterministic rationale.' })
    const afterFirst = snapshotSpec009fDisposableCounts(database)
    const second = routeWith(database, taskId, 'NEEDS_SPEC', { rationale: 'Updated deterministic rationale.' })
    const afterSecond = snapshotSpec009fDisposableCounts(database)

    if (!first.ok || first.status !== 'recorded' || !second.ok || second.status !== 'recorded') {
      throw new Error('Expected changed same-outcome retry to record a new route')
    }
    expect(second.artifact.id).not.toBe(first.artifact.id)
    expect(afterSecond).toEqual({
      ...afterFirst,
      activities: afterFirst.activities + 1,
      taskArtifacts: afterFirst.taskArtifacts + 1,
    })
    expect(artifactRow(database, first.artifact.id).redaction_status).toBe('superseded')
    expect(artifactRow(database, second.artifact.id).supersedes_artifact_id).toBe(first.artifact.id)
    expect(JSON.parse(latestActivity(database, taskId).data ?? '{}')).toMatchObject({
      artifact_id: second.artifact.id,
      supersedes_artifact_id: first.artifact.id,
      routing_status: 'recorded',
    })
  })

  it('records a conflict activity without publishing an attempted changed-disposition artifact', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9602, githubIssueNumber: 930 })

    const first = route(database, taskId, 'NEEDS_SPEC')
    const afterFirst = snapshotSpec009fDisposableCounts(database)
    const conflict = route(database, taskId, 'NEEDS_HUMAN')
    const afterConflict = snapshotSpec009fDisposableCounts(database)

    if (!first.ok || first.status !== 'recorded') throw new Error('Initial route was not recorded')
    expect(conflict).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'conflicting_disposition',
    })
    expect(afterConflict).toEqual({
      ...afterFirst,
      activities: afterFirst.activities + 1,
    })
    const activity = latestActivity(database, taskId)
    expect(activity.type).toBe('triage_routing_conflict')
    expect(JSON.parse(activity.data ?? '{}')).toMatchObject({
      routing_status: 'conflict',
      existing_disposition: 'NEEDS_SPEC',
      attempted_disposition: 'NEEDS_HUMAN',
    })
  })

  it('backfills a missing recorded activity without creating a duplicate active artifact', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9603, githubIssueNumber: 931 })

    const first = route(database, taskId, 'NEEDS_HUMAN')
    if (!first.ok || first.status !== 'recorded') throw new Error('Initial route was not recorded')
    database.prepare("DELETE FROM activities WHERE type = 'triage_routing_recorded' AND entity_id = ?").run(taskId)
    const afterDelete = snapshotSpec009fDisposableCounts(database)

    const retry = route(database, taskId, 'NEEDS_HUMAN')
    const afterRetry = snapshotSpec009fDisposableCounts(database)

    if (!retry.ok || retry.status !== 'recorded') throw new Error('Retry route was not recorded')
    expect(retry.artifact.id).toBe(first.artifact.id)
    expect(retry.activity.id).not.toBe(first.activity.id)
    expect(afterRetry).toEqual({
      ...afterDelete,
      activities: afterDelete.activities + 1,
    })
  })

  it('records sanitized validation-failure activity before artifact publish', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9604, githubIssueNumber: 932 })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = routeWith(database, taskId, 'NEEDS_SPEC', { rationale: 'x'.repeat(2101) })
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'payload_validation_failed',
    })
    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
    })
    const activity = latestActivity(database, taskId)
    expect(activity.type).toBe('triage_routing_validation_failed')
    expect(activity.data ?? '').not.toContain('x'.repeat(100))
  })

  it('isolates artifact publish failures into sanitized failure activity without terminal artifact rows', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9605, githubIssueNumber: 933 })
    database.exec(`
      CREATE TRIGGER spec_009f_fail_routing_artifact
      BEFORE INSERT ON task_artifacts
      WHEN NEW.artifact_type LIKE 'triage_%'
      BEGIN
        SELECT RAISE(FAIL, 'artifact store down token=SECRET');
      END;
    `)
    const before = snapshotSpec009fDisposableCounts(database)

    const result = route(database, taskId, 'NEEDS_SPECIALIST')
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'artifact_publish_failed',
    })
    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
    })
    const activity = latestActivity(database, taskId)
    expect(activity.type).toBe('triage_routing_artifact_publish_failed')
    expect(activity.data ?? '').not.toContain('SECRET')
  })

  it('rejects secret-bearing routing artifacts through the task artifact publisher', () => {
    const database = db()
    enablePilot(database)
    const taskId = seedSourceTask(database, { taskId: 9606, githubIssueNumber: 934 })
    const before = snapshotSpec009fDisposableCounts(database)

    const result = routeWith(database, taskId, 'NEEDS_SPEC', {
      rationale: `Owner pasted credential ${FAKE_AKIA} in triage notes.`,
    })
    const after = snapshotSpec009fDisposableCounts(database)

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'artifact_publish_failed',
    })
    expect(after).toEqual({
      ...before,
      activities: before.activities + 1,
    })
    const activity = latestActivity(database, taskId)
    expect(activity.type).toBe('triage_routing_artifact_publish_failed')
    expect(activity.data ?? '').not.toContain(FAKE_AKIA)
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
