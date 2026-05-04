/**
 * SPEC-008 — Aegis emergency-reserve badge (T183).
 *
 * Per FR-315 / FR-156 / FR-090o. Surfaces the Aegis emergency-reserve
 * state with `aria-live="polite"` so SR users hear transitions.
 * Variants: inactive / engaged / cooling-down / disabled-by-flag.
 *
 * @see specs/008-resource-governance/tasks.md T183
 */

'use client';

import { type ReactNode } from 'react';

export type AegisReserveState = 'inactive' | 'engaged' | 'cooling_down' | 'disabled';

const STATE_CLASS: Record<AegisReserveState, string> = {
  inactive: 'bg-muted text-muted-foreground',
  engaged: 'bg-blue-100 text-blue-800 ring-2 ring-blue-300',
  cooling_down: 'bg-amber-100 text-amber-800',
  disabled: 'bg-muted/50 text-muted-foreground',
};

export interface AegisEmergencyReserveBadgeProps {
  state: AegisReserveState;
  remainingTokens?: number;
  cooldownEndsAt?: string;
}

export function AegisEmergencyReserveBadge(
  props: AegisEmergencyReserveBadgeProps,
): ReactNode {
  const cls = STATE_CLASS[props.state];
  const label =
    props.state === 'inactive'
      ? 'Emergency reserve idle'
      : props.state === 'engaged'
        ? 'Emergency reserve engaged'
        : props.state === 'cooling_down'
          ? 'Emergency reserve cooling down'
          : 'Emergency reserve unavailable';
  return (
    <div
      role="status"
      aria-live="polite"
      data-aegis-reserve-state={props.state}
      data-testid="aegis-emergency-reserve-badge"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${cls}`}
    >
      <span aria-hidden>*</span>
      <span>{label}</span>
      {props.remainingTokens !== undefined ? (
        <span className="text-[10px] opacity-80">
          {props.remainingTokens.toLocaleString()} tokens remaining
        </span>
      ) : null}
      {props.cooldownEndsAt !== undefined ? (
        <span className="text-[10px] opacity-80">
          ends {props.cooldownEndsAt}
        </span>
      ) : null}
    </div>
  );
}
