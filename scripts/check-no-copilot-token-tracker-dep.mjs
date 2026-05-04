#!/usr/bin/env node
// SPEC-008 — CI guard: this repository MUST NOT take a runtime or
// development dependency on the third-party `J-Bax/copilot-token-tracker`
// package. Per FR-219s and tasks.md T124, the SPEC-008 telemetry layer
// owns Copilot CLI ingestion via the first-party adapter
// `src/lib/observability/adapters/copilot-events-jsonl.ts` (T099 / T100).
// The third-party tracker has an unreviewed runtime contract and ships a
// schema-versioning policy incompatible with FR-090d / FR-090d1.
//
// Two independent failure modes guard the rejection:
//
//   1. `package.json` deps + devDeps + optionalDeps + peerDeps must NOT
//      list the package under any name spelling.
//   2. Source files under `src/` must NOT import the package by any
//      identifier (`copilot-token-tracker`, `@J-Bax/copilot-token-tracker`,
//      `J-Bax/copilot-token-tracker`).
//
// Failure prints an informative message naming the first-party
// replacement and exits non-zero. No external dependencies — uses the
// Node std lib (`fs`, `path`).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

// Disallowed package identifiers. Cover the namespaced and bare spellings
// the upstream README has shipped under across versions.
const DISALLOWED_PACKAGES = [
  'copilot-token-tracker',
  '@J-Bax/copilot-token-tracker',
  'J-Bax/copilot-token-tracker',
]

// Replacement adapter (used in the failure message only).
const REPLACEMENT_ADAPTER = 'src/lib/observability/adapters/copilot-events-jsonl.ts'

// Directories the file walker MUST skip. Anything generated, vendored,
// or out-of-tree. Without these excludes a recursive readdirSync on
// node_modules can take minutes and emit gigabytes of output.
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.tsbuild',
  '.git',
  'dist',
  'build',
  'coverage',
  '.specify',
  '.worktrees',
  'storybook-static',
  '.gitnexus',
  'playwright-report',
  'test-results',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'])

function checkPackageJson() {
  const pkgPath = join(ROOT, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    console.error('check-no-copilot-token-tracker-dep: cannot read package.json:')
    console.error(String(err))
    process.exit(2)
  }
  const buckets = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
  const offences = []
  for (const bucket of buckets) {
    const entries = pkg[bucket]
    if (!entries || typeof entries !== 'object') continue
    for (const name of Object.keys(entries)) {
      for (const banned of DISALLOWED_PACKAGES) {
        if (name === banned || name.toLowerCase() === banned.toLowerCase()) {
          offences.push({ bucket, name })
        }
      }
    }
  }
  return offences
}

function walkSourceFiles(dir, out) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.') {
      // Allow .ts/.tsx/etc. but skip dotdirs except the explicit skip list.
      // We've already filtered SKIP_DIRS below, so most dotdirs fall here.
      if (SKIP_DIRS.has(entry)) continue
    }
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkSourceFiles(full, out)
      continue
    }
    if (!st.isFile()) continue
    const dot = entry.lastIndexOf('.')
    if (dot < 0) continue
    const ext = entry.slice(dot)
    if (!SOURCE_EXTS.has(ext)) continue
    out.push(full)
  }
}

// Patterns matching every realistic ES-module / CommonJS reference. The
// regexes target the package identifier, anchored on either an `import`
// statement, a dynamic `import()`, a `require()` call, or a TypeScript
// `import type` form. Each banned identifier is matched verbatim — we
// don't loosen to a substring search because that would false-positive
// on documentation strings that mention the package name.
function buildSourcePatterns() {
  const patterns = []
  for (const banned of DISALLOWED_PACKAGES) {
    // Escape regex metacharacters in the package name (covers '@' and '/').
    const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Static import:   import ... from 'banned'
    // Dynamic import:  import('banned')
    // CJS require:     require('banned')
    // Re-export:       export ... from 'banned'
    patterns.push(new RegExp(
      `(?:` +
      `import\\s+[^'"\\n;]*\\s+from\\s+['"]${escaped}['"]` +
      `|import\\s*\\(\\s*['"]${escaped}['"]\\s*\\)` +
      `|import\\s+['"]${escaped}['"]` +
      `|require\\s*\\(\\s*['"]${escaped}['"]\\s*\\)` +
      `|export\\s+[^'"\\n;]*\\s+from\\s+['"]${escaped}['"]` +
      `)`,
      'm',
    ))
  }
  return patterns
}

function checkSourceTree() {
  const files = []
  walkSourceFiles(join(ROOT, 'src'), files)
  const patterns = buildSourcePatterns()
  const offences = []
  for (const file of files) {
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (let i = 0; i < patterns.length; i += 1) {
      if (patterns[i].test(content)) {
        offences.push({ file: relative(ROOT, file), pattern: DISALLOWED_PACKAGES[i] })
      }
    }
  }
  return offences
}

function main() {
  const pkgOffences = checkPackageJson()
  const srcOffences = checkSourceTree()
  if (pkgOffences.length === 0 && srcOffences.length === 0) {
    console.log('check-no-copilot-token-tracker-dep: OK — no offending dependencies or imports.')
    return
  }
  console.error('check-no-copilot-token-tracker-dep: FAILED')
  console.error('')
  if (pkgOffences.length > 0) {
    console.error('package.json declares disallowed dependency:')
    for (const o of pkgOffences) {
      console.error(`  - ${o.bucket}.${o.name}`)
    }
    console.error('')
  }
  if (srcOffences.length > 0) {
    console.error('source files import disallowed package:')
    for (const o of srcOffences) {
      console.error(`  - ${o.file} imports "${o.pattern}"`)
    }
    console.error('')
  }
  console.error('Per FR-219s, the SPEC-008 telemetry layer owns Copilot CLI')
  console.error('ingestion via the first-party adapter:')
  console.error(`  ${REPLACEMENT_ADAPTER}`)
  console.error('')
  console.error('Remove the offending dependency or import and route through')
  console.error('the first-party adapter (T099 / T100).')
  process.exit(1)
}

main()
