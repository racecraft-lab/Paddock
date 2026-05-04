import { BudgetUtilizationChart } from './budget-utilization-chart';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof BudgetUtilizationChart> = {
  title: 'governance/BudgetUtilizationChart',
  component: BudgetUtilizationChart,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof BudgetUtilizationChart>;

export const ZeroPercent: Story = { args: { pctUsed: 0, unit: 'usd' } };
export const Fifty: Story = { args: { pctUsed: 50, unit: 'tokens' } };
export const SoftThreshold: Story = { args: { pctUsed: 80, unit: 'tokens' } };
export const Approaching: Story = { args: { pctUsed: 95, unit: 'usd' } };
export const Hard: Story = { args: { pctUsed: 100, unit: 'requests' } };
export const DisabledByFlag: Story = {
  args: { pctUsed: 50, unit: 'usd', disabledByFlag: true },
};
