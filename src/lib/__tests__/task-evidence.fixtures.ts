import Database from 'better-sqlite3'

export interface EvidenceRowCounts {
  tasks: number
  activities: number
  taskArtifacts: number
  taskDispositions: number
  qualityReviews: number
  githubSyncs: number
}

export const SUPPORTED_SPEC_009F_NON_REMEDIATION_OUTCOMES = [
  'NEEDS_SPEC',
  'NEEDS_HUMAN',
  'NEEDS_SPECIALIST',
  'DUPLICATE',
  'OBSOLETE',
  'INVALID',
] as const

export type Spec009fNonRemediationOutcome = typeof SUPPORTED_SPEC_009F_NON_REMEDIATION_OUTCOMES[number]

export type Spec009fTriageRoutingLane =
  | 'speckit_handoff'
  | 'clarification_request'
  | 'specialist_recommendation'
  | 'closure_recommendation'

export interface Spec009fDisposableCounts {
  tasks: number
  activities: number
  taskArtifacts: number
  taskDispositions: number
  qualityReviews: number
  githubSyncs: number
  projects: number
  projectAgentAssignments: number
  agents: number
  workflowTemplates: number
}

export interface Spec009fCleanupMetadata {
  taskIds: number[]
  artifactIds: number[]
  activityIds: number[]
  taskDispositionIds: number[]
  qualityReviewIds: number[]
  githubSyncIds: number[]
  projectIds: number[]
  projectAgentAssignmentIds: number[]
  agentIds: number[]
  workflowTemplateIds: number[]
  featureFlagChanges: string[]
  retainedRepoIdentity: {
    repo: string
    issueNumber: number
    pullRequestNumber: null
  }
  cleanupScope: 'spec-009f-fixture'
  beforeCounts: Spec009fDisposableCounts
  afterCounts?: Spec009fDisposableCounts
}

export interface Spec009fFixtureSeed {
  outcome: Spec009fNonRemediationOutcome
  taskId: number
  artifactId: number
  activityId: number
  dispositionId: number
  payload: Spec009fTriageRoutingPayload
  cleanup: Spec009fCleanupMetadata
}

interface Spec009fTriageRoutingPayload {
  schema_version: 'spec-009f.triage_routing.v1'
  artifact_type:
    | 'triage_speckit_handoff'
    | 'triage_clarification_request'
    | 'triage_specialist_recommendation'
    | 'triage_closure_recommendation'
  source_task_id: number
  workspace_id: number
  source_issue: {
    repo: 'racecraft-lab/mission-control'
    issue_number: number
    url: string
  }
  disposition: Spec009fNonRemediationOutcome
  lane: Spec009fTriageRoutingLane
  routing_status: 'recorded'
  triage_rationale: string
  recommended_next_action: string
  proposed_labels: {
    name: string
    source: 'triage_routing'
    action: 'recommend_add'
    applied: false
  }[]
  evidence_links: {
    type: 'artifact' | 'activity' | 'github_issue' | 'static_doc'
    label: string
    url?: string
    artifact_id?: number
    activity_id?: number
  }[]
  deferred_side_effects: {
    side_effect:
      | 'github_close'
      | 'github_comment'
      | 'github_label'
      | 'github_assignment'
      | 'agent_dispatch'
      | 'speckit_setup'
      | 'successor_task'
    deferred: true
    reason: string
  }[]
  produced_at: string
  lane_detail:
    | {
      proposed_scope: string
      non_goals: string[]
      deferred_setup_action: {
        automatic_setup: false
        owner_action: string
      }
    }
    | {
      blocking_questions: string[]
      target_audience: string
      evidence_needed: string[]
      no_external_message_sent: true
    }
    | {
      specialist_state: 'recommended'
      recommended_lane: string
      recommended_owner: string
      matching_confidence: 'deterministic'
      matching_basis: string[]
    }
    | {
      specialist_state: 'unassigned'
      missing_metadata: string[]
      owner_action: string
    }
    | {
      closure_outcome: 'DUPLICATE'
      suspected_duplicate_target: string
      comparison_rationale: string
    }
    | {
      closure_outcome: 'OBSOLETE'
      superseding_condition: string
      non_actionability_rationale: string
    }
    | {
      closure_outcome: 'INVALID'
      invalidity_reason: string
      validation_evidence: string[]
      missing_reproducibility_context: string[]
    }
}

interface Spec009fFixtureOptions {
  specialistState?: 'recommended' | 'unassigned'
  includeUnsafeContent?: boolean
}

export function createTaskEvidenceDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT,
      feature_flags TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
      github_synced_at INTEGER,
      project_id INTEGER,
      assigned_to TEXT,
      resolution TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE task_artifacts (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      producer_agent_id INTEGER,
      workflow_template_slug TEXT,
      artifact_type TEXT NOT NULL,
      schema_version TEXT,
      storage_kind TEXT NOT NULL,
      content_json TEXT,
      content_markdown TEXT,
      storage_uri TEXT,
      original_filename TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      sha256 TEXT,
      preview_text TEXT,
      redaction_status TEXT NOT NULL DEFAULT 'clean',
      security_scan_status TEXT NOT NULL DEFAULT 'scanned_clean',
      supersedes_artifact_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE task_dispositions (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      disposition TEXT NOT NULL,
      reason TEXT,
      triaged_by_agent_id INTEGER,
      triaged_at INTEGER NOT NULL DEFAULT 1,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE quality_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER,
      reviewer TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE resource_policy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      workspace_id INTEGER,
      decision TEXT,
      reason TEXT,
      details_json TEXT,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE github_syncs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT NOT NULL,
      last_synced_at INTEGER NOT NULL DEFAULT 1,
      issue_count INTEGER NOT NULL DEFAULT 0,
      sync_direction TEXT NOT NULL DEFAULT 'inbound',
      status TEXT NOT NULL DEFAULT 'success',
      error TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      workspace_id INTEGER NOT NULL,
      scope TEXT DEFAULT 'workspace',
      status TEXT DEFAULT 'online',
      config TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      ticket_prefix TEXT NOT NULL,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      area_slug TEXT,
      is_triage_project INTEGER NOT NULL DEFAULT 0,
      is_repo_sync_owner INTEGER NOT NULL DEFAULT 0,
      github_repo TEXT,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE project_agent_assignments (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      workspace_id INTEGER NOT NULL DEFAULT 1,
      assigned_at INTEGER DEFAULT 1
    );
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      task_prompt TEXT NOT NULL,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT,
      agent_role TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT 'system',
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run(
    'spec-009e',
    JSON.stringify({ FEATURE_TASK_ARTIFACTS: true }),
  )
  return db
}

export function closeTaskEvidenceDb(db: Database.Database): void {
  db.close()
}

export function seedEligiblePilotEvidence(db: Database.Database, taskId = 500): number {
  db.prepare(`
    INSERT INTO tasks (
      id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number,
      github_synced_at, chain_id, chain_stage, created_at, updated_at
    )
    VALUES (?, 1, ?, 'ready_for_owner', 'racecraft-lab/mission-control', 50, 51,
      1779300000, 'spec-009e-uat', 'ready_for_owner', 1779300000, 1779300100)
  `).run(taskId, 'SPEC-009E retained pilot trail')
  db.prepare(`
    INSERT INTO task_artifacts (
      id, task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
      byte_size, sha256, preview_text, redaction_status, security_scan_status, created_at
    )
    VALUES
      (900, ?, 1, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
       512, ?, 'SPEC-009D packet references smoke checklist proof for issue #50 / PR #51.', 'clean', 'scanned_clean', 1779300200),
      (901, ?, 1, 'pilot_review_packet_markdown', 'spec-009d.packet.v1', 'inline_markdown', 'text/markdown',
       256, ?, 'Packet markdown export for <script>alert(1)</script> [unsafe](javascript:alert(1)).', 'redacted', 'scanned_clean', 1779300210)
  `).run(taskId, 'a'.repeat(64), taskId, 'b'.repeat(64))
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES ('task_ready_for_owner', 'task', ?, 'mission-control', 'Ready for owner after retained pilot smoke', ?, 1, 1779300300)
  `).run(taskId, JSON.stringify({ smoke_checklist: true, github_pr_number: 51 }))
  db.prepare(`
    INSERT INTO quality_reviews (task_id, workspace_id, reviewer, status, notes, created_at)
    VALUES (?, 1, 'aegis', 'approved', 'Aegis approved retained pilot evidence.', 1779300400)
  `).run(taskId)
  db.prepare(`
    INSERT INTO resource_policy_events (task_id, workspace_id, decision, reason, details_json, created_at)
    VALUES (?, 1, 'allow', 'Within pilot budget', '{"source":"spec-009e-fixture"}', 1779300500)
  `).run(taskId)
  db.prepare(`
    INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, workspace_id, created_at)
    VALUES ('racecraft-lab/mission-control', 1779300600, 1, 'inbound', 'success', 1, 1779300600)
  `).run()
  return taskId
}

export function seedLocalOnlyTask(db: Database.Database, taskId = 600): number {
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number, github_synced_at)
    VALUES (?, 1, 'Local-only task', 'in_progress', NULL, NULL, NULL, NULL)
  `).run(taskId)
  return taskId
}

export function seedPartialProofTask(db: Database.Database, taskId = 700): number {
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number, github_synced_at)
    VALUES (?, 1, 'Partial pilot proof', 'review', 'racecraft-lab/mission-control', 50, NULL, 1779300000)
  `).run(taskId)
  db.prepare(`
    INSERT INTO task_artifacts (
      id, task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
      byte_size, sha256, preview_text, redaction_status, security_scan_status, supersedes_artifact_id, created_at
    )
    VALUES
      (910, ?, 1, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
       131072, ?, 'Large packet preview must not be needed for proof.', 'clean', 'scanned_clean', NULL, 1779300200),
      (911, ?, 1, 'pilot_review_packet_markdown', 'spec-009d.packet.v1', 'inline_markdown', 'text/markdown',
       128, ?, 'Superseded packet', 'superseded', 'scanned_clean', 910, 1779300210),
      (912, ?, 1, 'review_verdict', 'spec-009c3.v1', 'inline_json', 'application/json',
       128, ?, 'Do not show quarantined preview', 'quarantined', 'scanned_with_findings', NULL, 1779300220)
  `).run(taskId, 'c'.repeat(64), taskId, 'd'.repeat(64), taskId, 'e'.repeat(64))
  return taskId
}

export function seedSpec009fNonRemediationOutcome(
  db: Database.Database,
  outcome: Spec009fNonRemediationOutcome,
  options: Spec009fFixtureOptions = {},
): Spec009fFixtureSeed {
  const outcomeIndex = SUPPORTED_SPEC_009F_NON_REMEDIATION_OUTCOMES.indexOf(outcome)
  if (outcomeIndex < 0) throw new Error(`Unsupported SPEC-009F fixture outcome: ${outcome}`)

  const beforeCounts = snapshotSpec009fDisposableCounts(db)
  seedSpec009fSpecialistMetadata(db)

  const taskId = 9500 + outcomeIndex
  const artifactId = 9600 + outcomeIndex
  const activityId = 9700 + outcomeIndex
  const dispositionId = 9800 + outcomeIndex
  const issueNumber = 900 + outcomeIndex
  const producedAt = `2026-05-21T12:0${String(outcomeIndex)}:00.000Z`
  const payload = spec009fPayload(outcome, {
    taskId,
    artifactId,
    activityId,
    issueNumber,
    producedAt,
    ...(options.specialistState ? { specialistState: options.specialistState } : {}),
    ...(options.includeUnsafeContent !== undefined ? { includeUnsafeContent: options.includeUnsafeContent } : {}),
  })
  const payloadJson = JSON.stringify(payload)

  db.prepare(`
    INSERT INTO tasks (
      id, workspace_id, title, description, status, priority, github_repo,
      github_issue_number, github_pr_number, github_synced_at, project_id,
      workflow_template_id, workflow_template_slug, chain_id, chain_stage, created_at, updated_at
    )
    VALUES (?, 1, ?, ?, 'done', 'medium', 'racecraft-lab/mission-control',
      ?, NULL, 1779400000, 9900, 9950, 'mission-control_issue_triage',
      'spec-009f-routing', 'issue_triage', 1779400000, 1779400100)
  `).run(taskId, `SPEC-009F ${outcome} fixture`, `Disposable SPEC-009F fixture for ${outcome}.`, issueNumber)

  db.prepare(`
    INSERT INTO task_artifacts (
      id, task_id, workspace_id, project_id, producer_agent_id, workflow_template_slug,
      artifact_type, schema_version, storage_kind, content_json, mime_type, byte_size,
      sha256, preview_text, redaction_status, security_scan_status, created_at
    )
    VALUES (?, ?, 1, 9900, 9901, 'mission-control_issue_triage',
      ?, 'spec-009f.triage_routing.v1', 'inline_json', ?, 'application/json',
      ?, ?, ?, 'clean', 'scanned_clean', 1779400200)
  `).run(
    artifactId,
    taskId,
    payload.artifact_type,
    payloadJson,
    Buffer.byteLength(payloadJson, 'utf8'),
    String(outcomeIndex).repeat(64),
    `${payload.disposition} ${payload.lane} ${payload.recommended_next_action}`,
  )

  db.prepare(`
    INSERT INTO task_dispositions (id, task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
    VALUES (?, ?, ?, ?, 9901, 1779400300, 1)
  `).run(dispositionId, taskId, outcome, payload.triage_rationale)

  db.prepare(`
    INSERT INTO activities (id, type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES (?, 'triage_routing_recorded', 'task', ?, 'mission-control', ?, ?, 1, 1779400400)
  `).run(
    activityId,
    taskId,
    `Recorded terminal triage routing for ${outcome}`,
    JSON.stringify({
      source_task_id: taskId,
      workspace_id: 1,
      disposition: outcome,
      lane: payload.lane,
      routing_status: 'recorded',
      artifact_id: artifactId,
      idempotency_key: spec009fIdempotencyKey(taskId, outcome),
    }),
  )

  const cleanup: Spec009fCleanupMetadata = {
    taskIds: [taskId],
    artifactIds: [artifactId],
    activityIds: [activityId],
    taskDispositionIds: [dispositionId],
    qualityReviewIds: [],
    githubSyncIds: [],
    projectIds: [9900],
    projectAgentAssignmentIds: [9902],
    agentIds: [9901],
    workflowTemplateIds: [9950],
    featureFlagChanges: ['FEATURE_TASK_ARTIFACTS=true', 'FEATURE_TRIAGE_ROUTING=true'],
    retainedRepoIdentity: {
      repo: 'racecraft-lab/mission-control',
      issueNumber,
      pullRequestNumber: null,
    },
    cleanupScope: 'spec-009f-fixture',
    beforeCounts,
  }

  return {
    outcome,
    taskId,
    artifactId,
    activityId,
    dispositionId,
    payload,
    cleanup,
  }
}

export function seedSpec009fNeedsHumanTriageRouting(db: Database.Database): Spec009fFixtureSeed {
  return seedSpec009fNonRemediationOutcome(db, 'NEEDS_HUMAN')
}

export function seedSpec009fRecommendedSpecialistTriageRouting(db: Database.Database): Spec009fFixtureSeed {
  return seedSpec009fNonRemediationOutcome(db, 'NEEDS_SPECIALIST')
}

export function seedSpec009fUnassignedSpecialistTriageRouting(db: Database.Database): Spec009fFixtureSeed {
  return seedSpec009fNonRemediationOutcome(db, 'NEEDS_SPECIALIST', {
    specialistState: 'unassigned',
    includeUnsafeContent: true,
  })
}

export function seedSpec009fNonRemediationOutcomes(db: Database.Database): Spec009fFixtureSeed[] {
  return SUPPORTED_SPEC_009F_NON_REMEDIATION_OUTCOMES.map((outcome) => seedSpec009fNonRemediationOutcome(db, outcome))
}

export function snapshotSpec009fDisposableCounts(db: Database.Database): Spec009fDisposableCounts {
  return {
    tasks: count(db, 'tasks'),
    activities: count(db, 'activities'),
    taskArtifacts: count(db, 'task_artifacts'),
    taskDispositions: count(db, 'task_dispositions'),
    qualityReviews: count(db, 'quality_reviews'),
    githubSyncs: count(db, 'github_syncs'),
    projects: count(db, 'projects'),
    projectAgentAssignments: count(db, 'project_agent_assignments'),
    agents: count(db, 'agents'),
    workflowTemplates: count(db, 'workflow_templates'),
  }
}

export function cleanupSpec009fDisposableRows(
  db: Database.Database,
  cleanup: Spec009fCleanupMetadata,
): Spec009fCleanupMetadata {
  deleteIds(db, 'activities', cleanup.activityIds)
  deleteIds(db, 'task_dispositions', cleanup.taskDispositionIds)
  deleteIds(db, 'task_artifacts', cleanup.artifactIds)
  deleteIds(db, 'quality_reviews', cleanup.qualityReviewIds)
  deleteIds(db, 'github_syncs', cleanup.githubSyncIds)
  deleteIds(db, 'tasks', cleanup.taskIds)
  deleteIds(db, 'project_agent_assignments', cleanup.projectAgentAssignmentIds)
  deleteIds(db, 'workflow_templates', cleanup.workflowTemplateIds)
  deleteIds(db, 'agents', cleanup.agentIds)
  deleteIds(db, 'projects', cleanup.projectIds)
  return {
    ...cleanup,
    afterCounts: snapshotSpec009fDisposableCounts(db),
  }
}

export function snapshotEvidenceCounts(db: Database.Database): EvidenceRowCounts {
  return {
    tasks: count(db, 'tasks'),
    activities: count(db, 'activities'),
    taskArtifacts: count(db, 'task_artifacts'),
    taskDispositions: count(db, 'task_dispositions'),
    qualityReviews: count(db, 'quality_reviews'),
    githubSyncs: count(db, 'github_syncs'),
  }
}

function seedSpec009fSpecialistMetadata(db: Database.Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO projects (
      id, workspace_id, name, slug, ticket_prefix, area_slug, github_repo,
      github_sync_enabled, status, created_at, updated_at
    )
    VALUES (9900, 1, 'SPEC-009F QA', 'spec-009f-qa', 'FQA', 'qa',
      'racecraft-lab/mission-control', 1, 'active', 1779400000, 1779400000)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, role, workspace_id, status, config, created_at, updated_at)
    VALUES (9901, 'spec-009f-specialist', 'qa-specialist', 1, 'online', '{}', 1779400000, 1779400000)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO project_agent_assignments (id, project_id, agent_name, role, workspace_id, assigned_at)
    VALUES (9902, 9900, 'spec-009f-specialist', 'qa-specialist', 1, 1779400000)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO workflow_templates (
      id, name, task_prompt, workspace_id, slug, agent_role, output_schema,
      routing_rules, next_template_slug, enabled, created_by, created_at, updated_at
    )
    VALUES (9950, 'Issue Triage', 'Classify the issue without mutating GitHub.',
      1, 'mission-control_issue_triage', 'qa-specialist', '{}', '{}', NULL, 1,
      'spec-009f-fixture', 1779400000, 1779400000)
  `).run()
}

function spec009fPayload(
  outcome: Spec009fNonRemediationOutcome,
  ids: {
    taskId: number
    artifactId: number
    activityId: number
    issueNumber: number
    producedAt: string
    specialistState?: 'recommended' | 'unassigned'
    includeUnsafeContent?: boolean
  },
): Spec009fTriageRoutingPayload {
  const common = {
    schema_version: 'spec-009f.triage_routing.v1' as const,
    source_task_id: ids.taskId,
    workspace_id: 1,
    source_issue: {
      repo: 'racecraft-lab/mission-control' as const,
      issue_number: ids.issueNumber,
      url: `https://github.com/racecraft-lab/mission-control/issues/${String(ids.issueNumber)}`,
    },
    disposition: outcome,
    routing_status: 'recorded' as const,
    triage_rationale: `Deterministic SPEC-009F fixture rationale for ${outcome}.`,
    recommended_next_action: ids.includeUnsafeContent
      ? `Review the ${outcome} recommendation in Mission Control. javascript:alert(1)`
      : `Review the ${outcome} recommendation in Mission Control.`,
    proposed_labels: [
      { name: 'mc:triage-routing', source: 'triage_routing' as const, action: 'recommend_add' as const, applied: false as const },
      { name: spec009fOutcomeLabel(outcome), source: 'triage_routing' as const, action: 'recommend_add' as const, applied: false as const },
    ],
    evidence_links: [
      { type: 'github_issue' as const, label: `Issue #${String(ids.issueNumber)}`, url: `https://github.com/racecraft-lab/mission-control/issues/${String(ids.issueNumber)}` },
      { type: 'artifact' as const, label: 'Routing artifact', artifact_id: ids.artifactId },
      { type: 'activity' as const, label: 'Routing activity', activity_id: ids.activityId },
      { type: 'static_doc' as const, label: 'SPEC-009F checklist', url: 'specs/009f-production-triage-routing/checklists/data-integrity.md' },
    ],
    deferred_side_effects: spec009fDeferredSideEffects(outcome),
    produced_at: ids.producedAt,
  }

  if (outcome === 'NEEDS_SPEC') {
    return {
      ...common,
      artifact_type: 'triage_speckit_handoff',
      lane: 'speckit_handoff',
      lane_detail: {
        proposed_scope: 'Specify a focused production behavior change from the triage evidence.',
        non_goals: ['Do not create a spec worktree automatically.', 'Do not enter Issue Remediation.'],
        deferred_setup_action: {
          automatic_setup: false,
          owner_action: 'Owner decides whether to start SpecKit setup from this handoff.',
        },
      },
    }
  }

  if (outcome === 'NEEDS_HUMAN') {
    return {
      ...common,
      artifact_type: 'triage_clarification_request',
      lane: 'clarification_request',
      lane_detail: {
        blocking_questions: ['What user-visible behavior should change?', 'Which environment proves the issue?'],
        target_audience: 'Issue owner',
        evidence_needed: ['Minimal reproduction notes', 'Expected result confirmation'],
        no_external_message_sent: true,
      },
    }
  }

  if (outcome === 'NEEDS_SPECIALIST') {
    if (ids.specialistState === 'unassigned') {
      return {
        ...common,
        artifact_type: 'triage_specialist_recommendation',
        lane: 'specialist_recommendation',
        lane_detail: {
          specialist_state: 'unassigned',
          missing_metadata: ['project.area_slug', 'project_agent_assignments'],
          owner_action: '<b>Assign</b> a specialist owner in Mission Control before dispatch.',
        },
      }
    }

    return {
      ...common,
      artifact_type: 'triage_specialist_recommendation',
      lane: 'specialist_recommendation',
      lane_detail: {
        specialist_state: 'recommended',
        recommended_lane: 'qa-specialist',
        recommended_owner: 'spec-009f-specialist',
        matching_confidence: 'deterministic',
        matching_basis: ['project.area_slug=qa', 'single same-workspace assignment', 'agent status online'],
      },
    }
  }

  if (outcome === 'DUPLICATE') {
    return {
      ...common,
      artifact_type: 'triage_closure_recommendation',
      lane: 'closure_recommendation',
      lane_detail: {
        closure_outcome: 'DUPLICATE',
        suspected_duplicate_target: 'https://github.com/racecraft-lab/mission-control/issues/42',
        comparison_rationale: 'The reported behavior matches the retained duplicate target.',
      },
    }
  }

  if (outcome === 'OBSOLETE') {
    return {
      ...common,
      artifact_type: 'triage_closure_recommendation',
      lane: 'closure_recommendation',
      lane_detail: {
        closure_outcome: 'OBSOLETE',
        superseding_condition: 'The referenced workflow contract has been replaced.',
        non_actionability_rationale: 'Current production behavior no longer reaches the reported state.',
      },
    }
  }

  return {
    ...common,
    artifact_type: 'triage_closure_recommendation',
    lane: 'closure_recommendation',
    lane_detail: {
      closure_outcome: 'INVALID',
      invalidity_reason: 'The report lacks a reproducible Mission Control state.',
      validation_evidence: ['Fixture validation did not find the claimed task state.', 'Stored GitHub identity is issue-only.'],
      missing_reproducibility_context: ['Exact workspace scope', 'Observed task id'],
    },
  }
}

function spec009fDeferredSideEffects(outcome: Spec009fNonRemediationOutcome): Spec009fTriageRoutingPayload['deferred_side_effects'] {
  const common: Spec009fTriageRoutingPayload['deferred_side_effects'] = [
    { side_effect: 'github_label', deferred: true, reason: 'SPEC-009F recommends labels but does not apply them.' },
    { side_effect: 'successor_task', deferred: true, reason: 'SPEC-009F keeps non-remediation outcomes terminal.' },
  ]
  if (outcome === 'NEEDS_SPEC') {
    return [
      ...common,
      { side_effect: 'speckit_setup', deferred: true, reason: 'SpecKit setup remains an owner action.' },
    ]
  }
  if (outcome === 'NEEDS_HUMAN') {
    return [
      ...common,
      { side_effect: 'github_comment', deferred: true, reason: 'No external clarification message is sent by the fixture.' },
    ]
  }
  if (outcome === 'NEEDS_SPECIALIST') {
    return [
      ...common,
      { side_effect: 'github_assignment', deferred: true, reason: 'No GitHub assignment is applied.' },
      { side_effect: 'agent_dispatch', deferred: true, reason: 'Specialist recommendation does not dispatch an agent.' },
    ]
  }
  return [
    ...common,
    { side_effect: 'github_close', deferred: true, reason: 'Closure outcomes are recommendation-only.' },
    { side_effect: 'github_comment', deferred: true, reason: 'No external closure comment is posted.' },
  ]
}

function spec009fOutcomeLabel(outcome: Spec009fNonRemediationOutcome): string {
  return `mc:${outcome.toLowerCase().replaceAll('_', '-')}`
}

function spec009fIdempotencyKey(taskId: number, outcome: Spec009fNonRemediationOutcome): string {
  return `spec-009f.triage_routing.v1:1:${String(taskId)}:${outcome}`
}

function deleteIds(db: Database.Database, table: string, ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids)
}

function count(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
