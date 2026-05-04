import { BudgetsSubview, type BudgetSummary } from './budgets-subview';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof BudgetsSubview> = {
  title: 'governance/BudgetsSubview',
  component: BudgetsSubview,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof BudgetsSubview>;

const sample: BudgetSummary[] = [
  { id: 1, workspace_id: 1, unit: 'usd', limit_value: 1000, consumed: 250, pct_used: 25, enabled: true },
  { id: 2, workspace_id: 1, unit: 'tokens', limit_value: 100_000, consumed: 82_500, pct_used: 82.5, enabled: true },
  { id: 3, workspace_id: 1, unit: 'requests', limit_value: 500, consumed: 488, pct_used: 97.6, enabled: true },
];

export const Default: Story = { args: { state: 'ready', budgets: sample } };
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = { args: { state: 'error', errorMessage: 'Counter rebuild in progress' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Dense: Story = {
  args: {
    state: 'ready',
    budgets: Array.from({ length: 12 }).map((_, i) => ({
      id: i + 1,
      workspace_id: 1,
      unit: i % 3 === 0 ? 'usd' : i % 3 === 1 ? 'tokens' : 'requests',
      limit_value: (i + 1) * 100,
      consumed: ((i + 1) * 100 * (i + 1) * 7) % ((i + 1) * 100 + 1),
      pct_used: ((i + 1) * 13) % 100,
      enabled: i % 4 !== 0,
    })),
  },
};
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
