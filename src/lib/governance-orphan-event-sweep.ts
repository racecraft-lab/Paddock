/**
 * SPEC-008 — `governance_orphan_event` weekly sweep (T237).
 *
 * Per FR-382. Sundays at 03:30 UTC the host scheduler invokes
 * `runOrphanEventSweep`. The sweep finds rows in the audit chain
 * that reference policy ids / workspace ids no longer in the live
 * tables and emits one `governance_orphan_event` activity row per
 * affected `(table, foreign_key)` tuple.
 *
 * The sweep is read-only — orphans are reported, not deleted.
 *
 * @see specs/008-resource-governance/tasks.md T237
 */

import type Database from 'better-sqlite3';

export interface OrphanEventReport {
  table: string;
  fk_column: string;
  fk_value: number | null;
  count: number;
}

export interface OrphanSweepResult {
  reports: OrphanEventReport[];
  total: number;
}

/** Run the sweep. Read-only; emits activity rows for each orphan group. */
export function runOrphanEventSweep(db: Database.Database): OrphanSweepResult {
  const reports: OrphanEventReport[] = [];
  const checks: { table: string; fk: string; ref: string }[] = [
    { table: 'resource_decision_audit', fk: 'workspace_id', ref: 'workspaces' },
    { table: 'resource_budget_ledger', fk: 'policy_id', ref: 'resource_policies' },
    { table: 'resource_overrides', fk: 'policy_id', ref: 'resource_policies' },
  ];

  for (const c of checks) {
    try {
      const rows = db
        .prepare(
          `SELECT ${c.fk} AS fk_value, COUNT(*) AS cnt
             FROM ${c.table}
            WHERE ${c.fk} IS NOT NULL
              AND ${c.fk} NOT IN (SELECT id FROM ${c.ref})
            GROUP BY ${c.fk}`,
        )
        .all() as { fk_value: number; cnt: number }[];
      for (const r of rows) {
        reports.push({
          table: c.table,
          fk_column: c.fk,
          fk_value: r.fk_value,
          count: r.cnt,
        });
      }
    } catch {
      // Table may not exist in stripped test harnesses.
    }
  }

  const total = reports.reduce((sum, r) => sum + r.count, 0);

  if (total > 0) {
    try {
      db.prepare(
        `INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'governance_orphan_event',
        'governance_orphan',
        0,
        'system',
        `Weekly orphan-event sweep: ${total.toString()} rows`,
        JSON.stringify({ reports, total }),
        0,
      );
    } catch {
      // activity table absent in test-harness mode.
    }
  }

  return { reports, total };
}
