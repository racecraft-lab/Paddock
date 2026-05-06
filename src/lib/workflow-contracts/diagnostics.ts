import type { WorkflowContractDiff, WorkflowContractError, WorkflowContractRunMode, WorkflowContractRunStatus, WorkflowContractMutationStatus } from './types.ts'
import type Database from 'better-sqlite3'

interface CreateRunOptions {
  family: string
  workspaceId: number
  mode: WorkflowContractRunMode
  status: WorkflowContractRunStatus
  mutationStatus: WorkflowContractMutationStatus
  sourcePath?: string
  exportPath?: string
  contractHash?: string
  diff?: WorkflowContractDiff
  errorCount?: number
  lkgSnapshotId?: number
  recoveryCommand?: string
}

export function createWorkflowContractRun(db: Database.Database, options: CreateRunOptions): number {
  const result = db.prepare(`
    INSERT INTO workflow_contract_runs (
      family, workspace_id, mode, status, mutation_status, source_path, export_path,
      contract_hash, diff_json, template_counts_json, error_count, lkg_snapshot_id,
      recovery_command, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    options.family,
    options.workspaceId,
    options.mode,
    options.status,
    options.mutationStatus,
    options.sourcePath ?? null,
    options.exportPath ?? null,
    options.contractHash ?? null,
    JSON.stringify(options.diff ?? {}),
    JSON.stringify(countDiff(options.diff)),
    options.errorCount ?? 0,
    options.lkgSnapshotId ?? null,
    options.recoveryCommand ?? null
  )
  return Number(result.lastInsertRowid)
}

export function recordWorkflowContractErrors(db: Database.Database, runId: number, errors: WorkflowContractError[]): void {
  const insert = db.prepare(`
    INSERT INTO workflow_contract_run_errors (
      run_id, code, manifest_path, canonical_model_path, template_slug, message, remediation_hint, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const error of errors) {
    insert.run(
      runId,
      error.code,
      error.manifest_path ?? null,
      error.canonical_model_path ?? null,
      error.template_slug ?? null,
      error.message,
      error.remediation_hint,
      error.details ?? null
    )
  }
  db.prepare('UPDATE workflow_contract_runs SET error_count = ? WHERE id = ?').run(errors.length, runId)
}

export function getWorkflowContractDiagnostics(
  db: Database.Database,
  options: { family: string; workspaceId: number; limit?: number }
) {
  const runs = db.prepare(`
    SELECT * FROM workflow_contract_runs
    WHERE family = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(options.family, options.workspaceId, options.limit ?? 20) as (Record<string, unknown> & { id: number })[]
  const errorsByRun = new Map<number, unknown[]>()
  if (runs.length > 0) {
    const ids = runs.map(run => run.id)
    const rows = db.prepare(`
      SELECT * FROM workflow_contract_run_errors
      WHERE run_id IN (${ids.map(() => '?').join(',')})
      ORDER BY id ASC
    `).all(...ids) as (Record<string, unknown> & { run_id: number })[]
    for (const row of rows) {
      const list = errorsByRun.get(row.run_id) ?? []
      list.push(row)
      errorsByRun.set(row.run_id, list)
    }
  }
  return {
    runs: runs.map(run => ({
      ...run,
      diff: parseJson(run['diff_json'], {}),
      template_counts: parseJson(run['template_counts_json'], {}),
      errors: errorsByRun.get(run.id) ?? [],
    })),
  }
}

function countDiff(diff?: WorkflowContractDiff): Record<string, number> {
  return {
    create: diff?.create.length ?? 0,
    update: diff?.update.length ?? 0,
    disable: diff?.disable.length ?? 0,
    unchanged: diff?.unchanged.length ?? 0,
    unrelated: diff?.unrelated.length ?? 0,
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
