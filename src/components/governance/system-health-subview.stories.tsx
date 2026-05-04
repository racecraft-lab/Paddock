import { SystemHealthCard } from './system-health-card';
import { SystemHealthSubview } from './system-health-subview';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof SystemHealthSubview> = {
  title: 'governance/SystemHealthSubview',
  component: SystemHealthSubview,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof SystemHealthSubview>;

export const Default: Story = {
  args: {
    state: 'ready',
    children: (
      <>
        <SystemHealthCard title="Evaluator" severity="green" metric="120 ms p95" summary="Within budget" />
        <SystemHealthCard title="Reconciler" severity="amber" metric="lag 4m" summary="Catching up" />
        <SystemHealthCard title="Breaker" severity="red" metric="open" summary="2 incidents in last hour" runbookHref="/docs/runbook/breaker-stuck-open.md" />
      </>
    ),
  },
};
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = { args: { state: 'error', errorMessage: 'Health collector unreachable' } };
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
