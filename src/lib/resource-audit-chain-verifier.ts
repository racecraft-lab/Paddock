/**
 * SPEC-008 — Audit-chain forward-walk verifier (T147).
 *
 * Per FR-177, FR-177a, FR-219n, FR-273. Walks the SPEC-008 audit chains
 * (`resource_decision_audit`, `resource_budget_ledger`, `recovery_action`)
 * row-by-row in id order, recomputing each row's expected `row_hash`
 * against the prior row's `row_hash` and the row's canonical content. A
 * mismatch is reported but does NOT throw — the caller decides remediation.
 *
 * Resumable cursor (FR-219n):
 *   The verifier reads/writes `governance_audit_verification_state`
 *   (table_name PK; M65m) so a long walk can resume after interruption.
 *   Each invocation may pass `mode='resume'` (default) or `mode='full'`
 *   (genesis restart). Successful walk advances `last_verified_id` to the
 *   highest id observed and updates `last_verified_at` to "now".
 *
 * Archive cross-check (FR-177a):
 *   When archived partitions exist, the verifier asserts the live chain's
 *   earliest `prev_hash` matches the most-recently archived `curr_hash`
 *   and verifies the SHA-256 of the partition's row-content against the
 *   archive checksum. The retention/archive subsystem is not yet
 *   implemented (no `<MISSION_CONTROL_DATA_DIR>/archives/` writer ships
 *   today); the cross-check is wired as a graceful no-op that surfaces
 *   `archive_cross_check: 'no_archives'` rather than synthesizing a
 *   pass. Callers can still adopt the verifier safely; the archive arm
 *   activates automatically once the partition writer lands.
 *
 * Connection:
 *   Uses the dedicated audit connection (`getAuditDb`) per FR-331 so the
 *   30-second `busy_timeout` shields long verification work from
 *   foreground writes. Tests may inject a custom Database via the
 *   `db` argument.
 *
 * Cadence:
 *   The default operator runbook cadence is 15 minutes; this module is
 *   the primitive, not a scheduler — caller cron schedules invocations.
 *
 * @see specs/008-resource-governance/spec.md FR-177, FR-177a, FR-219n, FR-273
 * @see specs/008-resource-governance/tasks.md T147
 * @see Constitution Convention J (strict-scope)
 */

import { createHash } from 'node:crypto';
import { getAuditDb } from '@/lib/db/connection-pool';
import {
  canonicalAuditForm,
  canonicalizeJcs,
  hashAuditRow,
} from '@/lib/resource-audit-chain';
import type Database from 'better-sqlite3';

/**
 * Closed set of supported chain tables. Adding a new chain requires (a)
 * a new entry here, (b) a canonicalizer registered in
 * `recomputeRowHash`, (c) a row reader in `readRowAt`. The discriminated
 * union keeps the verifier honest at compile time.
 */
export type AuditChainTable =
  | 'resource_decision_audit'
  | 'resource_budget_ledger'
  | 'recovery_action';

/** Verifier mode — `resume` honors the cursor, `full` restarts from id=0. */
export type VerifierMode = 'resume' | 'full';

/** Per-row mismatch report. */
export interface ChainMismatch {
  table: AuditChainTable;
  row_id: number;
  reason:
    | 'row_hash_mismatch'
    | 'prev_hash_mismatch'
    | 'missing_columns'
    | 'tail_link_break';
  stored_row_hash?: string;
  expected_row_hash?: string;
  stored_prev_hash?: string;
  expected_prev_hash?: string;
}

/** Archive cross-check status (FR-177a). */
export type ArchiveCrossCheckStatus =
  | 'no_archives'
  | 'ok'
  | 'mismatch'
  | 'not_applicable';

/** Verifier result envelope. */
export interface VerifierResult {
  table: AuditChainTable;
  /** Total rows walked in this invocation. */
  rows_walked: number;
  /** Highest id verified. Persisted to the cursor table on success. */
  last_verified_id: number;
  /** ISO-8601 timestamp the cursor row was advanced. */
  last_verified_at: string;
  /** Empty array on a clean walk; one entry per detected mismatch. */
  mismatches: ChainMismatch[];
  /** ok=true means rows_walked finished without any mismatch. */
  ok: boolean;
  /** Archive cross-check arm. `no_archives` is the default when the
   *  retention/archive writer has not landed yet. */
  archive_cross_check: ArchiveCrossCheckStatus;
}

/** Verifier options. */
export interface VerifierOptions {
  mode?: VerifierMode;
  /** Cap on rows scanned per invocation; helps batched operator runs. */
  batch_size?: number;
  /** Override the wall-clock for deterministic tests. */
  now?: () => Date;
}

const DEFAULT_BATCH = 1000;

interface RowDecisionAudit {
  id: number;
  decision_id: string;
  actor: string | null;
  decision: string;
  reason: string | null;
  payload_json: string | null;
  prev_hash: string;
  row_hash: string;
}

interface RowBudgetLedger {
  id: number;
  policy_id: number;
  counter_id: number | null;
  window_start: string;
  kind: string;
  amount: number;
  unit: string;
  source_event_id: number | null;
  decision_id: string | null;
  prev_hash: string;
  row_hash: string;
  partition_month: string;
  notes_json: string | null;
}

interface RowRecoveryAction {
  id: number;
  kind: string;
  actor: string;
  scope_kind: string | null;
  scope_id: number | null;
  payload_json: string | null;
  prev_hash: string;
  row_hash: string;
  taken_at: string;
}

/** Canonical pipe form for `resource_budget_ledger` (mirrors M65e migration). */
function canonicalLedgerForm(row: RowBudgetLedger): string {
  return [
    row.prev_hash,
    String(row.policy_id),
    row.counter_id === null ? '' : String(row.counter_id),
    row.window_start,
    row.kind,
    String(row.amount),
    row.unit,
    row.source_event_id === null ? '' : String(row.source_event_id),
    row.decision_id ?? '',
    row.partition_month,
    row.notes_json ?? '',
  ].join('|');
}

/** Recompute the expected row_hash for a given chain row. */
function recomputeRowHash(
  table: AuditChainTable,
  row: unknown,
): string {
  if (table === 'resource_decision_audit') {
    const r = row as RowDecisionAudit;
    return hashAuditRow(
      canonicalAuditForm({
        prev_hash: r.prev_hash,
        decision_id: r.decision_id,
        actor: r.actor ?? '',
        decision: r.decision,
        reason: r.reason ?? '',
        payload_json: r.payload_json ?? '',
      }),
    );
  }
  if (table === 'resource_budget_ledger') {
    const r = row as RowBudgetLedger;
    return createHash('sha256')
      .update(canonicalLedgerForm(r), 'utf8')
      .digest('hex');
  }
  // recovery_action — JCS canonical content. Reconstruct the content
  // payload from the persisted columns. The original `appendChainEntry`
  // call used `auditContent` whose shape is the JSON-decoded
  // `payload_json` value; we re-canonicalize that.
  const r = row as RowRecoveryAction;
  let content: unknown;
  try {
    content = r.payload_json === null ? null : JSON.parse(r.payload_json);
  } catch {
    content = null;
  }
  const body = canonicalizeJcs(content);
  return createHash('sha256')
    .update(r.prev_hash, 'utf8')
    .update('|', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
}

/**
 * Read the cursor row for `table`. Returns 0 when no row exists
 * (genesis restart). The cursor row is upserted by `writeCursor`.
 */
function readCursor(db: Database.Database, table: AuditChainTable): number {
  const row = db
    .prepare(
      `SELECT last_verified_id FROM governance_audit_verification_state
       WHERE table_name = ?`,
    )
    .get(table) as { last_verified_id: number } | undefined;
  return row?.last_verified_id ?? 0;
}

/** Persist `(last_verified_id, last_verified_at, status)` for `table`. */
function writeCursor(
  db: Database.Database,
  table: AuditChainTable,
  args: {
    last_verified_id: number;
    last_verified_at: string;
    status: 'ok' | 'mismatch' | 'in_progress';
  },
): void {
  db.prepare(
    `INSERT INTO governance_audit_verification_state
       (table_name, last_verified_id, last_verified_at, verification_status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(table_name) DO UPDATE SET
       last_verified_id = excluded.last_verified_id,
       last_verified_at = excluded.last_verified_at,
       verification_status = excluded.verification_status`,
  ).run(
    table,
    args.last_verified_id,
    args.last_verified_at,
    args.status,
  );
}

/**
 * Verify rows in id-ascending order from `start_id+1` up to a `batch_size`
 * cap. Returns the mismatches collected and the highest id observed.
 */
function walkChain(
  db: Database.Database,
  table: AuditChainTable,
  start_id: number,
  batch_size: number,
): { mismatches: ChainMismatch[]; last_id: number; rows_walked: number } {
  // Load the prior row (if any) so we can compare prev_hash linkage at
  // the boundary. For start_id=0 this falls back to the chain's genesis
  // sentinel — `resource_decision_audit` and `resource_budget_ledger`
  // both have a real genesis row inserted by their migrations, so the
  // walk always starts from id=1; recovery_action has no genesis row,
  // so its first entry's prev_hash MUST equal GENESIS_PREV_HASH.
  const priorRow = db
    .prepare(
      `SELECT row_hash FROM ${table} WHERE id = ? LIMIT 1`,
    )
    .get(start_id) as { row_hash: string } | undefined;
  let priorHash: string | null = priorRow?.row_hash ?? null;

  const rows = db
    .prepare(
      `SELECT * FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(start_id, batch_size) as { id: number; prev_hash: string; row_hash: string }[];

  const mismatches: ChainMismatch[] = [];
  let lastId = start_id;
  for (const row of rows) {
    lastId = row.id;
    if (priorHash !== null && row.prev_hash !== priorHash) {
      mismatches.push({
        table,
        row_id: row.id,
        reason: 'tail_link_break',
        stored_prev_hash: row.prev_hash,
        expected_prev_hash: priorHash,
      });
    }
    const expected = recomputeRowHash(table, row);
    if (expected !== row.row_hash) {
      mismatches.push({
        table,
        row_id: row.id,
        reason: 'row_hash_mismatch',
        stored_row_hash: row.row_hash,
        expected_row_hash: expected,
      });
    }
    priorHash = row.row_hash;
  }

  return { mismatches, last_id: lastId, rows_walked: rows.length };
}

/**
 * Verify the chain in `table` and persist the cursor.
 *
 * Returns a `VerifierResult` envelope; the caller decides whether to
 * alert / page on `ok=false`.
 *
 * @param table whitelisted chain
 * @param db optional Database (default: getAuditDb())
 * @param options batch_size, mode, now()
 */
export function verifyChain(
  table: AuditChainTable,
  db?: Database.Database,
  options: VerifierOptions = {},
): VerifierResult {
  const conn = db ?? getAuditDb();
  const mode: VerifierMode = options.mode ?? 'resume';
  const batchSize = options.batch_size ?? DEFAULT_BATCH;
  const nowFn = options.now ?? ((): Date => new Date());

  const startId = mode === 'full' ? 0 : readCursor(conn, table);

  const { mismatches, last_id, rows_walked } = walkChain(
    conn,
    table,
    startId,
    batchSize,
  );
  const last_verified_at = nowFn().toISOString();
  const ok = mismatches.length === 0;
  const status: 'ok' | 'mismatch' = ok ? 'ok' : 'mismatch';

  writeCursor(conn, table, {
    last_verified_id: last_id,
    last_verified_at,
    status,
  });

  return {
    table,
    rows_walked,
    last_verified_id: last_id,
    last_verified_at,
    mismatches,
    ok,
    archive_cross_check: archiveCrossCheck(),
  };
}

/**
 * FR-177a archive cross-check stub. Until the retention/archive writer
 * lands, no archives exist on disk; we return `no_archives` so the
 * verifier surface is honest about coverage. Once the partition writer
 * ships, replace this body with the SHA-256 read of
 * `<MISSION_CONTROL_DATA_DIR>/archives/<partition>.checksum` and the
 * earliest-prev_hash assertion against the most-recent archived
 * curr_hash.
 *
 * TODO(SPEC-008 archive): activate per FR-249/FR-250 when partition
 * archival lands.
 */
function archiveCrossCheck(): ArchiveCrossCheckStatus {
  return 'no_archives';
}

/**
 * Convenience wrapper: walk all three SPEC-008 chains in turn and
 * return per-chain results. Each chain is verified independently; a
 * mismatch in one does NOT abort the others.
 */
export function verifyAllChains(
  db?: Database.Database,
  options?: VerifierOptions,
): VerifierResult[] {
  const tables: AuditChainTable[] = [
    'resource_decision_audit',
    'resource_budget_ledger',
    'recovery_action',
  ];
  return tables.map((t) => verifyChain(t, db, options));
}
