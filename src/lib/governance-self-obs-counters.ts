/**
 * SPEC-008 — Self-observability counters (T235, T236, T240).
 *
 * Per FR-005a / FR-194 / FR-285 / FR-338. Lightweight counters used by
 * the governance subsystem to surface its own state. Counters live in
 * a process-local map (`activity_throttle_metrics` table writes are
 * deferred — these are in-memory aggregates the System Health REST
 * surface reads).
 *
 * @see specs/008-resource-governance/tasks.md T235, T236, T240
 */

const counters = new Map<string, number>();

/** Increment a counter by `delta` (default 1). */
export function incCounter(name: string, delta = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + delta);
}

/** Read a counter (default 0 when missing). */
export function readCounter(name: string): number {
  return counters.get(name) ?? 0;
}

/** Snapshot all counters; used by /api/governance/system-health. */
export function snapshotCounters(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

/** T235 — postcommit dispatch retry counter (FR-005a). */
export function recordPostcommitDispatchError(): void {
  incCounter('mc.governance.evaluator_postcommit_dispatch_error');
}

/** T236 — throttle engaged / disengaged counters (FR-338). */
export function recordThrottleEngaged(workerClass: string): void {
  incCounter(`mc.governance.governance_throttle_engaged_total{worker_class=${workerClass}}`);
}
export function recordThrottleDisengaged(workerClass: string): void {
  incCounter(`mc.governance.governance_throttle_disengaged_total{worker_class=${workerClass}}`);
}

/** T240 — alert-throttle suppression counter is itself a metric (FR-285). */
export function recordAlertSuppressed(reason: string): void {
  incCounter(`mc.governance.alert_suppressed_total{reason=${reason}}`);
}

/** Test helper — reset between specs. */
export function _resetCountersForTests(): void {
  counters.clear();
}
