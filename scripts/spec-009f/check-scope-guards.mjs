#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const guardScriptPath = 'scripts/spec-009f/check-scope-guards.mjs'
const apiRoutePattern = /^src\/app\/api\/.+/
const committedReviewArtifactPattern = /^test-results\/spec-009f-triage-routing\//

const forbiddenChangedPathPatterns = [
  {
    pattern: /^docs\/ai\/workflows\/mission-control\/workflow-contract\.ya?ml$/,
    reason: 'workflow contract successor/template changes are out of SPEC-009F guard scope',
  },
  {
    pattern: /^src\/lib\/migrations\.ts$/,
    reason: 'SPEC-009F must not add or edit migrations',
  },
  {
    pattern: /^docs\/migrations\//,
    reason: 'SPEC-009F must not add migration rollback SQL',
  },
  {
    pattern: /^src\/lib\/__tests__\/migrations[-/]/,
    reason: 'SPEC-009F must not add migration tests',
  },
  {
    pattern: /^src\/lib\/github-(?:sync|label)/,
    reason: 'SPEC-009F must not add GitHub mutation or label application behavior',
  },
  {
    pattern: /^src\/app\/api\/github/,
    reason: 'SPEC-009F must not add GitHub mutation API behavior',
  },
  {
    pattern: /^src\/lib\/task-create\.ts$/,
    reason: 'SPEC-009F must not alter task creation paths',
  },
  {
    pattern: /^src\/lib\/.*(?:claim|runner|sandbox|adapter|auto-?merge)/i,
    reason: 'claim, runner, sandbox, adapter, and auto-merge work is deferred',
  },
  {
    pattern: /^src\/app\/api\/.*(?:claim|runner|sandbox|adapter|merge)/i,
    reason: 'claim, runner, sandbox, adapter, and auto-merge API work is deferred',
  },
]

const forbiddenContentPatterns = [
  {
    pattern:
      /\b(?:createIssueComment|updateIssue|closeIssue|addLabels|setLabels|removeLabel|addAssignees|requestReviewers|mergePullRequest)\b/i,
    reason: 'live GitHub issue, label, assignment, review, or merge mutation call',
  },
  {
    pattern: /\/issues\/[^`'"\s]+\/(?:comments|labels|assignees)\b/i,
    reason: 'live GitHub issue comment, label, or assignee endpoint',
  },
  {
    pattern: /\bstate\s*:\s*['"]closed['"]/i,
    reason: 'live GitHub issue close mutation',
  },
  {
    pattern: /\/pulls\/[^`'"\s]+\/merge\b/i,
    reason: 'live GitHub pull request merge endpoint',
  },
  {
    pattern: /\b(?:apply|sync|ensure|initialize|provision)[A-Za-z0-9_]*Labels?\b/i,
    reason: 'GitHub label application or provisioning behavior',
  },
  {
    pattern:
      /\bcreateTask\s*\([\s\S]{0,240}\bmission-control_(?:remediation_plan|specialist_route|close_issue|needs_spec_route)\b/i,
    reason: 'remediation or non-remediation successor task creation',
  },
  {
    pattern:
      /\b(?:successor_template_slug|next_template_slug|successorSlug)\s*[:=]\s*['"]mission-control_(?:remediation_plan|specialist_route|close_issue|needs_spec_route)['"]/i,
    reason: 'remediation or non-remediation successor template wiring',
  },
  {
    pattern:
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:task_)?claims?\b/i,
    reason: 'claim table migration drift',
  },
  {
    pattern:
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:workflow_)?runs?\b/i,
    reason: 'runner/run-state table migration drift',
  },
  {
    pattern:
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:sandbox|adapter)/i,
    reason: 'sandbox or adapter table migration drift',
  },
  {
    pattern:
      /\b(?:claimTask|createClaim|startRunner|launchRunner|createSandbox|openSandbox|adapterRegistry|autoMerge|auto_merge)\b/i,
    reason: 'claim, runner, sandbox, adapter, or auto-merge behavior',
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
  if (process.env.SPEC_009F_SCOPE_GUARD_BASE) {
    return process.env.SPEC_009F_SCOPE_GUARD_BASE
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

function readJsonAtRef(ref, file) {
  const content = tryGit(['show', `${ref}:${file}`])
  if (!content) return null
  return JSON.parse(content)
}

function packageRuntimeDependenciesChanged(baseRef) {
  const basePackage = readJsonAtRef(baseRef, 'package.json')
  if (!basePackage || !existsSync('package.json')) return false

  const currentPackage = JSON.parse(readFileSync('package.json', 'utf8'))
  const dependencyKeys = ['dependencies', 'optionalDependencies']
  return dependencyKeys.some((key) => {
    return JSON.stringify(basePackage[key] ?? {}) !== JSON.stringify(currentPackage[key] ?? {})
  })
}

function shouldScanContent(file) {
  if (file === guardScriptPath) return false
  if (file === 'src/lib/task-dispatch.ts') return false
  if (file.startsWith('specs/') || file.startsWith('docs/ai/specs/')) return false
  if (file.startsWith('docs/qa/')) return false
  if (file.includes('/__tests__/') || file.startsWith('tests/')) return false
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|sql|ya?ml)$/.test(file)
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

function taskDispatchHookChangeIsAllowed(file, baseRef) {
  if (file !== 'src/lib/task-dispatch.ts') return true
  const allowed = new Set([
    "import { routeTriageDisposition } from './triage-routing'",
    'const SPEC_009F_TERMINAL_DISPOSITION_FAILURES = new Set([',
    "  'DUPLICATE',",
    "  'OBSOLETE',",
    "  'INVALID',",
    "  'NEEDS_HUMAN',",
    "  'NEEDS_SPECIALIST',",
    "  'NEEDS_SPEC',",
    '])',
    '  const routingResult = routeTriageDisposition(db, {',
    '    taskId: parent.id,',
    '    workspaceId: parent.workspace_id,',
    '    disposition,',
    '    rationale,',
    '  })',
    '  if (',
    '    !routingResult.ok',
    '    && SPEC_009F_TERMINAL_DISPOSITION_FAILURES.has(disposition)',
    '    && (',
    "      routingResult.reason === 'payload_validation_failed'",
    "      || routingResult.reason === 'conflicting_disposition'",
    "      || routingResult.reason === 'artifact_publish_failed'",
    '    )',
    '  ) {',
    '    return',
    '  }',
    '',
  ])
  const unexpected = addedLinesInDiff(file, baseRef)
    .filter((line) => !allowed.has(line))
  return unexpected.length === 0
}

function fail(failures, message) {
  failures.push(message)
}

const baseRef = resolveBaseRef()
const files = changedFiles(baseRef)
const failures = []

for (const file of files) {
  if (file.status === 'A' && apiRoutePattern.test(file.path)) {
    fail(failures, `forbidden API route addition: ${file.path}`)
  }

  if (file.tracked && committedReviewArtifactPattern.test(file.path)) {
    fail(failures, `committed SPEC-009F review artifact is forbidden: ${file.path}`)
  }

  for (const { pattern, reason } of forbiddenChangedPathPatterns) {
    if (pattern.test(file.path)) {
      fail(failures, `forbidden path changed: ${file.path} (${reason})`)
    }
  }

  if (!taskDispatchHookChangeIsAllowed(file.path, baseRef)) {
    fail(
      failures,
      'src/lib/task-dispatch.ts changed outside the allowed SPEC-009F production routing hook',
    )
  }

  if (!shouldScanContent(file.path) || !existsSync(file.path)) continue

  const content = addedLinesInDiff(file.path, baseRef).join('\n')
  if (content.trim() === '') continue
  for (const { pattern, reason } of forbiddenContentPatterns) {
    if (pattern.test(content)) {
      fail(failures, `forbidden content in ${file.path}: ${reason}`)
    }
  }
}

if (packageRuntimeDependenciesChanged(baseRef)) {
  fail(failures, 'package.json runtime dependencies changed from the SPEC-009F base')
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`SPEC-009F scope guard failed: ${failure}`)
  }
  process.exit(1)
}

console.log(`SPEC-009F scope guard passed (${files.length} changed files checked)`)
