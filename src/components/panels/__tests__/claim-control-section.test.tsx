import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  actionLabel,
  buildClaimControlDraft,
  buildReceipt,
  defaultReasonForAction,
  outcomeLabel,
  sanitizedErrorLabel,
} from '@/components/panels/claim-control-copy'
import {
  ClaimControlSection,
  type ClaimControlDraft,
  type ClaimControlSectionProps,
} from '@/components/panels/claim-control-section'
import type { ClaimControlAction, ClaimControlRequestBody } from '@/lib/task-claim-control-types'
import type { ClaimControlAvailableAction, ClaimControlReadModel, TaskClaimReconciliationEnvelope } from '@/lib/task-claim-reconciliation'

const EXPECTED_STATE = {
  claim_id: 'claim-1',
  claim_run_id: 'run-1',
  attempt_id: 'attempt-1',
  attempt_status: 'running',
  operator_action_activity_id: 'activity-1',
} as const

function action(actionName: ClaimControlAction, overrides: Partial<ClaimControlAvailableAction> = {}): ClaimControlAvailableAction {
  return {
    action: actionName,
    enabled: true,
    unavailable_reason: null,
    requires_confirmation: true,
    requires_idempotency_key: true,
    requires_expected_state: true,
    requires_override_reason: false,
    backoff_policy: 'not_applicable',
    ...overrides,
  }
}

function claimControl(overrides: Partial<ClaimControlReadModel> = {}): ClaimControlReadModel {
  return {
    stage_key: 'mission-control_issue_remediation',
    authorization: {
      required_role: 'operator',
      current_role: 'operator',
      can_mutate: true,
    },
    available_actions: [action('retry'), action('release'), action('cancel')],
    retry_eligibility: {
      state: 'eligible',
      reason: 'latest attempt failed',
      evidence_type: 'attempt',
      evidence_id: 'attempt-1',
    },
    backoff: {
      state: 'none',
      seconds_remaining: 0,
      next_retry_at: null,
      reason: null,
      override_allowed: false,
      override_requires_reason: false,
    },
    expected_state: EXPECTED_STATE,
    last_operator_action: { action: 'release', outcome: 'already_applied', activity_id: 'activity-0' },
    last_sanitized_error: { category: 'backoff_active' },
    ...overrides,
  }
}

function envelope(overrides: Partial<TaskClaimReconciliationEnvelope> = {}): TaskClaimReconciliationEnvelope {
  return {
    schema_version: 'task_claim_reconciliation.v1',
    task: {
      id: '500',
      workspace_id: '1',
      status: 'in_progress',
      stage_key: 'mission-control_issue_remediation',
      github: {
        repo: 'racecraft-lab/mission-control',
        issue_number: 55,
        pr_number: null,
      },
    },
    feature_flag: {
      key: 'FEATURE_TASK_CONTROL_PLANE',
      enabled: true,
    },
    eligibility: {
      state: 'eligible',
      reason: null,
    },
    active_claim: null,
    claim_history: [],
    activities: [],
    diagnostics: {
      warnings: [],
    },
    claim_control: claimControl(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

function renderSection(props: Partial<ClaimControlSectionProps> = {}) {
  const onSubmit = vi.fn<(draft: ClaimControlDraft) => void>()
  const onRetryNetworkSubmit = vi.fn<(draft: ClaimControlDraft) => void>()
  const onRefresh = vi.fn<() => void>()

  render(
    <ClaimControlSection
      readModel={envelope()}
      loading={false}
      error={null}
      submitting={null}
      receipt={null}
      networkRetry={null}
      onSubmit={onSubmit}
      onRetryNetworkSubmit={onRetryNetworkSubmit}
      onRefresh={onRefresh}
      {...props}
    />,
  )

  return { onRefresh, onRetryNetworkSubmit, onSubmit }
}

function expectPresent(element: Element | null): void {
  expect(element).not.toBeNull()
}

function expectElementText(element: Element, pattern: RegExp): void {
  expect(element.textContent).toMatch(pattern)
}

function expectButtonDisabled(element: HTMLElement): void {
  expect((element as HTMLButtonElement).disabled).toBe(true)
}

describe('claim-control copy and request helpers', () => {
  it('uses closed maps for actions, outcomes, sanitized errors, and release defaults', () => {
    expect(actionLabel('retry')).toBe('Retry stage')
    expect(actionLabel('release')).toBe('Release claim')
    expect(actionLabel('cancel')).toBe('Cancel attempt')
    expect(outcomeLabel('stale_state')).toBe('State changed before submit')
    expect(sanitizedErrorLabel('forbidden_role')).toBe('Operator role is required.')
    expect(defaultReasonForAction('release')).toBe('operator_released')
  })

  it('copies expected state, applies reason defaults, adds correlation, and never exposes an idempotency key', () => {
    const draft = buildClaimControlDraft({
      readModel: envelope(),
      action: 'release',
      clientCorrelationId: 'client-correlation-1',
    })

    expect(draft).toEqual({
      action: 'release',
      stage_key: 'mission-control_issue_remediation',
      expected: EXPECTED_STATE,
      override_backoff: false,
      override_reason: null,
      reason: 'operator_released',
      client_correlation_id: 'client-correlation-1',
    })
    expect(JSON.stringify(draft)).not.toMatch(/idempotency/i)

    const overrideDraft = buildClaimControlDraft({
      readModel: envelope(),
      action: 'retry',
      overrideBackoff: true,
      overrideReason: 'override because owner approved',
      clientCorrelationId: 'client-correlation-2',
    })
    expect(overrideDraft.override_backoff).toBe(true)
    expect(overrideDraft.override_reason).toBe('override because owner approved')
  })

  it('bounds receipts to closed outcome and sanitized error labels', () => {
    const receipt = buildReceipt({
      action: 'cancel',
      outcome: 'conflict',
      stageKey: 'mission-control_issue_remediation',
      activityId: '123',
      idempotencyReplayed: true,
      sanitizedErrorCategory: 'conflict',
    })

    expect(receipt).toMatchObject({
      action: 'cancel',
      outcome: 'conflict',
      activity_reference: '123',
      idempotency_replayed: true,
      sanitized_error_category: 'conflict',
      tone: 'warning',
    })
  })
})

describe('ClaimControlSection', () => {
  it('renders active claim-control state, disabled backend actions, and bounded safe diagnostics', () => {
    renderSection({
      readModel: envelope({
        claim_control: claimControl({
          available_actions: [
            action('retry'),
            action('release', { enabled: false, unavailable_reason: 'owned by another run' }),
            action('cancel', { enabled: false, unavailable_reason: 'terminal attempt' }),
          ],
        }),
      }),
    })

    const region = screen.getByRole('region', { name: /claim control/i })
    expectPresent(within(region).getByText('mission-control_issue_remediation'))
    expectPresent(within(region).getByText(/operator can mutate/i))
    expectPresent(within(region).getByText(/latest attempt failed/i))
    expectPresent(within(region).getByText(/owned by another run/i))
    expectPresent(within(region).getByText(/terminal attempt/i))
    expectPresent(within(region).getByText(/backoff_active/i))
    expectButtonDisabled(within(region).getByRole('button', { name: 'Release claim' }))
  })

  it('renders loading, route error, absent, and flag-off states without noisy mutation controls', () => {
    const { rerender } = render(
      <ClaimControlSection
        readModel={null}
        loading
        error={null}
        submitting={null}
        receipt={null}
        networkRetry={null}
        onSubmit={vi.fn()}
        onRetryNetworkSubmit={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expectElementText(screen.getByRole('status'), /loading claim-control state/i)

    rerender(
      <ClaimControlSection
        readModel={null}
        loading={false}
        error="Failed to load claim control"
        submitting={null}
        receipt={null}
        networkRetry={null}
        onSubmit={vi.fn()}
        onRetryNetworkSubmit={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expectElementText(screen.getByRole('alert'), /failed to load claim control/i)

    rerender(
      <ClaimControlSection
        readModel={envelope({ claim_control: null })}
        loading={false}
        error={null}
        submitting={null}
        receipt={null}
        networkRetry={null}
        onSubmit={vi.fn()}
        onRetryNetworkSubmit={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.queryByRole('region', { name: /claim control/i })).toBeNull()

    rerender(
      <ClaimControlSection
        readModel={envelope({ feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: false }, claim_control: null })}
        loading={false}
        error={null}
        submitting={null}
        receipt={null}
        networkRetry={null}
        onSubmit={vi.fn()}
        onRetryNetworkSubmit={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expectPresent(screen.getByText(/task control plane is off/i))
    expect(screen.queryByRole('button', { name: /retry stage|release claim|cancel attempt/i })).toBeNull()
  })

  it('emits retry, release, cancel, and backoff override drafts without direct route calls', () => {
    const retry = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Retry stage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(retry.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'retry', expected: EXPECTED_STATE }))

    cleanup()

    const release = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Release claim' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(release.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'release', reason: 'operator_released' }))
  })

  it('requires cancel and override reasons before submit', () => {
    const cancel = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel attempt' }))
    expectElementText(screen.getByRole('alert'), /cancel reason is required/i)
    expectButtonDisabled(screen.getByRole('button', { name: 'Submit' }))
    fireEvent.change(screen.getByLabelText(/cancel reason required/i), { target: { value: 'operator cancelled stuck attempt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(cancel.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel', reason: 'operator cancelled stuck attempt' }))

    cleanup()

    const override = renderSection({
      readModel: envelope({
        claim_control: claimControl({
          available_actions: [
            action('retry', { enabled: false, unavailable_reason: 'retry backoff active', requires_override_reason: true, backoff_policy: 'respect_backoff' }),
            action('release'),
            action('cancel'),
          ],
          backoff: {
            state: 'active',
            seconds_remaining: 120,
            next_retry_at: 1790000000,
            reason: 'retry backoff active',
            override_allowed: true,
            override_requires_reason: true,
          },
        }),
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Override backoff' }))
    expectElementText(screen.getByRole('alert'), /override reason is required/i)
    fireEvent.change(screen.getByLabelText(/override reason required/i), { target: { value: 'incident owner approved override' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(override.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'retry',
      override_backoff: true,
      override_reason: 'incident owner approved override',
    } satisfies Partial<ClaimControlRequestBody>))
  })

  it('renders receipts and network retry without raw idempotency key text', () => {
    const retryDraft: ClaimControlDraft = {
      action: 'retry',
      stage_key: 'mission-control_issue_remediation',
      expected: EXPECTED_STATE,
      override_backoff: false,
      override_reason: null,
      reason: null,
      client_correlation_id: 'client-correlation-3',
    }
    const { onRetryNetworkSubmit } = renderSection({
      receipt: buildReceipt({
        action: 'retry',
        outcome: 'retry_ready',
        stageKey: 'mission-control_issue_remediation',
        activityId: '333',
        idempotencyReplayed: false,
        sanitizedErrorCategory: null,
      }),
      networkRetry: {
        draft: retryDraft,
        message: 'Network failed. Retry the same submission.',
      },
    })

    expectElementText(screen.getByRole('status'), /retry requested/i)
    expectPresent(screen.getByText(/activity 333/i))
    expect(document.body.textContent).not.toMatch(/idempotency-key|raw-request|auth header|bearer|github body/i)
    fireEvent.click(screen.getByRole('button', { name: /retry same submission/i }))
    expect(onRetryNetworkSubmit).toHaveBeenCalledWith(retryDraft)
  })

  it('keeps viewer/read-only actions disabled and inert', () => {
    const { onSubmit } = renderSection({
      readModel: envelope({
        claim_control: claimControl({
          authorization: {
            required_role: 'operator',
            current_role: 'viewer',
            can_mutate: false,
          },
        }),
      }),
    })

    const region = screen.getByRole('region', { name: /claim control/i })
    expectPresent(within(region).getByText(/operator role is required/i))
    for (const button of within(region).getAllByRole('button', { name: /retry stage|release claim|cancel attempt/i })) {
      expectButtonDisabled(button)
      fireEvent.click(button)
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
