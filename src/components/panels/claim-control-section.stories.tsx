import { expect, userEvent, within } from 'storybook/test'
import { buildReceipt } from '@/components/panels/claim-control-copy'
import { ClaimControlSection, type ClaimControlDraft, type ClaimControlSectionProps } from '@/components/panels/claim-control-section'
import type { ClaimControlAvailableAction, ClaimControlReadModel, TaskClaimReconciliationEnvelope } from '@/lib/task-claim-reconciliation'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

function action(actionName: ClaimControlDraft['action'], enabled = true, unavailableReason: string | null = null): ClaimControlAvailableAction {
  return {
    action: actionName,
    enabled,
    unavailable_reason: unavailableReason,
    requires_confirmation: true,
    requires_idempotency_key: true,
    requires_expected_state: true,
    requires_override_reason: false,
    backoff_policy: actionName === 'retry' ? 'respect_backoff' as const : 'not_applicable' as const,
  }
}

function control(overrides: Partial<ClaimControlReadModel> = {}): ClaimControlReadModel {
  return {
    stage_key: 'mission-control_issue_remediation',
    authorization: { required_role: 'operator', current_role: 'operator', can_mutate: true },
    available_actions: [action('retry'), action('release'), action('cancel')],
    retry_eligibility: { state: 'eligible', reason: 'latest attempt failed', evidence_type: 'attempt', evidence_id: '22' },
    backoff: {
      state: 'none',
      seconds_remaining: 0,
      next_retry_at: null,
      reason: null,
      override_allowed: false,
      override_requires_reason: false,
    },
    expected_state: {
      claim_id: 'claim-22',
      claim_run_id: 'run-22',
      attempt_id: 'attempt-22',
      attempt_status: 'failed',
      operator_action_activity_id: null,
    },
    last_operator_action: null,
    last_sanitized_error: null,
    ...overrides,
  }
}

function model(overrides: Partial<TaskClaimReconciliationEnvelope> = {}): TaskClaimReconciliationEnvelope {
  return {
    schema_version: 'task_claim_reconciliation.v1',
    task: {
      id: '2200',
      workspace_id: '1',
      status: 'in_progress',
      stage_key: 'mission-control_issue_remediation',
      github: { repo: 'racecraft-lab/mission-control', issue_number: 72, pr_number: null },
    },
    feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: true },
    eligibility: { state: 'eligible', reason: null },
    active_claim: null,
    claim_history: [],
    activities: [],
    diagnostics: { warnings: [] },
    claim_control: control(),
    ...overrides,
  }
}

function StorySurface(args: ClaimControlSectionProps) {
  return (
    <div className="max-w-2xl bg-card p-6 text-foreground">
      <ClaimControlSection {...args} />
    </div>
  )
}

const meta = {
  title: 'SPEC-013D/Claim Control Section',
  component: StorySurface,
  tags: ['visual', 'spec-013d'],
  args: {
    readModel: model(),
    loading: false,
    error: null,
    submitting: null,
    receipt: null,
    networkRetry: null,
    onSubmit: () => undefined,
    onRetryNetworkSubmit: () => undefined,
    onRefresh: () => undefined,
  },
  parameters: {
    screenshot: {
      viewport: { width: 760, height: 620 },
    },
  },
} satisfies Meta<typeof StorySurface>

export default meta

type Story = StoryObj<typeof meta>

export const ActiveOperator: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: /claim control/i })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Retry stage' })).toBeEnabled()
  },
}

export const Confirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Retry stage' }))
    await expect(canvas.getByText(/confirm retry stage/i)).toBeInTheDocument()
  },
}

export const DisabledReasons: Story = {
  args: {
    readModel: model({
      claim_control: control({
        available_actions: [
          action('retry', false, 'retry backoff active'),
          action('release', false, 'owned by another run'),
          action('cancel', false, 'terminal attempt'),
        ],
      }),
    }),
  },
}

export const BackoffOverride: Story = {
  args: {
    readModel: model({
      claim_control: control({
        available_actions: [
          action('retry', false, 'retry backoff active'),
          action('release'),
          action('cancel'),
        ],
        backoff: {
          state: 'active',
          seconds_remaining: 180,
          next_retry_at: 1790000000,
          reason: 'retry backoff active',
          override_allowed: true,
          override_requires_reason: true,
        },
      }),
    }),
  },
}

export const ViewerReadOnly: Story = {
  args: {
    readModel: model({
      claim_control: control({
        authorization: { required_role: 'operator', current_role: 'viewer', can_mutate: false },
      }),
    }),
  },
}

export const ReceiptConflict: Story = {
  args: {
    receipt: buildReceipt({
      action: 'retry',
      outcome: 'stale_state',
      stageKey: 'mission-control_issue_remediation',
      activityId: null,
      idempotencyReplayed: false,
      sanitizedErrorCategory: 'stale_state',
    }),
  },
}

export const FlagOff: Story = {
  args: {
    readModel: model({
      feature_flag: { key: 'FEATURE_TASK_CONTROL_PLANE', enabled: false },
      claim_control: null,
    }),
  },
}
