/**
 * SPEC-008 — T319 — Typed-confirmation modal error summary.
 *
 * Per FR-090p: every typed-confirmation modal renders an
 * `role="alert"` error summary populated when:
 *   - The typed phrase does not match the required text.
 *   - The submit fails (server returned a 4xx/5xx).
 *
 * The summary is keyboard-focusable on render so screen-readers
 * announce the failure immediately. Visual snapshots are captured
 * via the per-modal Storybook variants.
 *
 * @see specs/008-resource-governance/spec.md FR-090p
 * @see specs/008-resource-governance/tasks.md T319
 */

'use client'

import { useEffect, useRef, type ReactElement } from 'react'

interface ModalErrorSummaryProps {
  /** When non-empty, the summary renders. */
  message: string | null
  /** Optional secondary instruction text shown beneath the message. */
  hint?: string | undefined
  /** Stable test id for Playwright + visual snapshots. */
  testId?: string
}

/**
 * `role="alert"` live region. Auto-focuses on mount when populated
 * so the message is announced. No focus-on-update — only focus on
 * mount, since updating the message in-place is a noisy SR pattern.
 */
export function ModalErrorSummary(props: ModalErrorSummaryProps): ReactElement | null {
  const { message, hint, testId = 'modal-error-summary' } = props
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (message && ref.current) {
      ref.current.focus()
    }
  }, [message])

  if (!message) return null

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      data-testid={testId}
      className="modal-error-summary"
      style={{
        background: 'var(--surface-error, #fde2e2)',
        border: '1px solid var(--border-error, #c40000)',
        color: 'var(--text-error, #5a0000)',
        padding: '0.75rem 1rem',
        borderRadius: '4px',
        marginBlockEnd: '0.75rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{message}</p>
      {hint ? (
        <p style={{ margin: 0, marginBlockStart: '0.25rem', fontSize: '0.875rem' }}>{hint}</p>
      ) : null}
    </div>
  )
}
