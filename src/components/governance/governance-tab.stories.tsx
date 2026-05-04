import { GovernanceTab, type SubviewId } from './governance-tab';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactElement } from 'react';

const meta: Meta<typeof GovernanceTab> = {
  title: 'governance/GovernanceTab',
  component: GovernanceTab,
  tags: ['visual', 'spec-008'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof GovernanceTab>;

function placeholder(id: SubviewId): ReactElement {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Subview: {id}</p>
      <p>This is a Storybook placeholder; production view loads lazily.</p>
    </div>
  );
}

export const Default: Story = {
  args: {
    renderSubview: placeholder,
  },
};

export const StartOnDiagnostics: Story = {
  args: {
    initialSubview: 'diagnostics',
    renderSubview: placeholder,
  },
};

export const SystemHealthFirst: Story = {
  args: {
    initialSubview: 'system-health',
    renderSubview: placeholder,
  },
};

export const Empty: Story = {
  args: {},
};

export const Dense: Story = {
  args: {
    initialSubview: 'overrides',
    renderSubview: (id) => (
      <ul className="list-disc pl-4 text-xs">
        <li>{id} row 1</li>
        <li>{id} row 2</li>
        <li>{id} row 3</li>
      </ul>
    ),
  },
};

export const DisabledByFlag: Story = {
  render: () => (
    <div
      className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
      data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
      data-feature-flag-state="off"
    >
      Governance disabled — feature flag OFF.
    </div>
  ),
};
