import { DiagnosticsSubview } from './diagnostics-subview';
import type { DiagnosticEvent } from './diagnostic-feed';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof DiagnosticsSubview> = {
  title: 'governance/DiagnosticsSubview',
  component: DiagnosticsSubview,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof DiagnosticsSubview>;

const sample: DiagnosticEvent[] = [
  {
    id: 1,
    decision: 'allow',
    reason_code: 'within_budget',
    scope_kind: 'workspace',
    scope_id: 1,
    policy_id: 7,
    observed_amount: 25,
    observed_unit: 'usd',
    captured_at: '2026-05-02T15:30:00Z',
  },
  {
    id: 2,
    decision: 'defer',
    reason_code: 'breaker_half_open',
    scope_kind: 'global',
    scope_id: null,
    policy_id: null,
    observed_amount: 0,
    observed_unit: 'requests',
    captured_at: '2026-05-02T15:31:00Z',
  },
  {
    id: 3,
    decision: 'block',
    reason_code: 'budget_exceeded',
    scope_kind: 'agent',
    scope_id: 12,
    policy_id: 9,
    observed_amount: 1200,
    observed_unit: 'tokens',
    captured_at: '2026-05-02T15:32:00Z',
  },
];

export const Default: Story = { args: { state: 'ready', events: sample } };
export const Loading: Story = { args: { state: 'loading', events: [] } };
export const Empty: Story = { args: { state: 'empty', events: [] } };
export const FilterActive: Story = {
  args: { state: 'ready', events: sample.filter((e) => e.decision === 'block'), filterDecision: 'block' },
};
export const Error: Story = { args: { state: 'error', errorMessage: 'Diagnostic stream interrupted', events: [] } };
export const DisabledByFlag: Story = { args: { state: 'disabled', events: [] } };
