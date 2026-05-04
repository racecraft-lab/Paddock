import { OverrideGrantForm } from './override-grant-form';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof OverrideGrantForm> = {
  title: 'governance/OverrideGrantForm',
  component: OverrideGrantForm,
  tags: ['visual', 'spec-008'],
};
export default meta;
type Story = StoryObj<typeof OverrideGrantForm>;

export const Default: Story = { args: {} };
export const Submitting: Story = { args: { state: 'submitting' } };
export const Error409: Story = {
  args: {
    state: 'error_409',
    errorMessage: 'An override with this idempotency key already exists.',
  },
};
export const Error412: Story = {
  args: {
    state: 'error_412',
    errorMessage: 'ETag precondition failed; refresh and retry.',
  },
};
export const Error422: Story = {
  args: {
    state: 'error_422',
    errorMessage: 'Validation failed',
    validationIssues: [
      { field_path: 'reason', message: 'reason is required', code: 'required' },
      { field_path: 'granted_amount', message: 'must be > 0', code: 'min_value' },
    ],
  },
};
export const Error423: Story = {
  args: {
    state: 'error_423',
    errorMessage:
      'Override grants are disabled for this operator (anomaly auto-disable). An admin must re-enable.',
  },
};
export const DisabledByFlag: Story = { args: { state: 'disabled' } };
