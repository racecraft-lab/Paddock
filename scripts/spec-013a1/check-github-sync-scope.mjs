#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const guardScriptPath = 'scripts/spec-013a1/check-github-sync-scope.mjs'

const forbiddenPatterns = [
  {
    pattern: /\b(?:claimTask[A-Za-z0-9_]*|claim_owner|claimed_by|claim_token|one[_-]?active[_-]?attempt|active_owner|lock_owner)\b/i,
    reason: 'task claim authority is out of scope for SPEC-013A1',
  },
  {
    pattern: /\b(?:dispatchTask[A-Za-z0-9_]*|launchTask[A-Za-z0-9_]*|scheduleTaskAttempt[A-Za-z0-9_]*|runnerLaunch[A-Za-z0-9_]*)\b/i,
    reason: 'task dispatch or launch behavior is out of scope for SPEC-013A1',
  },
  {
    pattern: /\b(?:Issue Remediation|issue_remediation|ACTIONABLE_REMEDIATION|remediation execution|executeRemediation[A-Za-z0-9_]*)\b/i,
    reason: 'Issue Remediation execution is out of scope for SPEC-013A1',
  },
  {
    pattern: /\b(?:sandboxLifecycle[A-Za-z0-9_]*|createSandbox[A-Za-z0-9_]*|openSandbox[A-Za-z0-9_]*|harnessAdapter[A-Za-z0-9_]*|harness_adapter|launchHarness[A-Za-z0-9_]*)\b/i,
    reason: 'sandbox and harness lifecycle behavior is out of scope for SPEC-013A1',
  },
  {
    pattern: /\b(?:autoMerge[A-Za-z0-9_]*|mergePullRequest[A-Za-z0-9_]*|automatic triage|auto[_-]?triage)\b/i,
    reason: 'auto-merge and automatic triage behavior is out of scope for SPEC-013A1',
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
  if (process.env.SPEC_013A1_SCOPE_GUARD_BASE) return process.env.SPEC_013A1_SCOPE_GUARD_BASE
  return tryGit(['merge-base', 'origin/main', 'HEAD']) || git(['rev-parse', 'HEAD'])
}

function parseNameStatus(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t').at(-1))
    .filter(Boolean)
}

function parseShortStatus(output) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim()
      return rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath
    })
    .filter(Boolean)
}

function changedFiles(baseRef) {
  return Array.from(new Set([
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', baseRef, 'HEAD'])),
    ...parseNameStatus(tryGit(['diff', '--cached', '--name-status', '--find-renames'])),
    ...parseNameStatus(tryGit(['diff', '--name-status', '--find-renames', 'HEAD'])),
    ...parseShortStatus(tryGit(['status', '--short', '--untracked-files=all'])),
  ])).sort()
}

function addedLinesInDiff(file, baseRef) {
  return [
    tryGit(['diff', '--unified=0', baseRef, 'HEAD', '--', file]),
    tryGit(['diff', '--cached', '--unified=0', '--', file]),
    tryGit(['diff', '--unified=0', 'HEAD', '--', file]),
  ]
    .join('\n')
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
}

function isScannedPath(path) {
  if (path === guardScriptPath) return false
  if (path.includes('/__tests__/') || path.includes('/fixtures/') || path.startsWith('tests/')) return false
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml)$/.test(path)
}

function scanEntries(entries) {
  const failures = []
  for (const entry of entries) {
    for (const line of entry.lines) {
      for (const { pattern, reason } of forbiddenPatterns) {
        if (pattern.test(line)) {
          failures.push(`${reason}: ${entry.path}`)
        }
      }
    }
  }
  return Array.from(new Set(failures)).sort()
}

function runSelfTest() {
  const failures = scanEntries([
    { path: 'src/lib/github-sync-lifecycle.ts', lines: ['const claim_owner = "agent"'] },
    { path: 'src/components/panels/github-sync-panel.tsx', lines: ['Automatic triage is enabled'] },
  ])
  if (failures.length !== 2) {
    console.error(`[spec-013a1-scope] self-test expected 2 failures, got ${failures.length}`)
    process.exit(1)
  }
  console.log('[spec-013a1-scope] self-test passed')
}

function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
    return
  }

  const baseRef = resolveBaseRef()
  const entries = changedFiles(baseRef)
    .filter(isScannedPath)
    .map((path) => {
      const lines = addedLinesInDiff(path, baseRef)
      if (lines.length > 0) return { path, lines }
      try {
        return { path, lines: readFileSync(path, 'utf8').split('\n') }
      } catch {
        return { path, lines: [] }
      }
    })

  const failures = scanEntries(entries)
  if (failures.length > 0) {
    console.error('[spec-013a1-scope] forbidden authority drift detected:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(`[spec-013a1-scope] passed (${entries.length} changed file(s) scanned)`)
}

main()
