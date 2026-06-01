import { describe, expect, it } from 'vitest'
import {
  DEFERRAL_OWNER_SPECS,
  PILOT_REVIEW_PACKET_SCHEMA_VERSION,
  buildPilotReviewPacket,
} from '@/lib/pilot-review-packet'
import {
  pilotArtifact,
  pilotGithubSync,
  pilotPrTask,
  pilotRootTask,
  provenPilotPacketInput,
} from './pilot-review-packet.fixtures'

describe('SPEC-009D pilot review packet contract', () => {
  it('uses the v1 packet schema, required top-level keys, and RFC 6901 pointer source-map keys', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())

    expect(packet.schema_version).toBe(PILOT_REVIEW_PACKET_SCHEMA_VERSION)
    expect(Object.keys(packet)).toEqual([
      'schema_version',
      'generated_at',
      'packet_identity',
      'candidate',
      'lifecycle',
      'gates',
      'evidence',
      'deferrals',
      'warnings',
      'source_map',
    ])
    expect(Object.keys(packet.source_map).every((pointer) => pointer.startsWith('/'))).toBe(true)
    expect(packet.source_map['/lifecycle/current_stage']).toEqual([
      expect.objectContaining({
        source_type: 'table',
        table: 'tasks',
        row_id: 901,
        field: 'status',
      }),
    ])
  })

  it('proves candidate identity from stored GitHub linkage, sync proof, root task, descendants, and PR evidence', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())

    expect(packet.candidate).toMatchObject({
      state: 'proven',
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 52,
      github_pr_number: 52,
      github_synced_at: '2026-05-19T22:10:00.000Z',
      missing_proof: [],
    })
    expect(packet.packet_identity).toMatchObject({
      root_task_id: 900,
      artifact_owner_task_id: 901,
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 52,
      github_pr_number: 52,
    })
    expect(packet.packet_identity.lifecycle_descendant_ids).toEqual([901])
    expect(packet.evidence.github_sync.evidence_state).toBe('available')
  })

  it('source-maps stored table, GitHub sync, and smoke checklist evidence classes', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())
    const refs = Object.values(packet.source_map).flat()

    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'tasks' }),
      expect.objectContaining({ table: 'activities' }),
      expect.objectContaining({ table: 'notifications' }),
      expect.objectContaining({ table: 'task_artifacts' }),
      expect.objectContaining({ table: 'quality_reviews' }),
      expect.objectContaining({ table: 'resource_policy_events' }),
      expect.objectContaining({ table: 'github_syncs' }),
      expect.objectContaining({ source_type: 'smoke_checklist' }),
    ]))
  })

  it('derives lifecycle, gates, latest error, governance, duplicate-stage, and cleaned replay evidence deterministically', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())

    expect(packet.lifecycle.current_stage).toBe('ready_for_owner')
    expect(packet.lifecycle.latest_terminal_activity).toMatchObject({
      type: 'task_ready_for_owner',
      description: 'PR #52 entered ready for owner',
    })
    expect(packet.lifecycle.latest_error).toMatchObject({
      type: 'sync_error',
      summary: 'Latest sync error compacted into stored activity',
    })
    expect(packet.lifecycle.duplicate_active_stage_evidence).toMatchObject({
      evidence_state: 'available',
      duplicate_active_stage: false,
    })
    expect(packet.lifecycle.cleaned_replay_evidence).toMatchObject({
      evidence_state: 'available',
      cleanup_applied: true,
    })
    expect(packet.gates.owner_gate).toMatchObject({ state: 'ready_for_owner', notification_id: 400 })
    expect(packet.gates.aegis_decision).toMatchObject({ reviewer: 'aegis', status: 'approved' })
    expect(packet.gates.governance_evidence).toMatchObject({ decision: 'allow', event_id: 700 })
  })

  it('emits structured missing, malformed, superseded, and stale evidence warnings', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput({
      notifications: [],
      quality_reviews: [],
      resource_policy_events: [],
      artifacts: [
        pilotArtifact({ id: 501, redaction_status: 'superseded', supersedes_artifact_id: 500 }),
        pilotArtifact({ id: 502, artifact_type: '', malformed: true }),
        pilotArtifact({ id: 503, stale: true }),
      ],
    }))

    expect(packet.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_owner_gate' }),
      expect.objectContaining({ code: 'missing_aegis_decision' }),
      expect.objectContaining({ code: 'missing_governance_evidence' }),
      expect.objectContaining({ code: 'artifact_superseded' }),
      expect.objectContaining({ code: 'artifact_malformed' }),
      expect.objectContaining({ code: 'artifact_stale' }),
    ]))
    expect(packet.evidence.artifacts.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidence_state: 'superseded' }),
      expect.objectContaining({ evidence_state: 'malformed' }),
      expect.objectContaining({ evidence_state: 'stale' }),
    ]))
  })

  it('names canonical SPEC-013 and SPEC-014 owners for deferred control-plane fields', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())

    expect(DEFERRAL_OWNER_SPECS).toEqual({
      run_state: ['SPEC-013A'],
      github_sync_automation: ['SPEC-013A1'],
      claim_authority: ['SPEC-013B'],
      retry_controls: ['SPEC-013C'],
      sandbox_lifecycle: ['SPEC-014A'],
      adapter_registry: ['SPEC-014B'],
      real_harness_execution: ['SPEC-014C', 'SPEC-014D'],
    })
    expect(packet.deferrals.run_state).toMatchObject({
      state: 'deferred',
      owner_specs: ['SPEC-013A'],
      reason_code: 'future_spec_owns_capability',
    })
    expect(Object.values(packet.deferrals).every((entry) => entry.source_map.length === 0)).toBe(true)
  })

  it('does not introduce active run, claim, retry, sync, sandbox, adapter, or harness capabilities', () => {
    const packet = buildPilotReviewPacket(provenPilotPacketInput())

    const serialized = JSON.stringify(packet.deferrals)
    expect(serialized).not.toContain('"enabled":true')
    expect(serialized).not.toContain('"active":true')
    expect(serialized).not.toContain('"claim_token"')
    expect(serialized).not.toContain('"retry_after"')
    expect(packet).not.toHaveProperty('run_state')
    expect(packet).not.toHaveProperty('claim_authority')
  })

  it('marks local-only lookalikes and partial-proof candidates without claiming a proven pilot', () => {
    const localOnly = buildPilotReviewPacket(provenPilotPacketInput({
      root_task: pilotRootTask({
        github_repo: null,
        github_issue_number: null,
        github_synced_at: null,
      }),
      descendant_tasks: [pilotPrTask({ github_repo: null, github_issue_number: null })],
      github_syncs: [],
      smoke_checklist_references: [],
    }))
    const partial = buildPilotReviewPacket(provenPilotPacketInput({
      root_task: pilotRootTask({ github_pr_number: null }),
      descendant_tasks: [],
      github_syncs: [pilotGithubSync({ github_pr_number: null })],
      smoke_checklist_references: [],
    }))

    expect(localOnly.candidate.state).toBe('local_only_excluded')
    expect(localOnly.candidate.missing_proof).toEqual(
      expect.arrayContaining(['github_repo', 'github_issue_number', 'github_synced_at', 'github_pr_number_or_checklist_pr']),
    )
    expect(partial.candidate).toMatchObject({
      state: 'incomplete',
      missing_proof: ['github_pr_number_or_checklist_pr'],
    })
  })
})
