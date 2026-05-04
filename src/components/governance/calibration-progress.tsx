/**
 * SPEC-008 — Calibration progress indicator (T187).
 *
 * Per FR-198 / FR-042. Visualizes the calibration milestones the
 * evaluator must hit before a policy can be promoted from shadow to
 * hard enforcement.
 *
 * @see specs/008-resource-governance/tasks.md T187
 */

'use client';

import { type ReactNode } from 'react';

export type MilestoneStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface CalibrationMilestone {
  id: string;
  label: string;
  status: MilestoneStatus;
  detail?: string;
}

export interface CalibrationProgressProps {
  milestones: CalibrationMilestone[];
  pctComplete?: number;
  disabled?: boolean;
}

const STATUS_CLASS: Record<MilestoneStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-800',
  complete: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

export function CalibrationProgress(props: CalibrationProgressProps): ReactNode {
  if (props.disabled === true) {
    return (
      <div
        role="region"
        aria-label="Calibration (disabled)"
        data-feature-flag-state="off"
        className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
      >
        Calibration milestones unavailable
      </div>
    );
  }
  const totalDone = props.milestones.filter((m) => m.status === 'complete').length;
  const pct =
    props.pctComplete ??
    (props.milestones.length === 0
      ? 0
      : (totalDone / props.milestones.length) * 100);
  return (
    <section
      aria-label="Calibration progress"
      className="rounded-md border p-3"
      data-testid="calibration-progress"
    >
      <header className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">Calibration milestones</span>
        <span className="font-mono">
          {totalDone.toString()} / {props.milestones.length.toString()} ·{' '}
          {pct.toFixed(0)}%
        </span>
      </header>
      <div
        role="progressbar"
        aria-label="Calibration completion"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mb-3 h-2 w-full overflow-hidden rounded bg-muted"
      >
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${pct.toString()}%` }}
        />
      </div>
      <ul className="space-y-1">
        {props.milestones.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between text-xs"
            data-milestone-id={m.id}
            data-status={m.status}
          >
            <span className="flex flex-col">
              <span>{m.label}</span>
              {m.detail !== undefined ? (
                <span className="text-[10px] text-muted-foreground">
                  {m.detail}
                </span>
              ) : null}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[m.status]}`}
            >
              {m.status.replace('_', ' ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
