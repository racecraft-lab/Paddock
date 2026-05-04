import { BulkPromoteModal } from './bulk-promote-modal';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof BulkPromoteModal> = {
  title: 'governance/BulkPromoteModal',
  component: BulkPromoteModal,
  tags: ['visual', 'spec-008'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof BulkPromoteModal>;

const baseArgs = {
  policyCount: 17,
  targetWorkspaceLabel: 'product-line-alpha',
  confirmationPhrase: 'PROMOTE 17 POLICIES',
};

export const Default: Story = { args: { ...baseArgs } };
export const TypedCorrect: Story = { args: { ...baseArgs, state: 'typed_correct' } };
export const TypedWrong: Story = { args: { ...baseArgs, state: 'typed_wrong' } };
export const Submitting: Story = { args: { ...baseArgs, state: 'submitting' } };
export const Error409: Story = { args: { ...baseArgs, state: 'error_409' } };
export const Error422CrossWorkspace: Story = {
  args: { ...baseArgs, state: 'error_422_cross_workspace' },
};
export const DisabledByFlag: Story = { args: { ...baseArgs, state: 'disabled' } };
