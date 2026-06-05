#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const guardScriptPath = 'scripts/spec-014c/check-scope-guard.mjs'

/**
 * @typedef {{
 *   readonly path: string
 *   readonly source: string
 *   readonly status: string
 *   readonly tracked: boolean
 * }} ChangedFile
 *
 * @typedef {{
 *   readonly path: string
 *   readonly lines: readonly string[]
 * }} ScanEntry
 *
 * @typedef {{
 *   readonly name: string
 *   readonly pattern: RegExp
 *   readonly reason: string
 * }} ScopeRule
 *
 * @typedef {{
 *   readonly baseRef: string
 *   readonly files: readonly ChangedFile[]
 *   readonly scannedEntries: readonly ScanEntry[]
 *   readonly failures: readonly string[]
 * }} ScopeGuardResult
 */

/** @type {readonly ScopeRule[]} */
const forbiddenPathRules = [
  {
    name: 'second harness adapter path',
    pattern: /^src\/lib\/harness-adapters\/(?!codex-app-server\/|__tests__\/)([^/]+)\//,
    reason: 'SPEC-014C owns only the codex-app-server adapter',
  },
  {
    name: 'OpenClaw implementation path',
    pattern: /^(?:src|scripts|tests)\/.*openclaw/i,
    reason: 'OpenClaw-specific behavior is deferred outside SPEC-014C',
  },
  {
    name: 'live intervention UI path',
    pattern: /^src\/(?:app|components|store)\//,
    reason: 'live intervention UI and launch controls are deferred to SPEC-014F',
  },
  {
    name: 'schema migration path',
    pattern: /^(?:src\/lib\/migrations\.ts|docs\/migrations\/rollback-M\d+\.sql)$/,
    reason: 'SPEC-014C must not add schema migrations',
  },
  {
    name: 'broad scheduler path',
    pattern: /^src\/lib\/(?!(?:task-dispatch|task-dispatch-codex-app-server)\.ts$).*(?:scheduler|cron|dispatch-loop|task-queue|runner-loop)/i,
    reason: 'SPEC-014C may only add a narrow dispatch seam',
  },
]

/** @type {readonly ScopeRule[]} */
const forbiddenContentRules = [
  {
    name: 'second adapter registration',
    pattern:
      /\b(?:adapterId|adapter_id|manifestId|manifest_id|provider_kind)\s*[:=]\s*['"](?!(?:codex-app-server|codex_app_server)\b)[a-z0-9_-]+['"]/i,
    reason: 'only the codex-app-server adapter identity is allowed',
  },
  {
    name: 'OpenClaw behavior',
    pattern: /\b(?:openclaw|openclaw-gateway|OpenClaw|openClaw)\b/,
    reason: 'OpenClaw-specific behavior is deferred outside SPEC-014C',
  },
  {
    name: 'live intervention behavior',
    pattern:
      /\b(?:liveIntervention|operatorIntervention|promptOperator|requestUserInput|captureAnswer|answerCapture|approvalUi|approvalPrompt|pauseForOperator|resumeWithAnswer|createApprovalRequest)\b/i,
    reason: 'live user input and approval handling must fail closed, not add UI/intervention flows',
  },
  {
    name: 'transcript retention behavior',
    pattern:
      /\b(?:transcriptRetention|retainTranscript|persistTranscript|saveTranscript|transcriptStore|rawTranscriptStore|rawProtocolLog|replayExport|debugExport|rawCapturePolicy)\b/i,
    reason: 'transcript/event retention and replay exports are deferred to SPEC-014E',
  },
  {
    name: 'direct task terminal mutation',
    pattern:
      /\b(?:setTaskStatus|updateTaskStatus|markTaskCompleted|markTaskFailed|completeTask|failTask|closeTask|writeTaskTerminal|updateTaskTerminal)\s*\(|\bUPDATE\s+tasks\s+SET\s+(?:[^;]*\b)?status\b/i,
    reason: 'adapter code must not directly mutate terminal task status',
  },
  {
    name: 'successor or task creation',
    pattern:
      /\b(?:advanceTaskChain|selectSuccessor|createSuccessorTask|createTask|insertTask|enqueueTask|queueTask)\s*\(|\b(?:successor_template_slug|next_template_slug|successorSlug)\b/i,
    reason: 'successor selection and task creation stay outside SPEC-014C',
  },
  {
    name: 'direct GitHub mutation',
    pattern:
      /\b(?:syncTaskOutbound|createIssueComment|updateIssue|closeIssue|addLabels|setLabels|removeLabel|addAssignees|requestReviewers|mergePullRequest|enablePullRequestAutoMerge|createPullRequest)\s*\(|\boctokit\.rest\.(?:issues|pulls)\.(?:create|update|add|set|remove|merge)|\bfetch\s*\([\s\S]{0,400}api\.github\.com[\s\S]{0,400}method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i,
    reason: 'direct GitHub mutation and outbound sync are out of scope',
  },
  {
    name: 'auto-merge behavior',
    pattern: /\b(?:mergePullRequest|enablePullRequestAutoMerge)\s*\(|\b(?:autoMerge|auto_merge)\s*[:=]\s*true\b/i,
    reason: 'auto-merge behavior is out of scope',
  },
  {
    name: 'governance mutation',
    pattern:
      /\b(?:insertResourcePolicy|updateResourcePolicy|deleteResourcePolicy|setPolicyOverride|mutateGovernance|writeGovernance|upsertGovernance)\s*\(|\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?resource_policies\b/i,
    reason: 'governance mutation is out of scope',
  },
  {
    name: 'Aegis or owner gate bypass',
    pattern:
      /\b(?:bypassOwnerGate|skipOwnerGate|overrideOwnerGate|markReadyForOwner|forceReadyForOwner|AegisOwnerGateBypass)\s*\(/i,
    reason: 'Aegis and owner gates must remain authoritative outside SPEC-014C',
  },
  {
    name: 'broad scheduler rewrite',
    pattern:
      /\b(?:rewriteScheduler|replaceScheduler|registerSchedulerLoop|dispatchLoop|taskQueueWorker|scheduleAllTasks|startTaskScheduler)\b/i,
    reason: 'SPEC-014C may only add a narrow dispatch seam',
  },
]

/**
 * @param {readonly string[]} args
 * @param {boolean} [allowFailure]
 * @returns {string}
 */
function git(args, allowFailure = false) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: allowFailure ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
  }).trimEnd()
}

/**
 * @param {readonly string[]} args
 * @returns {string}
 */
function tryGit(args) {
  try {
    return git(args, true)
  } catch {
    return ''
  }
}

/** @returns {string} */
function resolveBaseRef() {
  if (process.env.SPEC_014C_SCOPE_GUARD_BASE) return process.env.SPEC_014C_SCOPE_GUARD_BASE

  const mergeBase = tryGit(['merge-base', 'origin/main', 'HEAD'])
  if (mergeBase) return mergeBase

  return git(['rev-parse', 'HEAD'])
}

/**
 * @param {string} output
 * @param {string} source
 * @returns {ChangedFile[]}
 */
function parseNameStatus(output, source) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t')
      const status = parts[0]?.[0] ?? 'M'
      return {
        path: parts.at(-1) ?? '',
        source,
        status,
        tracked: true,
      }
    })
    .filter((entry) => entry.path.length > 0)
}

/**
 * @param {string} output
 * @returns {ChangedFile[]}
 */
function parseShortStatus(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2)
      const rawPath = line.slice(3).trim()
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath
      return {
        path: path ?? '',
        source: 'working-tree',
        status: code.includes('A') || code.includes('?') ? 'A' : 'M',
        tracked: !code.includes('?'),
      }
    })
    .filter((entry) => entry.path.length > 0)
}

/**
 * @param {string} baseRef
 * @returns {ChangedFile[]}
 */
function changedFiles(baseRef) {
  const entries = [
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', baseRef, 'HEAD']), 'branch'),
    ...parseNameStatus(tryGit(['diff', '--cached', '--name-status', '--find-renames']), 'index'),
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', 'HEAD']), 'working-tree'),
    ...parseShortStatus(tryGit(['status', '--short', '--untracked-files=all'])),
  ]
  /** @type {Map<string, ChangedFile>} */
  const byPath = new Map()
  for (const entry of entries) {
    const existing = byPath.get(entry.path)
    byPath.set(entry.path, {
      ...entry,
      tracked: entry.tracked ? true : (existing?.tracked ?? false),
      status: existing?.status === 'A' || entry.status === 'A' ? 'A' : entry.status,
    })
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path))
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
 * @param {string} file
 * @param {string} baseRef
 * @returns {string[]}
 */
function addedLinesInDiff(file, baseRef) {
  const outputs = [
    tryGit(['diff', '--unified=0', baseRef, 'HEAD', '--', file]),
    tryGit(['diff', '--cached', '--unified=0', '--', file]),
    tryGit(['diff', '--unified=0', 'HEAD', '--', file]),
  ]
  return outputs
    .join('\n')
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isDocsOrProcessPath(file) {
  return (
    file.startsWith('specs/')
    || file.startsWith('docs/')
    || file.startsWith('.specify/')
    || file === 'AGENTS.md'
    || file === 'CLAUDE.md'
    || file.endsWith('.md')
  )
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isSpec014cOwnedImplementationPath(file) {
  return (
    file.startsWith('src/lib/harness-adapters/codex-app-server/')
    || file === 'src/lib/harness-adapters/validation.ts'
    || file === 'src/lib/harness-adapters/runtime-inventory.ts'
    || file === 'src/lib/harness-adapters/types.ts'
    || file === 'src/lib/task-dispatch-codex-app-server.ts'
    || file === 'src/lib/task-dispatch.ts'
    || file === guardScriptPath
    || file === 'eslint.config.mjs'
    || file === 'tsconfig.spec-strict.json'
  )
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isSpec014cOwnedTestPath(file) {
  return (
    file === 'src/lib/__tests__/task-dispatch-codex-app-server.test.ts'
    || file === 'tests/integration/strict-scope-guard.test.ts'
    || /^tests\/integration\/spec-014c-[^/]+\.test\.ts$/.test(file)
    || file === 'src/types/import-meta-glob.d.ts'
    || /^src\/lib\/harness-adapters\/__tests__\/(?:codex-app-server|runtime-inventory|validation)/.test(file)
  )
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isSpec014cAllowedChangedPath(file) {
  return (
    isDocsOrProcessPath(file)
    || isSpec014cOwnedImplementationPath(file)
    || isSpec014cOwnedTestPath(file)
    || file.startsWith('scripts/spec-014c/')
  )
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function shouldScanContent(file) {
  if (file === guardScriptPath) return false
  if (isDocsOrProcessPath(file)) return false
  if (file.includes('/__tests__/') || file.startsWith('tests/')) return false
  if (!isSpec014cOwnedImplementationPath(file)) return false
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml)$/.test(file)
}

/**
 * @param {readonly ChangedFile[]} files
 * @returns {string[]}
 */
function checkChangedPaths(files) {
  const failures = []
  for (const file of files) {
    if (isDocsOrProcessPath(file.path)) continue
    if (!isSpec014cAllowedChangedPath(file.path)) {
      failures.push(
        `outside SPEC-014C owned path: ${file.path} (SPEC-014C may only touch adapter, narrow dispatch, evidence, guard, UAT, and review artifacts)`,
      )
    }
    for (const { name, pattern, reason } of forbiddenPathRules) {
      if (pattern.test(file.path)) {
        failures.push(`${name}: ${file.path} (${reason})`)
      }
    }
  }
  return failures
}

/**
 * @param {ChangedFile} file
 * @param {string} baseRef
 * @returns {string[]}
 */
function readScanLines(file, baseRef) {
  const lines = addedLinesInDiff(file.path, baseRef)
  if (lines.length > 0) return lines
  if (!existsSync(file.path)) return []
  return readFileSync(file.path, 'utf8').split('\n')
}

/**
 * @param {readonly ScanEntry[]} entries
 * @returns {string[]}
 */
function scanEntries(entries) {
  const failures = []
  for (const entry of entries) {
    const source = stripComments(entry.lines.join('\n'))
    if (source.trim().length === 0) continue
    for (const { name, pattern, reason } of forbiddenContentRules) {
      if (pattern.test(source)) {
        failures.push(`${name}: ${entry.path} (${reason})`)
      }
    }
  }
  return Array.from(new Set(failures)).sort()
}

/**
 * @param {string} [baseRef]
 * @returns {ScopeGuardResult}
 */
function runScopeGuard(baseRef = resolveBaseRef()) {
  const files = changedFiles(baseRef)
  const pathFailures = checkChangedPaths(files)
  const scanEntriesForDiff = files
    .filter((file) => shouldScanContent(file.path))
    .map((file) => ({
      path: file.path,
      lines: readScanLines(file, baseRef),
    }))
  return {
    baseRef,
    files,
    scannedEntries: scanEntriesForDiff,
    failures: [
      ...pathFailures,
      ...scanEntries(scanEntriesForDiff),
    ],
  }
}

/** @returns {void} */
function runSelfTest() {
  /** @type {ChangedFile[]} */
  const pathFixtures = [
    'src/lib/feature-flags.ts',
    'src/lib/workflow-contracts/codex-app-server-sync.ts',
    'src/lib/harness-adapters/openclaw/manifest.ts',
    'src/lib/harness-adapters/claude-app-server/manifest.ts',
    'src/components/harness/LiveIntervention.tsx',
    'src/lib/scheduler/runner-loop.ts',
  ].map((path) => ({ path, source: 'fixture', status: 'A', tracked: false }))

  /** @type {ScanEntry[]} */
  const contentFixtures = [
    {
      path: 'src/lib/harness-adapters/codex-app-server/manifest.ts',
      lines: ['export const manifest = { adapterId: "openclaw-app-server" }'],
    },
    {
      path: 'src/lib/harness-adapters/codex-app-server/runner.ts',
      lines: ['await promptOperator({ approvalUi: true })'],
    },
    {
      path: 'src/lib/harness-adapters/codex-app-server/evidence.ts',
      lines: ['await persistTranscript({ runId, transcriptRetention: true })'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['await updateTaskStatus(taskId, "done")'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['advanceTaskChain(db, taskId)'],
    },
    {
      path: 'src/lib/harness-adapters/codex-app-server/runner.ts',
      lines: ['insertTask({ title: "unexpected successor" })'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['await syncTaskOutbound(taskId)'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['await enablePullRequestAutoMerge(repo, prNumber)'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['await mutateGovernance({ policyId })'],
    },
    {
      path: 'src/lib/task-dispatch-codex-app-server.ts',
      lines: ['await bypassOwnerGate(taskId)'],
    },
    {
      path: 'src/lib/task-dispatch.ts',
      lines: ['registerSchedulerLoop("codex-app-server", handler)'],
    },
  ]

  const safeDocsFixture = {
    path: 'specs/014c-first-real-harness-adapter/pr-review-packet.md',
    source: 'fixture',
    status: 'M',
    tracked: true,
  }
  const safeDocsScanEntries = shouldScanContent(safeDocsFixture.path)
    ? [{ path: safeDocsFixture.path, lines: ['OpenClaw, transcript retention, live intervention UI, auto-merge are non-goals.'] }]
    : []
  const safeCodeFailures = scanEntries([
    {
      path: 'src/lib/harness-adapters/codex-app-server/evidence.ts',
      lines: [
        'export const safeEvidence = {',
        '  schemaVersion: "codex_app_server_run.v1",',
        '  unsupportedReason: "approval_unsupported",',
        '  artifactRefs: [{ kind: "summary", redactionStatus: "redacted" }],',
        '}',
      ],
    },
  ])

  const failures = [
    ...checkChangedPaths(pathFixtures),
    ...scanEntries(contentFixtures),
    ...scanEntries(safeDocsScanEntries),
    ...safeCodeFailures,
  ]

  const expectedFindingCount = 23
  if (failures.length !== expectedFindingCount) {
    console.error(`SPEC-014C scope guard self-test expected ${String(expectedFindingCount)} findings, got ${String(failures.length)}`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

/** @returns {void} */
function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
    console.log('SPEC-014C scope guard self-test: OK (23 findings across 16 forbidden fixture(s), docs/process non-goals allowed)')
    return
  }

  const result = runScopeGuard()
  if (result.failures.length > 0) {
    console.error('SPEC-014C scope guard failed:')
    for (const failure of result.failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `SPEC-014C scope guard: OK (${String(result.files.length)} changed file(s), ${String(result.scannedEntries.length)} code/config file(s) scanned)`,
  )
}

main()
