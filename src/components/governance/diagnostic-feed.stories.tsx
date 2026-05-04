import { DiagnosticFeed, type DiagnosticEvent } from './diagnostic-feed';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof DiagnosticFeed> = {
  title: 'governance/DiagnosticFeed',
  component: DiagnosticFeed,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof DiagnosticFeed>;

const baseRow: DiagnosticEvent = {
  id: 1,
  decision: 'allow',
  reason_code: 'within_budget',
  scope_kind: 'workspace',
  scope_id: 1,
  policy_id: 7,
  observed_amount: 25,
  observed_unit: 'usd',
  captured_at: '2026-05-02T15:30:00Z',
};

const onePage: DiagnosticEvent[] = Array.from({ length: 5 }).map((_, i) => ({
  ...baseRow,
  id: i + 1,
  decision: i % 3 === 0 ? 'allow' : i % 3 === 1 ? 'defer' : 'block',
  reason_code: ['within_budget', 'breaker_half_open', 'budget_exceeded'][i % 3] ?? 'within_budget',
}));
const multiPage: DiagnosticEvent[] = Array.from({ length: 30 }).map((_, i) => ({
  ...baseRow,
  id: i + 1,
  decision: i % 3 === 0 ? 'allow' : i % 3 === 1 ? 'defer' : 'block',
}));

export const Empty: Story = { args: { state: 'empty', events: [] } };
export const OnePage: Story = { args: { state: 'ready', events: onePage } };
export const MultiPage: Story = { args: { state: 'multi_page', events: multiPage, hasMore: true } };
export const LiveAppending: Story = { args: { state: 'live_appending', events: onePage } };
export const FilterActive: Story = {
  args: { state: 'filter_active', events: onePage.filter((e) => e.decision === 'block') },
};
export const FilterEmpty: Story = { args: { state: 'filter_empty', events: [] } };
export const DisabledByFlag: Story = {
  render: () => (
    <div
      role="region"
      aria-label="Diagnostic feed (disabled)"
      data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
      data-feature-flag-state="off"
      className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      Diagnostic feed unavailable — flag OFF.
    </div>
  ),
};
