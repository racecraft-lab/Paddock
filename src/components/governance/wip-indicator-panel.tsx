/**
 * SPEC-008 — WIP indicator panel (T184).
 *
 * Per FR-312. Shows current work-in-progress count against the
 * effective WIP limit, with empty / under-limit / at-limit / over-
 * limit / disabled-by-flag variants.
 *
 * @see specs/008-resource-governance/tasks.md T184
 */

'use client';

import { type ReactNode } from 'react';

export type WipStatus = 'empty' | 'under_limit' | 'at_limit' | 'over_limit' | 'disabled';

export interface WipIndicatorPanelProps {
  status: WipStatus;
  current: number;
  limit: number | null;
}

const STATUS_CLASS: Record<Exclude<WipStatus, 'disabled' | 'empty'>, string> = {
  under_limit: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  at_limit: 'border-amber-200 bg-amber-50 text-amber-900',
  over_limit: 'border-red-200 bg-red-50 text-red-900',
};

export function WipIndicatorPanel(props: WipIndicatorPanelProps): ReactNode {
  if (props.status === 'disabled') {
    return (
      <div
        role="region"
        aria-label="WIP indicator (disabled)"
        className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        data-feature-flag-state="off"
        data-testid="wip-indicator-panel"
      >
        WIP indicator unavailable
      </div>
    );
  }
  if (props.status === 'empty') {
    return (
      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground" data-testid="wip-indicator-panel">
        No WIP policy defined for this scope.
      </div>
    );
  }
  const cls = STATUS_CLASS[props.status];
  return (
    <article
      className={`rounded-md border p-3 ${cls}`}
      data-wip-status={props.status}
      data-testid="wip-indicator-panel"
      aria-label={`WIP ${props.current.toString()} of ${props.limit === null ? 'no limit' : props.limit.toString()}`}
    >
      <header className="flex items-center justify-between text-xs">
        <span className="font-semibold">Work in progress</span>
        <span className="font-mono">
          {props.current.toString()} / {props.limit === null ? '∞' : props.limit.toString()}
        </span>
      </header>
      <div
        role="progressbar"
        aria-label="WIP utilization"
        aria-valuenow={props.current}
        aria-valuemin={0}
        aria-valuemax={props.limit ?? Math.max(props.current, 1)}
        className="mt-2 h-2 w-full overflow-hidden rounded bg-white/40"
      >
        <div
          className="h-full bg-current opacity-50"
          style={{
            width: `${Math.min(
              100,
              props.limit === null
                ? 50
                : (props.current / Math.max(props.limit, 1)) * 100,
            ).toString()}%`,
          }}
        />
      </div>
    </article>
  );
}
