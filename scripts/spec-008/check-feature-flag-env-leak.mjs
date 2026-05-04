#!/usr/bin/env node
/**
 * SPEC-008 — T353 — Feature-flag env-leak CI guard.
 *
 * Per FR-019 + FR-325: any `process.env.FEATURE_*` reference outside
 * `src/lib/feature-flags.ts` is a configuration leak (it bypasses the
 * `resolveFlag` env-override semantics that gate the workspace flag
 * activation).
 *
 * Allowed exceptions:
 *   - `src/lib/feature-flags.ts` itself.
 *   - Test files under `src/**__tests__/**`, `tests/**` (verifying the
 *     env-override semantics).
 *   - `scripts/spec-008/**` (this guard + matrix harness verification).
 *   - `playwright.config.ts` (env passthrough to the test webServer).
 *
 * Exit 0 on success, 1 on leak detected.
 *
 * Usage: node scripts/spec-008/check-feature-flag-env-leak.mjs
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(process.cwd(), 'src')
const PATTERN = /process\.env\.FEATURE_[A-Z_]+/g
const ALLOWED_FILES = new Set([
  path.resolve(process.cwd(), 'src/lib/feature-flags.ts'),
])
const ALLOWED_DIR_PREFIXES = [
  path.resolve(process.cwd(), 'src/lib/__tests__'),
  path.resolve(process.cwd(), 'src/components/__tests__'),
  path.resolve(process.cwd(), 'src/app/api/__tests__'),
  path.resolve(process.cwd(), 'src/lib/observability/__tests__'),
  path.resolve(process.cwd(), 'src/types/'),
  path.resolve(process.cwd(), 'tests/'),
  path.resolve(process.cwd(), 'scripts/spec-008'),
]

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules and build outputs.
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === '.tsbuild' ||
        entry.name === 'dist'
      )
        continue
      yield* walk(full)
    } else if (
      entry.name.endsWith('.ts') ||
      entry.name.endsWith('.tsx') ||
      entry.name.endsWith('.mjs') ||
      entry.name.endsWith('.js')
    ) {
      yield full
    }
  }
}

function isAllowed(file) {
  if (ALLOWED_FILES.has(file)) return true
  for (const prefix of ALLOWED_DIR_PREFIXES) {
    if (file.startsWith(prefix + path.sep) || file === prefix) return true
  }
  return false
}

async function main() {
  // Sanity — make sure the root exists.
  try {
    await stat(ROOT)
  } catch {
    console.error(`[spec-008] feature-flag env leak guard: src/ not found`)
    process.exit(2)
  }

  const offenders = []
  for await (const file of walk(ROOT)) {
    if (isAllowed(file)) continue
    const src = await readFile(file, 'utf8')
    // Strip block comments (/* … */) and line comments (// …) before
    // scanning so JSDoc that documents the pattern doesn't trip the
    // guard. The trade-off is that a leak hidden by a trailing
    // comment slipping past the line scan; the lint rule paired with
    // this guard catches that case.
    const sansBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
    const sansLineComments = sansBlockComments.replace(/\/\/[^\n]*/g, '')
    if (PATTERN.test(sansLineComments)) {
      offenders.push(file)
    }
  }

  if (offenders.length > 0) {
    console.error('[spec-008] feature-flag env leak detected (FR-019 / FR-325).')
    console.error('  The following files reference `process.env.FEATURE_*` outside the allowed scope:')
    for (const f of offenders) console.error(`    - ${path.relative(process.cwd(), f)}`)
    console.error('')
    console.error('  Fix: route flag reads through `resolveFlag(name, ctx)` in src/lib/feature-flags.ts.')
    process.exit(1)
  }

  console.log('[spec-008] feature-flag env-leak check OK.')
}

main().catch((err) => {
  console.error('[spec-008] check-feature-flag-env-leak internal error:', err)
  process.exit(2)
})
