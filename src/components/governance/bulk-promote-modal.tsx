/**
 * SPEC-008 — Bulk policy promotion modal (T185).
 *
 * Per FR-090h / FR-090p / FR-197 / FR-275. Typed-confirmation modal
 * that promotes a set of staged policies to a target workspace.
 * Variants: default / typed-correct / typed-wrong / submitting /
 * error-409 (idempotency conflict) / error-422-cross-workspace /
 * disabled-by-flag. Per FR-090p the dialog uses a focus-trap pattern
 * (initial focus on confirmation input + Escape returns focus to
 * trigger).
 *
 * Focus-trap and animation orchestration are scaffolded via standard
 * dialog ARIA (role=dialog + aria-modal="true"); the production
 * implementation can layer Radix or @react-aria FocusTrap on top.
 *
 * @see specs/008-resource-governance/tasks.md T185
 */

'use client';

import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ModalErrorSummary } from './modal-error-summary';

export type BulkPromoteModalState =
  | 'default'
  | 'typed_correct'
  | 'typed_wrong'
  | 'submitting'
  | 'error_409'
  | 'error_422_cross_workspace'
  | 'disabled';

export interface BulkPromoteModalProps {
  state?: BulkPromoteModalState;
  policyCount: number;
  targetWorkspaceLabel: string;
  /** Required typed confirmation (literal phrase the user must enter). */
  confirmationPhrase: string;
  errorMessage?: string;
  onConfirm?: (input: { typed: string; idempotency_key: string }) => void;
  onCancel?: () => void;
}

export function BulkPromoteModal(props: BulkPromoteModalProps): ReactNode {
  const [typed, setTyped] = useState<string>('');
  const state = props.state ?? 'default';

  if (state === 'disabled') {
    return (
      <div
        role="region"
        aria-label="Bulk promote (disabled by feature flag)"
        data-feature-flag-state="off"
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        Bulk promote unavailable — FEATURE_RESOURCE_GOVERNANCE is OFF.
      </div>
    );
  }

  const submitting = state === 'submitting';
  const matches = typed === props.confirmationPhrase || state === 'typed_correct';
  const blocked = state === 'typed_wrong' || (typed !== '' && !matches);
  const summaryMessage =
    state === 'error_409'
      ? 'Another promotion is already in progress.'
      : state === 'error_422_cross_workspace'
        ? 'Cross-workspace promotion is not allowed for this policy set.'
        : blocked
          ? 'Confirmation phrase did not match.'
          : props.errorMessage ?? null;

  function submit(e: SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!matches || props.onConfirm === undefined) return;
    props.onConfirm({
      typed,
      idempotency_key: `bulk-${props.targetWorkspaceLabel}-${String(props.policyCount)}`,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-promote-heading"
      aria-describedby="bulk-promote-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="bulk-promote-modal"
    >
      <form
        onSubmit={submit}
        className="w-[420px] rounded-md bg-background p-4 shadow-xl"
      >
        <ModalErrorSummary
          message={summaryMessage}
          hint={blocked ? `Type ${props.confirmationPhrase} exactly to continue.` : undefined}
          testId={
            blocked
              ? 'modal-error-summary-phrase-mismatch'
              : state === 'error_422_cross_workspace'
                ? 'modal-error-summary-server-422'
                : 'modal-error-summary'
          }
        />
        <h2
          id="bulk-promote-heading"
          className="text-base font-semibold"
        >
          Promote {props.policyCount.toString()} policies to {props.targetWorkspaceLabel}?
        </h2>
        <p id="bulk-promote-description" className="mt-1 text-xs text-muted-foreground">
          This is irreversible. Type{' '}
          <code className="rounded bg-muted px-1 font-mono text-foreground">{props.confirmationPhrase}</code>{' '}
          to confirm.
        </p>

        <input
          type="text"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
          autoFocus
          aria-label={`Type ${props.confirmationPhrase} to confirm`}
          aria-invalid={blocked}
          disabled={submitting}
          className={`mt-3 w-full rounded border bg-background px-2 py-1 text-sm text-foreground ${
            blocked ? 'border-destructive' : ''
          }`}
          data-testid="bulk-promote-phrase-input"
        />

        {state === 'error_409' ? (
          <p role="alert" className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-foreground">
            Conflict: another promotion is already in progress.
          </p>
        ) : null}
        {state === 'error_422_cross_workspace' ? (
          <p role="alert" className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-foreground">
            Cross-workspace promotion is not allowed for this policy set.
          </p>
        ) : null}
        {state === 'typed_wrong' ? (
          <p role="alert" className="mt-2 text-xs text-foreground">
            Confirmation phrase did not match. Try again.
          </p>
        ) : null}
        {props.errorMessage !== undefined ? (
          <p role="alert" className="mt-2 text-xs text-foreground">
            {props.errorMessage}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          {props.onCancel !== undefined ? (
            <button
              type="button"
              onClick={props.onCancel}
              disabled={submitting}
              className="rounded border px-3 py-1.5 text-xs"
              data-testid="bulk-promote-cancel"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !matches}
            className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
            data-testid="bulk-promote-submit"
          >
            {submitting ? 'Promoting...' : 'Promote'}
          </button>
        </div>
      </form>
    </div>
  );
}
