/**
 * SPEC-008 — Reconciler health alert + freshness lag (T241, T242, T243).
 *
 * Per FR-194 / FR-340 / FR-341. Provides:
 *   - reconcilerHealthDegradedCheck — flips when FR-340 ratios are
 *     sustained > 5 minutes
 *   - sourceFreshnessLagCheck — per-source budget per FR-341
 *   - alertStormCollapse — collapse N suppressed alerts into one
 *     summary entry per FR-194
 *
 * @see specs/008-resource-governance/tasks.md T241, T242, T243
 */

export interface ReconcilerSample {
  observedAt: number;
  successRatio: number;
}

export function reconcilerHealthDegradedCheck(
  samples: ReconcilerSample[],
  thresholdRatio = 0.95,
  windowMs = 5 * 60_000,
): boolean {
  if (samples.length === 0) return false;
  const now = samples[samples.length - 1]?.observedAt ?? Date.now();
  const inWindow = samples.filter((s) => now - s.observedAt <= windowMs);
  return inWindow.length > 0 && inWindow.every((s) => s.successRatio < thresholdRatio);
}

export interface FreshnessSample {
  sourceId: string;
  lagMs: number;
}

export function sourceFreshnessLagCheck(
  samples: FreshnessSample[],
  budgetMs: Record<string, number>,
): { sourceId: string; lagMs: number; budgetMs: number }[] {
  const breaches: { sourceId: string; lagMs: number; budgetMs: number }[] = [];
  for (const s of samples) {
    const budget = budgetMs[s.sourceId] ?? Number.POSITIVE_INFINITY;
    if (s.lagMs > budget) {
      breaches.push({ sourceId: s.sourceId, lagMs: s.lagMs, budgetMs: budget });
    }
  }
  return breaches;
}

export interface SuppressedAlert {
  kind: string;
  count: number;
}

export function alertStormCollapse(
  suppressed: SuppressedAlert[],
): { kind: 'governance_alert_storm_summary'; collapsed: SuppressedAlert[]; total: number } {
  const total = suppressed.reduce((sum, a) => sum + a.count, 0);
  return {
    kind: 'governance_alert_storm_summary',
    collapsed: suppressed,
    total,
  };
}
