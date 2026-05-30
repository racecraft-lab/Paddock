'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  actionDescription,
  actionLabel,
  boundClaimControlText,
  buildClaimControlDraft,
  defaultReasonForAction,
  outcomeLabel,
  safeClaimControlDisplay,
  sanitizedErrorLabel,
  type ClaimControlOutcomeReceipt,
} from '@/components/panels/claim-control-copy'
import type { ClaimControlRequestBody } from '@/lib/task-claim-control-types'
import type { ClaimControlAvailableAction, TaskClaimReconciliationEnvelope } from '@/lib/task-claim-reconciliation'

export type ClaimControlDraft = ClaimControlRequestBody

export interface ClaimControlSubmissionState {
  readonly action: ClaimControlDraft['action']
  readonly phase: 'submitting' | 'refreshing'
}

export interface ClaimControlNetworkRetry {
  readonly draft: ClaimControlDraft
  readonly message: string
}

interface ConfirmationState {
  readonly action: ClaimControlDraft['action']
  readonly mode: 'standard' | 'override_backoff'
}

export interface ClaimControlSectionProps {
  readonly readModel: TaskClaimReconciliationEnvelope | null
  readonly loading: boolean
  readonly error: string | null
  readonly submitting: ClaimControlSubmissionState | null
  readonly receipt: ClaimControlOutcomeReceipt | null
  readonly networkRetry: ClaimControlNetworkRetry | null
  readonly onSubmit: (draft: ClaimControlDraft) => void
  readonly onRetryNetworkSubmit: (draft: ClaimControlDraft) => void
  readonly onRefresh: () => void
}

export function ClaimControlSection({
  readModel,
  loading,
  error,
  submitting,
  receipt,
  networkRetry,
  onSubmit,
  onRetryNetworkSubmit,
  onRefresh,
}: ClaimControlSectionProps) {
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [reason, setReason] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const confirmationRef = useRef<HTMLDivElement | null>(null)
  const receiptRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setConfirmation(null)
    setReason('')
    setOverrideReason('')
  }, [readModel?.task?.id, readModel?.claim_control?.expected_state.operator_action_activity_id])

  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus()
    }
  }, [confirmation])

  useEffect(() => {
    if (receipt) {
      receiptRef.current?.focus()
    }
  }, [receipt])

  if (loading) {
    return (
      <SectionShell>
        <div role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          Loading claim-control state...
        </div>
      </SectionShell>
    )
  }

  if (error) {
    return (
      <SectionShell>
        <div role="alert" className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {boundClaimControlText(error, 180) ?? 'Failed to load claim-control state.'}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 rounded-md border border-border/40 bg-secondary/40 px-2 py-1 text-xs text-foreground hover:bg-secondary"
        >
          Refresh claim-control state
        </button>
      </SectionShell>
    )
  }

  if (!readModel) return null

  if (!readModel.feature_flag.enabled && !readModel.claim_control) {
    return (
      <SectionShell>
        <p className="mt-2 rounded-md border border-border/30 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
          Task control plane is off.
        </p>
      </SectionShell>
    )
  }

  const control = readModel.claim_control
  if (!control) return null

  const canMutate = control.authorization.can_mutate
  const activeSubmittingAction = submitting?.action ?? null
  const confirmationDescriptor = confirmation
    ? control.available_actions.find((entry) => entry.action === confirmation.action) ?? null
    : null
  const submitProblem = confirmation && confirmationDescriptor
    ? getSubmitProblem(confirmation, reason, overrideReason)
    : null

  const handleSubmit = () => {
    if (!confirmation || !confirmationDescriptor || submitProblem) return
    onSubmit(buildClaimControlDraft({
      readModel,
      action: confirmation.action,
      reason,
      overrideBackoff: confirmation.mode === 'override_backoff',
      overrideReason,
    }))
  }

  return (
    <SectionShell className="space-y-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <ClaimControlBlock label="Stage">
          <span className="break-words font-medium text-foreground">{boundClaimControlText(control.stage_key, 128) ?? 'missing'}</span>
        </ClaimControlBlock>
        <ClaimControlBlock label="Authorization">
          <span className="break-words text-foreground/85">
            {control.authorization.current_role} {canMutate ? 'can mutate' : 'read-only'}
          </span>
        </ClaimControlBlock>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <ClaimControlBlock label="Retry eligibility">
          <span className="break-words text-foreground/85">
            {control.retry_eligibility.state}
            {control.retry_eligibility.reason ? `: ${safeClaimControlDisplay(control.retry_eligibility.reason)}` : ''}
          </span>
        </ClaimControlBlock>
        <ClaimControlBlock label="Backoff">
          <span className="break-words text-foreground/85">
            {control.backoff.state === 'active'
              ? `${String(control.backoff.seconds_remaining)}s remaining${control.backoff.override_allowed ? ', override available' : ''}`
              : 'No active backoff'}
          </span>
          {control.backoff.reason && (
            <span className="mt-1 block break-words text-muted-foreground">{safeClaimControlDisplay(control.backoff.reason)}</span>
          )}
        </ClaimControlBlock>
      </div>

      {control.last_operator_action != null || control.last_sanitized_error != null ? (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {control.last_operator_action != null ? (
            <ClaimControlBlock label="Last operator action">
              <span className="break-words text-foreground/85">{safeClaimControlDisplay(control.last_operator_action)}</span>
            </ClaimControlBlock>
          ) : null}
          {control.last_sanitized_error != null ? (
            <ClaimControlBlock label="Sanitized error">
              <span className="break-words text-foreground/85">{safeClaimControlDisplay(control.last_sanitized_error)}</span>
            </ClaimControlBlock>
          ) : null}
        </div>
      ) : null}

      {!canMutate && (
        <p className="rounded-md border border-border/30 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
          Operator role is required to change claim-control state.
        </p>
      )}

      <ul className="space-y-2">
        {control.available_actions.map((descriptor) => (
          <li key={descriptor.action} className="rounded-md border border-border/30 bg-secondary/20 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{actionLabel(descriptor.action)}</p>
                <p id={reasonId(descriptor)} className="mt-1 break-words text-xs text-muted-foreground">
                  {descriptor.enabled
                    ? actionDescription(descriptor.action)
                    : boundClaimControlText(descriptor.unavailable_reason, 180) ?? 'Unavailable from backend state.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-describedby={reasonId(descriptor)}
                  disabled={!canStartAction(descriptor, canMutate, submitting)}
                  onClick={() => {
                    setConfirmation({ action: descriptor.action, mode: 'standard' })
                  }}
                  className="rounded-md border border-border/40 bg-card/60 px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50 hover:bg-secondary"
                >
                  {activeSubmittingAction === descriptor.action ? 'Submitting...' : actionLabel(descriptor.action)}
                </button>
                {descriptor.action === 'retry' && !descriptor.enabled && control.backoff.state === 'active' && control.backoff.override_allowed && (
                  <button
                    type="button"
                    disabled={!canMutate || submitting !== null}
                    onClick={() => {
                      setConfirmation({ action: 'retry', mode: 'override_backoff' })
                    }}
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
                  >
                    Override backoff
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {confirmation && confirmationDescriptor && (
        <div
          ref={confirmationRef}
          tabIndex={-1}
          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-3 text-xs outline-none"
        >
          <h5 className="text-sm font-medium text-foreground">
            Confirm {confirmation.mode === 'override_backoff' ? 'backoff override' : actionLabel(confirmation.action).toLowerCase()}
          </h5>
          <p className="mt-1 break-words text-muted-foreground">
            Expected state will be copied from the latest backend claim-control read model for {control.stage_key}.
          </p>

          {(confirmation.action === 'release' || confirmation.action === 'cancel') && (
            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {confirmation.action === 'release' ? 'Reason' : 'Cancel reason required'}
              </span>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                }}
                rows={2}
                maxLength={512}
                className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
                placeholder={confirmation.action === 'release' ? defaultReasonForAction('release') ?? '' : 'Explain why this attempt is being cancelled.'}
              />
            </label>
          )}

          {confirmation.mode === 'override_backoff' && (
            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Override reason required</span>
              <textarea
                value={overrideReason}
                onChange={(event) => {
                  setOverrideReason(event.target.value)
                }}
                rows={2}
                maxLength={512}
                className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
                placeholder="Explain why retry backoff is being overridden."
              />
            </label>
          )}

          {submitProblem && (
            <p role="alert" className="mt-2 text-xs text-amber-100">{submitProblem}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitProblem !== null || submitting !== null}
              onClick={handleSubmit}
              className="rounded-md border border-primary/50 bg-primary/20 px-3 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50 hover:bg-primary/30"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmation(null)
              }}
              className="rounded-md border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {networkRetry && (
        <div role="alert" className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <p>{boundClaimControlText(networkRetry.message, 180) ?? 'Network failure. Retry the same submission.'}</p>
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => {
              onRetryNetworkSubmit(networkRetry.draft)
            }}
            className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
          >
            Retry same submission
          </button>
        </div>
      )}

      {receipt && (
        <div
          ref={receiptRef}
          tabIndex={-1}
          role={receipt.tone === 'error' || receipt.tone === 'warning' ? 'alert' : 'status'}
          aria-live={receipt.tone === 'error' || receipt.tone === 'warning' ? 'assertive' : 'polite'}
          className={`rounded-md border px-3 py-2 text-xs outline-none ${receiptClass(receipt.tone)}`}
        >
          <p className="font-medium">{outcomeLabel(receipt.outcome)}</p>
          <p className="mt-1 break-words">
            {actionLabel(receipt.action)} for {receipt.stage_key}
            {receipt.idempotency_replayed ? ' was replayed from an earlier matching submission.' : ' refreshed claim-control availability.'}
          </p>
          {receipt.activity_reference && (
            <p className="mt-1 break-all font-mono text-[10px]">Activity {receipt.activity_reference}</p>
          )}
          {receipt.sanitized_error_category && (
            <p className="mt-1">{sanitizedErrorLabel(receipt.sanitized_error_category)}</p>
          )}
        </div>
      )}
    </SectionShell>
  )
}

function SectionShell({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <section role="region" aria-label="Claim control" className={`pt-3 border-t border-border/30 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Claim control</h4>
        <span className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Operator actions</span>
      </div>
      {children}
    </section>
  )
}

function ClaimControlBlock({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function reasonId(descriptor: ClaimControlAvailableAction): string {
  return `claim-control-${descriptor.action}-reason`
}

function canStartAction(
  descriptor: ClaimControlAvailableAction,
  canMutate: boolean,
  submitting: ClaimControlSubmissionState | null,
): boolean {
  return canMutate && descriptor.enabled && submitting === null
}

function getSubmitProblem(confirmation: ConfirmationState, reason: string, overrideReason: string): string | null {
  if (confirmation.action === 'cancel' && !boundClaimControlText(reason)) {
    return 'Cancel reason is required.'
  }
  if (confirmation.mode === 'override_backoff' && !boundClaimControlText(overrideReason)) {
    return 'Override reason is required.'
  }
  return null
}

function receiptClass(tone: ClaimControlOutcomeReceipt['tone']): string {
  if (tone === 'success') return 'border-green-500/25 bg-green-500/10 text-green-100'
  if (tone === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-100'
  if (tone === 'error') return 'border-red-500/25 bg-red-500/10 text-red-100'
  return 'border-border/30 bg-secondary/20 text-muted-foreground'
}
