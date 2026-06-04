#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const baseBranch = process.env.BASE_BRANCH ?? 'origin/main'

/**
 * @typedef {{ readonly name: string, readonly pattern: RegExp }} ScopeRule
 * @typedef {{ readonly rule: string, readonly files: readonly string[], readonly content: string }} ForbiddenSample
 */

/** @type {readonly ScopeRule[]} */
const changedPathRules = [
  {
    name: 'no schema migrations',
    pattern: /^(src\/lib\/migrations\.ts|docs\/migrations\/rollback-M\d+\.sql)$/,
  },
  {
    name: 'no adapter boundary widening',
    pattern: /^src\/lib\/adapters\//,
  },
]

/** @type {readonly string[]} */
const scanTargets = [
  'src/lib/harness-adapters/types.ts',
  'src/lib/harness-adapters/evidence.ts',
  'src/lib/harness-adapters/fixtures.ts',
  'src/lib/harness-adapters/validation.ts',
  'src/lib/harness-adapters/runtime-inventory.ts',
  'src/app/api/agents/runtime-inventory/route.ts',
  'src/components/agents/RuntimeInventoryEvidence.tsx',
  'src/components/panels/agent-squad-panel.tsx',
]

/** @type {readonly ScopeRule[]} */
const forbiddenContentRules = [
  {
    name: 'no real harness or gateway execution',
    pattern: /\b(?:runOpenClaw|openclawGateway|openclaw-gateway|harnessGateway|realHarness|gatewayClient)\b/,
  },
  {
    name: 'no process execution',
    pattern: /\b(?:child_process|execFile|execSync|spawnSync|spawn|exec)\s*(?:\(|from\s+['"]node:child_process['"]|from\s+['"]child_process['"])/,
  },
  {
    name: 'no scheduler or task dispatch',
    pattern: /\b(?:scheduler|dispatchTask|advanceTaskChain|selectSuccessor|createSuccessorTask|taskDispatch|task-dispatch)\b/,
  },
  {
    name: 'no claim-control or lifecycle-control mutation',
    pattern: /\b(?:claim-control|taskClaimControl|applyClaimControl|retryStage|releaseClaim|cancelStage|lifecycleControl|insertLifecycle|updateLifecycle)\b/,
  },
  {
    name: 'no GitHub or governance mutation',
    pattern: /\b(?:githubSync|syncGitHub|createPullRequest|mergePullRequest|autoMerge|resourcePolicyEvaluator|governanceMutation)\b/,
  },
]

/** @returns {string[]} */
function gitChangedFiles() {
  const files = /** @type {Set<string>} */ (new Set())
  try {
    execFileSync('git', ['diff', `${baseBranch}...HEAD`, '--name-only'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').filter(Boolean).forEach((file) => files.add(file))
  } catch {
    // Fall through to working tree detection below when the configured base is
    // unavailable in a local worktree.
  }

  try {
    execFileSync('git', ['status', '--short'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n')
      .map((line) => line.slice(3).trim().split(' -> ').pop())
      .filter(Boolean)
      .forEach((file) => files.add(file))
  } catch {
    // No git status data; return any base diff files already collected.
  }

  return [...files]
}

/**
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * @param {readonly string[]} files
 * @returns {string[]}
 */
function checkChangedPaths(files) {
  const failures = /** @type {string[]} */ ([])
  for (const file of files) {
    for (const rule of changedPathRules) {
      if (rule.pattern.test(file)) failures.push(`${rule.name}: ${file}`)
    }
  }
  return failures
}

/**
 * @param {readonly string[]} [files]
 * @returns {string[]}
 */
function checkFileContents(files = scanTargets) {
  const failures = /** @type {string[]} */ ([])
  for (const file of files) {
    const absolute = path.join(root, file)
    if (!existsSync(absolute)) continue
    const source = stripComments(readFileSync(absolute, 'utf8'))
    for (const rule of forbiddenContentRules) {
      if (rule.pattern.test(source)) failures.push(`${rule.name}: ${file}`)
    }
  }
  return failures
}

function runSelfTest() {
  /** @type {readonly ForbiddenSample[]} */
  const forbiddenSamples = [
    {
      rule: 'no schema migrations',
      files: ['src/lib/migrations.ts'],
      content: '',
    },
    {
      rule: 'no adapter boundary widening',
      files: ['src/lib/adapters/openclaw.ts'],
      content: '',
    },
    {
      rule: 'no process execution',
      files: [],
      content: "import { spawn } from 'node:child_process'\nspawn('openclaw')",
    },
    {
      rule: 'no real harness or gateway execution',
      files: [],
      content: 'await runOpenClaw(taskId)',
    },
    {
      rule: 'no scheduler or task dispatch',
      files: [],
      content: 'advanceTaskChain(taskId)',
    },
    {
      rule: 'no claim-control or lifecycle-control mutation',
      files: [],
      content: 'await applyClaimControl({ action: "retryStage" })',
    },
    {
      rule: 'no GitHub or governance mutation',
      files: [],
      content: 'await autoMerge(prNumber)',
    },
  ]
  const safeSample = `
    export const envelope = {
      schema_version: 'runtime_inventory.v1',
      entries: [{ state: 'blocked', reason_codes: ['capability_unsupported'] }],
    }
  `

  for (const sample of forbiddenSamples) {
    const pathFailures = checkChangedPaths(sample.files)
    const contentFailures = forbiddenContentRules
      .filter((rule) => rule.pattern.test(stripComments(sample.content)))
      .map((rule) => rule.name)
    if (pathFailures.length === 0 && contentFailures.length === 0) {
      throw new Error(`Self-test failed to catch forbidden fixture: ${sample.rule}`)
    }
  }

  const safeFailures = forbiddenContentRules.filter((rule) => rule.pattern.test(stripComments(safeSample)))
  if (safeFailures.length > 0) {
    throw new Error(`Self-test rejected safe runtime inventory fixture: ${safeFailures.map((rule) => rule.name).join(', ')}`)
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
  console.log('SPEC-014B harness adapter scope guard self-test: OK')
  process.exit(0)
}

const changedFiles = gitChangedFiles()
const failures = [
  ...checkChangedPaths(changedFiles),
  ...checkFileContents(),
]

if (failures.length > 0) {
  console.error('SPEC-014B harness adapter scope guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('SPEC-014B harness adapter scope guard: OK')
