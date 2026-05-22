import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { MISSION_CONTROL_SEED_DEFAULTS } from '../src/lib/product-line-seed/types.ts'
import {
  runSeedProductLineCliWithDefaults,
  type GenericSeedCliResult,
  type GenericSeedCliDefaults,
} from './seed-product-line.ts'
import type { ProductLineSeedDatabase } from '../src/lib/product-line-seed/types.ts'

export interface CliHarness extends Pick<GenericSeedCliDefaults, 'db'> {
  contractPath?: string
}

export function runSeedMissionControlCli(args: string[], harness: CliHarness = {}): GenericSeedCliResult {
  return runSeedMissionControlCliInternal(args, harness, false)
}

const currentUrl = pathToFileURL(process.argv[1] ?? '').href
if (import.meta.url === currentUrl) {
  const result = runSeedMissionControlCliInternal(process.argv.slice(2), {}, true)
  process.exitCode = result.exitCode
}

function runSeedMissionControlCliInternal(
  args: string[],
  harness: CliHarness,
  writeOutput: boolean,
): GenericSeedCliResult {
  const normalizedArgs = stripLegacyContractFlag(args)
  const argsWithDb = harness.db && !hasFlag(normalizedArgs, 'db') ? ['--db', ':memory:', ...normalizedArgs] : normalizedArgs
  let db = harness.db
  let ownsDb = false

  try {
    if (!db) {
      const dbPath = stringFlagValue(argsWithDb, 'db')
      if (dbPath) {
        db = openDatabase(dbPath)
        ownsDb = true
      }
    }
    return runSeedProductLineCliWithDefaults(argsWithDb, {
      entrypoint: 'seed:mission-control',
      configPath: MISSION_CONTROL_SEED_DEFAULTS.configPath,
      ...(db === undefined ? {} : { db }),
    }, writeOutput)
  } catch (error) {
    const result = unexpectedErrorResult(error)
    if (writeOutput) console.error(result.stderr)
    return result
  } finally {
    if (ownsDb) db?.close()
  }
}

function stripLegacyContractFlag(args: string[]): string[] {
  const stripped: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--contract') {
      index += 1
      continue
    }
    stripped.push(args[index] ?? '')
  }
  return stripped
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`)
}

function stringFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(`--${flag}`)
  const next = index >= 0 ? args[index + 1] : undefined
  return next && !next.startsWith('--') ? next : undefined
}

function openDatabase(dbPath: string): ProductLineSeedDatabase {
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

function assertRequiredTables(db: ProductLineSeedDatabase): void {
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

function unexpectedErrorResult(error: unknown): GenericSeedCliResult {
  const payload = {
    ok: false,
    mode: 'unknown',
    status: 'unexpected_error',
    mutation_status: 'not_mutated',
    error: error instanceof Error ? error.message : String(error),
  }
  return {
    exitCode: 5,
    stdout: '',
    stderr: JSON.stringify(payload, null, 2),
  }
}
