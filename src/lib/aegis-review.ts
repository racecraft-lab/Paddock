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
 * Stub. US11 replaces the body with the activity + disposition scan.
 *
 * @param db        SQLite handle — Foundation skeleton does not query.
 * @param taskId    Task under review.
 * @param window    Review window with `since` epoch-seconds lower bound.
 *                  When `since` is null/undefined the function returns null
 *                  WITHOUT scanning the database (FR-134).
 */
export function evaluateSpec007AegisSignals(
  _db: Database.Database,
  _taskId: number,
  window: ReviewWindow,
): AegisFailure | null {
  if (window.since == null) return null
  // US11 wires the real scan; Foundation skeleton returns null.
  return null
}
