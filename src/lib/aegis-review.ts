/**
 * SPEC-007 Aegis-review hook (FR-090, FR-134).
 *
 * Foundation skeleton: `evaluateSpec007AegisSignals` returns null and the
 * failure-reason tuple is frozen. US11 (T705..T708) wires the real signal
 * scan against `activities` (`security_violation`) and `task_dispositions`
 * (`disposition='unknown'`).
 *
 * Strict-scope module. The cross-cutting placement (separate file, NOT
 * inlined into `task-dispatch.ts`) is intentional per spec strict-scope —
 * `runAegisReviews` calls into this helper BEFORE its other checks.
 */

import type Database from 'better-sqlite3'

export const AEGIS_FAILURE_REASONS = Object.freeze([
  'secret_in_artifact',
  'disposition_validation_failed',
] as const)

export type AegisFailureReason = (typeof AEGIS_FAILURE_REASONS)[number]

export interface AegisFailure {
  readonly reason: AegisFailureReason
  readonly evidence: Readonly<Record<string, unknown>>
}

export interface ReviewWindow {
  /** Lower bound (inclusive, unix seconds) for activity scan. Required. */
  readonly since: number | null | undefined
}

/**
 * SPEC-007 FR-090: scan activities (`security_violation`) and task_dispositions
 * (`disposition='unknown'`) for the producer task. Returns the first matching
 * AegisFailure or null when both signals are clean.
 *
 * @param db        SQLite handle.
 * @param taskId    Task under review.
 * @param window    Review window with `since` epoch-seconds lower bound.
 *                  When `since` is null/undefined the function returns null
 *                  WITHOUT scanning (FR-134).
 */
export function evaluateSpec007AegisSignals(
  db: Database.Database,
  taskId: number,
  window: ReviewWindow,
): AegisFailure | null {
  if (window.since == null) return null

  // Signal 1: security_violation activity within review window.
  const violation = db.prepare(
    "SELECT id, created_at, data FROM activities WHERE type = 'security_violation' AND entity_type = 'task' AND entity_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
  ).get(taskId, window.since) as { id: number; created_at: number; data: string | null } | undefined

  if (violation) {
    return {
      reason: 'secret_in_artifact',
      evidence: Object.freeze({
        activity_id: violation.id,
        activity_created_at: violation.created_at,
      }),
    }
  }

  // Signal 2: any task_dispositions row with disposition='unknown' for this task.
  const unknownDisp = db.prepare(
    "SELECT id, triaged_at FROM task_dispositions WHERE task_id = ? AND disposition = 'unknown' ORDER BY id DESC LIMIT 1",
  ).get(taskId) as { id: number; triaged_at: number } | undefined

  if (unknownDisp) {
    return {
      reason: 'disposition_validation_failed',
      evidence: Object.freeze({
        disposition_id: unknownDisp.id,
        triaged_at: unknownDisp.triaged_at,
      }),
    }
  }

  return null
}
