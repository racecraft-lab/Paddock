import { WindowEditor } from './window-editor';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof WindowEditor> = {
  title: 'governance/WindowEditor',
  component: WindowEditor,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof WindowEditor>;

const baseWindow = {
  id: 7,
  policy_type: 'blackout' as const,
  start_local: '2026-03-08T01:00',
  end_local: '2026-03-08T03:30',
  timezone: 'America/New_York',
  enabled: true,
};

export const Default: Story = { args: { window: baseWindow } };
export const Editing: Story = { args: { window: baseWindow, state: 'editing' } };
export const Submitting: Story = { args: { window: baseWindow, state: 'submitting' } };
export const DSTWarning: Story = { args: { window: baseWindow, state: 'dst_warning' } };
export const Conflict: Story = {
  args: {
    window: baseWindow,
    state: 'conflict',
    conflictMessage: 'Overlaps existing window 12 (2026-03-08T02:00 to 03:30).',
  },
};
export const DisabledByFlag: Story = {
  render: () => (
    <div
      role="region"
      aria-label="Window editor (disabled)"
      data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
      data-feature-flag-state="off"
      className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      Window editor unavailable — feature flag OFF.
    </div>
  ),
};
