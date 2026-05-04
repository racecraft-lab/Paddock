/**
 * SPEC-008 — Policies subview (T167).
 *
 * Per FR-187 / FR-306. List view of resource policies for the active
 * workspace. Renders a header (count + "Add policy" trigger) and a
 * scrollable list of <PolicyRow> children. Empty state, loading
 * spinner, and disabled-by-flag variants share the same wrapper so
 * Storybook can drive them via the `state` prop without re-rendering
 * the world.
 *
 * Data: caller provides `policies[]` after loading them via the
 * existing policies REST collection. The subview itself is render-only
 * — no fetch, no transitions — keeping the cost-tracker-panel
 * byte-compat surface bound to the parent's effect chain.
 *
 * @see specs/008-resource-governance/spec.md FR-187, FR-306
 * @see specs/008-resource-governance/tasks.md T167
 */

'use client';

import { type ReactNode } from 'react';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';
import { PolicyRow, type PolicySummary } from './policy-row';

export type PoliciesSubviewState = 'loading' | 'ready' | 'empty' | 'error' | 'disabled';

export interface PoliciesSubviewProps {
  state: PoliciesSubviewState;
  policies?: PolicySummary[];
  errorMessage?: string;
  onAddPolicy?: () => void;
  onSelectPolicy?: (id: number) => void;
  onBulkPromote?: () => void;
}

export function PoliciesSubview(props: PoliciesSubviewProps): ReactNode {
  if (props.state === 'disabled') {
    return <FeatureFlagDisabledShim subviewLabel="Policies" />;
  }

  if (props.state === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="governance-policies-loading"
        className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
      >
        <span aria-hidden>...</span>
        <span>Loading policies</span>
      </div>
    );
  }

  if (props.state === 'error') {
    return (
      <div
        role="alert"
        data-testid="governance-policies-error"
        className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
      >
        {props.errorMessage ?? 'Failed to load policies.'}
      </div>
    );
  }

  if (props.state === 'empty') {
    return (
      <div
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
        data-testid="governance-policies-empty"
      >
        <p className="mb-2 font-medium text-foreground">No policies yet</p>
        <p className="mb-4">
          Create your first policy to start governing resource usage.
        </p>
        {props.onAddPolicy !== undefined ? (
          <button
            type="button"
            onClick={props.onAddPolicy}
            data-testid="governance-policies-new-button"
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Add policy
          </button>
        ) : null}
      </div>
    );
  }

  // state === 'ready'
  const list = props.policies ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {list.length.toString()} {list.length === 1 ? 'policy' : 'policies'}
        </p>
        <div className="flex items-center gap-2">
          {props.onBulkPromote !== undefined ? (
            <button
              type="button"
              onClick={props.onBulkPromote}
              data-testid="governance-policies-bulk-promote"
              className="rounded border px-3 py-1.5 text-xs font-medium"
            >
              Bulk promote
            </button>
          ) : null}
          {props.onAddPolicy !== undefined ? (
            <button
              type="button"
              onClick={props.onAddPolicy}
              data-testid="governance-policies-new-button"
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Add policy
            </button>
          ) : null}
        </div>
      </div>
      <ul className="divide-y rounded-md border" aria-label="Policies list">
        {list.map((policy) => (
          <li key={policy.id}>
            <PolicyRow
              policy={policy}
              onSelect={props.onSelectPolicy}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
