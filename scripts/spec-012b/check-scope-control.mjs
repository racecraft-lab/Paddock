#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(moduleDir, '../..')

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

const BLOCKED_PATH_SEGMENTS = [
  'api',
  'scheduler',
  'dispatch',
  'claim',
  'retry',
  'sandbox',
  'harness-adapter',
]

const token = (...parts) => parts.join('')
const TOKEN_RULES = [
  {
    category: 'github_mutation',
    patterns: [
      new RegExp(token('octokit\\.rest\\.[A-Za-z0-9_.]+\\.(?:crea', 'te|upda', 'te|mer', 'ge|add|remove|set)\\b')),
      new RegExp(token('\\bgh\\s+(?:issue|pr)\\s+[^\\n]*(?:crea', 'te|edit|mer', 'ge)\\b')),
    ],
  },
  {
    category: 'paddock_task_mutation',
    patterns: [
      new RegExp(token('\\bcrea', 'teTask\\s*\\(')),
      new RegExp(token('INSERT\\s+INTO\\s+', 'tasks\\b'), 'i'),
      new RegExp(token('UPDATE\\s+', 'tasks\\b'), 'i'),
      new RegExp(token('paddock_cleanup_task[\\s\\S]*live_mutation\\s*:\\s*true')),
    ],
  },
  {
    category: 'scheduler_dispatch',
    patterns: [
      new RegExp(token('\\badvance', 'TaskChain\\s*\\(')),
      new RegExp(token('\\bdispatch', 'Task\\s*\\(')),
    ],
  },
  {
    category: 'claim_retry',
    patterns: [
      new RegExp(token('\\bclaim', 'Task\\s*\\(')),
      new RegExp(token('\\bretry', 'Task\\s*\\(')),
    ],
  },
  {
    category: 'sandbox',
    patterns: [
      new RegExp(token('\\bcreate', 'Sandbox\\s*\\(')),
    ],
  },
  {
    category: 'harness_adapter',
    patterns: [
      new RegExp(token('\\blaunch', 'Harness\\s*\\(')),
      new RegExp(token('\\bharness', 'Adapter\\b')),
    ],
  },
  {
    category: 'auto_merge',
    patterns: [
      new RegExp(token('\\benable', 'PullRequestAutoMerge\\b')),
    ],
  },
  {
    category: 'runtime_feature_flag',
    patterns: [
      new RegExp(token('process\\.env\\.FEATURE', '_')),
      new RegExp(token('NEXT_PUBLIC_FEATURE', '_')),
    ],
  },
  {
    category: 'external_openai_fetch',
    patterns: [
      new RegExp(token('\\bfetc', 'h\\s*\\([^\\n]*(?:openai\\.com/index/(?:harness-engineering|open-source-codex-orchestration-symphony)|github\\.com/openai/symphony)')),
    ],
  },
  {
    category: 'archive_cleanup_mutation',
    patterns: [
      new RegExp(token('\\brm', 'Sync\\s*\\([^\\n]*[\'"]specs/')),
      new RegExp(token('\\bunlink', 'Sync\\s*\\([^\\n]*[\'"]specs/')),
      new RegExp(token('\\brename', 'Sync\\s*\\([^\\n]*[\'"]specs/')),
      new RegExp(token('\\bmv\\s+specs/')),
      new RegExp(token('--apply-', 'cleanup')),
    ],
  },
]

function parseArgs(argv) {
  return {
    selfTest: argv.includes('--self-test'),
  }
}

function currentChangedFiles() {
  const result = spawnSync('git', ['status', '--short', '--porcelain', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) return []

  return result.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3)
      return path.includes(' -> ') ? path.split(' -> ').at(-1) : path
    })
    .map(normalizePath)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
}

function currentAddedLines(paths) {
  return [
    ...diffAddedLines(),
    ...untrackedAddedLines(paths),
  ]
}

function diffAddedLines() {
  const result = spawnSync('git', ['diff', '--unified=0', '--no-ext-diff', 'HEAD', '--'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) return []

  const entries = []
  let currentPath = ''
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentPath = normalizePath(line.slice('+++ b/'.length))
      continue
    }
    if (!currentPath || !line.startsWith('+') || line.startsWith('+++')) continue
    entries.push({ path: currentPath, line: line.slice(1) })
  }
  return entries
}

function untrackedAddedLines(paths) {
  const entries = []
  for (const path of paths) {
    const absolute = resolve(repoRoot, path)
    if (!existsSync(absolute) || !isWithin(absolute, repoRoot)) continue
    if (!isUntracked(path) || !isScannableTextFile(path, absolute)) continue

    const text = readFileSync(absolute, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      entries.push({ path, line })
    }
  }
  return entries
}

function isUntracked(path) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', path], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return result.status !== 0
}

function isScannableTextFile(path, absolute) {
  if (!/\.(?:mjs|cjs|js|json|md|ts|tsx|sql|sh|yaml|yml)$/.test(path)) return false
  try {
    return statSync(absolute).size <= 262_144
  } catch {
    return false
  }
}

function evaluate(paths, addedLines = []) {
  const failures = []
  const normalizedPaths = paths.map(normalizePath).filter(Boolean)

  for (const path of normalizedPaths) {
    const allowed = isAllowedPath(path)
    const blocked = isBlockedPath(path)
    if (!allowed || blocked) {
      failures.push({
        path,
        reason: blocked ? 'blocked_runtime_surface' : 'outside_spec_012b_allowed_surface',
      })
    }
  }

  for (const entry of addedLines) {
    const path = normalizePath(entry.path)
    if (!path || isTokenExemptPath(path)) continue
    for (const rule of TOKEN_RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(entry.line))) continue
      failures.push({
        path,
        reason: 'forbidden_live_mutation_token',
        token_category: rule.category,
      })
    }
  }

  return {
    changed_file_count: normalizedPaths.length,
    scanned_entry_count: normalizedPaths.length + addedLines.length,
    failure_count: failures.length,
    failures: sortFailures(failures),
  }
}

function runSelfTest() {
  const cases = collectScopeFixtures()
  const reports = cases.map((fixture) => {
    const evaluation = evaluate(fixture.changed_files || [], fixture.added_lines || [])
    const expectedFailureCount = Number(fixture.expected?.failure_count || 0)
    return {
      case_id: fixture.case_id,
      status: evaluation.failure_count === expectedFailureCount ? 'passed' : 'failed',
      expected_failure_count: expectedFailureCount,
      observed_failure_count: evaluation.failure_count,
      observed_reasons: uniqueSorted(evaluation.failures.map((failure) => failure.reason)),
      observed_token_categories: uniqueSorted(evaluation.failures.map((failure) => failure.token_category).filter(Boolean)),
      changed_file_count: evaluation.changed_file_count,
      scanned_entry_count: evaluation.scanned_entry_count,
    }
  })
  const failedCases = reports.filter((entry) => entry.status !== 'passed')

  return {
    schema_version: 'harness_gardening_scope_control.v1',
    mode: 'self-test',
    changed_file_count: reports.reduce((total, entry) => total + entry.changed_file_count, 0),
    scanned_entry_count: reports.reduce((total, entry) => total + entry.scanned_entry_count, 0),
    failure_count: failedCases.length,
    failures: failedCases.map((entry) => ({
      path: `scripts/spec-012b/fixtures/scope-control/${entry.case_id}/fixture.json`,
      reason: 'scope_control_self_test_mismatch',
    })),
    self_test_cases: reports,
  }
}

function runCurrentDiff() {
  const paths = currentChangedFiles()
  const evaluation = evaluate(paths, currentAddedLines(paths))

  return {
    schema_version: 'harness_gardening_scope_control.v1',
    mode: 'current-diff',
    ...evaluation,
  }
}

function collectScopeFixtures() {
  const root = join(repoRoot, 'scripts/spec-012b/fixtures/scope-control')
  if (!existsSync(root)) return []

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'fixture.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    .sort((left, right) => left.case_id.localeCompare(right.case_id))
}

function isAllowedPath(path) {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

function isBlockedPath(path) {
  if (isFixtureOrSpec012bProcessPath(path)) return false
  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true
  return BLOCKED_PATH_SEGMENTS.some((segment) => pathIncludesSegment(path, segment))
}

function isTokenExemptPath(path) {
  return path.endsWith('.md')
    || path.includes('/fixtures/')
    || path.endsWith('/fixture.json')
}

function isFixtureOrSpec012bProcessPath(path) {
  return path.startsWith('scripts/spec-012b/fixtures/')
    || path.startsWith('specs/012b-harness-gardening-guards/')
    || path.startsWith('docs/ai/specs/.process/')
}

function pathIncludesSegment(path, segment) {
  return path.split('/').some((part) => part === segment || part.startsWith(`${segment}-`))
}

function sortFailures(failures) {
  return [...failures].sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.reason.localeCompare(right.reason)
    || String(left.token_category || '').localeCompare(String(right.token_category || '')),
  )
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function normalizePath(value) {
  const normalized = String(value || '').replaceAll(sep, '/').replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) return ''
  return normalized
}

function isWithin(candidate, root) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = args.selfTest ? runSelfTest() : runCurrentDiff()

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.failure_count > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
