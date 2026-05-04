import { CalibrationProgress } from './calibration-progress';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof CalibrationProgress> = {
  title: 'governance/CalibrationProgress',
  component: CalibrationProgress,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof CalibrationProgress>;

const baseMilestones = [
  { id: 'shadow_run', label: '7 days shadow run', status: 'complete' as const, detail: 'started 2026-04-25' },
  { id: 'no_false_blocks', label: 'No false-positive blocks', status: 'complete' as const },
  { id: 'soft_to_hard', label: 'Promote shadow → soft', status: 'in_progress' as const, detail: '3/7 days complete' },
  { id: 'soak', label: 'Soak test', status: 'pending' as const },
];

export const Default: Story = { args: { milestones: baseMilestones } };
export const AllComplete: Story = {
  args: {
    milestones: baseMilestones.map((m) => ({ ...m, status: 'complete' })),
  },
};
const failedMilestoneOverrides = [
  { status: 'complete' as const },
  { status: 'failed' as const, detail: 'soft block on 2026-05-01' },
  { status: 'pending' as const },
  { status: 'pending' as const },
];

export const Failed: Story = {
  args: {
    milestones: baseMilestones.map((milestone, index) => ({
      ...milestone,
      ...(failedMilestoneOverrides[index] ?? {}),
    })),
  },
};
export const DisabledByFlag: Story = { args: { milestones: baseMilestones, disabled: true } };
