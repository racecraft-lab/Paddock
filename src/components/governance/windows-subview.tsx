/**
 * SPEC-008 — Windows subview (T172).
 *
 * Per FR-187 / FR-306. Lists time-window policies (blackout +
 * degraded) with edit affordance.
 *
 * @see specs/008-resource-governance/tasks.md T172
 */

'use client';

import { type ReactNode } from 'react';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';

export type WindowsSubviewState = 'loading' | 'ready' | 'empty' | 'error' | 'disabled';

export interface WindowSummary {
  id: number;
  policy_type: 'blackout' | 'degraded';
  start_local: string;
  end_local: string;
  timezone: string;
  enabled: boolean;
}

export interface WindowsSubviewProps {
  state: WindowsSubviewState;
  windows?: WindowSummary[];
  errorMessage?: string;
  onEdit?: (id: number) => void;
}

export function WindowsSubview(props: WindowsSubviewProps): ReactNode {
  if (props.state === 'disabled') return <FeatureFlagDisabledShim subviewLabel="Windows" />;
  if (props.state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="governance-windows-loading" className="p-4 text-sm text-muted-foreground">
        Loading windows...
      </div>
    );
  }
  if (props.state === 'error') {
    return (
      <div role="alert" data-testid="governance-windows-error" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {props.errorMessage ?? 'Failed to load windows.'}
      </div>
    );
  }
  if (props.state === 'empty') {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="governance-windows-empty">
        <p className="font-medium text-foreground">No windows defined</p>
      </div>
    );
  }
  const list = props.windows ?? [];
  return (
    <ul className="divide-y rounded-md border" aria-label="Windows list" data-testid="governance-windows-status">
      {list.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            onClick={() => {
              props.onEdit?.(w.id);
            }}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
            data-window-id={w.id}
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {w.policy_type} · {w.timezone}
              </span>
              <span className="text-xs text-muted-foreground">
                {w.start_local} → {w.end_local}
              </span>
            </span>
            <span
              className={
                w.enabled
                  ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                  : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
              }
            >
              {w.enabled ? 'enabled' : 'disabled'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
