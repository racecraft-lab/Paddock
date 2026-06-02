import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ALLOWED_EVIDENCE_STATES,
  SECTION_STATE_MATRIX,
  TASK_EVIDENCE_SCHEMA_VERSION,
  buildTaskEvidence,
  toInertEvidenceText,
  type TaskEvidenceResponse,
} from '@/lib/task-evidence'
import {
  closeTaskEvidenceDb,
  createTaskEvidenceDb,
  seedEligiblePilotEvidence,
  seedLocalOnlyTask,
  seedPartialProofTask,
  seedSpec009fDuplicateClosureRouting,
  seedSpec009fInvalidClosureRouting,
  seedSpec009fNeedsHumanTriageRouting,
  seedSpec009fNonRemediationOutcome,
  seedSpec009fObsoleteClosureRouting,
  seedSpec009fRecommendedSpecialistTriageRouting,
  seedSpec009fUnassignedSpecialistTriageRouting,
  snapshotEvidenceCounts,
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

function scopedBuild(database: Database.Database, taskId: number, artifactStorageEnabled = true): TaskEvidenceResponse {
  const evidence = buildTaskEvidence(database, {
    taskId,
    scopeSql: 't.workspace_id = ?',
    scopeParams: [1],
    artifactStorageEnabled,
  })
  if (!evidence) throw new Error(`Missing fixture task evidence for task ${String(taskId)}`)
  return evidence
}

describe('SPEC-009E task evidence helper', () => {
  it('defines only the v1 evidence states allowed by the data model and section matrix', () => {
    expect(TASK_EVIDENCE_SCHEMA_VERSION).toBe('task_evidence.v1')
    expect(ALLOWED_EVIDENCE_STATES).toEqual([
      'eligible',
      'not_eligible',
      'incomplete',
      'available',
      'missing',
      'stale',
      'redacted',
      'quarantined',
      'superseded',
      'unavailable',
      'deferred',
    ])
    expect(SECTION_STATE_MATRIX.pilot_eligibility).toEqual([
      'eligible',
      'not_eligible',
      'incomplete',
      'missing',
      'unavailable',
    ])
    expect(SECTION_STATE_MATRIX.deferrals).toEqual(['deferred'])
    expect(SECTION_STATE_MATRIX.triage_routing).toEqual([
      'missing',
      'available',
      'incomplete',
      'unavailable',
      'superseded',
    ])
  })

  it('derives an eligible retained pilot trail from stored Paddock rows only', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)

    const evidence = scopedBuild(database, taskId)

    expect(evidence).toMatchObject({
      schema_version: 'task_evidence.v1',
      task: {
        state: 'available',
        id: String(taskId),
        github_repo: 'racecraft-lab/Paddock',
        github_issue_number: 50,
        github_pr_number: 51,
      },
      pilot_eligibility: {
        state: 'eligible',
        reasons: [],
      },
      identity: {
        state: 'available',
        repository: 'racecraft-lab/Paddock',
        issue: {
          number: 50,
          url: 'https://github.com/racecraft-lab/Paddock/issues/50',
        },
        pull_request: {
          number: 51,
          url: 'https://github.com/racecraft-lab/Paddock/pull/51',
        },
      },
      packet_artifacts: {
        state: 'available',
      },
      smoke: {
        state: 'available',
      },
      current_stage: {
        state: 'available',
        current_status: 'ready_for_owner',
      },
    })
    expect(evidence.deferrals).toHaveLength(7)
    expect(evidence.deferrals.map((entry) => entry.state)).toEqual(Array.from({ length: 7 }, () => 'deferred'))
    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'task', source_type: 'task', state: 'available' }),
      expect.objectContaining({ section: 'packet_artifacts', source_type: 'artifact', state: 'available' }),
      expect.objectContaining({ section: 'smoke', source_type: 'static_uat_link', state: 'available' }),
    ]))
  })

  it('maps local-only and partial-proof tasks to explicit domain states instead of empty success', () => {
    const database = db()
    const localOnlyId = seedLocalOnlyTask(database)
    const partialId = seedPartialProofTask(database)

    const localOnly = scopedBuild(database, localOnlyId)
    const partial = scopedBuild(database, partialId)

    expect(localOnly.pilot_eligibility.state).toBe('not_eligible')
    expect(localOnly.pilot_eligibility.reasons).toEqual(
      expect.arrayContaining(['missing_github_repo', 'missing_github_issue_number', 'missing_github_synced_at']),
    )
    expect(localOnly.identity.state).toBe('missing')
    expect(partial.pilot_eligibility.state).toBe('incomplete')
    expect(partial.identity).toMatchObject({
      state: 'incomplete',
      missing: ['missing_github_pr_number'],
    })
    expect(partial.packet_artifacts.state).toBe('quarantined')
    expect(partial.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'oversized', section: 'packet_artifacts' }),
      expect.objectContaining({ reason: 'superseded', section: 'packet_artifacts' }),
      expect.objectContaining({ reason: 'unsafe', section: 'packet_artifacts' }),
    ]))
  })

  it('degrades packet artifacts to unavailable when artifact storage is disabled', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)

    const evidence = scopedBuild(database, taskId, false)

    expect(evidence.packet_artifacts).toMatchObject({
      state: 'unavailable',
      unavailable_reason: 'artifact_storage_disabled',
      references: [],
    })
    expect(evidence.warnings).toContainEqual(expect.objectContaining({
      code: 'section_unavailable',
      section: 'packet_artifacts',
      reason: 'artifact_storage_disabled',
    }))
  })

  it('reads governance evidence from the migration-era policy event schema without workspace_id', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)
    database.exec(`
      DROP TABLE resource_policy_events;
      CREATE TABLE resource_policy_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER,
        task_id INTEGER,
        agent_id INTEGER,
        decision TEXT NOT NULL,
        reason TEXT,
        observed_value REAL,
        limit_value REAL,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT 1
      );
    `)
    database.prepare(`
      INSERT INTO resource_policy_events (task_id, decision, reason, metadata, created_at)
      VALUES (?, 'allow', 'Within pilot budget', '{"source":"spec-009e-fixture"}', 1779300500)
    `).run(taskId)

    const evidence = scopedBuild(database, taskId)

    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_type: 'governance', state: 'available' }),
    ]))
  })

  it('normalizes stored evidence text as inert display text and performs no writes', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)
    const before = snapshotEvidenceCounts(database)

    const unsafe = toInertEvidenceText('Before <b>bold</b> [link](javascript:alert(1)) data:text/plain,hi')
    const evidence = scopedBuild(database, taskId)
    const after = snapshotEvidenceCounts(database)

    expect(unsafe).toBe('Before bold link')
    expect(after).toEqual(before)
    expect(JSON.stringify(evidence)).not.toContain('storage_uri')
    expect(JSON.stringify(evidence)).not.toContain('javascript:alert')
    expect(JSON.stringify(evidence)).not.toContain('<script>')
  })
})

describe('SPEC-009F task evidence triage routing', () => {
  function insertTriageRoutingProblemActivity(
    database: Database.Database,
    taskId: number,
    type: 'triage_routing_conflict' | 'triage_routing_validation_failed' | 'triage_routing_artifact_publish_failed',
    data: Record<string, unknown>,
    createdAt = 1779400900,
  ): number {
    const info = database.prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
      VALUES (?, 'task', ?, 'paddock', 'SPEC-009F problem activity', ?, 1, ?)
    `).run(type, taskId, JSON.stringify(data), createdAt)
    return Number(info.lastInsertRowid)
  }

  it('derives NEEDS_SPEC triage routing evidence from terminal handoff artifacts and activities', () => {
    const database = db()
    const seed = seedSpec009fNonRemediationOutcome(database, 'NEEDS_SPEC')
    const before = snapshotEvidenceCounts(database)

    const evidence = scopedBuild(database, seed.taskId)
    const after = snapshotEvidenceCounts(database)

    expect(after).toEqual(before)
    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      artifact: {
        state: 'available',
        artifact_id: String(seed.artifactId),
        artifact_type: 'triage_speckit_handoff',
        schema_version: 'spec-009f.triage_routing.v1',
      },
      activity_reference: `activity:${String(seed.activityId)}`,
      idempotency_key: `spec-009f.triage_routing.v1:1:${String(seed.taskId)}:NEEDS_SPEC`,
      recommended_next_action: 'Review the NEEDS_SPEC recommendation in Paddock.',
      proposed_labels: [
        {
          name: 'mc:triage-routing',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        {
          name: 'mc:needs-spec',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
      ],
      missing: [],
      warnings: [],
      lane_detail: {
        proposed_scope: 'Specify a focused production behavior change from the triage evidence.',
        non_goals: ['Do not create a spec worktree automatically.', 'Do not enter Issue Remediation.'],
        deferred_setup_action: {
          automatic_setup: false,
          owner_action: 'Owner decides whether to start SpecKit setup from this handoff.',
        },
      },
      superseded_artifacts: [],
    })
    expect(evidence.triage_routing.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side_effect: 'speckit_setup',
          deferred: true,
          reason: 'SpecKit setup remains an owner action.',
        }),
      ]),
    )
    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: 'triage_routing',
        source_type: 'artifact',
        source_id: String(seed.artifactId),
        state: 'available',
      }),
      expect.objectContaining({
        section: 'triage_routing',
        source_type: 'activity',
        source_id: String(seed.activityId),
        state: 'available',
      }),
    ]))
    expect(JSON.stringify(evidence.triage_routing)).not.toContain('storage_uri')
    expect(JSON.stringify(evidence.triage_routing)).not.toContain('javascript:')
  })

  it('maps missing and artifact-storage-unavailable triage routing evidence explicitly', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)

    const missing = scopedBuild(database, taskId)
    const unavailable = scopedBuild(database, taskId, false)

    expect(missing.triage_routing).toMatchObject({
      state: 'missing',
      routing_status: 'missing',
      missing: ['missing_triage_routing_artifact'],
    })
    expect(unavailable.triage_routing).toMatchObject({
      state: 'unavailable',
      routing_status: 'missing',
      missing: ['artifact_storage_disabled'],
    })
    expect(unavailable.warnings).toContainEqual(expect.objectContaining({
      code: 'section_unavailable',
      section: 'triage_routing',
      reason: 'artifact_storage_disabled',
    }))
  })

  it('selects the newest current route and preserves superseded artifacts as trace-only evidence', () => {
    const database = db()
    const seed = seedSpec009fNonRemediationOutcome(database, 'NEEDS_SPEC')
    const newArtifactId = seed.artifactId + 200
    const newActivityId = seed.activityId + 200
    const idempotencyKey = `spec-009f.triage_routing.v1:1:${String(seed.taskId)}:NEEDS_SPEC`
    const nextPayload = {
      ...seed.payload,
      idempotency_key: idempotencyKey,
      triage_rationale: 'Updated deterministic SPEC-009F fixture rationale.',
      recommended_next_action: 'Review the newest NEEDS_SPEC route in Paddock.',
      produced_at: '2026-05-21T14:00:00.000Z',
    }
    const payloadJson = JSON.stringify(nextPayload)
    database
      .prepare('UPDATE task_artifacts SET redaction_status = ? WHERE id = ?')
      .run('superseded', seed.artifactId)
    database.prepare(`
      INSERT INTO task_artifacts (
        id, task_id, workspace_id, project_id, producer_agent_id, workflow_template_slug,
        artifact_type, schema_version, storage_kind, content_json, mime_type, byte_size,
        sha256, preview_text, redaction_status, security_scan_status, supersedes_artifact_id, created_at
      )
      VALUES (?, ?, 1, 9900, 9901, 'paddock_issue_triage',
        'triage_speckit_handoff', 'spec-009f.triage_routing.v1', 'inline_json', ?, 'application/json',
        ?, ?, 'Updated routing artifact', 'clean', 'scanned_clean', ?, 1779400800)
    `).run(newArtifactId, seed.taskId, payloadJson, Buffer.byteLength(payloadJson, 'utf8'), 'f'.repeat(64), seed.artifactId)
    database.prepare(`
      INSERT INTO activities (id, type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
      VALUES (?, 'triage_routing_recorded', 'task', ?, 'paddock', 'Recorded terminal triage routing for NEEDS_SPEC', ?, 1, 1779400810)
    `).run(newActivityId, seed.taskId, JSON.stringify({
      source_task_id: seed.taskId,
      workspace_id: 1,
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      artifact_id: newArtifactId,
      supersedes_artifact_id: seed.artifactId,
      idempotency_key: idempotencyKey,
    }))

    const evidence = scopedBuild(database, seed.taskId)

    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      artifact: {
        artifact_id: String(newArtifactId),
      },
      activity_reference: `activity:${String(newActivityId)}`,
      recommended_next_action: 'Review the newest NEEDS_SPEC route in Paddock.',
      superseded_artifacts: [
        expect.objectContaining({
          state: 'superseded',
          artifact_id: String(seed.artifactId),
        }),
      ],
    })
    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: 'triage_routing',
        source_type: 'artifact',
        source_id: String(seed.artifactId),
        state: 'superseded',
      }),
    ]))
  })

  it('maps conflict and failed routing activities without exposing raw unsafe failure details', () => {
    const database = db()
    const seed = seedSpec009fNonRemediationOutcome(database, 'NEEDS_SPEC')
    const conflictActivityId = insertTriageRoutingProblemActivity(database, seed.taskId, 'triage_routing_conflict', {
      source_task_id: seed.taskId,
      workspace_id: 1,
      disposition: 'NEEDS_HUMAN',
      routing_status: 'conflict',
      idempotency_key: `spec-009f.triage_routing.v1:1:${String(seed.taskId)}:NEEDS_HUMAN`,
      existing_disposition: 'NEEDS_SPEC',
      attempted_disposition: 'NEEDS_HUMAN',
    })

    const conflict = scopedBuild(database, seed.taskId)

    expect(conflict.triage_routing).toMatchObject({
      state: 'incomplete',
      routing_status: 'conflict',
      disposition: 'NEEDS_SPEC',
      activity_reference: `activity:${String(conflictActivityId)}`,
      missing: ['conflicting_triage_routing_disposition'],
    })
    expect(conflict.triage_routing.warnings.join(' ')).toContain('NEEDS_SPEC already recorded')

    const failureTaskId = seedEligiblePilotEvidence(database, 9900)
    insertTriageRoutingProblemActivity(database, failureTaskId, 'triage_routing_validation_failed', {
      disposition: 'NEEDS_SPEC',
      routing_status: 'failed',
      failure_code: 'payload_validation_failed',
      raw_error: 'javascript:alert(1) storage_uri=/secret',
    })
    const failed = scopedBuild(database, failureTaskId)

    expect(failed.triage_routing).toMatchObject({
      state: 'incomplete',
      routing_status: 'failed',
      disposition: 'NEEDS_SPEC',
      missing: ['missing_triage_routing_artifact'],
      warnings: ['payload_validation_failed'],
    })
    expect(JSON.stringify(failed.triage_routing)).not.toContain('javascript:')
    expect(JSON.stringify(failed.triage_routing)).not.toContain('storage_uri')
  })

  it('reports trace-only superseded routing evidence when no current artifact remains', () => {
    const database = db()
    const seed = seedSpec009fNonRemediationOutcome(database, 'NEEDS_HUMAN')
    database.prepare('UPDATE task_artifacts SET redaction_status = ? WHERE id = ?').run('superseded', seed.artifactId)

    const evidence = scopedBuild(database, seed.taskId)

    expect(evidence.triage_routing).toMatchObject({
      state: 'superseded',
      routing_status: 'missing',
      missing: ['missing_current_triage_routing_artifact'],
      superseded_artifacts: [
        expect.objectContaining({
          state: 'superseded',
          artifact_id: String(seed.artifactId),
        }),
      ],
    })
  })

  it('derives NEEDS_HUMAN clarification routing evidence without mutating source rows', () => {
    const database = db()
    const seed = seedSpec009fNeedsHumanTriageRouting(database)
    const before = snapshotEvidenceCounts(database)

    const evidence = scopedBuild(database, seed.taskId)
    const after = snapshotEvidenceCounts(database)

    expect(after).toEqual(before)
    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      disposition: 'NEEDS_HUMAN',
      lane: 'clarification_request',
      artifact: {
        state: 'available',
        artifact_id: String(seed.artifactId),
        artifact_type: 'triage_clarification_request',
        schema_version: 'spec-009f.triage_routing.v1',
      },
      activity_reference: `activity:${String(seed.activityId)}`,
      idempotency_key: `spec-009f.triage_routing.v1:1:${String(seed.taskId)}:NEEDS_HUMAN`,
      recommended_next_action: 'Review the NEEDS_HUMAN recommendation in Paddock.',
      proposed_labels: [
        {
          name: 'mc:triage-routing',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        {
          name: 'mc:needs-human',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
      ],
      lane_detail: {
        blocking_questions: ['What user-visible behavior should change?', 'Which environment proves the issue?'],
        target_audience: 'Issue owner',
        evidence_needed: ['Minimal reproduction notes', 'Expected result confirmation'],
        no_external_message_sent: true,
      },
      missing: [],
      warnings: [],
      superseded_artifacts: [],
    })
    expect(evidence.triage_routing.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side_effect: 'github_comment',
          deferred: true,
          reason: 'No external clarification message is sent by the fixture.',
        }),
      ]),
    )
    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: 'triage_routing',
        source_type: 'artifact',
        source_id: String(seed.artifactId),
        state: 'available',
      }),
      expect.objectContaining({
        section: 'triage_routing',
        source_type: 'activity',
        source_id: String(seed.activityId),
        state: 'available',
      }),
    ]))
  })

  it('derives recommended NEEDS_SPECIALIST routing evidence with deferred assignment and dispatch', () => {
    const database = db()
    const seed = seedSpec009fRecommendedSpecialistTriageRouting(database)
    const before = snapshotEvidenceCounts(database)

    const evidence = scopedBuild(database, seed.taskId)
    const after = snapshotEvidenceCounts(database)

    expect(after).toEqual(before)
    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      disposition: 'NEEDS_SPECIALIST',
      lane: 'specialist_recommendation',
      artifact: {
        state: 'available',
        artifact_id: String(seed.artifactId),
        artifact_type: 'triage_specialist_recommendation',
        schema_version: 'spec-009f.triage_routing.v1',
      },
      activity_reference: `activity:${String(seed.activityId)}`,
      idempotency_key: `spec-009f.triage_routing.v1:1:${String(seed.taskId)}:NEEDS_SPECIALIST`,
      recommended_next_action: 'Review the NEEDS_SPECIALIST recommendation in Paddock.',
      proposed_labels: [
        {
          name: 'mc:triage-routing',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        {
          name: 'mc:needs-specialist',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
      ],
      lane_detail: {
        specialist_state: 'recommended',
        recommended_lane: 'qa-specialist',
        recommended_owner: 'spec-009f-specialist',
        matching_confidence: 'deterministic',
        matching_basis: ['project.area_slug=qa', 'single same-workspace assignment', 'agent status online'],
      },
      missing: [],
      warnings: [],
      superseded_artifacts: [],
    })
    expect(evidence.triage_routing.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_assignment', deferred: true }),
        expect.objectContaining({ side_effect: 'agent_dispatch', deferred: true }),
      ]),
    )
  })

  it('derives unassigned NEEDS_SPECIALIST routing evidence with missing metadata and inert owner action', () => {
    const database = db()
    const seed = seedSpec009fUnassignedSpecialistTriageRouting(database)
    const before = snapshotEvidenceCounts(database)

    const evidence = scopedBuild(database, seed.taskId)
    const after = snapshotEvidenceCounts(database)
    const rendered = JSON.stringify(evidence.triage_routing)

    expect(after).toEqual(before)
    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      disposition: 'NEEDS_SPECIALIST',
      lane: 'specialist_recommendation',
      artifact: {
        state: 'available',
        artifact_id: String(seed.artifactId),
        artifact_type: 'triage_specialist_recommendation',
        schema_version: 'spec-009f.triage_routing.v1',
      },
      activity_reference: `activity:${String(seed.activityId)}`,
      recommended_next_action: 'Review the NEEDS_SPECIALIST recommendation in Paddock.',
      proposed_labels: [
        {
          name: 'mc:triage-routing',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        {
          name: 'mc:needs-specialist',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
      ],
      lane_detail: {
        specialist_state: 'unassigned',
        missing_metadata: ['project.area_slug', 'project_agent_assignments'],
        owner_action: 'Assign a specialist owner in Paddock before dispatch.',
      },
      missing: [],
      warnings: [],
    })
    expect(evidence.triage_routing.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_assignment', deferred: true }),
        expect.objectContaining({ side_effect: 'agent_dispatch', deferred: true }),
      ]),
    )
    expect(rendered).not.toContain('<b>')
    expect(rendered).not.toContain('javascript:')
    expect(rendered).not.toContain('storage_uri')
  })

  it.each([
    {
      label: 'duplicate',
      seedClosure: seedSpec009fDuplicateClosureRouting,
      disposition: 'DUPLICATE',
      expectedDetail: {
        closure_outcome: 'DUPLICATE',
        suspected_duplicate_target: 'https://github.com/racecraft-lab/Paddock/issues/42',
        comparison_rationale: 'The reported behavior matches the retained duplicate target.',
      },
    },
    {
      label: 'obsolete',
      seedClosure: seedSpec009fObsoleteClosureRouting,
      disposition: 'OBSOLETE',
      expectedDetail: {
        closure_outcome: 'OBSOLETE',
        superseding_condition: 'The referenced workflow contract has been replaced.',
        non_actionability_rationale: 'Current production behavior no longer reaches the reported state.',
      },
    },
    {
      label: 'invalid',
      seedClosure: seedSpec009fInvalidClosureRouting,
      disposition: 'INVALID',
      expectedDetail: {
        closure_outcome: 'INVALID',
        invalidity_reason: 'The report lacks a reproducible Paddock state.',
        validation_evidence: ['Fixture validation did not find the claimed task state.', 'Stored GitHub identity is issue-only.'],
        missing_reproducibility_context: ['Exact workspace scope', 'Observed task id'],
      },
    },
  ])('derives $label closure routing evidence with inert outcome-specific detail', ({ seedClosure, disposition, expectedDetail }) => {
    const database = db()
    const seed = seedClosure(database)
    const before = snapshotEvidenceCounts(database)

    const evidence = scopedBuild(database, seed.taskId)
    const after = snapshotEvidenceCounts(database)
    const rendered = JSON.stringify(evidence.triage_routing)

    expect(after).toEqual(before)
    expect(evidence.triage_routing).toMatchObject({
      state: 'available',
      routing_status: 'recorded',
      disposition,
      lane: 'closure_recommendation',
      artifact: {
        state: 'available',
        artifact_id: String(seed.artifactId),
        artifact_type: 'triage_closure_recommendation',
        schema_version: 'spec-009f.triage_routing.v1',
      },
      activity_reference: `activity:${String(seed.activityId)}`,
      recommended_next_action: `Review the ${disposition} recommendation in Paddock.`,
      lane_detail: expectedDetail,
      missing: [],
      warnings: [],
    })
    expect(evidence.triage_routing.proposed_labels.length).toBeGreaterThan(0)
    for (const label of evidence.triage_routing.proposed_labels) {
      expect(label.applied).toBe(false)
    }
    expect(evidence.triage_routing.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_close', deferred: true }),
        expect.objectContaining({ side_effect: 'github_comment', deferred: true }),
      ]),
    )
    expect(rendered).not.toContain('javascript:')
    expect(rendered).not.toContain('<b>')
    expect(rendered).not.toContain('storage_uri')
  })
})
