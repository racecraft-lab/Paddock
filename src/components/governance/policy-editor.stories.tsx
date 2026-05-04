import { PolicyEditor } from './policy-editor';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof PolicyEditor> = {
  title: 'governance/PolicyEditor',
  component: PolicyEditor,
  tags: ['visual', 'spec-008'],
};

export default meta;

type Story = StoryObj<typeof PolicyEditor>;

const basePolicy = {
  id: 12,
  policy_type: 'budget',
  limit_kind: 'budget',
  limit_value: 5000,
  enforcement: 'hard',
  enforce_mode: null,
  enabled: true,
  workspace_id: 1,
};

export const Default: Story = {
  args: { policy: basePolicy, etag: 'W/"abc123"' },
};

export const Submitting: Story = {
  args: { policy: basePolicy, etag: 'W/"abc123"', state: 'submitting' },
};

export const ETagConflict: Story = {
  args: { policy: basePolicy, etag: 'W/"abc123"', state: 'etag_conflict' },
};

export const Error: Story = {
  args: {
    policy: basePolicy,
    etag: 'W/"abc123"',
    state: 'error',
    errorMessage: 'Validation failed: limit_value must be positive',
  },
};

export const DisabledByFlag: Story = {
  // Policy editor is never rendered when flag is OFF — the parent
  // <PoliciesSubview> short-circuits to <FeatureFlagDisabledShim>.
  // This story documents the contract.
  render: () => (
    <div
      role="region"
      aria-label="Policies (disabled by feature flag)"
      data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
      data-feature-flag-state="off"
      className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      Policy editor unavailable — FEATURE_RESOURCE_GOVERNANCE is OFF.
    </div>
  ),
};
