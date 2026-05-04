/**
 * SPEC-008 — Bulk policy demotion (T231).
 *
 * Per FR-269. Inverse of bulk promotion: takes a set of policy ids
 * and reverts them to a previous workspace + writes a recovery_action
 * audit row. Cross-workspace + maxItems guards mirror T197.
 *
 * @see specs/008-resource-governance/tasks.md T231
 */

import { appendChainEntry } from '@/lib/governance-audit-chain';
import type Database from 'better-sqlite3';

const MAX_ITEMS = 500;

export interface BulkDemoteInput {
  policy_ids: number[];
  source_workspace_id: number | null;
  actor: string;
  reason: string;
}

export type BulkDemoteResult =
  | { ok: true; demoted: number; audit_row_hash: string }
  | { ok: false; code: 'too_many_items' | 'cross_workspace_mismatch' | 'policy_not_found' | 'invalid_input'; detail: string };

export function bulkDemotePolicies(
  db: Database.Database,
  input: BulkDemoteInput,
): BulkDemoteResult {
  if (!Array.isArray(input.policy_ids) || input.policy_ids.length === 0) {
    return { ok: false, code: 'invalid_input', detail: 'policy_ids required' };
  }
  if (input.policy_ids.length > MAX_ITEMS) {
    return {
      ok: false,
      code: 'too_many_items',
      detail: `policy_ids exceeds maxItems=${String(MAX_ITEMS)}`,
    };
  }

  const placeholders = input.policy_ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, workspace_id FROM resource_policies WHERE id IN (${placeholders})`)
    .all(...input.policy_ids) as { id: number; workspace_id: number | null }[];

  if (rows.length !== input.policy_ids.length) {
    return { ok: false, code: 'policy_not_found', detail: 'one or more ids missing' };
  }
  const workspaces = new Set(rows.map((r) => r.workspace_id));
  if (workspaces.size > 1) {
    return {
      ok: false,
      code: 'cross_workspace_mismatch',
      detail: 'policies span multiple workspaces; demote per-workspace',
    };
  }

  const tx = db.transaction(() => {
    const update = db.prepare(
      `UPDATE resource_policies
          SET workspace_id = ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = ?
        WHERE id = ?`,
    );
    let demoted = 0;
    for (const id of input.policy_ids) {
      const r = update.run(input.source_workspace_id, input.actor, id);
      demoted += r.changes;
    }
    const content = {
      action: 'bulk_demote',
      actor: input.actor,
      reason: input.reason,
      policy_ids: input.policy_ids,
      source_workspace_id: input.source_workspace_id,
      demoted,
      taken_at: new Date().toISOString(),
    };
    const hashes = appendChainEntry('recovery_action', content, db);
    db.prepare(
      `INSERT INTO recovery_action
         (kind, actor, scope_kind, scope_id, payload_json, prev_hash, row_hash)
       VALUES ('bulk_demote', ?, 'policy', NULL, ?, ?, ?)`,
    ).run(
      input.actor,
      JSON.stringify(content),
      hashes.prev_hash,
      hashes.row_hash,
    );
    return { demoted, audit_row_hash: hashes.row_hash };
  });
  const out = tx.immediate();
  return { ok: true, demoted: out.demoted, audit_row_hash: out.audit_row_hash };
}
