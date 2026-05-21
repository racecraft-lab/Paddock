import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskEvidenceSection } from '@/components/panels/task-evidence-section'
import type { TaskEvidenceResponse } from '@/lib/task-evidence'

function evidence(overrides: Partial<TaskEvidenceResponse> = {}): TaskEvidenceResponse {
  return {
    schema_version: 'task_evidence.v1',
    task: {
      id: '500',
      state: 'available',
      title: 'SPEC-009E retained pilot trail',
      status: 'ready_for_owner',
      workspace_id: '1',
      github_repo: 'racecraft-lab/mission-control',
      github_issue_number: 50,
      github_pr_number: 51,
    },
    pilot_eligibility: {
      state: 'eligible',
      reasons: [],
      inputs: ['github_issue', 'github_pr', 'packet_artifacts', 'smoke'],
    },
    identity: {
      state: 'available',
      repository: 'racecraft-lab/mission-control',
      issue: {
        number: 50,
        url: 'https://github.com/racecraft-lab/mission-control/issues/50',
        label: 'racecraft-lab/mission-control#50',
      },
      pull_request: {
        number: 51,
        url: 'https://github.com/racecraft-lab/mission-control/pull/51',
        label: 'PR #51',
      },
      missing: [],
    },
    packet_artifacts: {
      state: 'available',
      references: [
        {
          state: 'available',
          artifact_id: '900',
          kind: 'packet_json',
          display_name: 'SPEC-009D packet [unsafe](javascript:alert(1)) <b>label</b>',
          sha256: 'a'.repeat(64),
          mime_type: 'application/json',
          size_bytes: 512,
          created_at: '2026-05-20T12:00:00.000Z',
          warning_codes: [],
        },
      ],
      missing: [],
    },
    smoke: {
      state: 'available',
      references: ['docs/qa/pilot-smoke-checklist.md#spec-009e'],
      missing: [],
    },
    current_stage: {
      state: 'available',
      current_status: 'ready_for_owner',
      activity_reference: 'activity:1',
      warnings: [],
    },
    triage_routing: {
      state: 'missing',
      routing_status: 'missing',
      proposed_labels: [],
      deferred_side_effects: [],
      missing: ['missing_triage_routing_artifact'],
      warnings: [],
      superseded_artifacts: [],
    },
    warnings: [
      {
        code: 'stale_evidence',
        message: 'Packet snapshot is older than current task state.',
        section: 'current_stage',
        reason: 'stale',
      },
    ],
    deferrals: [
      { category: 'run_state', state: 'deferred', owner_spec: 'SPEC-013A', label: 'Run state' },
      { category: 'sync_automation', state: 'deferred', owner_spec: 'SPEC-013A1', label: 'GitHub sync automation' },
      { category: 'claim_authority', state: 'deferred', owner_spec: 'SPEC-013B', label: 'Claim authority' },
      { category: 'retry_debug_controls', state: 'deferred', owner_spec: 'SPEC-013C', label: 'Retry/debug controls' },
      { category: 'sandbox_lifecycle', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Sandbox lifecycle' },
      { category: 'adapter_registry', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Adapter registry' },
      { category: 'real_harness_execution', state: 'deferred', owner_spec: 'SPEC-014A-D', label: 'Real harness execution' },
    ],
    source_map: [
      { section: 'packet_artifacts', source_type: 'artifact', source_id: '900', state: 'available', note: 'packet artifact' },
    ],
    ...overrides,
  }
}

describe('TaskEvidenceSection', () => {
  it('renders loaded pilot evidence with accessible labels and typed links only', () => {
    render(<TaskEvidenceSection evidence={evidence()} loading={false} error={null} />)

    const region = screen.getByRole('region', { name: /task evidence/i })
    expect(within(region).getByText('eligible')).toBeInTheDocument()
    expect(within(region).getByText('ready_for_owner')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /racecraft-lab\/mission-control#50/i }))
      .toHaveAttribute('href', 'https://github.com/racecraft-lab/mission-control/issues/50')
    expect(within(region).getByRole('link', { name: /PR #51/i }))
      .toHaveAttribute('href', 'https://github.com/racecraft-lab/mission-control/pull/51')
    expect(within(region).getByText(/SPEC-009D packet unsafe/i)).toBeInTheDocument()
    expect(within(region).queryByRole('link', { name: /unsafe/i })).not.toBeInTheDocument()
    expect(within(region).getByText('Triage routing')).toBeInTheDocument()
    expect(within(region).getByText('No triage routing recorded.')).toBeInTheDocument()
  })

  it('renders loading, route error, incomplete, and deferred states without controls', () => {
    const { rerender } = render(<TaskEvidenceSection evidence={null} loading error={null} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading evidence/i)

    rerender(<TaskEvidenceSection evidence={null} loading={false} error="Failed to load evidence" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load evidence/i)

    rerender(<TaskEvidenceSection
      loading={false}
      error={null}
      evidence={evidence({
        pilot_eligibility: {
          state: 'incomplete',
          reasons: ['missing_smoke_proof'],
          inputs: ['github_issue'],
        },
        identity: {
          state: 'incomplete',
          repository: 'racecraft-lab/mission-control',
          issue: { number: 50, label: 'racecraft-lab/mission-control#50' },
          missing: ['missing_github_pr_number'],
        },
      })}
    />)
    expect(screen.getByText('incomplete')).toBeInTheDocument()
    expect(screen.getByText('missing_smoke_proof')).toBeInTheDocument()
    expect(screen.getAllByText('deferred')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /refresh|generate|sync|retry|claim|sandbox|harness/i })).not.toBeInTheDocument()
  })

  it('renders compact read-only triage routing states and inert recommendation text', () => {
    const { rerender } = render(<TaskEvidenceSection
      evidence={evidence({
        triage_routing: {
          state: 'available',
          routing_status: 'recorded',
          disposition: 'NEEDS_SPECIALIST',
          lane: 'specialist_recommendation',
          artifact: {
            state: 'available',
            artifact_id: '9602',
            artifact_type: 'triage_specialist_recommendation',
            schema_version: 'spec-009f.triage_routing.v1',
            display_name: 'Specialist routing <b>artifact</b>',
          },
          activity_reference: 'activity:9702',
          idempotency_key: 'spec-009f.triage_routing.v1:1:9502:NEEDS_SPECIALIST',
          recommended_next_action: 'Review [unsafe](javascript:alert(1)) specialist recommendation.',
          proposed_labels: [
            { name: 'mc:needs-specialist', source: 'triage_routing', action: 'recommend_add', applied: false },
          ],
          deferred_side_effects: [
            { side_effect: 'agent_dispatch', deferred: true, reason: 'No agent is dispatched.' },
          ],
          missing: [],
          warnings: [],
          lane_detail: {
            specialist_state: 'unassigned',
            missing_metadata: ['missing_project'],
            owner_action: 'Owner chooses a specialist.',
          },
          superseded_artifacts: [],
        },
      })}
      loading={false}
      error={null}
    />)

    const region = screen.getByRole('region', { name: /task evidence/i })
    expect(within(region).getByText('Routing recorded')).toBeInTheDocument()
    expect(within(region).getByText('Specialist unassigned')).toBeInTheDocument()
    expect(within(region).getByText(/mc:needs-specialist applied: false/i)).toBeInTheDocument()
    expect(within(region).getByText(/Deferred side effects/i)).toBeInTheDocument()
    expect(within(region).getByText(/Review unsafe specialist recommendation/i)).toBeInTheDocument()
    expect(within(region).queryByRole('link', { name: /unsafe/i })).not.toBeInTheDocument()

    rerender(<TaskEvidenceSection
      evidence={evidence({
        triage_routing: {
          state: 'incomplete',
          routing_status: 'conflict',
          disposition: 'NEEDS_SPEC',
          proposed_labels: [],
          deferred_side_effects: [],
          missing: ['conflicting_triage_routing_disposition'],
          warnings: ['conflict: NEEDS_SPEC already recorded; NEEDS_HUMAN was rejected'],
          superseded_artifacts: [],
        },
      })}
      loading={false}
      error={null}
    />)
    expect(screen.getByText('Triage routing conflict')).toBeInTheDocument()
    expect(screen.getByText('conflicting_triage_routing_disposition')).toBeInTheDocument()

    rerender(<TaskEvidenceSection
      evidence={evidence({
        triage_routing: {
          state: 'unavailable',
          routing_status: 'failed',
          proposed_labels: [],
          deferred_side_effects: [],
          missing: ['artifact_storage_disabled'],
          warnings: ['artifact_publish_failed'],
          superseded_artifacts: [
            {
              state: 'superseded',
              artifact_id: '9601',
              artifact_type: 'triage_speckit_handoff',
              schema_version: 'spec-009f.triage_routing.v1',
              display_name: 'Superseded routing evidence',
            },
          ],
        },
      })}
      loading={false}
      error={null}
    />)
    expect(screen.getByText('Triage routing unavailable')).toBeInTheDocument()
    expect(screen.getAllByText(/Superseded routing evidence/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders unknown API states as unsupported contract text instead of coercing them', () => {
    render(<TaskEvidenceSection
      loading={false}
      error={null}
      evidence={evidence({
        packet_artifacts: {
          state: 'generated' as TaskEvidenceResponse['packet_artifacts']['state'],
          references: [],
          missing: [],
        },
      })}
    />)

    expect(screen.getByText(/unsupported evidence state: generated/i)).toBeInTheDocument()
  })
})
