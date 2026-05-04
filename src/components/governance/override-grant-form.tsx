/**
 * SPEC-008 — Override grant form (T175).
 *
 * Per FR-309 / FR-090p / FR-183. Form for granting a temporary
 * override against a target scope. State variants:
 *   - default
 *   - submitting
 *   - 409 (idempotency conflict)
 *   - 412 (precondition failure)
 *   - 422 (validation failure with `issues[]`)
 *   - 423 (governance_grants_disabled per FR-219d)
 *   - disabled-by-flag
 *
 * Per FR-090p the error summary panel uses `role="alert"` and is
 * populated with the per-field issues; the form's `aria-describedby`
 * points to the summary id so SR readers announce errors on submit.
 *
 * @see specs/008-resource-governance/tasks.md T175
 */

'use client';

import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ModalErrorSummary } from './modal-error-summary';

export type OverrideGrantFormState =
  | 'default'
  | 'submitting'
  | 'error_409'
  | 'error_412'
  | 'error_422'
  | 'error_423'
  | 'disabled';

export interface OverrideGrantValidationIssue {
  field_path: string;
  message: string;
  code: string;
}

export interface OverrideGrantFormProps {
  state?: OverrideGrantFormState;
  defaultScopeKind?: 'workspace' | 'project' | 'agent';
  defaultScopeId?: number;
  defaultPolicyId?: number | null;
  defaultUnit?: 'usd' | 'requests' | 'tokens';
  defaultReason?: string;
  errorMessage?: string;
  validationIssues?: OverrideGrantValidationIssue[];
  onSubmit?: (input: {
    scope_kind: 'workspace' | 'project' | 'agent';
    scope_id: number;
    policy_id: number | null;
    granted_amount: number;
    granted_unit: 'usd' | 'requests' | 'tokens';
    ttl_ms: number;
    reason: string;
    idempotency_key: string;
  }) => void;
  onCancel?: () => void;
}

const ERROR_SUMMARY_ID = 'override-grant-error-summary';
const FORM_ID = 'override-grant-form';

export function OverrideGrantForm(props: OverrideGrantFormProps): ReactNode {
  const state = props.state ?? 'default';
  const [scopeKind, setScopeKind] = useState<'workspace' | 'project' | 'agent'>(
    props.defaultScopeKind ?? 'workspace',
  );
  const [scopeId, setScopeId] = useState<string>(
    props.defaultScopeId === undefined ? '1' : String(props.defaultScopeId),
  );
  const [policyId, setPolicyId] = useState<string>(
    props.defaultPolicyId === undefined || props.defaultPolicyId === null
      ? ''
      : String(props.defaultPolicyId),
  );
  const [grantedAmount, setGrantedAmount] = useState<string>('100');
  const [unit, setUnit] = useState<'usd' | 'requests' | 'tokens'>(
    props.defaultUnit ?? 'usd',
  );
  const [ttlMinutes, setTtlMinutes] = useState<string>('60');
  const [localReason, setLocalReason] = useState<string>(props.defaultReason ?? '');

  if (state === 'disabled') {
    return (
      <div
        role="region"
        aria-label="Override grant form (disabled by feature flag)"
        data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
        data-feature-flag-state="off"
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        Override grants disabled — FEATURE_RESOURCE_GOVERNANCE is OFF.
      </div>
    );
  }

  const submitting = state === 'submitting';
  const hasError =
    state === 'error_409' ||
    state === 'error_412' ||
    state === 'error_422' ||
    state === 'error_423';

  function submit(e: SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (props.onSubmit === undefined) return;
    props.onSubmit({
      scope_kind: scopeKind,
      scope_id: Number(scopeId),
      policy_id: policyId.trim() === '' ? null : Number(policyId),
      granted_amount: Number(grantedAmount),
      granted_unit: unit,
      ttl_ms: Number(ttlMinutes) * 60_000,
      reason: localReason,
      // Caller-supplied idem-key is generated client-side (uuid), but
      // for the scaffold we synthesize from the form contents to keep
      // Storybook stories deterministic.
      idempotency_key: `idem-${scopeKind}-${scopeId}-${grantedAmount}-${localReason.length.toString()}`,
    });
  }

  const summaryMessage =
    state === 'error_409'
      ? 'Idempotency conflict'
      : state === 'error_412'
        ? 'Precondition failed'
        : state === 'error_422'
          ? 'Validation failed'
          : state === 'error_423'
            ? 'Override grants disabled'
            : null;

  return (
    <form
      id={FORM_ID}
      onSubmit={submit}
      aria-describedby={hasError ? ERROR_SUMMARY_ID : undefined}
      className="flex flex-col gap-3 rounded-md border p-4"
      data-testid="governance-overrides-grant-form"
    >
      <h3 className="text-sm font-semibold">Grant resource override</h3>

      {hasError ? (
        <div
          id={ERROR_SUMMARY_ID}
          className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground"
        >
          <ModalErrorSummary
            message={summaryMessage}
            hint={props.errorMessage}
            testId={state === 'error_422' ? 'modal-error-summary-server-422' : 'modal-error-summary'}
          />
          <p className="mb-1 font-medium">
            {state === 'error_409' ? 'Idempotency conflict' : null}
            {state === 'error_412' ? 'Precondition failed' : null}
            {state === 'error_422' ? 'Validation failed' : null}
            {state === 'error_423' ? 'Override grants disabled' : null}
          </p>
          {props.errorMessage !== undefined ? (
            <p>{props.errorMessage}</p>
          ) : null}
          {props.validationIssues !== undefined &&
          props.validationIssues.length > 0 ? (
            <ul className="ml-4 list-disc">
              {props.validationIssues.map((iss, idx) => (
                <li key={`${iss.field_path}-${idx.toString()}`}>
                  <span className="font-mono">{iss.field_path}</span>:{' '}
                  {iss.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>Scope kind</span>
          <select
            value={scopeKind}
            onChange={(e) => {
              setScopeKind(e.target.value as 'workspace' | 'project' | 'agent');
            }}
            disabled={submitting}
            className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            data-testid="override-grant-scope-kind"
          >
            <option value="workspace">workspace</option>
            <option value="project">project</option>
            <option value="agent">agent</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Scope id</span>
          <input
            type="number"
            value={scopeId}
            min={1}
            onChange={(e) => {
              setScopeId(e.target.value);
            }}
            disabled={submitting}
            className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            data-testid="override-grant-scope-id"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span>Policy id (optional)</span>
        <input
          type="number"
          value={policyId}
          onChange={(e) => {
            setPolicyId(e.target.value);
          }}
          disabled={submitting}
          className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          data-testid="override-grant-policy-id"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>Granted amount</span>
          <input
            type="number"
            min={1}
            value={grantedAmount}
            onChange={(e) => {
              setGrantedAmount(e.target.value);
            }}
            disabled={submitting}
            className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            data-testid="override-grant-amount"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Unit</span>
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value as 'usd' | 'requests' | 'tokens');
            }}
            disabled={submitting}
            className="rounded border bg-background px-2 py-1 text-sm text-foreground"
            data-testid="override-grant-unit"
          >
            <option value="usd">usd</option>
            <option value="tokens">tokens</option>
            <option value="requests">requests</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span>TTL (minutes)</span>
        <input
          type="number"
          min={0}
          max={1440}
          value={ttlMinutes}
          onChange={(e) => {
            setTtlMinutes(e.target.value);
          }}
          disabled={submitting}
          className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          data-testid="override-grant-ttl-minutes"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span>Reason</span>
        <textarea
          value={localReason}
          onChange={(e) => {
            setLocalReason(e.target.value);
          }}
          disabled={submitting}
          required
          rows={2}
          className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          data-testid="override-grant-reason"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          data-testid="override-grant-submit"
        >
          {submitting ? 'Granting...' : 'Grant override'}
        </button>
        {props.onCancel !== undefined ? (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={submitting}
            className="rounded border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
