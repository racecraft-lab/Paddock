import { OverridesSubview, type OverrideSummary } from './overrides-subview';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof OverridesSubview> = {
  title: 'governance/OverridesSubview',
  component: OverridesSubview,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof OverridesSubview>;

const sample: OverrideSummary[] = [
  {
    id: 1,
    scope_kind: 'workspace',
    scope_id: 1,
    granted_amount: 500,
    granted_unit: 'usd',
    reason: 'Customer demo prep',
    actor: 'admin',
    active: true,
    granted_at: '2026-05-02T15:00:00Z',
    ttl_ms: 60 * 60_000,
  },
  {
    id: 2,
    scope_kind: 'agent',
    scope_id: 7,
    granted_amount: 50_000,
    granted_unit: 'tokens',
    reason: 'Backfill batch',
    actor: 'op-on-call',
    active: false,
    granted_at: '2026-05-01T09:30:00Z',
    ttl_ms: 30 * 60_000,
  },
];

export const Default: Story = { args: { state: 'ready', overrides: sample } };
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = { args: { state: 'error', errorMessage: 'Token issuer unreachable' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Dense: Story = {
  args: {
    state: 'ready',
    overrides: Array.from({ length: 15 }).map((_, i) => ({
      id: i + 1,
      scope_kind: i % 3 === 0 ? 'workspace' : i % 3 === 1 ? 'project' : 'agent',
      scope_id: (i + 1) * 3,
      granted_amount: (i + 1) * 100,
      granted_unit: i % 2 === 0 ? 'usd' : 'tokens',
      reason: `override #${i.toString()}`,
      actor: i % 2 === 0 ? 'admin' : 'operator',
      active: i < 6,
      granted_at: '2026-05-02T15:00:00Z',
      ttl_ms: (i + 1) * 60_000,
    })),
  },
};
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
