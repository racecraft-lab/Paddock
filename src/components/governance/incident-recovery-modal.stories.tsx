import { IncidentRecoveryModal } from './incident-recovery-modal';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof IncidentRecoveryModal> = {
  title: 'governance/IncidentRecoveryModal',
  component: IncidentRecoveryModal,
  tags: ['visual', 'spec-008'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof IncidentRecoveryModal>;

export const Default: Story = { args: { action: 'breaker_reset' } };
export const Typed: Story = { args: { action: 'counter_rebuild_restart', state: 'typed' } };
export const Submitting: Story = { args: { action: 'collector_rotate_key', state: 'submitting' } };
export const Error409: Story = { args: { action: 'breaker_reset', state: 'error_409' } };
export const Error423: Story = { args: { action: 'reconciler_retry', state: 'error_423' } };
export const DisabledByFlag: Story = { args: { action: 'breaker_reset', state: 'disabled' } };
