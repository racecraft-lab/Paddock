/**
 * SPEC-008 — Post-restore audit-chain verifier (T204).
 *
 * Per FR-219q / FR-273. After a restore from a backup, the audit
 * chain MUST be verified before hard enforcement is re-armed. The
 * function returns a result envelope; on `ok=false`, the caller
 * MUST require an admin to type `ACCEPT AUDIT CHAIN BREAK` before
 * re-enabling enforcement (FR-219q).
 *
 * @see specs/008-resource-governance/tasks.md T204
 */

import { verifyAllChains, type VerifierResult } from '@/lib/resource-audit-chain-verifier';
import type Database from 'better-sqlite3';

export interface PostRestoreVerificationResult {
  ok: boolean;
  per_chain: VerifierResult[];
  hard_enforcement_blocked: boolean;
  required_action: 'none' | 'admin_typed_acceptance';
}

/**
 * Run a full-mode verification across all SPEC-008 chains. Returns
 * a result envelope the caller stamps onto the recovery_action row.
 */
export function verifyAfterRestore(
  db?: Database.Database,
): PostRestoreVerificationResult {
  const results = verifyAllChains(db, { mode: 'full' });
  const allOk = results.every((r) => r.ok);
  return {
    ok: allOk,
    per_chain: results,
    hard_enforcement_blocked: !allOk,
    required_action: allOk ? 'none' : 'admin_typed_acceptance',
  };
}
