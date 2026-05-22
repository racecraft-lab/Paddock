import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskStageAttemptsSection } from '@/components/panels/task-stage-attempts-section'
import type {
  SerializedTaskStageAttempt,
  TaskStageAttemptEnvelope,
} from '@/lib/task-stage-attempts'

function envelope(overrides: Partial<TaskStageAttemptEnvelope> = {}): TaskStageAttemptEnvelope {
  return {
    schema_version: 'task_stage_attempts.v1',
    task: {
      id: '500',
      workspace_id: '1',
      title: 'SPEC-013A pilot task',
      status: 'in_progress',
    },
    attempts: [],
    warnings: [],
    ...overrides,
  }
}

function attempt(overrides: Partial<SerializedTaskStageAttempt> = {}): SerializedTaskStageAttempt {
  return {
    id: '44',
    workspace_id: '1',
    task_id: '500',
    stage_key: 'remediation',
    attempt_number: 2,
    status: 'running',
    created_at: '2026-05-22T12:00:00.000Z',
    updated_at: '2026-05-22T12:03:00.000Z',
    started_at: '2026-05-22T12:01:00.000Z',
    completed_at: null,
    archived_at: null,
    workflow_template_id: 7,
    workflow_template_slug: 'mission-control_issue_remediation',
    run_id: 'run-123',
    run_link: { state: 'linked', run_id: 'run-123' },
    run_summary: {
      id: 'run-123',
      status: 'running',
      started_at: '2026-05-22T12:01:00.000Z',
      ended_at: null,
      agent_name: 'aegis',
      runtime: 'mission-control',
      git_branch: '013a-run-state-spine',
      git_commit: 'abc123',
      error: null,
    },
    metadata: null,
    lifecycle: [
      {
        id: '100',
        status: 'created',
        observed_at: '2026-05-22T12:00:00.000Z',
        actor_type: 'system',
        actor_id: 'scheduler',
        message: 'created for inspection',
        metadata: null,
      },
      {
        id: '101',
        status: 'running',
        observed_at: '2026-05-22T12:01:00.000Z',
        actor_type: 'agent',
        actor_id: 'aegis',
        message: 'runtime observed',
        metadata: null,
      },
    ],
    ...overrides,
  }
}

function expectPresent(element: Element | null): void {
  expect(element).not.toBeNull()
}

function expectElementText(element: Element, pattern: RegExp): void {
  expect(element.textContent).toMatch(pattern)
}

describe('TaskStageAttemptsSection', () => {
  it('renders loading, no-attempts, active attempt, linked run, and missing run states', () => {
    const { rerender } = render(<TaskStageAttemptsSection attempts={null} loading error={null} />)

    expectPresent(screen.getByRole('region', { name: /run state and stage attempts/i }))
    expectElementText(screen.getByRole('status'), /loading stage attempts/i)

    rerender(<TaskStageAttemptsSection attempts={envelope()} loading={false} error={null} />)
    expectPresent(screen.getByText(/no stage attempts recorded/i))
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<TaskStageAttemptsSection
      loading={false}
      error={null}
      attempts={envelope({
        attempts: [
          attempt(),
          attempt({
            id: '43',
            stage_key: 'triage',
            attempt_number: 1,
            status: 'created',
            run_id: 'missing-run',
            run_link: { state: 'missing_unavailable', run_id: 'missing-run' },
            run_summary: null,
            lifecycle: [],
          }),
        ],
      })}
    />)

    const region = screen.getByRole('region', { name: /run state and stage attempts/i })
    expectPresent(within(region).getByText('Attempt remediation #2'))
    expectPresent(within(region).getByText('State: running'))
    expectElementText(within(region).getByRole('status'), /remediation #2 is running/i)
    expectPresent(within(region).getByText(/Linked run \(read-only reference\): run-123/i))
    expectPresent(within(region).getByText(/Run missing or unavailable: missing-run/i))
  })

  it('renders invalid-state and projection-drift warnings as alerts with explicit labels', () => {
    render(<TaskStageAttemptsSection
      loading={false}
      error={null}
      attempts={envelope({
        attempts: [attempt({ status: 'invalid_state' })],
        warnings: [
          { code: 'invalid_attempt_state', attempt_id: '44', field: 'status' },
          {
            code: 'projection_drift',
            attempt_id: '44',
            field: 'status',
            projection_value: 'running',
            expected_value: 'failed',
            latest_valid_lifecycle: {
              status: 'failed',
              observed_at: '2026-05-22T12:05:00.000Z',
            },
          },
        ],
      })}
    />)

    const alerts = screen.getAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent).join(' ')).toMatch(/Invalid stored state/i)
    expect(alerts.map((alert) => alert.textContent).join(' ')).toMatch(/Projection drift/i)
    expectPresent(screen.getByText(/expected failed/i))
  })

  it('renders archived attempts and bounds lifecycle snippets to ten entries', () => {
    const lifecycle = Array.from({ length: 12 }, (_, index) => ({
      id: String(200 + index),
      status: index === 11 ? 'archived' as const : 'running' as const,
      observed_at: `2026-05-22T12:${String(index).padStart(2, '0')}:00.000Z`,
      actor_type: 'agent',
      actor_id: 'aegis',
      message: `lifecycle event ${String(index + 1)}`,
      metadata: null,
    }))

    render(<TaskStageAttemptsSection
      loading={false}
      error={null}
      attempts={envelope({
        attempts: [
          attempt({
            status: 'archived',
            archived_at: '2026-05-22T12:11:00.000Z',
            lifecycle,
          }),
        ],
      })}
    />)

    expectPresent(screen.getByText('State: archived'))
    expectPresent(screen.getByText(/Archived at 2026-05-22T12:11:00.000Z/i))
    expect(screen.queryByText(/^lifecycle event 1$/i)).toBeNull()
    expect(screen.queryByText(/^lifecycle event 2$/i)).toBeNull()
    expectPresent(screen.getByText(/lifecycle event 12/i))
    expect(screen.getAllByText(/Lifecycle:/i)).toHaveLength(10)
  })

  it('uses named regions, status semantics, alert semantics, non-color labels, and no action controls', () => {
    const { rerender } = render(<TaskStageAttemptsSection attempts={null} loading error={null} />)
    expectPresent(screen.getByRole('region', { name: /run state and stage attempts/i }))
    expectElementText(screen.getByRole('status'), /loading stage attempts/i)

    rerender(<TaskStageAttemptsSection attempts={null} loading={false} error="Failed to load stage attempts" />)
    expectElementText(screen.getByRole('alert'), /failed to load stage attempts/i)

    rerender(<TaskStageAttemptsSection
      loading={false}
      error={null}
      attempts={envelope({ attempts: [attempt()] })}
    />)

    const region = screen.getByRole('region', { name: /run state and stage attempts/i })
    expectPresent(within(region).getByText('Stage: remediation'))
    expectPresent(within(region).getByText('State: running'))
    expectPresent(within(region).getByText(/Linked run \(read-only reference\): run-123/i))
    expect(within(region).queryByRole('button')).toBeNull()
    expect(within(region).queryByRole('form')).toBeNull()
    expect(within(region).queryByRole('menu')).toBeNull()
  })
})
