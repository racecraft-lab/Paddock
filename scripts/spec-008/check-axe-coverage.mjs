#!/usr/bin/env node
/**
 * SPEC-008 — T319 axe-core coverage CI guard.
 *
 * Per FR-090n WCAG 2.1 AA: every Playwright spec under
 *   tests/e2e/governance-*.{e2e,spec}.ts
 *   tests/e2e/spec-008-*.{e2e,spec}.ts
 * MUST contain at least one `axeAssert(` call. Scans source-text
 * statically — does NOT execute the specs.
 *
 * Exits with code 0 on success, 1 if any spec is uncovered.
 *
 * Usage: node scripts/spec-008/check-axe-coverage.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const SPEC_DIR = path.resolve(process.cwd(), 'tests', 'e2e')
const SPEC_PATTERN = /^governance-.+\.(e2e|spec)\.ts$|^spec-008-.+\.(e2e|spec)\.ts$/
// Files that are pure scaffolds / placeholders explicitly excluded
// from the coverage requirement. Currently empty; populate only if a
// spec is reduced to a deferred placeholder per spec evolution.
const EXEMPT = new Set([])

async function main() {
  const entries = await readdir(SPEC_DIR)
  const specs = entries.filter((f) => SPEC_PATTERN.test(f) && !EXEMPT.has(f))

  const failures = []
  for (const spec of specs) {
    const full = path.join(SPEC_DIR, spec)
    const src = await readFile(full, 'utf8')
    if (!/\baxeAssert\(/.test(src)) {
      failures.push(spec)
    }
  }

  if (failures.length > 0) {
    console.error('[spec-008] axe-core coverage check FAILED.')
    console.error('  The following specs have NO `axeAssert(` calls (FR-090n):')
    for (const f of failures) console.error(`    - tests/e2e/${f}`)
    console.error('')
    console.error('  Fix: import { axeAssert } from "./spec-008/governance-axe-shim"')
    console.error('       and call `await axeAssert(page, "<state-label>")` on every page-state.')
    process.exit(1)
  }

  console.log(`[spec-008] axe-core coverage check OK (${specs.length} specs scanned).`)
}

main().catch((err) => {
  console.error('[spec-008] check-axe-coverage internal error:', err)
  process.exit(2)
})
