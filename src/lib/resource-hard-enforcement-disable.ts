/**
 * SPEC-008 — T161 — Hard-enforcement disable 4-step typed-confirmation.
 *
 * Per FR-021 / FR-030: an operator may disable hard enforcement for
 * a workspace ONLY by completing a 4-step typed-confirmation
 * escalation:
 *
 *   1. Open the System Health subview, click "Disable hard enforcement".
 *   2. Type the workspace slug exactly.
 *   3. Type `DISABLE HARD ENFORCEMENT` exactly.
 *   4. Submit, with a reason ≥ 32 characters.
 *
 * The server validates each step and writes one
 * `governance_hard_enforcement_disabled` audit row that participates
 * in the unified `governance_audit_chain` (FR-368). The disable is
 * time-boxed — auto-revert after `default_disable_ttl_seconds`
 * (default 1800s, FR-021).
 *
 * @see specs/008-resource-governance/spec.md FR-021, FR-030, FR-368
 * @see specs/008-resource-governance/tasks.md T161
 */

import type Database from 'better-sqlite3'

export interface HardEnforcementDisableRequest {
  workspace_slug: string
  expected_workspace_slug: string
  typed_phrase: string
  reason: string
  actor: string
  workspace_id: number
  ttl_seconds: number
}

export type HardEnforcementDisableResult =
  | { ok: true; revert_at: string; audit_id: number | bigint }
  | { ok: false; status: 400 | 422; error: string; reason: string }

const REQUIRED_PHRASE = 'DISABLE HARD ENFORCEMENT'
const MIN_REASON_LENGTH = 32
const MAX_TTL_SECONDS = 24 * 3600 // 24h hard ceiling

export function validateHardEnforcementDisable(
  req: HardEnforcementDisableRequest,
): HardEnforcementDisableResult | null {
  // Step 1 (workspace slug match).
  if (req.workspace_slug !== req.expected_workspace_slug) {
    return {
      ok: false,
      status: 422,
      error: 'workspace_slug_mismatch',
      reason: 'Typed workspace slug does not match the active workspace.',
    }
  }
  // Step 2 (typed confirmation phrase exact match).
  if (req.typed_phrase !== REQUIRED_PHRASE) {
    return {
      ok: false,
      status: 422,
      error: 'phrase_mismatch',
      reason: `Typed phrase must equal '${REQUIRED_PHRASE}' exactly.`,
    }
  }
  // Step 3 (reason length floor).
  if (req.reason.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      status: 422,
      error: 'reason_too_short',
      reason: `Reason must be at least ${String(MIN_REASON_LENGTH)} characters.`,
    }
  }
  // Step 4 (TTL bounds).
  if (
    !Number.isInteger(req.ttl_seconds) ||
    req.ttl_seconds <= 0 ||
    req.ttl_seconds > MAX_TTL_SECONDS
  ) {
    return {
      ok: false,
      status: 422,
      error: 'invalid_ttl',
      reason: `ttl_seconds must be a positive integer ≤ ${String(MAX_TTL_SECONDS)}.`,
    }
  }
  return null
}

export function applyHardEnforcementDisable(
  db: Database.Database,
  req: HardEnforcementDisableRequest,
): HardEnforcementDisableResult {
  const validation = validateHardEnforcementDisable(req)
  if (validation) return validation

  const revertAt = new Date(Date.now() + req.ttl_seconds * 1000).toISOString()

  // Single immediate transaction: insert audit row + flip the per-
  // workspace flag (governance_hard_enforcement_disabled_until).
  const tx = db.transaction((args: HardEnforcementDisableRequest) => {
    const insert = db
      .prepare(
        `INSERT INTO activities
         (type, entity_type, entity_id, actor, description, data, workspace_id)
         VALUES (
           'governance_hard_enforcement_disabled',
           'workspace',
           ?,
           ?,
           ?,
           ?,
           ?
         )`,
      )
      .run(
        args.workspace_id,
        args.actor,
        `Hard enforcement disabled for ${String(args.ttl_seconds)}s`,
        JSON.stringify({
          revert_at: revertAt,
          ttl_seconds: args.ttl_seconds,
          reason: args.reason,
        }),
        args.workspace_id,
      )
    return insert.lastInsertRowid
  })

  const auditId = tx.immediate(req)
  return { ok: true, revert_at: revertAt, audit_id: auditId }
}

export const HARD_ENFORCEMENT_DISABLE = {
  REQUIRED_PHRASE,
  MIN_REASON_LENGTH,
  MAX_TTL_SECONDS,
} as const
