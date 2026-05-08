import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { verifyMissionControlSeed } from '../src/lib/mission-control-seed/evidence.ts'
import { runMissionControlPreflight } from '../src/lib/mission-control-seed/preflight.ts'
import { redactEvidenceValue } from '../src/lib/mission-control-seed/redaction.ts'
import { applyMissionControlSeed } from '../src/lib/mission-control-seed/seed.ts'
import type { Db, SeedMode } from '../src/lib/mission-control-seed/types.ts'

interface CliHarness {
  db?: Db
  contractPath?: string
  write?: (text: string) => void
  writeError?: (text: string) => void
}

interface ParsedArgs {
  dbPath?: string
  contractPath: string
  mode: SeedMode
  json: boolean
  operatorEvidencePath?: string
}

export function runSeedMissionControlCli(args: string[], harness: CliHarness = {}): {
  exitCode: number
  stdout: string
  stderr: string
} {
  const stdout: string[] = []
  const stderr: string[] = []
  const write = harness.write ?? ((text: string) => stdout.push(text))
  const writeError = harness.writeError ?? ((text: string) => stderr.push(text))

  try {
    const parsed = parseArgs(args, harness.contractPath)
    const db = harness.db ?? openDatabase(parsed.dbPath)
    const result = runMode(db, parsed)
    const exitCode = exitCodeForResult(result)
    write(formatOutput(result, parsed.json))
    return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
  } catch (error) {
    const payload = {
      ok: false,
      mode: 'unknown',
      status: 'unexpected_error',
      mutation_status: 'not_mutated',
      error: redactEvidenceValue(error instanceof Error ? error.message : String(error)),
    }
    writeError(JSON.stringify(payload, null, 2))
    return { exitCode: 5, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
  }
}

function runMode(db: Db, parsed: ParsedArgs): unknown {
  const options = {
    contractPath: parsed.contractPath,
    ...(parsed.operatorEvidencePath === undefined ? {} : { operatorEvidencePath: parsed.operatorEvidencePath }),
  }
  switch (parsed.mode) {
    case 'preflight':
      return runMissionControlPreflight(db, options)
    case 'apply':
      return applyMissionControlSeed(db, options)
    case 'verify':
      return verifyMissionControlSeed(db, options)
  }
}

function exitCodeForResult(result: unknown): number {
  if (!result || typeof result !== 'object') return 5
  const record = result as Record<string, unknown>
  if (record['ok'] === true) return 0
  if (record['status'] === 'blocked_preflight') return 2
  if (record['status'] === 'contract_not_ready') return 3
  if (record['status'] === 'verification_failed') return 4
  return 5
}

function parseArgs(args: string[], contractOverride?: string): ParsedArgs {
  const flags = parseFlags(args)
  const mode = flags['mode']
  if (mode !== 'preflight' && mode !== 'apply' && mode !== 'verify') throw new Error('--mode must be preflight, apply, or verify')
  const dbPath = stringFlag(flags['db'])
  if (!dbPath && contractOverride === undefined) throw new Error('--db is required')
  const operatorEvidencePath = stringFlag(flags['operator-evidence'])
  const parsed: ParsedArgs = {
    contractPath: contractOverride ?? stringFlag(flags['contract']) ?? 'docs/ai/workflows/mission-control/workflow-contract.yaml',
    mode,
    json: flags['json'] === true,
  }
  if (dbPath !== undefined) parsed.dbPath = dbPath
  if (operatorEvidencePath !== undefined) parsed.operatorEvidencePath = operatorEvidencePath
  return parsed
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

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function openDatabase(dbPath: string | undefined): Db {
  if (!dbPath) throw new Error('--db is required')
  const resolved = resolve(dbPath)
  if (!existsSync(resolved)) throw new Error(`Database file does not exist: ${resolved}`)
  const db = new Database(resolved, { fileMustExist: true })
  assertRequiredTables(db)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

function assertRequiredTables(db: Db): void {
  const requiredTables = [
    'workspaces',
    'projects',
    'project_agent_assignments',
    'tasks',
    'workflow_templates',
    'workflow_contract_runs',
    'workflow_contract_run_errors',
    'workflow_contract_snapshots',
    'resource_policies',
  ]
  const missing = requiredTables.filter((table) => {
    const row = db.prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
      | { ok: number }
      | undefined
    return !row?.ok
  })
  if (missing.length > 0) throw new Error(`Database missing required tables: ${missing.join(', ')}`)
}

function formatOutput(result: unknown, json: boolean): string {
  if (json) return JSON.stringify(redactEvidenceValue(result), null, 2)
  return JSON.stringify(redactEvidenceValue(result))
}

const currentUrl = pathToFileURL(process.argv[1] ?? '').href
if (import.meta.url === currentUrl) {
  const result = runSeedMissionControlCli(process.argv.slice(2), {
    write: (text) => { console.log(text); },
    writeError: (text) => { console.error(text); },
  })
  process.exitCode = result.exitCode
}
