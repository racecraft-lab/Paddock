#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ALLOWED_PREFIXES = [
  'specs/012b-harness-gardening-guards/',
  'scripts/spec-012b/',
  'docs/ai/specs/.process/SPEC-012B-workflow.md',
  'docs/ai/specs/.process/autopilot-state.json',
  'docs/ai/repo-knowledge-index.json',
  'AGENTS.md',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/check-guardrails.mjs',
]

const BLOCKED_PREFIXES = [
  'src/',
  'docs/migrations/',
  'migrations/',
]

function parseArgs(argv) {
  return {
    selfTest: argv.includes('--self-test'),
    json: argv.includes('--json'),
  }
}

function changedFiles() {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
}

function evaluate(paths) {
  const failures = []
  for (const path of paths) {
    const allowed = ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
    const blocked = BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))
    if (!allowed || blocked) {
      failures.push({
        path,
        reason: blocked ? 'blocked_runtime_surface' : 'outside_spec_012b_allowed_surface',
      })
    }
  }

  return {
    schema_version: 'harness_gardening_scope_control.v1',
    changed_file_count: paths.length,
    scanned_entry_count: paths.length,
    failure_count: failures.length,
    failures,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = args.selfTest
    ? evaluate(['scripts/spec-012b/harness-gardening-check.mjs'])
    : evaluate(changedFiles())

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.failure_count > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
