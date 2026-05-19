#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const forbiddenPathPatterns = [
  /^src\/app\/api\/github-sync\//,
  /^src\/app\/api\/workflow-runs\//,
  /^src\/app\/api\/evidence\//,
  /^src\/components\/.*evidence/i,
  /^src\/lib\/.*sandbox/i,
  /^src\/lib\/.*adapter/i,
  /^src\/lib\/.*claim/i,
  /^src\/lib\/.*runner/i,
]

const forbiddenContentPatterns = [
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:task_)?claims?\b/i,
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:workflow_)?runs?\b/i,
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:sandbox|adapter)/i,
  /ready_for_owner\s*[-=]>?\s*done/i,
  /github_pr_merged[\s\S]{0,120}ready_for_owner[\s\S]{0,120}done/i,
]

function changedFiles() {
  const diffOutput = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' })
  const statusOutput = execFileSync('git', ['status', '--short', '--untracked-files=all'], { encoding: 'utf8' })
  const paths = new Set(diffOutput.split('\n').map((line) => line.trim()).filter(Boolean))
  for (const line of statusOutput.split('\n')) {
    const path = line.slice(3).trim()
    if (path.length > 0) paths.add(path)
  }
  return Array.from(paths).sort()
}

function fail(message) {
  console.error(`SPEC-009C3 scope guard failed: ${message}`)
  process.exitCode = 1
}

const files = changedFiles()
for (const file of files) {
  if (forbiddenPathPatterns.some((pattern) => pattern.test(file))) {
    fail(`forbidden path changed: ${file}`)
  }
  if (file === 'scripts/spec-009c3/check-scope-guards.mjs') continue
  if (/\.md$/.test(file)) continue
  if (!/\.(?:ts|tsx|js|jsx|mjs|sql|md|ya?ml)$/.test(file)) continue
  let content = ''
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const pattern of forbiddenContentPatterns) {
    if (pattern.test(content)) {
      fail(`forbidden deferred-scope content in ${file}: ${pattern}`)
    }
  }
}

if (process.exitCode && process.exitCode !== 0) process.exit()
console.log(`SPEC-009C3 scope guard passed (${files.length} changed files checked)`)
