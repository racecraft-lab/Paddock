/**
 * SPEC-008 — Breaker-open banner (T182).
 *
 * Per FR-314. Surfaces the persistent circuit-breaker state at the top
 * of the governance subview. Variants:
 *   - closed (no banner — render null)
 *   - half_open (info — orange/amber)
 *   - open (red, with reset CTA when admin)
 *   - persistent_open (red + chronic alert badge)
 *
 * Reset action wires to POST /api/governance/breaker/reset (T161).
 *
 * @see specs/008-resource-governance/tasks.md T182
 */

'use client';

import { type ReactNode } from 'react';

export type BreakerBannerState = 'closed' | 'half_open' | 'open' | 'persistent_open' | 'disabled';

export interface BreakerOpenBannerProps {
  state: BreakerBannerState;
  openedAt?: string | null;
  consecutiveErrors?: number;
  canReset?: boolean;
  onReset?: () => void;
}

export function BreakerOpenBanner(props: BreakerOpenBannerProps): ReactNode {
  if (props.state === 'closed') return null;
  if (props.state === 'disabled') {
    return (
      <div
        role="status"
        className="rounded-md border border-dashed p-2 text-xs text-muted-foreground"
        data-feature-flag-state="off"
      >
        Circuit breaker telemetry — feature flag OFF
      </div>
    );
  }
  const palette =
    props.state === 'half_open'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-red-300 bg-red-50 text-red-900';
  const label =
    props.state === 'half_open'
      ? 'Breaker half-open — probing'
      : props.state === 'persistent_open'
        ? 'Breaker persistently open — chronic alert active'
        : 'Breaker open — admission halted';
  return (
    <div
      role="alert"
      data-breaker-state={props.state}
      data-testid="breaker-open-banner"
      className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${palette}`}
    >
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {props.openedAt !== undefined && props.openedAt !== null ? (
          <span className="text-xs">
            Opened {props.openedAt}
            {props.consecutiveErrors !== undefined
              ? ` · ${props.consecutiveErrors.toString()} consecutive errors`
              : ''}
          </span>
        ) : null}
      </span>
      {props.canReset === true && props.onReset !== undefined ? (
        <button
          type="button"
          onClick={props.onReset}
          className="rounded border border-current px-2 py-0.5 text-xs"
        >
          Manual reset
        </button>
      ) : null}
    </div>
  );
}
