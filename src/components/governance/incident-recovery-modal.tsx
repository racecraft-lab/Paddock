/**
 * SPEC-008 — Incident recovery modal (T186).
 *
 * Per FR-090i / FR-090p / FR-192. Typed-gesture modal that issues
 * recovery actions (counter rebuild, breaker reset, override revoke
 * batch) per the FR-090i gesture matrix. Variants: default / typed /
 * submitting / 409 / 423 / disabled-by-flag.
 *
 * @see specs/008-resource-governance/tasks.md T186
 */

'use client';

import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';

export type IncidentRecoveryAction =
  | 'breaker_reset'
  | 'reservation_reaper_force_run'
  | 'counter_rebuild_restart'
  | 'reconciler_retry'
  | 'audit_chain_verify'
  | 'collector_rotate_key';

export type IncidentRecoveryState =
  | 'default'
  | 'typed'
  | 'submitting'
  | 'error_409'
  | 'error_423'
  | 'disabled';

export interface IncidentRecoveryModalProps {
  action: IncidentRecoveryAction;
  state?: IncidentRecoveryState;
  errorMessage?: string;
  onConfirm?: (input: { action: IncidentRecoveryAction; reason: string; typed: string }) => void;
  onCancel?: () => void;
}

const ACTION_LABEL: Record<IncidentRecoveryAction, string> = {
  breaker_reset: 'Reset circuit breaker',
  reservation_reaper_force_run: 'Force-run reservation reaper',
  counter_rebuild_restart: 'Restart counter rebuild',
  reconciler_retry: 'Retry governance reconciler',
  audit_chain_verify: 'Verify audit chain',
  collector_rotate_key: 'Rotate collector key',
};

const ACTION_PHRASE: Record<IncidentRecoveryAction, string> = {
  breaker_reset: 'CONFIRM RESET BREAKER',
  reservation_reaper_force_run: 'CONFIRM FORCE RUN REAPER',
  counter_rebuild_restart: 'CONFIRM RESTART REBUILD',
  reconciler_retry: 'CONFIRM RETRY RECONCILER',
  audit_chain_verify: 'CONFIRM VERIFY AUDIT CHAIN',
  collector_rotate_key: 'CONFIRM ROTATE COLLECTOR KEY',
};

export function IncidentRecoveryModal(
  props: IncidentRecoveryModalProps,
): ReactNode {
  const state = props.state ?? 'default';
  const [typed, setTyped] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const phrase = ACTION_PHRASE[props.action];
  const onCancel = props.onCancel;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  if (state === 'disabled') {
    return (
      <div
        role="region"
        aria-label="Incident recovery (disabled by feature flag)"
        data-feature-flag-state="off"
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        Incident recovery actions disabled — FEATURE_RESOURCE_GOVERNANCE is OFF.
      </div>
    );
  }

  const submitting = state === 'submitting';
  const matches = typed === phrase;

  function submit(e: SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!matches) return;
    props.onConfirm?.({ action: props.action, reason, typed });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="incident-recovery-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="incident-recovery-modal"
    >
      <form
        onSubmit={submit}
        className="w-[420px] rounded-md bg-background p-4 shadow-xl"
      >
        <h2
          id="incident-recovery-heading"
          className="text-base font-semibold"
        >
          {ACTION_LABEL[props.action]}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Type <code className="rounded bg-muted px-1 font-mono text-foreground">{phrase}</code> to confirm.
        </p>

        <label className="mt-3 flex flex-col gap-1 text-xs">
          <span>Reason</span>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            disabled={submitting}
            required
            rows={2}
            className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>

        <input
          type="text"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
          autoFocus
          aria-label={`Type ${phrase} to confirm`}
          disabled={submitting}
          className="mt-3 w-full rounded border bg-background px-2 py-1 font-mono text-sm text-foreground"
        />

        {state === 'error_409' ? (
          <p role="alert" className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-foreground">
            Conflict: another recovery action is in progress.
          </p>
        ) : null}
        {state === 'error_423' ? (
          <p role="alert" className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-foreground">
            Locked: governance recovery is currently disabled.
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
              data-testid="incident-recovery-cancel"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !matches || reason.trim() === ''}
            className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
            data-testid="incident-recovery-submit"
          >
            {submitting ? 'Working...' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
