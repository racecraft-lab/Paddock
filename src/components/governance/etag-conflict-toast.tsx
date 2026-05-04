/**
 * SPEC-008 — ETag-conflict toast (T188).
 *
 * Per FR-288. Toast surfaced when a write returns 412
 * (precondition_failed) on If-Match. Offers refresh-and-retry
 * affordance and an optional diff peek showing the upstream change.
 *
 * @see specs/008-resource-governance/tasks.md T188
 */

'use client';

import { useState, type ReactNode } from 'react';

export interface EtagConflictDiffEntry {
  field: string;
  yours: string;
  theirs: string;
}

export interface EtagConflictToastProps {
  resourceLabel: string;
  diff?: EtagConflictDiffEntry[];
  onRefreshAndRetry?: () => void;
  onDismiss?: () => void;
}

export function EtagConflictToast(props: EtagConflictToastProps): ReactNode {
  const [showDiff, setShowDiff] = useState<boolean>(false);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 w-[380px] rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 shadow-lg"
      data-toast="etag_conflict"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Record changed upstream</p>
          <p className="mt-1 text-xs">
            Another caller updated <span className="font-mono">{props.resourceLabel}</span>.
            Refresh and retry to keep their change.
          </p>
        </div>
        {props.onDismiss !== undefined ? (
          <button
            type="button"
            onClick={props.onDismiss}
            className="text-xs underline underline-offset-2"
            aria-label="Dismiss conflict toast"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {props.onRefreshAndRetry !== undefined ? (
          <button
            type="button"
            onClick={props.onRefreshAndRetry}
            className="rounded bg-amber-800 px-2 py-1 text-xs font-medium text-white"
          >
            Refresh and retry
          </button>
        ) : null}
        {props.diff !== undefined && props.diff.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setShowDiff((v) => !v);
            }}
            aria-expanded={showDiff}
            className="rounded border border-amber-400 px-2 py-1 text-xs"
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
        ) : null}
      </div>

      {showDiff && props.diff !== undefined ? (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide opacity-70">
              <th>Field</th>
              <th>Yours</th>
              <th>Theirs</th>
            </tr>
          </thead>
          <tbody>
            {props.diff.map((d) => (
              <tr key={d.field} className="border-t border-amber-200">
                <td className="py-0.5 font-mono">{d.field}</td>
                <td className="py-0.5">{d.yours}</td>
                <td className="py-0.5">{d.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
