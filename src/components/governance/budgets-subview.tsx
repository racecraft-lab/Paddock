/**
 * SPEC-008 — Budgets subview (T170).
 *
 * Per FR-187 / FR-306. Lists budget policies + utilization charts.
 * Renders one <BudgetUtilizationChart> per budget row plus the
 * `enabled` toggle. Disabled-by-flag delegates to the shim.
 *
 * @see specs/008-resource-governance/tasks.md T170
 */

'use client';

import { type ReactNode } from 'react';
import { BudgetUtilizationChart } from './budget-utilization-chart';
import { FeatureFlagDisabledShim } from './feature-flag-disabled-shim';

export type BudgetsSubviewState = 'loading' | 'ready' | 'empty' | 'error' | 'disabled';

export interface BudgetSummary {
  id: number;
  workspace_id: number | null;
  unit: 'usd' | 'requests' | 'tokens';
  limit_value: number;
  consumed: number;
  pct_used: number;
  enabled: boolean;
}

export interface BudgetsSubviewProps {
  state: BudgetsSubviewState;
  budgets?: BudgetSummary[];
  errorMessage?: string;
  onAddBudget?: () => void;
}

export function BudgetsSubview(props: BudgetsSubviewProps): ReactNode {
  if (props.state === 'disabled') return <FeatureFlagDisabledShim subviewLabel="Budgets" />;
  if (props.state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="governance-budgets-loading" className="p-4 text-sm text-muted-foreground">
        Loading budgets...
      </div>
    );
  }
  if (props.state === 'error') {
    return (
      <div role="alert" data-testid="governance-budgets-error" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {props.errorMessage ?? 'Failed to load budgets.'}
      </div>
    );
  }
  if (props.state === 'empty') {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="governance-budgets-empty">
        <p className="mb-2 font-medium text-foreground">No budgets defined</p>
        {props.onAddBudget !== undefined ? (
          <button
            type="button"
            onClick={props.onAddBudget}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Add budget
          </button>
        ) : null}
      </div>
    );
  }
  const budgets = props.budgets ?? [];
  return (
    <ul className="flex flex-col gap-3" aria-label="Budgets list" data-testid="governance-budgets-utilization">
      {budgets.map((b) => (
        <li key={b.id} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              Budget {b.id.toString()} · {b.unit}
            </span>
            <span className="text-xs text-muted-foreground">
              {b.consumed.toLocaleString()} / {b.limit_value.toLocaleString()}
            </span>
          </div>
          <BudgetUtilizationChart
            pctUsed={b.pct_used}
            unit={b.unit}
            disabledByFlag={false}
          />
        </li>
      ))}
    </ul>
  );
}
