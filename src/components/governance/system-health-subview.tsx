/**
 * SPEC-008 — System Health subview (T179).
 *
 * Per FR-187. Container that grids the System Health cards (T180),
 * telemetry source pills (T181), breaker banner (T182), Aegis
 * emergency-reserve badge (T183), and WIP indicator panel (T184).
 *
 * @see specs/008-resource-governance/tasks.md T179
 */

'use client';

import { type ReactNode } from 'react';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';

export type SystemHealthSubviewState = 'loading' | 'ready' | 'error' | 'disabled';

export interface SystemHealthSubviewProps {
  state: SystemHealthSubviewState;
  errorMessage?: string;
  children?: ReactNode;
}

export function SystemHealthSubview(props: SystemHealthSubviewProps): ReactNode {
  if (props.state === 'disabled') return <FeatureFlagDisabledShim subviewLabel="System Health" />;
  if (props.state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="system-health-loading" className="p-4 text-sm text-muted-foreground">
        Loading system health...
      </div>
    );
  }
  if (props.state === 'error') {
    return (
      <div role="alert" data-testid="system-health-error" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {props.errorMessage ?? 'Failed to load system health.'}
      </div>
    );
  }
  return (
    <section
      aria-label="System health overview"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
      data-testid="system-health-cards"
    >
      {props.children}
    </section>
  );
}
