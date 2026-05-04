import { PolicyRow } from './policy-row';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof PolicyRow> = {
  title: 'governance/PolicyRow',
  component: PolicyRow,
  tags: ['visual', 'spec-008'],
};

export default meta;

type Story = StoryObj<typeof PolicyRow>;

export const HardBudgetEnabled: Story = {
  args: {
    policy: {
      id: 12,
      policy_type: 'budget',
      limit_kind: 'budget',
      limit_value: 5000,
      enforcement: 'hard',
      enforce_mode: null,
      enabled: true,
      workspace_id: 1,
    },
  },
};

export const SoftWipDisabled: Story = {
  args: {
    policy: {
      id: 13,
      policy_type: 'wip_limit',
      limit_kind: 'wip',
      limit_value: 3,
      enforcement: 'soft',
      enforce_mode: 'shadow',
      enabled: false,
      workspace_id: 2,
    },
  },
};

export const NoLimit: Story = {
  args: {
    policy: {
      id: 14,
      policy_type: 'blackout',
      limit_kind: 'blackout',
      limit_value: null,
      enforcement: 'hard',
      enforce_mode: null,
      enabled: true,
      workspace_id: null,
    },
  },
};
