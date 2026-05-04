/**
 * SPEC-008 — Budget utilization chart (T171).
 *
 * Per FR-311. Single horizontal bar showing pct_used with green/amber/
 * red zones at 80% (soft) and 95% (approaching hard) thresholds.
 * Stories cover 0% / 50% / 80% / 95% / 100% / disabled-by-flag.
 *
 * @see specs/008-resource-governance/tasks.md T171
 */

'use client';

import { type ReactNode } from 'react';

export interface BudgetUtilizationChartProps {
  pctUsed: number;
  unit: 'usd' | 'requests' | 'tokens';
  disabledByFlag?: boolean;
  /** Optional label override (default: "Utilization"). */
  label?: string;
}

const SOFT_THRESHOLD = 80;
const HARD_THRESHOLD = 95;

function severityColor(pct: number): { bg: string; text: string } {
  if (pct >= HARD_THRESHOLD) {
    return { bg: 'bg-red-500', text: 'text-foreground' };
  }
  if (pct >= SOFT_THRESHOLD) {
    return { bg: 'bg-amber-500', text: 'text-foreground' };
  }
  return { bg: 'bg-emerald-500', text: 'text-foreground' };
}

export function BudgetUtilizationChart(
  props: BudgetUtilizationChartProps,
): ReactNode {
  const { pctUsed, disabledByFlag = false, unit } = props;
  const clamped = Math.max(0, Math.min(100, pctUsed));
  const severity = severityColor(clamped);
  const label = props.label ?? 'Utilization';

  if (disabledByFlag) {
    return (
      <div
        role="region"
        aria-label="Budget utilization (disabled)"
        className="h-2 w-full rounded bg-muted"
        data-feature-flag-state="off"
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${severity.text}`} data-pct={clamped.toFixed(1)}>
          {clamped.toFixed(1)}% · {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${clamped.toFixed(0)}%`}
        className="h-2 w-full overflow-hidden rounded bg-muted"
      >
        <div
          className={`h-full transition-[width] ${severity.bg}`}
          style={{ width: `${clamped.toString()}%` }}
        />
      </div>
    </div>
  );
}
