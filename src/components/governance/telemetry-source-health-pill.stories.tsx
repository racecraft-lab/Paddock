import { TelemetrySourceHealthPill } from './telemetry-source-health-pill';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof TelemetrySourceHealthPill> = {
  title: 'governance/TelemetrySourceHealthPill',
  component: TelemetrySourceHealthPill,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof TelemetrySourceHealthPill>;

export const Green: Story = { args: { sourceName: 'otelcol', health: 'green', freshnessLagMs: 1500 } };
export const Amber: Story = { args: { sourceName: 'aegis-relay', health: 'amber', freshnessLagMs: 30_000 } };
export const Red: Story = { args: { sourceName: 'github-webhook', health: 'red', freshnessLagMs: 600_000 } };
export const Unknown: Story = { args: { sourceName: 'opt-source', health: 'unknown' } };
export const DisabledByFlag: Story = { args: { sourceName: 'otelcol', health: 'green', disabled: true } };
