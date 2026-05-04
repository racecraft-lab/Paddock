import { WindowsSubview, type WindowSummary } from './windows-subview';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof WindowsSubview> = {
  title: 'governance/WindowsSubview',
  component: WindowsSubview,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof WindowsSubview>;

const sample: WindowSummary[] = [
  { id: 1, policy_type: 'blackout', start_local: '2026-01-01T00:00', end_local: '2026-01-02T00:00', timezone: 'America/New_York', enabled: true },
  { id: 2, policy_type: 'degraded', start_local: '2026-02-15T08:00', end_local: '2026-02-15T18:00', timezone: 'UTC', enabled: false },
];

export const Default: Story = { args: { state: 'ready', windows: sample } };
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = { args: { state: 'error' } };
export const Empty: Story = { args: { state: 'empty' } };
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
