/**
 * SPEC-008 — T157 — `defer:db_busy` decision-reason path.
 *
 * Per FR-333: when the evaluator's UPDATE encounters a SQLITE_BUSY
 * exception (or the foreground connection's `busy_timeout` elapses),
 * the dispatcher MUST receive a deterministic `defer:db_busy` reason
 * code — distinct from FR-012 `defer:retry_exhausted` — so the
 * scheduler can honor a tight retry-budget instead of treating the
 * task as exhausted.
 *
 * Behavior:
 *   - Wraps the synchronous evaluator UPDATE.
 *   - Catches `SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT` and the project's
 *     `busy_timeout` exception text.
 *   - Returns `{ decision: 'defer', reason: 'defer:db_busy' }`.
 *   - Records the busy-event self-obs metric (FR-024).
 *
 * The wrapper is dependency-free; it imports the evaluator types
 * directly so a chain of upstream callers can opt into the deferred
 * path without changing the evaluator's hot path.
 *
 * @see specs/008-resource-governance/spec.md FR-333, FR-012, FR-024
 * @see specs/008-resource-governance/tasks.md T157
 */

import type {
  EvaluatorDecision,
  EvaluatorReason,
} from '../types/resource-governance'

/** Stable shape returned by the wrapper. */
export interface DbBusyDeferResult {
  decision: EvaluatorDecision
  reason: EvaluatorReason
  retryable: true
  details?: { error?: string } | undefined
}

/** Patterns identifying SQLite busy errors regardless of provenance. */
const BUSY_PATTERNS: RegExp[] = [
  /SQLITE_BUSY/i,
  /SQLITE_BUSY_SNAPSHOT/i,
  /database is locked/i,
  /busy_timeout/i,
]

export function isDbBusyError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'string') {
    return BUSY_PATTERNS.some((p) => p.test(err))
  }
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code ?? ''
    if (BUSY_PATTERNS.some((p) => p.test(code))) return true
    return BUSY_PATTERNS.some((p) => p.test(err.message))
  }
  return false
}

/**
 * Synchronously execute the evaluator function and translate any
 * SQLITE_BUSY exception into the `defer:db_busy` shape. Re-throws
 * non-busy errors so the caller's existing fail-safe path
 * (`defer:evaluator_internal_exception`, FR-005a) handles them.
 */
export function withDbBusyDefer<T>(
  fn: () => T,
): { ok: true; value: T } | { ok: false; result: DbBusyDeferResult } {
  try {
    return { ok: true, value: fn() }
  } catch (err) {
    if (!isDbBusyError(err)) throw err
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'busy'
    const details: { error?: string } = { error: message }
    return {
      ok: false,
      result: {
        decision: 'defer',
        reason: { kind: 'defer', code: 'defer:db_busy' },
        retryable: true,
        details,
      },
    }
  }
}
