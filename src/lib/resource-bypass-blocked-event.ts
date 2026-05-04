/**
 * SPEC-008 — T160 — bypass-attempted-but-blocked event.
 *
 * Per FR-167: when a reservation attempt is blocked by a blackout
 * window OR by an open circuit breaker, the dispatcher MUST emit a
 * `governance_bypass_attempted_but_blocked` activity row that
 * captures the attempted scope, the blocking reason, and the actor.
 * The row enables operators to triage repeated bypass attempts on the
 * Diagnostics subview.
 *
 * @see specs/008-resource-governance/spec.md FR-167
 * @see specs/008-resource-governance/tasks.md T160
 */

import type Database from 'better-sqlite3'

export type BypassBlockReason =
  | 'blackout_window'
  | 'breaker_open'
  | 'reservation_state_invalid'

export interface BypassBlockedEvent {
  workspace_id: number
  policy_id: number | null
  agent_id: number | null
  task_id: number | null
  reason: BypassBlockReason
  actor: string
  detail: string | null
}

/**
 * Emit the activity row inside the caller's transaction. The function
 * does NOT open its own transaction — by design — so the row is
 * atomically consistent with the reservation-attempt UPDATE that
 * blocked it (a half-committed bypass row would be a worse state).
 *
 * Idempotent on `(workspace_id, agent_id, task_id, reason)` per 60s
 * window: the function checks for an identical row written in the
 * preceding 60 seconds and skips duplicates. This prevents a tight
 * dispatch loop from flooding the activity log on a stuck breaker.
 */
export function recordBypassBlockedEvent(
  db: Database.Database,
  event: BypassBlockedEvent,
): void {
  const dupe = db
    .prepare(
      `SELECT 1
       FROM activities
       WHERE type = 'governance_bypass_attempted_but_blocked'
         AND workspace_id = ?
         AND json_extract(data, '$.agent_id') = ?
         AND json_extract(data, '$.task_id') = ?
         AND json_extract(data, '$.reason') = ?
         AND created_at > datetime('now', '-60 seconds')
       LIMIT 1`,
    )
    .get(
      event.workspace_id,
      event.agent_id ?? null,
      event.task_id ?? null,
      event.reason,
    )
  if (dupe) return

  db.prepare(
    `INSERT INTO activities
     (type, entity_type, entity_id, actor, description, data, workspace_id)
     VALUES (
       'governance_bypass_attempted_but_blocked',
       'resource_policy',
       ?,
       ?,
       ?,
       ?,
       ?
     )`,
  ).run(
    event.policy_id ?? 0,
    event.actor,
    `Bypass blocked by ${event.reason}`,
    JSON.stringify({
      policy_id: event.policy_id,
      agent_id: event.agent_id,
      task_id: event.task_id,
      reason: event.reason,
      detail: event.detail,
    }),
    event.workspace_id,
  )
}
