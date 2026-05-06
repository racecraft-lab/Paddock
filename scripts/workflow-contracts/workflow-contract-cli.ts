import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_WORKFLOW_CONTRACT_EXPORT_PATH, DEFAULT_WORKFLOW_CONTRACT_FAMILY } from '../../src/lib/workflow-contracts/types.ts'

export type WorkflowContractCliCommand =
  | { command: 'import'; mode: 'dry-run' | 'apply'; file: string; workspaceId?: number }
  | { command: 'export'; output: string; workspaceId: number; family: string }
  | { command: 'recover'; mode: 'dry-run' | 'apply'; workspaceId: number; family: string }

export function parseWorkflowContractCliArgs(args: string[]): WorkflowContractCliCommand {
  const [command, ...rest] = args
  const flags = parseFlags(rest)
  if (command === 'import') {
    rejectUnknownFlags(flags, ['file', 'source', 'workspace-id', 'workspace', 'apply', 'dry-run', 'json'])
    const apply = flags.apply === true
    const dryRun = flags['dry-run'] === true
    if (apply && dryRun) throw new Error('--apply and --dry-run are mutually exclusive')
    const workspaceId = parseOptionalWorkspaceId(flags)
    return {
      command,
      mode: apply ? 'apply' : 'dry-run',
      file: resolveImportFileFlag(flags),
      ...(workspaceId === undefined ? {} : { workspaceId }),
    }
  }
  if (command === 'export') {
    rejectUnknownFlags(flags, ['output', 'workspace-id', 'workspace', 'family', 'json'])
    return {
      command,
      output: String(flags.output ?? DEFAULT_WORKFLOW_CONTRACT_EXPORT_PATH),
      workspaceId: parseWorkspaceId(flags),
      family: parseFamily(flags.family),
    }
  }
  if (command === 'recover') {
    rejectUnknownFlags(flags, ['workspace-id', 'workspace', 'family', 'snapshot', 'apply', 'dry-run', 'json'])
    if (flags.snapshot !== undefined && flags.snapshot !== 'latest') throw new Error('snapshot must be latest')
    const apply = flags.apply === true
    const dryRun = flags['dry-run'] === true
    if (apply && dryRun) throw new Error('--apply and --dry-run are mutually exclusive')
    return {
      command,
      mode: apply ? 'apply' : 'dry-run',
      workspaceId: parseWorkspaceId(flags),
      family: parseFamily(flags.family),
    }
  }
  throw new Error('Usage: pnpm workflow-contract <import|export|recover> [--file path] [--dry-run|--apply]')
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg?.startsWith('--')) continue
    const key = arg.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      index += 1
    }
  }
  return flags
}

function rejectUnknownFlags(flags: Record<string, string | boolean>, allowed: string[]): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(flags)) {
    if (!allowedSet.has(key)) throw new Error(`Unknown flag --${key}`)
  }
}

function parseWorkspaceId(flags: Record<string, string | boolean>): number {
  return parseOptionalWorkspaceId(flags) ?? 1
}

function parseOptionalWorkspaceId(flags: Record<string, string | boolean>): number | undefined {
  const value = flags['workspace-id'] ?? flags.workspace
  if (value == null) return undefined
  if (value === true) throw new Error('workspace-id must be a positive integer')
  const workspaceId = Number(value)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) throw new Error('workspace-id must be a positive integer')
  return workspaceId
}

function parseFamily(value: string | boolean | undefined): string {
  if (value === undefined) return DEFAULT_WORKFLOW_CONTRACT_FAMILY
  if (value === true || value !== DEFAULT_WORKFLOW_CONTRACT_FAMILY) throw new Error(`family must be ${DEFAULT_WORKFLOW_CONTRACT_FAMILY}`)
  return value
}

function resolveImportFileFlag(flags: Record<string, string | boolean>): string {
  const explicitFile = flags.file
  if (explicitFile != null && explicitFile !== true) return String(explicitFile)
  const source = flags.source
  if (source != null && source !== true) {
    const sourcePath = String(source)
    return /\.ya?ml$/i.test(sourcePath) ? sourcePath : join(sourcePath, 'workflow-contract.yaml')
  }
  return 'docs/ai/workflows/mission-control/workflow-contract.yaml'
}

async function main(): Promise<number> {
  try {
    const parsed = parseWorkflowContractCliArgs(process.argv.slice(2))
    const [{ loadWorkflowContractFromFile }, { importWorkflowContract }, { exportWorkflowContractMarkdown }, { recoverLastKnownGood }] = await Promise.all([
      import(tsModule('../../src/lib/workflow-contracts/yaml-loader.ts')),
      import(tsModule('../../src/lib/workflow-contracts/importer.ts')),
      import(tsModule('../../src/lib/workflow-contracts/exporter.ts')),
      import(tsModule('../../src/lib/workflow-contracts/recovery.ts')),
    ])
    const db = openWorkflowContractDatabase()
    if (parsed.command === 'import') {
      const contract = loadWorkflowContractFromFile(parsed.file)
      const result = importWorkflowContract(db, { ...contract, workspace_id: parsed.workspaceId ?? contract.workspace_id }, { mode: parsed.mode, sourcePath: parsed.file })
      console.log(JSON.stringify(result, null, 2))
      return result.ok ? 0 : 3
    }
    if (parsed.command === 'export') {
      const result = exportWorkflowContractMarkdown(db, { family: parsed.family, workspaceId: parsed.workspaceId, exportPath: parsed.output })
      mkdirSync(dirname(parsed.output), { recursive: true })
      writeFileSync(parsed.output, result.markdown)
      console.log(JSON.stringify({ ok: true, output: parsed.output, contract_hash: result.contract_hash, diagnostics_run_id: result.diagnostics_run_id }, null, 2))
      return 0
    }
    const result = recoverLastKnownGood(db, { family: parsed.family, workspaceId: parsed.workspaceId, mode: parsed.mode })
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 3
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2))
    return 2
  }
}

function openWorkflowContractDatabase(): Database.Database {
  const dbPath = resolveDatabasePath()
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  ensureWorkflowContractCliSchema(db)
  return db
}

function resolveDatabasePath(): string {
  if (process.env.MISSION_CONTROL_DB_PATH) return resolve(process.env.MISSION_CONTROL_DB_PATH)
  const dataDir = process.env.MISSION_CONTROL_DATA_DIR
    ? resolve(process.env.MISSION_CONTROL_DATA_DIR)
    : resolve(process.cwd(), '.data')
  return join(dataDir, 'mission-control.db')
}

function ensureWorkflowContractCliSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      task_prompt TEXT NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 300,
      agent_role TEXT,
      tags TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
  `)

  addColumnIfMissing(db, 'workflow_templates', 'workspace_id', 'workspace_id INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'workflow_templates', 'slug', 'slug TEXT')
  addColumnIfMissing(db, 'workflow_templates', 'output_schema', 'output_schema TEXT')
  addColumnIfMissing(db, 'workflow_templates', 'routing_rules', 'routing_rules TEXT')
  addColumnIfMissing(db, 'workflow_templates', 'next_template_slug', 'next_template_slug TEXT')
  addColumnIfMissing(db, 'workflow_templates', 'produces_pr', 'produces_pr INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(db, 'workflow_templates', 'external_terminal_event', 'external_terminal_event TEXT')
  addColumnIfMissing(db, 'workflow_templates', 'allow_redacted_artifacts', 'allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(db, 'workflow_templates', 'enabled', 'enabled INTEGER NOT NULL DEFAULT 1')
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_workspace_slug
      ON workflow_templates(workspace_id, slug)
      WHERE slug IS NOT NULL;

    CREATE TABLE IF NOT EXISTS workflow_contract_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      mutation_status TEXT NOT NULL,
      source_path TEXT,
      export_path TEXT,
      contract_hash TEXT,
      routing_hashes_json TEXT,
      output_schema_hashes_json TEXT,
      diff_json TEXT NOT NULL DEFAULT '{}',
      template_counts_json TEXT NOT NULL DEFAULT '{}',
      error_count INTEGER NOT NULL DEFAULT 0,
      lkg_snapshot_id INTEGER,
      recovery_command TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_contract_run_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_contract_runs(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      manifest_path TEXT,
      canonical_model_path TEXT,
      template_slug TEXT,
      message TEXT NOT NULL,
      remediation_hint TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_contract_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      contract_hash TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      runtime_templates_json TEXT NOT NULL,
      recovery_command TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_contract_runs_family_workspace_created
      ON workflow_contract_runs(family, workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_contract_errors_run
      ON workflow_contract_run_errors(run_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_contract_snapshots_family_workspace_created
      ON workflow_contract_snapshots(family, workspace_id, created_at DESC);
  `)
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }
}

function tsModule(relativePath: string): string {
  return new URL(relativePath, import.meta.url).href
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main()
}
