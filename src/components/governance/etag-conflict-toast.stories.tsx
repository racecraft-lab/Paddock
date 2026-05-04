import { EtagConflictToast } from './etag-conflict-toast';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof EtagConflictToast> = {
  title: 'governance/EtagConflictToast',
  component: EtagConflictToast,
  tags: ['visual', 'spec-008'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof EtagConflictToast>;

export const Default: Story = {
  args: { resourceLabel: 'policy/12' },
};
export const WithDiff: Story = {
  args: {
    resourceLabel: 'policy/12',
    diff: [
      { field: 'limit_value', yours: '5000', theirs: '7500' },
      { field: 'enforcement', yours: 'soft', theirs: 'hard' },
    ],
  },
};
