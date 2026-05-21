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
