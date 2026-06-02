import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  actionLabel,
  buildClaimControlDraft,
  buildClaimControlRequestInit,
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
    stage_key: 'paddock_issue_remediation',
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
    last_sanitized_error: { sanitized_error_category: 'backoff_active' },
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
      stage_key: 'paddock_issue_remediation',
      github: {
        repo: 'racecraft-lab/paddock',
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
  const onAbandonNetworkRetry = vi.fn<() => void>()
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
      onAbandonNetworkRetry={onAbandonNetworkRetry}
      onRefresh={onRefresh}
      {...props}
    />,
  )

  return { onAbandonNetworkRetry, onRefresh, onRetryNetworkSubmit, onSubmit }
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
    expect(actionLabel('cancel')).toBe('Cancel stage')
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
      stage_key: 'paddock_issue_remediation',
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

    const request = buildClaimControlRequestInit(overrideDraft, 'idem-key-123')
    expect(request.method).toBe('POST')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.headers['Idempotency-Key']).toBe('idem-key-123')
    expect(JSON.parse(request.body)).toMatchObject({ action: 'retry', override_backoff: true })

    const boundedOverride = buildClaimControlDraft({
      readModel: envelope(),
      action: 'retry',
      overrideBackoff: true,
      overrideReason: 'x'.repeat(700),
      clientCorrelationId: 'client-correlation-4',
    })
    expect(boundedOverride.override_reason?.length).toBe(512)
  })

  it('bounds receipts to closed outcome and sanitized error labels', () => {
    const receipt = buildReceipt({
      action: 'cancel',
      outcome: 'conflict',
      stageKey: 'paddock_issue_remediation',
      availableActions: [
        { action: 'retry', enabled: true, unavailable_reason: null },
        { action: 'release', enabled: false, unavailable_reason: 'no_active_claim' },
      ],
      activityId: '123',
      idempotencyReplayed: true,
      sanitizedErrorCategory: 'conflict',
    })

    expect(receipt).toMatchObject({
      action: 'cancel',
      outcome: 'conflict',
      refreshed_availability: 'Available after refresh: Retry stage; Release claim disabled: no_active_claim.',
      activity_reference: '123',
      idempotency_replayed: true,
      sanitized_error_category: 'conflict',
      tone: 'warning',
    })

    expect(buildReceipt({
      action: 'retry',
      outcome: 'retry_ready',
      stageKey: 'stage-a',
      availableActions: [],
      activityId: '200',
      idempotencyReplayed: false,
      sanitizedErrorCategory: null,
    })).toMatchObject({ tone: 'success', refreshed_availability: 'Available after refresh: none.' })
    expect(buildReceipt({
      action: 'release',
      outcome: 'already_applied',
      stageKey: 'stage-a',
      availableActions: null,
      activityId: '201',
      idempotencyReplayed: true,
      sanitizedErrorCategory: null,
    })).toMatchObject({ outcome: 'already_applied', idempotency_replayed: true, refreshed_availability: 'Availability refresh completed.', tone: 'status' })
    expect(buildReceipt({
      action: 'retry',
      outcome: 'stale_state',
      stageKey: 'stage-a',
      availableActions: [],
      activityId: null,
      idempotencyReplayed: false,
      sanitizedErrorCategory: 'stale_state',
    })).toMatchObject({ outcome: 'stale_state', sanitized_error_category: 'stale_state', tone: 'warning' })
    expect(buildReceipt({
      action: 'retry',
      outcome: 'unsafe-raw-outcome',
      stageKey: 'stage-a',
      availableActions: [],
      activityId: null,
      idempotencyReplayed: false,
      sanitizedErrorCategory: 'internal_error',
    })).toMatchObject({ outcome: 'validation_error', sanitized_error_category: 'internal_error', tone: 'error' })
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
    expectPresent(within(region).getByText('paddock_issue_remediation'))
    expectPresent(within(region).getByText(/operator can mutate/i))
    expectPresent(within(region).getByText(/latest attempt failed/i))
    expectPresent(within(region).getByText(/owned by another run/i))
    expectPresent(within(region).getByText(/terminal attempt/i))
    expectPresent(within(region).getByText(/retry backoff is active/i))
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
        onAbandonNetworkRetry={vi.fn()}
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
        onAbandonNetworkRetry={vi.fn()}
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
        onAbandonNetworkRetry={vi.fn()}
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
        onAbandonNetworkRetry={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expectPresent(screen.getByText(/task control plane is off/i))
    expect(screen.queryByRole('button', { name: /retry stage|release claim|cancel stage/i })).toBeNull()
  })

  it('renders sanitized error categories without raw diagnostic message fields', () => {
    renderSection({
      readModel: envelope({
        claim_control: claimControl({
          last_sanitized_error: {
            sanitized_error_category: 'unsafe_payload',
            message: 'raw token sk-live-secret should never render',
            reason: 'provider payload leaked',
          },
        }),
      }),
    })

    const region = screen.getByRole('region', { name: /claim control/i })
    expectPresent(within(region).getByText(/request included unsafe content/i))
    expect(region.textContent).not.toMatch(/sk-live-secret|provider payload leaked|raw token/i)
  })

  it('keeps task-detail claim-control wiring scoped and adjacent to existing Details sections', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/panels/task-board-panel.tsx'), 'utf8')
    const fetchIndex = source.indexOf('appendScopeToPath(`/api/tasks/${task.id}/claim-reconciliation`, activeProductLineScope)')
    const claimIndex = source.indexOf('<ClaimControlSection')
    const evidenceIndex = source.indexOf('<TaskEvidenceSection')
    const attemptsIndex = source.indexOf('<TaskStageAttemptsSection')

    expect(fetchIndex).toBeGreaterThan(-1)
    expect(claimIndex).toBeGreaterThan(-1)
    expect(evidenceIndex).toBeGreaterThan(claimIndex)
    expect(attemptsIndex).toBeGreaterThan(evidenceIndex)
    expect(source.includes("resolveFlag('FEATURE_TASK_CONTROL_PLANE")).toBe(false)
    expect(source.includes('resolveFlag("FEATURE_TASK_CONTROL_PLANE')).toBe(false)
  })

  it('refreshes claim reconciliation before adjacent task-detail surfaces after mutation responses', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/panels/task-board-panel.tsx'), 'utf8')
    const refreshStart = source.indexOf('const refreshAfterClaimControlResponse')
    const claimRefresh = source.indexOf('await fetchClaimReconciliation()', refreshStart)
    const evidenceRefresh = source.indexOf('fetchTaskEvidence()', refreshStart)
    const attemptsRefresh = source.indexOf('fetchTaskStageAttempts()', refreshStart)
    const listRefresh = source.indexOf('onUpdate()', refreshStart)

    expect(refreshStart).toBeGreaterThan(-1)
    expect(claimRefresh).toBeGreaterThan(refreshStart)
    expect(evidenceRefresh).toBeGreaterThan(claimRefresh)
    expect(attemptsRefresh).toBeGreaterThan(claimRefresh)
    expect(listRefresh).toBeGreaterThan(claimRefresh)
  })

  it('clears same-submission retry state when backend expected state refreshes', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/panels/task-board-panel.tsx'), 'utf8')
    const expectedStateDependency = 'claimReconciliation?.claim_control?.expected_state.operator_action_activity_id'
    const expectedStateDependencyIndex = source.indexOf(expectedStateDependency)
    const expectedStateEffectStart = source.lastIndexOf('useEffect(() => {', expectedStateDependencyIndex)
    const expectedStateEffectEnd = source.indexOf('])', expectedStateDependencyIndex)
    const expectedStateEffect = source.slice(expectedStateEffectStart, expectedStateEffectEnd)

    expect(expectedStateDependencyIndex).toBeGreaterThan(-1)
    expect(expectedStateEffectStart).toBeGreaterThan(-1)
    expect(expectedStateEffect).toContain('claimControlAttemptRef.current = null')
    expect(expectedStateEffect).toContain('setClaimControlNetworkRetry(null)')
    expect(expectedStateEffect).toContain(expectedStateDependency)
  })

  it('keeps SPEC-013D static scope away from backend and runtime drift', () => {
    const taskBoardSource = readFileSync(path.join(process.cwd(), 'src/components/panels/task-board-panel.tsx'), 'utf8')
    const claimControlStart = taskBoardSource.indexOf('const [claimReconciliation')
    const claimControlEnd = taskBoardSource.indexOf('const parseCommentContent', claimControlStart)
    const claimControlSlice = taskBoardSource.slice(claimControlStart, claimControlEnd)
    const ownedSources = [
      claimControlSlice,
      readFileSync(path.join(process.cwd(), 'src/components/panels/claim-control-copy.ts'), 'utf8'),
      readFileSync(path.join(process.cwd(), 'src/components/panels/claim-control-section.tsx'), 'utf8'),
      readFileSync(path.join(process.cwd(), 'src/components/panels/claim-control-section.stories.tsx'), 'utf8'),
      readFileSync(path.join(process.cwd(), 'tests/e2e/spec-013d-claim-control-operator-ux.spec.ts'), 'utf8'),
    ].join('\n')

    expect(claimControlStart).toBeGreaterThan(-1)
    expect(claimControlEnd).toBeGreaterThan(claimControlStart)
    expect(claimControlSlice).toContain('/api/tasks/${task.id}/claim-reconciliation')
    expect(claimControlSlice).toContain('/api/tasks/${task.id}/claim-control')
    expect(claimControlSlice).not.toMatch(/method:\s*['"]PUT['"]|\/api\/spawn|\/api\/gnap/i)
    expect(ownedSources).not.toMatch(/advanceTaskChain|successor|whole-task terminal|direct GitHub mutation|\/api\/github|runScheduler|dispatchAssignedTasks|task-dispatch|src\/lib\/scheduler|scheduler\.|sandbox|adapter|harness execution|openclaw-gateway/i)
    expect(readFileSync(path.join(process.cwd(), 'src/lib/migrations.ts'), 'utf8')).not.toMatch(/SPEC-013D|013d|claim-control operator ux/i)
  })

  it('emits retry, release, cancel, and backoff override drafts without direct route calls', () => {
    const retry = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Retry stage' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /confirm retry stage/i }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Cancel stage' }))
    expect(document.activeElement).toBe(screen.getByLabelText(/cancel reason required/i))
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
            action('retry', { enabled: true, unavailable_reason: null, requires_override_reason: true, backoff_policy: 'respect_backoff' }),
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
    expectButtonDisabled(screen.getByRole('button', { name: 'Retry stage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Override backoff' }))
    expect(document.activeElement).toBe(screen.getByLabelText(/override reason required/i))
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
      stage_key: 'paddock_issue_remediation',
      expected: EXPECTED_STATE,
      override_backoff: false,
      override_reason: null,
      reason: null,
      client_correlation_id: 'client-correlation-3',
    }
    const { onAbandonNetworkRetry, onRetryNetworkSubmit } = renderSection({
      receipt: buildReceipt({
        action: 'retry',
        outcome: 'retry_ready',
        stageKey: 'paddock_issue_remediation',
        availableActions: [
          { action: 'retry', enabled: true, unavailable_reason: null },
          { action: 'release', enabled: false, unavailable_reason: 'no_active_claim' },
        ],
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
    expectPresent(screen.getByText(/available after refresh: retry stage; release claim disabled: no_active_claim/i))
    expectPresent(screen.getByText(/activity 333/i))
    expect(document.body.textContent).not.toMatch(/idempotency-key|raw-request|auth header|bearer|github body/i)
    fireEvent.click(screen.getByRole('button', { name: /retry same submission/i }))
    expect(onRetryNetworkSubmit).toHaveBeenCalledWith(retryDraft)
    fireEvent.click(screen.getByRole('button', { name: 'Release claim' }))
    expect(onAbandonNetworkRetry).toHaveBeenCalled()
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
    for (const button of within(region).getAllByRole('button', { name: /retry stage|release claim|cancel stage/i })) {
      expectButtonDisabled(button)
      fireEvent.click(button)
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
