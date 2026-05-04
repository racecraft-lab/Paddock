/**
 * SPEC-008 — Unified `appendChainEntry` for JCS-form governance chains (T148).
 *
 * Per FR-368, FR-219o. This module is the single home for the
 * append-then-hash primitive used by every JCS-form governance audit
 * chain. Chains supported:
 *
 *   - `recovery_action` (operator override-grant audit, recovery actions,
 *     governance state transitions). Genesis seed is `GENESIS_PREV_HASH`.
 *
 * Chains explicitly NOT covered (frozen pipe-form):
 *
 *   - `resource_decision_audit` — uses `canonicalAuditForm` from
 *     `resource-audit-chain.ts`. The M64 genesis row's hash was computed
 *     against the pipe-delimited byte form and is locked. Replacing the
 *     canonicalizer with JCS would invalidate the entire chain. The
 *     verifier (T147) walks this chain with the pipe-form primitives.
 *   - `resource_budget_ledger` — uses `canonicalLedgerForm` from
 *     `resource-budget-ledger.ts`. The M65e genesis row hash is locked
 *     against that pipe-form. Same reasoning.
 *
 * `aegis_fallback_activity` (M68/M69) is NOT a hash-chained table — it has
 * neither `prev_hash` nor `row_hash` columns. It is a de-dup ledger only.
 *
 * Why two canonical forms coexist:
 *   The pre-existing chains were sealed by the M64 / M65e genesis migrations.
 *   The post-Phase-7 chains (recovery_action, future override audit) use the
 *   FR-368 canonical JSON form so the verifier can rehash arbitrary JSON
 *   payloads. The asymmetry is intentional and documented here so the next
 *   reader does NOT try to "unify" them and break the genesis hashes.
 *
 * Atomicity:
 *   Every caller passes a Database handle that MUST already be inside a
 *   write transaction (`db.transaction(fn).immediate(args)`). This module
 *   does NOT open its own transaction — the chain's prev/row linkage is
 *   only race-safe when the caller holds the SQLite RESERVED lock.
 *
 * @see specs/008-resource-governance/spec.md FR-368, FR-219o
 * @see specs/008-resource-governance/tasks.md T148
 * @see Constitution Convention J (strict-scope: governance-*.ts)
 */

import {
  chainHash,
  GENESIS_PREV_HASH,
} from '@/lib/resource-audit-chain';
import type Database from 'better-sqlite3';

/**
 * Closed set of tables this module supports. Adding a new chain means
 * (a) adding the table here, (b) ensuring that table's tail-row reader
 * is registered in TAIL_READERS, and (c) ensuring rows are persisted via
 * `appendChainEntry` so the prev/row hashes remain consistent.
 *
 * NOTE: `resource_decision_audit` and `resource_budget_ledger` are NOT in
 * this set — they are frozen pipe-form chains.
 */
export type JcsChainTable = 'recovery_action';

/**
 * Result returned by `appendChainEntry`. The caller persists the row
 * separately; this primitive only returns the hashes that the row's
 * `prev_hash` / `row_hash` columns must carry.
 */
export interface ChainEntryHashes {
  /** Tail row hash at the time of insert. The row's `prev_hash` column. */
  prev_hash: string;
  /** SHA-256 hex of `prev_hash | canonicalizeJcs(content)`. The row's `row_hash`. */
  row_hash: string;
}

/**
 * Read the most-recent `row_hash` from the chain table. Empty chain
 * returns `GENESIS_PREV_HASH`. Reads are bound to the supplied
 * connection so they participate in the caller's open transaction.
 */
function readTailHash(
  db: Database.Database,
  table: JcsChainTable,
): string {
  // Whitelisted via the JcsChainTable union; this string is interpolated
  // verbatim into SQL. The union is exported so a typo at the call site
  // becomes a compile error.
  const row = db
    .prepare(`SELECT row_hash FROM ${table} ORDER BY id DESC LIMIT 1`)
    .get() as { row_hash: string } | undefined;
  if (row === undefined) return GENESIS_PREV_HASH;
  return row.row_hash;
}

/**
 * Compute the prev/row hashes for a NEW JCS-form chain entry. The caller
 * is responsible for INSERTing the row with these hashes and any other
 * table-specific columns; this function intentionally does NOT issue the
 * INSERT so callers retain control of column shape (e.g., `recovery_action`
 * carries `kind`, `actor`, `scope_kind`, `scope_id`, `payload_json`,
 * `taken_at` in addition to the chain columns).
 *
 * Contract:
 *   - `db` MUST already be inside a write transaction.
 *   - `content` is canonicalized via `canonicalizeJcs` (RFC-8785 style)
 *     before hashing. Object keys are sorted lexicographically; arrays
 *     preserve order; non-finite numbers / functions / symbols throw.
 *   - The returned `prev_hash` is the previous row's `row_hash` (or
 *     `GENESIS_PREV_HASH` for the first entry).
 *
 * Concurrency:
 *   - Inside the BEGIN IMMEDIATE held by the caller, no other writer can
 *     advance the chain between `readTailHash` and the caller's INSERT.
 *   - When two writers contend pre-BEGIN, SQLite serializes them and the
 *     second sees the first's tail.
 */
export function appendChainEntry(
  table: JcsChainTable,
  content: unknown,
  db: Database.Database,
): ChainEntryHashes {
  const prev_hash = readTailHash(db, table);
  const row_hash = chainHash(prev_hash, content);
  return { prev_hash, row_hash };
}

/**
 * Re-export so callers that only need the genesis sentinel do not have
 * to also import `resource-audit-chain`.
 */
export { GENESIS_PREV_HASH };
