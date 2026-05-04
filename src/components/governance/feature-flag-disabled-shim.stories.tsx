import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * Stories cover the variants enumerated by FR-306:
 *   default / dense / disabled-by-flag (the only state this component
 *   renders — disabled-by-flag is the entire purpose).
 */
const meta: Meta<typeof FeatureFlagDisabledShim> = {
  title: 'governance/FeatureFlagDisabledShim',
  component: FeatureFlagDisabledShim,
  tags: ['visual', 'spec-008'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FeatureFlagDisabledShim>;

export const Default: Story = {
  args: {
    subviewLabel: 'Policies',
  },
};

export const WithHelpText: Story = {
  args: {
    subviewLabel: 'Budgets',
    helpText:
      'Workspace budgets are visible only when resource governance is enabled.',
  },
};

export const WithManageLink: Story = {
  args: {
    subviewLabel: 'Diagnostics',
    manageFlagHref: '/settings/feature-flags',
  },
};

export const Dense: Story = {
  args: {
    subviewLabel: 'System Health',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
