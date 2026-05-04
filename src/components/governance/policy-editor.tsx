/**
 * SPEC-008 — Policy editor (T169).
 *
 * Per FR-306 / FR-288 (ETag-conflict toast). Single-policy edit form
 * with limit-value, enforcement, and enabled toggle. Submit invokes
 * the caller-supplied `onSubmit` with the new values + the captured
 * ETag — handler is responsible for the PUT + If-Match wiring.
 *
 * State variants:
 *   - default      — editing a loaded policy
 *   - submitting   — disable inputs + show spinner
 *   - etag_conflict — show <EtagConflictToast> child indicating the
 *                    record was modified upstream; user must refresh
 *                    + retry per FR-288
 *
 * @see specs/008-resource-governance/spec.md FR-306, FR-288
 * @see specs/008-resource-governance/tasks.md T169
 */

'use client';

import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { PolicySummary } from './policy-row';

export type PolicyEditorState = 'default' | 'submitting' | 'etag_conflict' | 'error';

export interface PolicyEditorProps {
  policy: PolicySummary;
  etag: string;
  state?: PolicyEditorState;
  errorMessage?: string;
  onSubmit?: (next: {
    policy_id: number;
    limit_value: number | null;
    enforcement: string;
    enabled: boolean;
    if_match_etag: string;
  }) => void;
  onCancel?: () => void;
  onRefreshAndRetry?: () => void;
}

export function PolicyEditor(props: PolicyEditorProps): ReactNode {
  const [limitValue, setLimitValue] = useState<string>(
    props.policy.limit_value === null ? '' : String(props.policy.limit_value),
  );
  const [enforcement, setEnforcement] = useState<string>(props.policy.enforcement);
  const [enabled, setEnabled] = useState<boolean>(props.policy.enabled);

  const state = props.state ?? 'default';
  const submitting = state === 'submitting';

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (props.onSubmit === undefined) return;
    const parsed = limitValue.trim() === '' ? null : Number(limitValue);
    props.onSubmit({
      policy_id: props.policy.id,
      limit_value: parsed === null || Number.isNaN(parsed) ? null : parsed,
      enforcement,
      enabled,
      if_match_etag: props.etag,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-labelledby={`policy-editor-${String(props.policy.id)}-heading`}
      data-testid="policy-editor"
    >
      <h3
        id={`policy-editor-${String(props.policy.id)}-heading`}
        className="text-sm font-semibold"
      >
        Edit policy {String(props.policy.id)} ({props.policy.policy_type})
      </h3>

      <label className="flex flex-col gap-1 text-xs">
        <span>Limit value</span>
        <input
          type="number"
          min={0}
          value={limitValue}
          onChange={(e) => {
            setLimitValue(e.target.value);
          }}
          disabled={submitting}
          className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          inputMode="numeric"
          data-testid="policy-editor-limit-value"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span>Enforcement</span>
        <select
          value={enforcement}
          onChange={(e) => {
            setEnforcement(e.target.value);
          }}
          disabled={submitting}
          className="rounded border bg-background px-2 py-1 text-sm text-foreground"
          data-testid="policy-editor-enforce-mode"
        >
          <option value="alert">alert</option>
          <option value="defer">defer</option>
          <option value="pause_new_work">pause new work</option>
          <option value="block_dispatch">block dispatch</option>
          <option value="require_override">require override</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
          disabled={submitting}
        />
        <span>Enabled</span>
      </label>

      {state === 'etag_conflict' ? (
        <div
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
        >
          <p className="font-medium">Record modified upstream</p>
          <p>
            Another caller updated this policy. Refresh and retry to avoid
            overwriting their change.
          </p>
          {props.onRefreshAndRetry !== undefined ? (
            <button
              type="button"
              onClick={props.onRefreshAndRetry}
              className="mt-1 underline underline-offset-2"
            >
              Refresh and retry
            </button>
          ) : null}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {props.errorMessage ?? 'Save failed.'}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          data-testid="policy-editor-save"
        >
          {submitting ? 'Saving...' : 'Save'}
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
