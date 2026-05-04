import { AegisEmergencyReserveBadge } from './aegis-emergency-reserve-badge';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof AegisEmergencyReserveBadge> = {
  title: 'governance/AegisEmergencyReserveBadge',
  component: AegisEmergencyReserveBadge,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof AegisEmergencyReserveBadge>;

export const Inactive: Story = { args: { state: 'inactive' } };
export const Engaged: Story = {
  args: { state: 'engaged', remainingTokens: 25_000 },
};
export const CoolingDown: Story = {
  args: { state: 'cooling_down', cooldownEndsAt: '15:35Z' },
};
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
