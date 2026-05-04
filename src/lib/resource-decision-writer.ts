/**
 * SPEC-008 — Decision row + audit chain writer.
 *
 * Per FR-009, FR-010, FR-005a. The writer:
 *   1. Inserts the decision row into `resource_policy_events` (the
 *      M061-baseline decision-row table extended by M064).
 *   2. Appends one entry to the `resource_decision_audit` hash-chain.
 *   3. Both writes happen inside ONE `db.transaction(() => { ... })` so
 *      the FR-005a atomicity contract holds: a partial commit is
 *      impossible. (FR-010: append-only, no UPDATE.)
 *
 * Hash chain canonical form (matches the M64 genesis migration):
 *   prev_hash | decision_id | actor | decision | reason | payload_json
 * The previous row is the `resource_decision_audit` row with the highest
 * `id` — the chain is a simple linked list with the genesis row inserted
 * by M64. The canonical form is documented at `migrations.ts` line 1891.
 *
 * @see specs/008-resource-governance/spec.md FR-009, FR-010, FR-005a
 * @see src/lib/migrations.ts (064_resource_governance_default_policies
 *      genesis row insert)
 * @see specs/008-resource-governance/tasks.md T059
 */

import {
  canonicalAuditForm as sharedCanonicalAuditForm,
  canonicalizeJcs as sharedCanonicalizeJcs,
  hashAuditRow as sharedHashAuditRow,
} from '@/lib/resource-audit-chain';
import type {
  EvaluatorDecision,
  EvaluatorReason,
} from '@/types/resource-governance';
import type Database from 'better-sqlite3';

/**
 * Input shape passed by the evaluator. Most fields map 1:1 to columns on
 * `resource_policy_events`; `evaluation_snapshot_json` is the FR-025 read
 * snapshot (counters, breaker, window, policy versions) JCS-canonicalized
 * by the caller.
 */
export interface DecisionRecord {
  /** Stable opaque id (e.g., `dec_<ulid>`). Unique across decision rows. */
  decision_id: string;
  task_id: number | null;
  agent_id: number | null;
  workspace_id: number | null;
  decision: EvaluatorDecision;
  reasons: EvaluatorReason[];
  policy_ids: number[];
  precedence_rank: number | null;
  latency_ms: number;
  breaker_state: 'closed' | 'half_open' | 'open';
  evaluation_snapshot_json: string | null;
  /** Optional originating policy id (for legacy `policy_id` column). */
  primary_policy_id: number | null;
  /** Actor that requested the decision (e.g., `system`, `operator:<id>`). */
  actor: string;
}

/** Persisted decision-row id pair. */
export interface PersistedDecision {
  policy_event_id: number;
  audit_id: number;
  audit_row_hash: string;
}

/**
 * Re-exports of frozen audit-chain primitives. Implementation lives in
 * `resource-audit-chain.ts` (T146) so the override-grant audit chain
 * (T138) and recovery-action chain (T148) reuse the same byte-stable
 * canonicalizer / hasher. The byte output is unchanged from the M64
 * genesis migration, so the existing `resource_decision_audit` chain
 * remains valid.
 */
export const canonicalAuditForm = sharedCanonicalAuditForm;
export const hashAuditRow = sharedHashAuditRow;
export const canonicalizeJcs = sharedCanonicalizeJcs;

/**
 * Read the most-recently-appended row's `row_hash` from
 * `resource_decision_audit`. Throws if the chain is empty (the M64 genesis
 * row guarantees at least one row at all times).
 */
function tailAuditHash(db: Database.Database): string {
  const row = db
    .prepare(
      `SELECT row_hash FROM resource_decision_audit ORDER BY id DESC LIMIT 1`,
    )
    .get() as { row_hash: string } | undefined;
  if (row === undefined) {
    throw new Error(
      'resource-decision-writer: missing genesis row — M64 migration must run before any append',
    );
  }
  return row.row_hash;
}

/**
 * Render the canonical "primary reason" string for the audit row. Audit
 * row stores ONE textual reason; the full typed reason list lives in the
 * decision-row JSON. We pick the first reason (the highest-precedence
 * one per FR-002 / FR-029 winner).
 */
function primaryReason(reasons: EvaluatorReason[]): string {
  const first = reasons[0];
  if (first === undefined) return 'unspecified';
  return first.code;
}

/**
 * Build the JSON payload persisted in `resource_decision_audit.payload_json`.
 * This is a JCS-canonical-keys-sorted JSON of the decision shape so chain
 * verifiers can re-hash deterministically.
 */
function auditPayload(rec: DecisionRecord): string {
  // Keys sorted alphabetically so the JSON is canonical.
  const ordered: Record<string, unknown> = {
    agent_id: rec.agent_id,
    decision: rec.decision,
    decision_id: rec.decision_id,
    latency_ms: rec.latency_ms,
    policy_ids: [...rec.policy_ids].sort((a, b) => a - b),
    precedence_rank: rec.precedence_rank,
    reasons: rec.reasons.map((r) => ({ kind: r.kind, code: r.code })),
    task_id: rec.task_id,
    workspace_id: rec.workspace_id,
  };
  return JSON.stringify(ordered);
}

/**
 * Persist the decision row + audit chain entry atomically. Returns the
 * row identifiers and the audit row's `row_hash` for downstream
 * traceability (e.g., the dispatch-feed SSE payload includes the audit
 * pointer per FR-090j).
 *
 * IMPORTANT: caller MUST run this inside a write transaction OR allow
 * `writeDecision` to open one (default behavior when the supplied `db`
 * is not already inside a transaction). The function uses
 * `db.transaction(...)` internally for the atomic guarantee.
 */
export function writeDecision(
  db: Database.Database,
  rec: DecisionRecord,
): PersistedDecision {
  const insertEvent = db.prepare(`
    INSERT INTO resource_policy_events
      (policy_id, task_id, agent_id, decision, reason, observed_value,
       limit_value, metadata, decision_id, actor, details_json,
       prev_hash, row_hash)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
  `);
  const insertAudit = db.prepare(`
    INSERT INTO resource_decision_audit
      (decision_id, workspace_id, actor, decision, reason, payload_json,
       prev_hash, row_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const reasonStr = primaryReason(rec.reasons);
    const detailsJson = JSON.stringify({
      reasons: rec.reasons,
      policy_ids: rec.policy_ids,
      precedence_rank: rec.precedence_rank,
      latency_ms: rec.latency_ms,
      breaker_state: rec.breaker_state,
      evaluation_snapshot: rec.evaluation_snapshot_json,
    });
    const eventResult = insertEvent.run(
      rec.primary_policy_id,
      rec.task_id,
      rec.agent_id,
      rec.decision,
      reasonStr,
      JSON.stringify({ reasons: rec.reasons, policy_ids: rec.policy_ids }),
      rec.decision_id,
      rec.actor,
      detailsJson,
      // Per-row prev/row hash on resource_policy_events is reserved for
      // FR-176 future linking; we leave them empty strings on insert so
      // the column is non-NULL-friendly without claiming chain membership.
      '',
      '',
    );

    const prev = tailAuditHash(db);
    const payload = auditPayload(rec);
    const canonical = canonicalAuditForm({
      prev_hash: prev,
      decision_id: rec.decision_id,
      actor: rec.actor,
      decision: rec.decision,
      reason: reasonStr,
      payload_json: payload,
    });
    const rowHash = hashAuditRow(canonical);
    const auditResult = insertAudit.run(
      rec.decision_id,
      rec.workspace_id,
      rec.actor,
      rec.decision,
      reasonStr,
      payload,
      prev,
      rowHash,
    );

    return {
      policy_event_id: Number(eventResult.lastInsertRowid),
      audit_id: Number(auditResult.lastInsertRowid),
      audit_row_hash: rowHash,
    };
  });

  return tx();
}
