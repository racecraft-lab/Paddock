#!/usr/bin/env node
// SPEC-008 — CI guard: every observability adapter MUST appear as an
// H2 anchor in docs/observability/provider-tos-considerations.md.
//
// Per FR-219x and tasks.md T123. Walks
// src/lib/observability/adapters/*.ts, derives the basename of each
// adapter (e.g., claude-code-otel), and asserts the doc contains a
// matching "## <basename>" heading. Orphan adapters fail the build so
// the operator-facing ToS surface stays in sync with the runtime
// adapter set.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const ADAPTER_DIR = join(ROOT, 'src/lib/observability/adapters')
const TOS_DOC = join(ROOT, 'docs/observability/provider-tos-considerations.md')

// Helper modules: not runnable adapters (no init/disable surface) and
// therefore exempt from the orphan-doc check. Keep this list narrow —
// every entry is a deliberate carve-out justified in a code comment
// inside the helper module itself.
const HELPER_MODULES = new Set([
  'copilot-schema-versioning', // schema-tier resolver consumed by copilot-events-jsonl
])

function listAdapterBasenames() {
  let entries
  try {
    entries = readdirSync(ADAPTER_DIR)
  } catch (err) {
    console.error('check-tos-doc: cannot read adapters dir:', ADAPTER_DIR)
    console.error(String(err))
    process.exit(2)
  }
  const basenames = []
  for (const entry of entries) {
    if (!entry.endsWith('.ts')) continue
    if (entry.startsWith('_')) continue // underscore-prefixed helpers
    const base = entry.replace(/\.ts$/, '')
    if (HELPER_MODULES.has(base)) continue
    basenames.push(base)
  }
  return basenames.sort()
}

function loadDocHeadings() {
  let content
  try {
    content = readFileSync(TOS_DOC, 'utf8')
  } catch (err) {
    console.error('check-tos-doc: cannot read doc:', TOS_DOC)
    console.error(String(err))
    process.exit(2)
  }
  const headings = new Set()
  for (const line of content.split('\n')) {
    const match = /^##\s+([\S]+)\s*$/.exec(line)
    if (match !== null && match[1]) {
      headings.add(match[1].trim())
    }
  }
  return headings
}

function main() {
  const adapters = listAdapterBasenames()
  const headings = loadDocHeadings()
  const missing = adapters.filter((name) => !headings.has(name))
  if (missing.length > 0) {
    console.error('check-tos-doc: orphan adapters with no matching H2 in')
    console.error('  ' + TOS_DOC)
    for (const name of missing) {
      console.error('  - ' + name)
    }
    console.error('')
    console.error('Add a `## <name>` section per FR-219x H2 structure (Surface / Default state / ToS notes / Risk / Fallback / Acknowledgment).')
    process.exit(1)
  }
  console.log('check-tos-doc: OK — ' + adapters.length + ' adapters, all documented.')
}

main()
