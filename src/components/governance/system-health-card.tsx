/**
 * SPEC-008 — System Health card (T180).
 *
 * Per FR-307 / FR-191 / FR-090k. Single-status card with severity
 * (green / amber / red), title, summary metric, and an optional
 * runbook link. Supports the FR-090k backup variants:
 *   - backup-healthy / backup-stale / backup-no-offnode-warning /
 *     backup-failed
 *
 * @see specs/008-resource-governance/tasks.md T180
 */

'use client';

import { type ReactNode } from 'react';

export type CardSeverity = 'green' | 'amber' | 'red' | 'loading' | 'error';
export type CardBackupVariant =
  | 'backup-healthy'
  | 'backup-stale'
  | 'backup-no-offnode-warning'
  | 'backup-failed';

const SEVERITY_CLASS: Record<CardSeverity, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-red-200 bg-red-50 text-red-900',
  loading: 'border-muted bg-muted/30 text-muted-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export interface SystemHealthCardProps {
  title: string;
  severity: CardSeverity;
  summary?: string;
  metric?: string;
  runbookHref?: string;
  backupVariant?: CardBackupVariant;
  disabled?: boolean;
  testId?: string;
}

export function SystemHealthCard(props: SystemHealthCardProps): ReactNode {
  if (props.disabled === true) {
    return (
      <div
        role="region"
        aria-label={`${props.title} (disabled)`}
        className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
      data-feature-flag-state="off"
      data-testid={props.testId}
      >
        <p className="font-medium">{props.title}</p>
        <p className="text-xs">Feature flag disabled</p>
      </div>
    );
  }

  const cls = SEVERITY_CLASS[props.severity];
  return (
    <article
      className={`rounded-md border p-3 ${cls}`}
      aria-label={props.title}
      data-severity={props.severity}
      data-backup-variant={props.backupVariant ?? 'n/a'}
      data-testid={props.testId}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.metric !== undefined ? (
          <span className="text-xs font-mono">{props.metric}</span>
        ) : null}
      </header>
      {props.summary !== undefined ? (
        <p className="mt-1 text-xs">{props.summary}</p>
      ) : null}
      {props.runbookHref !== undefined ? (
        <p className="mt-2 text-xs">
          <a className="underline underline-offset-2" href={props.runbookHref}>
            Runbook
          </a>
        </p>
      ) : null}
    </article>
  );
}
