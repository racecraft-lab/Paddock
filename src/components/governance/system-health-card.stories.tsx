import { SystemHealthCard } from './system-health-card';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof SystemHealthCard> = {
  title: 'governance/SystemHealthCard',
  component: SystemHealthCard,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof SystemHealthCard>;

export const Green: Story = { args: { title: 'Evaluator', severity: 'green', summary: 'Within budget', metric: '120 ms p95' } };
export const Amber: Story = { args: { title: 'Reconciler', severity: 'amber', summary: 'Catching up', metric: 'lag 4m' } };
export const Red: Story = { args: { title: 'Breaker', severity: 'red', summary: 'Open', runbookHref: '/runbook/breaker-stuck-open' } };
export const Loading: Story = { args: { title: 'Loading source', severity: 'loading', summary: '...' } };
export const Error: Story = { args: { title: 'Source unreachable', severity: 'error', summary: 'Connection refused' } };
export const DisabledByFlag: Story = { args: { title: 'Disabled', severity: 'green', disabled: true } };

export const BackupHealthy: Story = {
  args: {
    title: 'Backup',
    severity: 'green',
    summary: 'Last backup 14 minutes ago',
    backupVariant: 'backup-healthy',
  },
};
export const BackupStale: Story = {
  args: {
    title: 'Backup',
    severity: 'amber',
    summary: 'Last backup 14 hours ago',
    backupVariant: 'backup-stale',
    runbookHref: '/runbook/retention-sweep-failure',
  },
};
export const BackupNoOffnodeWarning: Story = {
  args: {
    title: 'Backup',
    severity: 'amber',
    summary: 'No off-node mirror configured (FR-090k)',
    backupVariant: 'backup-no-offnode-warning',
  },
};
export const BackupFailed: Story = {
  args: {
    title: 'Backup',
    severity: 'red',
    summary: 'Last backup attempt failed: pg_dump exit 1',
    backupVariant: 'backup-failed',
    runbookHref: '/runbook/retention-sweep-failure',
  },
};
