/**
 * SPEC-008 — Overrides subview (T174).
 *
 * Per FR-187 / FR-306. Lists active + recent override grants with the
 * grant form (T175) as a sibling.
 *
 * @see specs/008-resource-governance/tasks.md T174
 */

'use client';

import { type ReactNode } from 'react';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';

export type OverridesSubviewState = 'loading' | 'ready' | 'empty' | 'error' | 'disabled';

export interface OverrideSummary {
  id: number;
  scope_kind: 'workspace' | 'project' | 'agent';
  scope_id: number;
  granted_amount: number;
  granted_unit: string;
  reason: string;
  actor: string;
  active: boolean;
  granted_at: string;
  ttl_ms: number;
}

export interface OverridesSubviewProps {
  state: OverridesSubviewState;
  overrides?: OverrideSummary[];
  errorMessage?: string;
  onGrantOverride?: () => void;
  onRevoke?: (id: number) => void;
}

export function OverridesSubview(props: OverridesSubviewProps): ReactNode {
  if (props.state === 'disabled') return <FeatureFlagDisabledShim subviewLabel="Overrides" />;
  if (props.state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="governance-overrides-loading" className="p-4 text-sm text-muted-foreground">
        Loading overrides...
      </div>
    );
  }
  if (props.state === 'error') {
    return (
      <div role="alert" data-testid="governance-overrides-error" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {props.errorMessage ?? 'Failed to load overrides.'}
      </div>
    );
  }
  if (props.state === 'empty') {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="governance-overrides-empty">
        <p className="font-medium text-foreground">No active overrides</p>
        {props.onGrantOverride !== undefined ? (
          <button
            type="button"
            onClick={props.onGrantOverride}
            className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Grant override
          </button>
        ) : null}
      </div>
    );
  }
  const list = props.overrides ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="governance-overrides-list">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {list.filter((o) => o.active).length.toString()} active ·{' '}
          {list.length.toString()} total
        </p>
        {props.onGrantOverride !== undefined ? (
          <button
            type="button"
            onClick={props.onGrantOverride}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Grant override
          </button>
        ) : null}
      </div>
      <ul className="divide-y rounded-md border" aria-label="Overrides list">
        {list.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            data-override-id={o.id}
          >
            <span className="flex flex-col">
              <span className="font-medium">
                {o.scope_kind} #{o.scope_id.toString()} · +{o.granted_amount.toLocaleString()} {o.granted_unit}
              </span>
              <span className="text-xs text-muted-foreground">
                by {o.actor} · {o.granted_at} · ttl {(o.ttl_ms / 60000).toFixed(0)}m
              </span>
              <span className="text-xs italic text-muted-foreground">{o.reason}</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className={
                  o.active
                    ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                    : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                }
              >
                {o.active ? 'active' : 'expired'}
              </span>
              {o.active && props.onRevoke !== undefined ? (
                <button
                  type="button"
                  onClick={() => {
                    props.onRevoke?.(o.id);
                  }}
                  className="rounded border px-2 py-0.5 text-xs"
                >
                  Revoke
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
