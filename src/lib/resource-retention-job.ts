/**
 * SPEC-008 — Default-on retention sweep nightly job (T206).
 *
 * Per FR-250 / FR-291. The host scheduler calls `runNightlyRetention`
 * at the configured cadence (default 03:30 local). The function is
 * a thin wrapper around `runRetentionSweep`; callers inspect the returned
 * `RetentionSweepResult` and decide how to surface errors.
 *
 * @see specs/008-resource-governance/tasks.md T206
 */

import { runRetentionSweep, type RetentionSweepResult } from '@/lib/resource-retention';
import type Database from 'better-sqlite3';

export function runNightlyRetention(db: Database.Database): RetentionSweepResult {
  return runRetentionSweep(db);
}
