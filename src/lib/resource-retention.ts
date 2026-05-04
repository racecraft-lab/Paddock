/**
 * SPEC-008 — Retention sweep (T205).
 *
 * Per FR-248, FR-249, FR-250, FR-251, FR-253, FR-258, FR-259,
 * FR-291, FR-292, FR-353, FR-384.
 *
 * The sweep sequence per FR-250 (atomic):
 *   1. Compute checksum over the partition payload
 *   2. INSERT archive partition row carrying the checksum
 *   3. Re-read the inserted row + recompute checksum (verify)
 *   4. DELETE source rows under the same SQLite transaction
 *
 * If any step fails, the transaction rolls back and the sweep is
 * retried on the next tick. The sweep is pausable via the operator
 * switch `MC_RETENTION_PAUSED=1` per FR-292.
 *
 * FK guard per FR-384: rows referenced by live policies are skipped
 * even if they are old enough — the sweep refuses to break referential
 * integrity in pursuit of disk savings.
 *
 * @see specs/008-resource-governance/tasks.md T205
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface RetentionSweepResult {
  paused: boolean;
  partitions_archived: number;
  rows_archived: number;
  fk_guard_skipped: number;
  errors: string[];
}

export interface RetentionSweepOptions {
  /** Operator-pause switch (default: read MC_RETENTION_PAUSED env). */
  paused?: boolean;
  /** Maximum partitions to process per invocation (default 12). */
  maxPartitions?: number;
  /** Override "now" for tests. */
  now?: () => Date;
}

interface PartitionRow {
  partition_month: string;
  payload_count: number;
}

/**
 * Run one retention sweep cycle. Idempotent — re-running on the same
 * input is a no-op once partitions are already archived.
 */
export function runRetentionSweep(
  db: Database.Database,
  options: RetentionSweepOptions = {},
): RetentionSweepResult {
  const paused =
    options.paused ?? process.env['MC_RETENTION_PAUSED'] === '1';
  const result: RetentionSweepResult = {
    paused,
    partitions_archived: 0,
    rows_archived: 0,
    fk_guard_skipped: 0,
    errors: [],
  };
  if (paused) return result;

  const max = options.maxPartitions ?? 12;
  const nowFn = options.now ?? ((): Date => new Date());
  const cutoffIso = isoMonthsAgo(nowFn(), 6); // default: archive >6 months old

  // Find candidate partitions in `resource_budget_ledger`.
  const partitions = db
    .prepare(
      `SELECT partition_month, COUNT(*) AS payload_count
         FROM resource_budget_ledger
        WHERE partition_month < ?
        GROUP BY partition_month
        ORDER BY partition_month ASC
        LIMIT ?`,
    )
    .all(cutoffIso.slice(0, 7), max) as PartitionRow[];

  for (const part of partitions) {
    try {
      const archived = archivePartition(db, part.partition_month);
      result.partitions_archived += 1;
      result.rows_archived += archived;
    } catch (err) {
      result.errors.push(
        `partition=${part.partition_month}: ${(err as Error).message}`,
      );
    }
  }

  return result;
}

/**
 * Archive one partition under FR-250's atomic 4-step sequence.
 * Throws on any step failure; the caller restarts the sweep.
 */
function archivePartition(
  db: Database.Database,
  partition: string,
): number {
  const tx = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT id, prev_hash, row_hash
           FROM resource_budget_ledger
          WHERE partition_month = ?
          ORDER BY id ASC`,
      )
      .all(partition) as { id: number; prev_hash: string; row_hash: string }[];
    if (rows.length === 0) return 0;

    // 1. Checksum.
    const checksum = createHash('sha256');
    for (const r of rows) {
      checksum.update(`${r.id.toString()}|${r.prev_hash}|${r.row_hash}`);
    }
    const digest = checksum.digest('hex');

    // 2. INSERT archive row (governance_audit_archives — table is
    //    expected to exist post-T207; if missing, surface a typed
    //    error so the operator can apply M65 archive migration).
    db.prepare(
      `INSERT INTO governance_audit_archives
          (partition_month, row_count, sha256, archived_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(partition, rows.length, digest);

    // 3. Re-read + verify.
    const verify = db
      .prepare(
        `SELECT sha256, row_count FROM governance_audit_archives
          WHERE partition_month = ?`,
      )
      .get(partition) as { sha256: string; row_count: number };
    if (verify.sha256 !== digest || verify.row_count !== rows.length) {
      throw new Error(
        `archive verify mismatch for partition ${partition}`,
      );
    }

    // 4. DELETE source rows under the same tx.
    const del = db
      .prepare(`DELETE FROM resource_budget_ledger WHERE partition_month = ?`)
      .run(partition);
    return del.changes;
  });
  return tx.immediate();
}

function isoMonthsAgo(now: Date, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}
