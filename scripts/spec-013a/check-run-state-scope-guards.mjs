#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const guardScriptPath = 'scripts/spec-013a/check-run-state-scope-guards.mjs'

const runtimeAttemptReferencePaths = [
  /^src\/lib\/scheduler\.ts$/,
  /^src\/lib\/task-dispatch\.ts$/,
  /^src\/lib\/task-chain(?:\.ts|\/)/,
  /^src\/lib\/aegis(?:\.ts|\/)/,
  /^src\/lib\/github-(?:sync|sync-engine|sync-poller|label).*\.ts$/,
  /^src\/lib\/runs\.ts$/,
  /^src\/lib\/pilot-review-packet\.ts$/,
  /^src\/app\/api\/tasks\/\[id\]\/evidence\/route\.ts$/,
  /^src\/lib\/task-evidence\.ts$/,
]

const allowedAttemptReferencePaths = [
  /^src\/lib\/migrations\.ts$/,
  /^docs\/migrations\/rollback-M76\.sql$/,
  /^src\/lib\/task-stage-attempts\.ts$/,
  /^src\/app\/api\/tasks\/\[id\]\/stage-attempts\/route\.ts$/,
  /^src\/components\/panels\/task-stage-attempts-section\.tsx$/,
  /^src\/app\/api\/index\/route\.ts$/,
  /^openapi\.json$/,
  /^specs\/013a-run-state-spine\//,
  /^docs\/ai\/specs\/SPEC-013A-/,
  /^scripts\/spec-013a\//,
  /\/__tests__\//,
  /^tests\//,
]

const attemptReferencePattern =
  /\b(?:task_stage_attempts|task_stage_attempt_events|task-stage-attempts|TaskStageAttempt|taskStageAttempt|task_stage_attempts\.v1)\b/

const forbiddenPatterns = [
  {
    pattern: /\bprocess\.env\.FEATURE_TASK_CONTROL_PLANE\b/,
    reason: 'Inline FEATURE_TASK_CONTROL_PLANE read outside src/lib/feature-flags.ts',
    isAllowed: (path) => path === 'src/lib/feature-flags.ts',
  },
  {
    pattern: /\bINSERT\s+INTO\s+tasks\b/i,
    reason: 'Direct production task insert outside src/lib/task-create.ts',
    isAllowed: (path) => path === 'src/lib/task-create.ts' || !isProductionSource(path),
  },
  {
    pattern:
      /\b(?:claimTask[A-Za-z0-9_]*|claimTaskStageAttempt[A-Za-z0-9_]*|claim_token|claimed_by|claim_owner|active_owner|lock_owner|lease_expires|one[_-]?active[_-]?attempt|duplicate[_-]?launch|reconcileGitHub[A-Za-z0-9_]*|githubTerminalReconciliation[A-Za-z0-9_]*|terminalReconciliation[A-Za-z0-9_]*)\b/i,
    reason: 'SPEC-013B claim/reconciliation/one-active-attempt drift',
    isAllowed: (path) => isTestOrDocsPath(path),
  },
  {
    pattern:
      /\b(?:CREATE\s+UNIQUE\s+INDEX[\s\S]{0,160}(?:active|running)[\s\S]{0,160}task_stage_attempts|UNIQUE[\s\S]{0,160}(?:active|running)[\s\S]{0,160}task_stage_attempts)\b/i,
    reason: 'SPEC-013B claim/reconciliation/one-active-attempt drift',
    isAllowed: (path) => isTestOrDocsPath(path),
  },
  {
    pattern:
      /\b(?:sandboxLifecycle[A-Za-z0-9_]*|createSandbox[A-Za-z0-9_]*|openSandbox[A-Za-z0-9_]*|sandbox_id|harnessAdapter[A-Za-z0-9_]*|harness_adapter|adapterRegistry[A-Za-z0-9_]*|adapter_manifest|launchHarness[A-Za-z0-9_]*|executeHarness[A-Za-z0-9_]*|runnerSandbox[A-Za-z0-9_]*|FEATURE_AGENT_RUNNER_SANDBOXES)\b/i,
    reason: 'SPEC-014 sandbox/adapter/harness drift',
    isAllowed: (path) => isTestOrDocsPath(path),
  },
]

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.allowFailure ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
  }).trimEnd()
}

function tryGit(args) {
  try {
    return git(args, { allowFailure: true })
  } catch {
    return ''
  }
}

function resolveBaseRef() {
  if (process.env.SPEC_013A_SCOPE_GUARD_BASE) {
    return process.env.SPEC_013A_SCOPE_GUARD_BASE
  }

  const mergeBase = tryGit(['merge-base', 'origin/main', 'HEAD'])
  if (mergeBase) return mergeBase

  return git(['rev-parse', 'HEAD'])
}

function parseNameStatus(output, source) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t')
      const status = parts[0]?.[0] ?? 'M'
      return {
        path: parts[parts.length - 1],
        source,
        status,
        tracked: true,
      }
    })
}

function parseShortStatus(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2)
      const rawPath = line.slice(3).trim()
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath
      return {
        path,
        source: 'working-tree',
        status: code.includes('A') || code.includes('?') ? 'A' : 'M',
        tracked: !code.includes('?'),
      }
    })
}

function changedFiles(baseRef) {
  const entries = [
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', baseRef, 'HEAD']), 'branch'),
    ...parseNameStatus(tryGit(['diff', '--cached', '--name-status', '--find-renames']), 'index'),
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', 'HEAD']), 'working-tree'),
    ...parseShortStatus(tryGit(['status', '--short', '--untracked-files=all'])),
  ]
  const byPath = new Map()
  for (const entry of entries) {
    if (!entry.path) continue
    const existing = byPath.get(entry.path)
    byPath.set(entry.path, {
      ...entry,
      tracked: Boolean(entry.tracked || existing?.tracked),
      status: existing?.status === 'A' || entry.status === 'A' ? 'A' : entry.status,
    })
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path))
}

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

function isTestOrDocsPath(path) {
  return (
    path.includes('/__tests__/')
    || path.startsWith('tests/')
    || path.startsWith('specs/')
    || path.startsWith('docs/')
    || path.includes('/fixtures/')
  )
}

function isProductionSource(path) {
  return (
    path.startsWith('src/')
    && !isTestOrDocsPath(path)
    && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path)
  )
}

function isAttemptReferenceAllowed(path) {
  return allowedAttemptReferencePaths.some((pattern) => pattern.test(path))
}

function isProtectedRuntimePath(path) {
  return runtimeAttemptReferencePaths.some((pattern) => pattern.test(path))
}

function shouldScanContent(path) {
  if (path === guardScriptPath) return false
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|sql|json|ya?ml)$/.test(path)
}

function scanEntries(entries) {
  const failures = []

  for (const entry of entries) {
    if (!shouldScanContent(entry.path)) continue
    const content = entry.content
    if (!content.trim()) continue

    if (
      attemptReferencePattern.test(content)
      && (isProtectedRuntimePath(entry.path) || (isProductionSource(entry.path) && !isAttemptReferenceAllowed(entry.path)))
    ) {
      failures.push(`Runtime path references task-stage attempt helper/table: ${entry.path}`)
    }

    for (const { pattern, reason, isAllowed } of forbiddenPatterns) {
      if (pattern.test(content) && !isAllowed(entry.path)) {
        failures.push(`${reason}: ${entry.path}`)
      }
    }
  }

  return failures
}

const selfTestFixtures = [
  {
    name: 'blocks inline task-control-plane env reads outside the flag registry',
    entries: [
      {
        path: 'src/lib/scheduler.ts',
        content: 'const enabled = process.env.FEATURE_TASK_CONTROL_PLANE === "true"\n',
      },
    ],
    expected: 'Inline FEATURE_TASK_CONTROL_PLANE read outside src/lib/feature-flags.ts',
  },
  {
    name: 'allows task-control-plane env reads in the flag registry',
    entries: [
      {
        path: 'src/lib/feature-flags.ts',
        content: 'const raw = process.env.FEATURE_TASK_CONTROL_PLANE\n',
      },
    ],
    expectedPass: true,
  },
  {
    name: 'blocks runtime imports of task-stage-attempt helpers',
    entries: [
      {
        path: 'src/lib/scheduler.ts',
        content: "import { createTaskStageAttempt } from './task-stage-attempts'\n",
      },
    ],
    expected: 'Runtime path references task-stage attempt helper/table',
  },
  {
    name: 'blocks runtime attempt table references',
    entries: [
      {
        path: 'src/lib/task-dispatch.ts',
        content: "db.prepare('SELECT * FROM task_stage_attempts').all()\n",
      },
    ],
    expected: 'Runtime path references task-stage attempt helper/table',
  },
  {
    name: 'allows attempt table references in migrations',
    entries: [
      {
        path: 'src/lib/migrations.ts',
        content: 'CREATE TABLE IF NOT EXISTS task_stage_attempts (id INTEGER PRIMARY KEY)\n',
      },
    ],
    expectedPass: true,
  },
  {
    name: 'blocks direct production task inserts outside task-create',
    entries: [
      {
        path: 'src/app/api/admin/spec-013a/attempt-fixtures/route.ts',
        content: "db.prepare('INSERT INTO tasks (title) VALUES (?)').run(title)\n",
      },
    ],
    expected: 'Direct production task insert outside src/lib/task-create.ts',
  },
  {
    name: 'allows task inserts in tests',
    entries: [
      {
        path: 'src/lib/__tests__/task-stage-attempts-route.test.ts',
        content: "db.prepare('INSERT INTO tasks (title) VALUES (?)').run(title)\n",
      },
    ],
    expectedPass: true,
  },
  {
    name: 'blocks SPEC-013B claim authority drift',
    entries: [
      {
        path: 'src/lib/task-stage-attempts.ts',
        content: 'export function claimTaskStageAttempt() { return "claimed" }\n',
      },
    ],
    expected: 'SPEC-013B claim/reconciliation/one-active-attempt drift',
  },
  {
    name: 'blocks SPEC-013B one-active-attempt enforcement drift',
    entries: [
      {
        path: 'src/lib/migrations.ts',
        content: 'CREATE UNIQUE INDEX one_active_attempt ON task_stage_attempts(task_id) WHERE status = "running"\n',
      },
    ],
    expected: 'SPEC-013B claim/reconciliation/one-active-attempt drift',
  },
  {
    name: 'blocks SPEC-013B reconciliation drift',
    entries: [
      {
        path: 'src/lib/task-stage-attempts.ts',
        content: 'export function reconcileGitHubTerminalState() { return null }\n',
      },
    ],
    expected: 'SPEC-013B claim/reconciliation/one-active-attempt drift',
  },
  {
    name: 'blocks SPEC-014 sandbox drift',
    entries: [
      {
        path: 'src/app/api/tasks/[id]/stage-attempts/route.ts',
        content: 'const sandboxLifecycleState = "created"\n',
      },
    ],
    expected: 'SPEC-014 sandbox/adapter/harness drift',
  },
  {
    name: 'blocks SPEC-014 harness adapter drift',
    entries: [
      {
        path: 'src/lib/task-stage-attempts.ts',
        content: 'export const harnessAdapterRegistry = new Map()\n',
      },
    ],
    expected: 'SPEC-014 sandbox/adapter/harness drift',
  },
]

function runSelfTest() {
  const failures = []

  for (const fixture of selfTestFixtures) {
    const messages = scanEntries(fixture.entries)
    if (fixture.expectedPass) {
      if (messages.length > 0) {
        failures.push(`${fixture.name}: expected pass, got ${messages.join('; ')}`)
      }
    } else if (!messages.some((message) => message.includes(fixture.expected))) {
      failures.push(`${fixture.name}: expected ${fixture.expected}`)
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`SPEC-013A scope guard self-test failed: ${failure}`)
    }
    process.exit(1)
  }

  console.log(`SPEC-013A scope guard self-test passed (${selfTestFixtures.length} fixtures)`)
}

function runRepositoryGuard() {
  const baseRef = resolveBaseRef()
  const files = changedFiles(baseRef)
  const entries = files
    .filter((file) => existsSync(file.path) && shouldScanContent(file.path))
    .map((file) => ({
      path: file.path,
      content: file.tracked ? addedLinesInDiff(file.path, baseRef).join('\n') : readFileSync(file.path, 'utf8'),
    }))

  const failures = scanEntries(entries)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`SPEC-013A scope guard failed: ${failure}`)
    }
    process.exit(1)
  }

  console.log(`SPEC-013A scope guard passed (${files.length} changed files checked)`)
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  runRepositoryGuard()
}
