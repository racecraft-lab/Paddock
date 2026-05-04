/**
 * SPEC-008 — Single policy row (T168).
 *
 * Per FR-306. Compact row used by `<PoliciesSubview>` to show one
 * policy's key fields (type, kind, limit, enforcement, enabled state)
 * with a click-to-open-editor affordance. The row is keyboard-
 * navigable (button) so screen readers / keyboard-only operators can
 * drill into the editor.
 *
 * @see specs/008-resource-governance/spec.md FR-306
 * @see specs/008-resource-governance/tasks.md T168
 */

'use client';

import { type ReactNode } from 'react';

export interface PolicySummary {
  id: number;
  name?: string;
  policy_type: string;
  limit_kind: string;
  limit_value: number | null;
  enforcement: string;
  enforce_mode: string | null;
  enabled: boolean;
  workspace_id: number | null;
}

export interface PolicyRowProps {
  policy: PolicySummary;
  onSelect?: ((id: number) => void) | undefined;
}

export function PolicyRow(props: PolicyRowProps): ReactNode {
  const { policy } = props;
  const limitDisplay =
    policy.limit_value === null
      ? 'no limit'
      : policy.limit_value.toLocaleString();
  const handleClick = (): void => {
    props.onSelect?.(policy.id);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
      aria-label={`Policy ${policy.id.toString()} — ${policy.policy_type} ${policy.limit_kind}`}
      data-policy-id={policy.id}
      data-testid={policy.name ? `governance-policies-row-${policy.name}` : undefined}
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium">
          {policy.policy_type} · {policy.limit_kind}
        </span>
        <span className="text-xs text-muted-foreground">
          enforcement: {policy.enforcement}
          {policy.enforce_mode === null
            ? ''
            : ` (${policy.enforce_mode})`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm">{limitDisplay}</span>
        <span
          className={
            policy.enabled
              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
              : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
          }
          data-policy-enabled={policy.enabled ? 'true' : 'false'}
        >
          {policy.enabled ? 'enabled' : 'disabled'}
        </span>
      </span>
    </button>
  );
}
