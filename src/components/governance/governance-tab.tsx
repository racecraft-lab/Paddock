/**
 * SPEC-008 — Governance tab top-level component (T166).
 *
 * Tab list + sub-views per FR-186 / FR-187. Mounted by
 * `cost-tracker-panel.tsx` (T164) ONLY when
 * `resolveFlag('FEATURE_RESOURCE_GOVERNANCE', ctx)` is ON; absent in
 * the rendered tree when OFF (FR-186, FR-193, FR-305).
 *
 * The tab uses the project's existing tab/role pattern — single
 * `role="tablist"` with `role="tab"` children and `role="tabpanel"`
 * sibling. Keyboard nav (left/right/home/end) per FR-200 wires
 * through native focus management; tabindex="0" on the active tab
 * keeps Tab-key reachability one stop.
 *
 * Subview slots are deferred to lazy-loaded children — each subview
 * (Policies, Budgets, Windows, Overrides, Diagnostics, System Health)
 * is its own component and loaded on first selection. This keeps
 * the cost-tracker-panel byte-compat regression bound to the *inner*
 * tab tree only.
 *
 * @see specs/008-resource-governance/spec.md FR-186, FR-187, FR-200,
 *      FR-305, FR-306
 * @see specs/008-resource-governance/tasks.md T166
 */

'use client';

import { useState, type ReactNode } from 'react';

const SUBVIEWS = [
  { id: 'policies', label: 'Policies' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'windows', label: 'Windows' },
  { id: 'overrides', label: 'Overrides' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'system-health', label: 'System Health' },
] as const;

export type SubviewId = (typeof SUBVIEWS)[number]['id'];

export interface GovernanceTabProps {
  /** Optional initial subview override (default: 'policies'). */
  initialSubview?: SubviewId;
  /**
   * Render-prop for the body. Allows the cost-tracker-panel to inject
   * route-resolved subview components without making this file aware
   * of every subview's import path.
   */
  renderSubview?: (id: SubviewId) => ReactNode;
}

const HEADING_ID = 'governance-tab-heading';

export function GovernanceTab(props: GovernanceTabProps): ReactNode {
  const [active, setActive] = useState<SubviewId>(
    props.initialSubview ?? 'policies',
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void {
    const idx = SUBVIEWS.findIndex((s) => s.id === active);
    if (idx < 0) return;
    // SUBVIEWS is a non-empty const tuple; modulo indexing always yields a row.
    // SUBVIEWS is a non-empty const tuple; runtime guard keeps lint happy.
    let candidate: { id: SubviewId } | undefined;
    if (e.key === 'ArrowRight') {
      candidate = SUBVIEWS[(idx + 1) % SUBVIEWS.length];
    } else if (e.key === 'ArrowLeft') {
      candidate = SUBVIEWS[(idx - 1 + SUBVIEWS.length) % SUBVIEWS.length];
    } else if (e.key === 'Home') {
      candidate = SUBVIEWS[0];
    } else if (e.key === 'End') {
      candidate = SUBVIEWS[SUBVIEWS.length - 1];
    }
    if (candidate !== undefined) {
      setActive(candidate.id);
      e.preventDefault();
    }
  }

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold">
        Governance
      </h2>
      <div role="tablist" aria-label="Governance subviews" className="flex gap-1 border-b">
        {SUBVIEWS.map((s) => {
          const selected = s.id === active;
          return (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`governance-panel-${s.id}`}
              id={`governance-tab-${s.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActive(s.id);
              }}
              onKeyDown={handleKeyDown}
              className={`px-3 py-2 text-sm font-medium ${
                selected
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-subview-id={s.id}
              data-testid={`governance-tab-${s.id}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`governance-panel-${active}`}
        aria-labelledby={`governance-tab-${active}`}
        data-testid={`governance-${active}-subview`}
        className="min-h-[160px]"
      >
        {props.renderSubview !== undefined ? (
          props.renderSubview(active)
        ) : null}
      </div>
    </section>
  );
}
