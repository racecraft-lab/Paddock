/**
 * SPEC-008 — Telemetry source health pill (T181).
 *
 * Per FR-313. Compact source-health pill showing the source name +
 * green / amber / red / unknown freshness state.
 *
 * @see specs/008-resource-governance/tasks.md T181
 */

'use client';

import { type ReactNode } from 'react';

export type SourceHealth = 'green' | 'amber' | 'red' | 'unknown';

const PILL_CLASS: Record<SourceHealth, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  unknown: 'bg-muted text-muted-foreground',
};

export interface TelemetrySourceHealthPillProps {
  sourceName: string;
  health: SourceHealth;
  freshnessLagMs?: number;
  disabled?: boolean;
}

export function TelemetrySourceHealthPill(
  props: TelemetrySourceHealthPillProps,
): ReactNode {
  if (props.disabled === true) {
    return (
      <span
        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        data-feature-flag-state="off"
      >
        {props.sourceName} (disabled)
      </span>
    );
  }
  const lag =
    props.freshnessLagMs === undefined
      ? ''
      : ` · ${(props.freshnessLagMs / 1000).toFixed(0)}s`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${PILL_CLASS[props.health]}`}
      data-source-name={props.sourceName}
      data-source-health={props.health}
      aria-label={`${props.sourceName} freshness ${props.health}${lag}`}
    >
      <span aria-hidden>{props.health === 'unknown' ? '?' : '*'}</span>
      <span>{props.sourceName}</span>
      {props.freshnessLagMs !== undefined ? (
        <span className="text-[10px] opacity-70">{lag.replace(' · ', '')}</span>
      ) : null}
    </span>
  );
}
