import { computeTemplateHashes, sha256, stableStringify } from './hash.ts'
import type { WorkflowContract, WorkflowContractDiff, WorkflowContractError, WorkflowContractRunMode, WorkflowContractRunStatus, WorkflowContractMutationStatus, WorkflowContractTemplate } from './types.ts'
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
  const latestSnapshot = readLatestSnapshot(db, options)
  const diagnosticRuns = runs.map(run => {
    const templateCounts = parseJson<Record<string, number>>(run['template_counts_json'], {})
    return {
      ...run,
      source_paths: typeof run['source_path'] === 'string' && run['source_path'].length > 0 ? [run['source_path']] : [],
      export_artifact_path: run['export_path'] ?? null,
      snapshot_id: run['lkg_snapshot_id'] ?? null,
      diff: parseJson(run['diff_json'], {}),
      diff_summary: summarizeCounts(templateCounts),
      template_counts: templateCounts,
      hashes: buildHashSet(latestSnapshot?.canonical_json, typeof run['contract_hash'] === 'string' ? run['contract_hash'] : null),
      errors: errorsByRun.get(run.id) ?? [],
    }
  })
  return {
    family: options.family,
    workspace_id: options.workspaceId,
    runs: diagnosticRuns,
    errors: diagnosticRuns[0]?.errors ?? [],
    last_run: diagnosticRuns[0] ?? null,
    last_known_good_available: Boolean(latestSnapshot),
    last_successful_apply: readLastSuccessfulApply(db, options),
  }
}

function countDiff(diff?: WorkflowContractDiff): Record<string, number> {
  return {
    create: diff?.create.length ?? 0,
    update: diff?.update.length ?? 0,
    disable: diff?.disable.length ?? 0,
    unchanged: diff?.unchanged.length ?? 0,
    unrelated: diff?.unrelated.length ?? 0,
    conflicts: diff?.conflicts.length ?? 0,
  }
}

function summarizeCounts(templateCounts: Record<string, number>) {
  return {
    creates: templateCounts['create'] ?? 0,
    updates: templateCounts['update'] ?? 0,
    disables: templateCounts['disable'] ?? 0,
    noops: templateCounts['unchanged'] ?? 0,
    unrelated_preserved: templateCounts['unrelated'] ?? 0,
    conflicts: templateCounts['conflicts'] ?? 0,
  }
}

function readLatestSnapshot(db: Database.Database, options: { family: string; workspaceId: number }) {
  return db.prepare(`
    SELECT id, contract_hash, canonical_json, created_at
    FROM workflow_contract_snapshots
    WHERE family = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(options.family, options.workspaceId) as { id: number; contract_hash: string; canonical_json: string; created_at: string } | undefined
}

function readLastSuccessfulApply(db: Database.Database, options: { family: string; workspaceId: number }) {
  const row = db.prepare(`
    SELECT id, contract_hash, lkg_snapshot_id, recovery_command, created_at, completed_at
    FROM workflow_contract_runs
    WHERE family = ? AND workspace_id = ? AND mode = 'import_apply' AND status = 'success'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(options.family, options.workspaceId) as {
    id: number
    contract_hash: string | null
    lkg_snapshot_id: number | null
    recovery_command: string | null
    created_at: string
    completed_at: string | null
  } | undefined
  if (!row) return null
  return {
    run_id: row.id,
    snapshot_id: row.lkg_snapshot_id,
    canonical_object_hash: row.contract_hash,
    recovery_command: row.recovery_command,
    created_at: row.created_at,
    completed_at: row.completed_at,
  }
}

function buildHashSet(canonicalJson: string | undefined, fallbackContractHash: string | null) {
  const empty = {
    canonical_object_hash: fallbackContractHash,
    template_hashes: {},
    routing_rule_hashes: {},
    output_schema_hashes: {},
  }
  if (!canonicalJson) return empty
  try {
    const contract = JSON.parse(canonicalJson) as WorkflowContract
    const templateHashes: Record<string, string> = {}
    const routingRuleHashes: Record<string, string> = {}
    const outputSchemaHashes: Record<string, string> = {}
    for (const template of Array.isArray(contract.templates) ? contract.templates : []) {
      if (!isContractTemplate(template)) continue
      templateHashes[template.slug] = `sha256:${sha256(stableStringify(template))}`
      const hashes = computeTemplateHashes(template)
      routingRuleHashes[template.slug] = hashes.routing_rule_hash
      outputSchemaHashes[template.slug] = hashes.output_schema_hash
    }
    return {
      canonical_object_hash: fallbackContractHash,
      template_hashes: templateHashes,
      routing_rule_hashes: routingRuleHashes,
      output_schema_hashes: outputSchemaHashes,
    }
  } catch {
    return empty
  }
}

function isContractTemplate(value: unknown): value is WorkflowContractTemplate {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof (value as { slug?: unknown }).slug === 'string'
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
