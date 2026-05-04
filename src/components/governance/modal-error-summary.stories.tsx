/**
 * SPEC-008 — T319 — Storybook variants for the modal error summary.
 *
 * Argos-snapshotted via the existing storybook → argos pipeline.
 *
 * @see specs/008-resource-governance/tasks.md T319
 */

import { ModalErrorSummary } from './modal-error-summary'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta: Meta<typeof ModalErrorSummary> = {
  title: 'Governance/ModalErrorSummary',
  component: ModalErrorSummary,
  tags: ['visual', 'spec-008'],
  parameters: {
    layout: 'centered',
  },
}
export default meta

type Story = StoryObj<typeof ModalErrorSummary>

export const Hidden: Story = {
  args: {
    message: null,
  },
}

export const PhraseMismatch: Story = {
  args: {
    message: 'Typed phrase does not match.',
    hint: 'Type the exact phrase shown above to enable submission.',
    testId: 'modal-error-summary-phrase-mismatch',
  },
}

export const ServerRejected: Story = {
  args: {
    message: 'Server rejected the request: 422 invalid TTL.',
    hint: 'Choose a TTL between 1 and 7200 seconds.',
    testId: 'modal-error-summary-server-422',
  },
}

export const NetworkError: Story = {
  args: {
    message: 'Network error: request timed out.',
    hint: 'Retry, or open the dispatch diagnostics for telemetry.',
    testId: 'modal-error-summary-network',
  },
}
