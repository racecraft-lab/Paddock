import { BreakerOpenBanner } from './breaker-open-banner';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof BreakerOpenBanner> = {
  title: 'governance/BreakerOpenBanner',
  component: BreakerOpenBanner,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof BreakerOpenBanner>;

export const Closed: Story = { args: { state: 'closed' } };
export const HalfOpen: Story = {
  args: { state: 'half_open', openedAt: '2026-05-02T15:30:00Z', consecutiveErrors: 0 },
};
export const Open: Story = {
  args: {
    state: 'open',
    openedAt: '2026-05-02T15:30:00Z',
    consecutiveErrors: 5,
    canReset: true,
    onReset: () => undefined,
  },
};
export const PersistentOpen: Story = {
  args: {
    state: 'persistent_open',
    openedAt: '2026-05-02T13:00:00Z',
    consecutiveErrors: 12,
    canReset: true,
  },
};
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
