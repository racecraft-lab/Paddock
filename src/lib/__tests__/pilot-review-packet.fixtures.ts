import type {
  BuildPilotReviewPacketInput,
  PilotActivityRecord,
  PilotArtifactEvidenceRecord,
  PilotGithubSyncRecord,
  PilotNotificationRecord,
  PilotQualityReviewRecord,
  PilotResourcePolicyEventRecord,
  PilotSmokeChecklistReference,
  PilotTaskRecord,
} from '@/lib/pilot-review-packet'

export const SPEC009D_GENERATED_AT = '2026-05-20T00:00:00.000Z'
export const SPEC009D_WORKSPACE_ID = 2
export const SPEC009D_ROOT_TASK_ID = 900
export const SPEC009D_PR_TASK_ID = 901

export function pilotRootTask(overrides: Partial<PilotTaskRecord> = {}): PilotTaskRecord {
  return {
    id: SPEC009D_ROOT_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    title: 'Pilot issue #52 lifecycle review',
    status: 'in_progress',
    github_repo: 'racecraft-lab/mission-control',
    github_issue_number: 52,
    github_synced_at: '2026-05-19T22:10:00.000Z',
    chain_id: 'pilot-review-chain',
    chain_stage: 'issue-triage',
    created_at: '2026-05-19T20:00:00.000Z',
    updated_at: '2026-05-19T22:12:00.000Z',
    ...overrides,
  }
}

export function pilotPrTask(overrides: Partial<PilotTaskRecord> = {}): PilotTaskRecord {
  return {
    id: SPEC009D_PR_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    parent_task_id: SPEC009D_ROOT_TASK_ID,
    root_task_id: SPEC009D_ROOT_TASK_ID,
    title: 'PR #52 owner merge reconciliation',
    status: 'ready_for_owner',
    github_repo: 'racecraft-lab/mission-control',
    github_issue_number: 52,
    github_pr_number: 52,
    github_synced_at: '2026-05-19T22:12:00.000Z',
    chain_id: 'pilot-review-chain',
    chain_stage: 'ready_for_owner',
    created_at: '2026-05-19T21:00:00.000Z',
    updated_at: '2026-05-19T22:20:00.000Z',
    ...overrides,
  }
}

export function pilotActivity(overrides: Partial<PilotActivityRecord> = {}): PilotActivityRecord {
  return {
    id: 300,
    task_id: SPEC009D_PR_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    type: 'task_ready_for_owner',
    description: 'PR #52 entered ready for owner',
    actor: 'mission-control',
    data: { stage: 'ready_for_owner' },
    created_at: '2026-05-19T22:20:00.000Z',
    ...overrides,
  }
}

export function pilotNotification(
  overrides: Partial<PilotNotificationRecord> = {},
): PilotNotificationRecord {
  return {
    id: 400,
    workspace_id: SPEC009D_WORKSPACE_ID,
    recipient: 'owner',
    type: 'task_ready_for_owner',
    title: 'Ready for owner',
    message: 'Review PR #52',
    source_type: 'task',
    source_id: SPEC009D_PR_TASK_ID,
    created_at: '2026-05-19T22:21:00.000Z',
    ...overrides,
  }
}

export function pilotArtifact(
  overrides: Partial<PilotArtifactEvidenceRecord> = {},
): PilotArtifactEvidenceRecord {
  return {
    id: 500,
    task_id: SPEC009D_PR_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    artifact_type: 'review_verdict',
    schema_version: 'spec-009c3.v1',
    storage_kind: 'inline_json',
    redaction_status: 'clean',
    security_scan_status: 'scanned_clean',
    sha256: 'a'.repeat(64),
    byte_size: 1024,
    mime: 'application/json',
    preview_text: 'Aegis approved PR #52',
    created_at: '2026-05-19T22:22:00.000Z',
    ...overrides,
  }
}

export function pilotQualityReview(
  overrides: Partial<PilotQualityReviewRecord> = {},
): PilotQualityReviewRecord {
  return {
    id: 600,
    task_id: SPEC009D_PR_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    reviewer: 'aegis',
    status: 'approved',
    notes: 'No blocking findings',
    created_at: '2026-05-19T22:23:00.000Z',
    ...overrides,
  }
}

export function pilotGovernanceEvent(
  overrides: Partial<PilotResourcePolicyEventRecord> = {},
): PilotResourcePolicyEventRecord {
  return {
    id: 700,
    task_id: SPEC009D_PR_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    decision: 'allow',
    reason: 'Within pilot budget',
    details_json: JSON.stringify({ readiness_blocked: false }),
    created_at: '2026-05-19T22:24:00.000Z',
    ...overrides,
  }
}

export function pilotGithubSync(
  overrides: Partial<PilotGithubSyncRecord> = {},
): PilotGithubSyncRecord {
  return {
    id: 800,
    task_id: SPEC009D_ROOT_TASK_ID,
    workspace_id: SPEC009D_WORKSPACE_ID,
    github_repo: 'racecraft-lab/mission-control',
    github_issue_number: 52,
    github_pr_number: 52,
    status: 'synced',
    synced_at: '2026-05-19T22:25:00.000Z',
    created_at: '2026-05-19T22:25:00.000Z',
    ...overrides,
  }
}

export function pilotSmokeChecklist(
  overrides: Partial<PilotSmokeChecklistReference> = {},
): PilotSmokeChecklistReference {
  return {
    id: 'spec-009c4-uat',
    checklist_path: 'specs/009c4-owner-merge-reconciliation/checklists/smoke.md',
    checklist_anchor: 'target-replay-cleanup',
    summary: 'Archived UAT smoke captured PR #52 target replay evidence after disposable rows were cleaned.',
    github_repo: 'racecraft-lab/mission-control',
    github_issue_number: 52,
    github_pr_number: 52,
    observed_at: '2026-05-19T22:26:00.000Z',
    cleanup_applied: true,
    ...overrides,
  }
}

export function provenPilotPacketInput(
  overrides: Partial<BuildPilotReviewPacketInput> = {},
): BuildPilotReviewPacketInput {
  return {
    generated_at: SPEC009D_GENERATED_AT,
    root_task: pilotRootTask(),
    descendant_tasks: [pilotPrTask()],
    activities: [
      pilotActivity(),
      pilotActivity({
        id: 301,
        type: 'sync_error',
        description: 'Latest sync error compacted into stored activity',
        data: { error: 'rate_limited', stage: 'github_sync' },
        created_at: '2026-05-19T22:19:00.000Z',
      }),
      pilotActivity({
        id: 302,
        type: 'duplicate_active_stage_detected',
        description: 'Duplicate active stage check found no duplicate successor.',
        data: { duplicate_active_stage: false },
        created_at: '2026-05-19T22:18:00.000Z',
      }),
    ],
    notifications: [pilotNotification()],
    artifacts: [pilotArtifact()],
    quality_reviews: [pilotQualityReview()],
    resource_policy_events: [pilotGovernanceEvent()],
    github_syncs: [pilotGithubSync()],
    smoke_checklist_references: [pilotSmokeChecklist()],
    ...overrides,
  }
}
