import { PoliciesSubview } from './policies-subview';
import type { PolicySummary } from './policy-row';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof PoliciesSubview> = {
  title: 'governance/PoliciesSubview',
  component: PoliciesSubview,
  tags: ['visual', 'spec-008'],
};

export default meta;

type Story = StoryObj<typeof PoliciesSubview>;

const samplePolicies: PolicySummary[] = [
  {
    id: 1,
    policy_type: 'wip_limit',
    limit_kind: 'wip',
    limit_value: 5,
    enforcement: 'hard',
    enforce_mode: null,
    enabled: true,
    workspace_id: 1,
  },
  {
    id: 2,
    policy_type: 'budget',
    limit_kind: 'budget',
    limit_value: 1000,
    enforcement: 'soft',
    enforce_mode: 'shadow',
    enabled: true,
    workspace_id: 1,
  },
  {
    id: 3,
    policy_type: 'blackout',
    limit_kind: 'blackout',
    limit_value: null,
    enforcement: 'hard',
    enforce_mode: null,
    enabled: false,
    workspace_id: 1,
  },
];

export const Default: Story = {
  args: { state: 'ready', policies: samplePolicies },
};

export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = {
  args: { state: 'error', errorMessage: 'Network unreachable' },
};
export const Empty: Story = { args: { state: 'empty' } };

export const Dense: Story = {
  args: {
    state: 'ready',
    policies: Array.from({ length: 25 }).map((_, i) => ({
      id: i + 1,
      policy_type: i % 2 === 0 ? 'wip_limit' : 'budget',
      limit_kind: i % 2 === 0 ? 'wip' : 'budget',
      limit_value: (i + 1) * 10,
      enforcement: i % 3 === 0 ? 'hard' : 'soft',
      enforce_mode: null,
      enabled: i % 4 !== 0,
      workspace_id: 1,
    })),
  },
};

export const DisabledByFlag: Story = { args: { state: 'disabled' } };
