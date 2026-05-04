/**
 * SPEC-008 — Diagnostic feed (T177).
 *
 * Per FR-090j / FR-090o / FR-189. Live-streaming list of governance
 * diagnostic events with `aria-live="polite"` and
 * `aria-relevant="additions"` on the live region so SR readers
 * announce only new entries (not re-reads of the entire list).
 *
 * @see specs/008-resource-governance/tasks.md T177
 */

'use client';

import { type ReactNode } from 'react';
import { DiagnosticFeedRow } from './diagnostic-feed-row';

export type DiagnosticFeedState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'live_appending'
  | 'multi_page'
  | 'filter_active'
  | 'filter_empty'
  | 'disabled';

export type DiagnosticDecision = 'allow' | 'defer' | 'block';

export interface DiagnosticEvent {
  id: number;
  decision: DiagnosticDecision;
  reason_code: string;
  scope_kind: 'workspace' | 'project' | 'agent' | 'global';
  scope_id: number | null;
  policy_id: number | null;
  observed_amount: number;
  observed_unit: string;
  captured_at: string;
}

export interface DiagnosticFeedProps {
  state: DiagnosticFeedState;
  events: DiagnosticEvent[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function DiagnosticFeed(props: DiagnosticFeedProps): ReactNode {
  if (props.state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="diagnostic-feed-loading" className="p-4 text-sm text-muted-foreground">
        Loading diagnostic events...
      </div>
    );
  }
  if (props.state === 'empty' || props.state === 'filter_empty') {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="diagnostic-feed-empty">
        {props.state === 'filter_empty'
          ? 'No events match the current filter.'
          : 'No diagnostic events recorded yet.'}
      </div>
    );
  }
  return (
    <div className="rounded-md border">
      <div
        role="feed"
        aria-busy={props.state === 'live_appending'}
        aria-label="Governance diagnostic feed"
        aria-live="polite"
        aria-relevant="additions"
        data-testid="diagnostic-feed-rows"
      >
        {props.events.map((evt, index) => (
          <article
            key={evt.id}
            aria-posinset={index + 1}
            aria-setsize={props.events.length}
            className="border-b last:border-b-0"
          >
            <DiagnosticFeedRow event={evt} />
          </article>
        ))}
      </div>
      {props.hasMore === true && props.onLoadMore !== undefined ? (
        <div className="flex justify-center p-2">
          <button
            type="button"
            onClick={props.onLoadMore}
            className="rounded border px-3 py-1 text-xs"
            data-testid="diagnostic-feed-next"
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
