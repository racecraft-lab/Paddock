import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
