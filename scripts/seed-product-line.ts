import { pathToFileURL } from 'node:url'
import { runProductLineSeed } from '../src/lib/product-line-seed/seed.ts'
import {
  MISSION_CONTROL_SEED_DEFAULTS,
  PRODUCT_LINE_SEED_MODES,
  PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
  type ProductLineSeedMode,
  type ProductLineSeedResultEnvelope,
} from '../src/lib/product-line-seed/types.ts'

export interface GenericSeedCliResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface GenericSeedCliDefaults {
  entrypoint?: 'seed:product-line' | 'seed:mission-control'
  configPath?: string
  db?: Parameters<typeof runProductLineSeed>[0]['db']
}

export function runSeedProductLineCli(args: string[], writeOutput = false): GenericSeedCliResult {
  return runSeedProductLineCliWithDefaults(args, {}, writeOutput)
}

export function runSeedProductLineCliWithDefaults(
  args: string[],
  defaults: GenericSeedCliDefaults,
  writeOutput = false,
): GenericSeedCliResult {
  const parsed = parseArgs(args, defaults)
  if (!parsed.ok) {
    const envelope = cliErrorEnvelope(parsed.message, defaults)
    return emit(envelope, writeOutput)
  }
  return emit(runProductLineSeed(parsed.options), writeOutput)
}

function parseArgs(args: string[], defaults: GenericSeedCliDefaults):
  | { ok: true; options: Parameters<typeof runProductLineSeed>[0] }
  | { ok: false; message: string } {
  const flags = new Map<string, string | true>()
  const knownFlags = new Set(['allow-existing', 'config', 'db', 'json', 'mode', 'operator-evidence'])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') continue
    if (!arg?.startsWith('--')) return { ok: false, message: `Unexpected positional argument: ${arg ?? ''}` }
    const key = arg.slice(2)
    if (!knownFlags.has(key)) return { ok: false, message: `Unknown flag: --${key}` }
    const next = args[index + 1]
    if (key === 'json' || key === 'allow-existing' || !next || next.startsWith('--')) {
      flags.set(key, true)
    } else {
      flags.set(key, next)
      index += 1
    }
  }

  const configPath = stringFlag(flags.get('config')) ?? defaults.configPath
  if (!configPath) return { ok: false, message: '--config is required' }
  const dbPath = stringFlag(flags.get('db'))
  if (!dbPath) return { ok: false, message: '--db is required' }
  const mode = stringFlag(flags.get('mode'))
  if (!isProductLineSeedMode(mode)) return { ok: false, message: '--mode must be preflight, apply, or verify' }
  const operatorEvidencePath = stringFlag(flags.get('operator-evidence'))
  return {
    ok: true,
    options: {
      entrypoint: defaults.entrypoint ?? 'seed:product-line',
      configPath,
      dbPath,
      ...(defaults.db === undefined ? {} : { db: defaults.db }),
      mode,
      json: flags.get('json') === true,
      allowExisting: flags.get('allow-existing') === true,
      ...(operatorEvidencePath === undefined ? {} : { operatorEvidencePath }),
    },
  }
}

function isProductLineSeedMode(value: string | undefined): value is ProductLineSeedMode {
  return PRODUCT_LINE_SEED_MODES.includes(value as ProductLineSeedMode)
}

function stringFlag(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function cliErrorEnvelope(message: string, defaults: GenericSeedCliDefaults): ProductLineSeedResultEnvelope {
  return {
    schema_version: PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
    ok: false,
    entrypoint: defaults.entrypoint ?? 'seed:product-line',
    mode: 'unknown',
    status: 'cli_error',
    code: 'CLI_USAGE_ERROR',
    mutation_status: 'not_mutated',
    config: {
      path: defaults.configPath ?? MISSION_CONTROL_SEED_DEFAULTS.configPath,
      schema_version: null,
      product_line_slug: null,
    },
    target: null,
    evidence: {},
    errors: [{ code: 'CLI_USAGE_ERROR', path: '$.argv', message }],
    snapshot_before: null,
    snapshot_after: null,
    redaction: {
      raw_secret_values_emitted: false,
      redacted_fields: [],
    },
    action_required: null,
    exit_code: 5,
  }
}

function emit(envelope: ProductLineSeedResultEnvelope, writeOutput: boolean): GenericSeedCliResult {
  const text = JSON.stringify(envelope, null, 2)
  if (writeOutput) {
    if (envelope.ok) {
      console.log(text)
    } else {
      console.error(text)
    }
  }
  return {
    exitCode: envelope.exit_code,
    stdout: envelope.ok ? text : '',
    stderr: envelope.ok ? '' : text,
  }
}

const currentUrl = pathToFileURL(process.argv[1] ?? '').href
if (import.meta.url === currentUrl) {
  const result = runSeedProductLineCli(process.argv.slice(2), true)
  process.exitCode = result.exitCode
}
