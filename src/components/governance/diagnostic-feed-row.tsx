/**
 * SPEC-008 — Diagnostic feed row (T178).
 *
 * Per FR-308 / FR-190. Single-event renderer with allow / defer /
 * block discriminators (color-coded badge) and an expandable detail
 * payload (scope, policy_id, observed amount, captured_at).
 *
 * @see specs/008-resource-governance/tasks.md T178
 */

'use client';

import { useState, type ReactNode } from 'react';
import type { DiagnosticEvent } from './diagnostic-feed';

const DECISION_BADGE: Record<
  DiagnosticEvent['decision'],
  { label: string; className: string }
> = {
  allow: { label: 'allow', className: 'bg-emerald-100 text-emerald-800' },
  defer: { label: 'defer', className: 'bg-amber-100 text-amber-800' },
  block: { label: 'block', className: 'bg-red-100 text-red-800' },
};

export interface DiagnosticFeedRowProps {
  event: DiagnosticEvent;
  defaultExpanded?: boolean;
}

export function DiagnosticFeedRow(props: DiagnosticFeedRowProps): ReactNode {
  const [expanded, setExpanded] = useState<boolean>(
    props.defaultExpanded ?? false,
  );
  const evt = props.event;
  const badge = DECISION_BADGE[evt.decision];

  return (
    <div className="px-3 py-2">
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
        data-decision={evt.decision}
        data-reason-code={evt.reason_code}
      >
        <span className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-sm">{evt.reason_code}</span>
          <span className="text-xs text-muted-foreground">
            {evt.scope_kind}
            {evt.scope_id === null ? '' : ` #${evt.scope_id.toString()}`}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{evt.captured_at}</span>
      </button>
      {expanded ? (
        <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <dt className="text-muted-foreground">Policy id</dt>
          <dd>{evt.policy_id === null ? '—' : String(evt.policy_id)}</dd>
          <dt className="text-muted-foreground">Observed</dt>
          <dd>
            {evt.observed_amount.toLocaleString()} {evt.observed_unit}
          </dd>
          <dt className="text-muted-foreground">Captured at</dt>
          <dd>{evt.captured_at}</dd>
        </dl>
      ) : null}
    </div>
  );
}
