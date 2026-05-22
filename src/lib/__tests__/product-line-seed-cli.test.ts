import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

export interface PnpmSeedInvocation {
  command: 'pnpm'
  args: string[]
  cwd: string
}

export interface CliRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

export function buildPnpmSeedInvocation(
  scriptName: 'seed:product-line' | 'seed:mission-control',
  args: string[],
  cwd = process.cwd(),
): PnpmSeedInvocation {
  return {
    command: 'pnpm',
    args: [scriptName, '--', ...args],
    cwd,
  }
}

export function invokePnpmSeedScript(
  scriptName: 'seed:product-line' | 'seed:mission-control',
  args: string[],
  cwd = process.cwd(),
): CliRunResult {
  const invocation = buildPnpmSeedInvocation(scriptName, args, cwd)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
  })
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function parseProductLineSeedJsonOutput(result: Pick<CliRunResult, 'stdout' | 'stderr'>): Record<string, unknown> {
  const payload = result.stdout.trim() || result.stderr.trim()
  expect(payload.length).toBeGreaterThan(0)
  return JSON.parse(payload) as Record<string, unknown>
}

describe('generic product-line seed CLI foundation', () => {
  it('registers the generic pnpm script without replacing the Mission Control compatibility script', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['seed:mission-control']).toContain('scripts/seed-mission-control-product-line.ts')
    expect(packageJson.scripts['seed:product-line']).toBe(
      'pnpm run verify:node && node --experimental-strip-types scripts/seed-product-line.ts',
    )
    expect(existsSync('scripts/seed-product-line.ts')).toBe(true)
  })

  it('builds pnpm script invocations with the argument separator preserved', () => {
    expect(buildPnpmSeedInvocation('seed:product-line', [
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      '.data/spec-010a-safe.db',
      '--mode',
      'preflight',
      '--json',
    ])).toEqual({
      command: 'pnpm',
      args: [
        'seed:product-line',
        '--',
        '--config',
        'docs/ai/product-lines/mission-control.yaml',
        '--db',
        '.data/spec-010a-safe.db',
        '--mode',
        'preflight',
        '--json',
      ],
      cwd: process.cwd(),
    })
  })

  it('parses structured JSON result envelopes from stdout or stderr', () => {
    const parsed = parseProductLineSeedJsonOutput({
      stdout: JSON.stringify({
        schema_version: 'product-line-seed-result-v1',
        ok: false,
        status: 'cli_error',
        mutation_status: 'not_mutated',
      }),
      stderr: '',
    })
    const parsedFromStderr = parseProductLineSeedJsonOutput({
      stdout: '',
      stderr: JSON.stringify({
        schema_version: 'product-line-seed-result-v1',
        ok: false,
        status: 'unexpected_error',
        mutation_status: 'not_mutated',
      }),
    })

    expect(parsed).toMatchObject({ schema_version: 'product-line-seed-result-v1', status: 'cli_error' })
    expect(parsedFromStderr).toMatchObject({ schema_version: 'product-line-seed-result-v1', status: 'unexpected_error' })
  })
})

describe('generic product-line seed CLI contracts', () => {
  it('parses required config, db, mode, json, allow-existing, and operator-evidence flags for every mode', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    for (const mode of ['preflight', 'apply', 'verify']) {
      const result = runCli([
        '--config',
        'docs/ai/product-lines/mission-control.yaml',
        '--db',
        ':memory:',
        '--mode',
        mode,
        '--json',
        '--allow-existing',
        '--operator-evidence',
        'operator-evidence.json',
      ])
      const parsed = parseProductLineSeedJsonOutput(result)
      expect(parsed).toMatchObject({
        entrypoint: 'seed:product-line',
        mode,
        config: { path: 'docs/ai/product-lines/mission-control.yaml' },
      })
    }
  })

  it('accepts the pnpm argument separator when it reaches the script argv', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    const result = runCli([
      '--',
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      ':memory:',
      '--mode',
      'preflight',
      '--json',
    ])
    const parsed = parseProductLineSeedJsonOutput(result)

    expect(parsed).toMatchObject({
      ok: true,
      entrypoint: 'seed:product-line',
      mode: 'preflight',
      status: 'ready',
    })
  })

  it('rejects missing required flags, invalid modes, and unknown flags with structured JSON', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    for (const args of [
      ['--db', ':memory:', '--mode', 'preflight', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--mode', 'preflight', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--db', ':memory:', '--mode', 'plan', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--db', ':memory:', '--mode', 'preflight', '--unknown'],
    ]) {
      const result = runCli(args)
      const parsed = parseProductLineSeedJsonOutput(result)
      expect(result.exitCode).toBe(5)
      expect(parsed).toMatchObject({
        ok: false,
        status: 'cli_error',
        code: 'CLI_USAGE_ERROR',
        mutation_status: 'not_mutated',
        redaction: { raw_secret_values_emitted: false },
      })
    }
  })

  it('never emits, snapshots, or hashes raw operator evidence', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')
    const dir = mkdtempSync(join(tmpdir(), 'product-line-seed-evidence-'))
    const evidencePath = join(dir, 'operator-evidence.json')
    const rawSecret = 'sk-test-operator-secret-raw-value'
    writeFileSync(evidencePath, JSON.stringify({
      token: rawSecret,
      raw_operator_evidence: rawSecret,
      nested: { password: rawSecret, safe_id: 'operator-check-1' },
    }))

    const result = runCli([
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      ':memory:',
      '--mode',
      'preflight',
      '--json',
      '--operator-evidence',
      evidencePath,
    ])
    const output = `${result.stdout}\n${result.stderr}`
    const parsed = parseProductLineSeedJsonOutput(result)

    expect(output).not.toContain(rawSecret)
    expect(output).not.toContain(`"raw_operator_evidence":`)
    expect(output).not.toContain('sk-test')
    const redaction = parsed['redaction'] as { raw_secret_values_emitted: boolean; redacted_fields: string[] }
    expect(redaction.raw_secret_values_emitted).toBe(false)
    expect(redaction.redacted_fields).toEqual(expect.arrayContaining(['$.nested.password', '$.raw_operator_evidence', '$.token']))
    expect(JSON.stringify(parsed['snapshot_before'])).not.toContain(rawSecret)
    expect(JSON.stringify(parsed['snapshot_after'])).not.toContain(rawSecret)
  })
})
