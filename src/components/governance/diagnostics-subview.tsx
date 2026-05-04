/**
 * SPEC-008 — Diagnostics subview (T176).
 *
 * Per FR-187 / FR-306. Container for the diagnostic feed (T177) plus
 * filter controls (decision class, time window, source).
 *
 * @see specs/008-resource-governance/tasks.md T176
 */

'use client';

import { type ReactNode } from 'react';
import { DiagnosticFeed, type DiagnosticEvent } from './diagnostic-feed';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';

export type DiagnosticsSubviewState = 'loading' | 'ready' | 'empty' | 'error' | 'disabled';

export interface DiagnosticsSubviewProps {
  state: DiagnosticsSubviewState;
  events?: DiagnosticEvent[];
  errorMessage?: string;
  filterDecision?: 'all' | 'allow' | 'defer' | 'block';
  onFilterChange?: (next: 'all' | 'allow' | 'defer' | 'block') => void;
}

export function DiagnosticsSubview(props: DiagnosticsSubviewProps): ReactNode {
  if (props.state === 'disabled') return <FeatureFlagDisabledShim subviewLabel="Diagnostics" />;
  if (props.state === 'error') {
    return (
      <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {props.errorMessage ?? 'Failed to load diagnostics.'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Filter decision:</span>
        {(['all', 'allow', 'defer', 'block'] as const).map((d) => {
          const selected = (props.filterDecision ?? 'all') === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                props.onFilterChange?.(d);
              }}
              className={
                selected
                  ? 'rounded bg-primary px-2 py-0.5 text-primary-foreground'
                  : 'rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted'
              }
              aria-pressed={selected}
            >
              {d}
            </button>
          );
        })}
      </div>
      <DiagnosticFeed
        state={
          props.state === 'loading'
            ? 'loading'
            : props.state === 'empty'
              ? 'empty'
              : 'ready'
        }
        events={props.events ?? []}
      />
    </div>
  );
}
