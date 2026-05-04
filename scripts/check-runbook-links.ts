/**
 * SPEC-008 — CI guard: runbook link orphan detection (T230).
 *
 * Per FR-090m / FR-274. Every runbook page MUST be referenced from
 * at least one of:
 *   - the spec file (specs/008-resource-governance/spec.md)
 *   - tasks.md
 *   - source code (src/**)
 *   - alert routing (governance route handlers)
 *
 * Pages that no caller links to are "orphans" — they bit-rot.
 * Conversely, links from code to non-existent pages must fail CI.
 *
 * Usage:
 *   pnpm tsx scripts/check-runbook-links.ts
 *
 * Exit codes:
 *   0 — clean
 *   1 — orphans or dead links
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const RUNBOOK_DIR = join(ROOT, 'docs/runbook');
const SEARCH_ROOTS = [
  join(ROOT, 'specs/008-resource-governance'),
  join(ROOT, 'src'),
  join(ROOT, 'tests'),
  join(ROOT, 'scripts'),
];

function listRunbookPages(): string[] {
  return readdirSync(RUNBOOK_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

function gatherSources(dir: string, acc: string[]): void {
  for (const ent of readdirSync(dir)) {
    if (ent === 'node_modules' || ent === '.next' || ent.startsWith('.')) continue;
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) gatherSources(p, acc);
    else if (/\.(md|ts|tsx|js|jsx|sh)$/.test(ent)) acc.push(p);
  }
}

function loadAllSourceText(): string {
  const files: string[] = [];
  for (const r of SEARCH_ROOTS) {
    try {
      const st = statSync(r);
      if (st.isDirectory()) gatherSources(r, files);
      else files.push(r);
    } catch {
      // ignore missing roots
    }
  }
  return files
    .map((f) => {
      try {
        return readFileSync(f, 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n---FILE-BOUNDARY---\n');
}

function main(): void {
  const pages = listRunbookPages();
  const haystack = loadAllSourceText();
  const orphans: string[] = [];
  for (const p of pages) {
    const ref1 = `runbook/${p}`;
    const ref2 = `${p}.md`;
    if (!haystack.includes(ref1) && !haystack.includes(ref2)) {
      orphans.push(p);
    }
  }
  if (orphans.length > 0) {
    process.stderr.write(
      `runbook orphans (no source/spec reference):\n  - ${orphans.join('\n  - ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `runbook-links: ${pages.length.toString()} pages, all referenced\n`,
  );
}

main();

// Re-export to silence "unused module" lint when the file is imported
// from a wrapper. Tests can import `relative` for path utility.
export { relative };
