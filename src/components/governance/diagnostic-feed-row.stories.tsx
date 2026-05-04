import { DiagnosticFeedRow } from './diagnostic-feed-row';
import type { DiagnosticEvent } from './diagnostic-feed';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof DiagnosticFeedRow> = {
  title: 'governance/DiagnosticFeedRow',
  component: DiagnosticFeedRow,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof DiagnosticFeedRow>;

const base: DiagnosticEvent = {
  id: 1,
  decision: 'allow',
  reason_code: 'within_budget',
  scope_kind: 'workspace',
  scope_id: 1,
  policy_id: 7,
  observed_amount: 25,
  observed_unit: 'usd',
  captured_at: '2026-05-02T15:30:00Z',
};

export const Allow: Story = { args: { event: base } };
export const Defer: Story = {
  args: { event: { ...base, decision: 'defer', reason_code: 'breaker_half_open' } },
};
export const Block: Story = {
  args: { event: { ...base, decision: 'block', reason_code: 'budget_exceeded' } },
};
export const Expanded: Story = {
  args: { event: base, defaultExpanded: true },
};
export const Dense: Story = {
  args: {
    event: {
      ...base,
      reason_code: 'soft_threshold_warning',
      observed_amount: 1_234_567,
    },
  },
};
