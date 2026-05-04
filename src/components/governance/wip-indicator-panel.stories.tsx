import { WipIndicatorPanel } from './wip-indicator-panel';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof WipIndicatorPanel> = {
  title: 'governance/WipIndicatorPanel',
  component: WipIndicatorPanel,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof WipIndicatorPanel>;

export const Empty: Story = { args: { status: 'empty', current: 0, limit: null } };
export const UnderLimit: Story = { args: { status: 'under_limit', current: 2, limit: 5 } };
export const AtLimit: Story = { args: { status: 'at_limit', current: 5, limit: 5 } };
export const OverLimit: Story = { args: { status: 'over_limit', current: 7, limit: 5 } };
export const DisabledByFlag: Story = { args: { status: 'disabled', current: 0, limit: null } };
