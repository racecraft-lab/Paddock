/**
 * SPEC-008 — CI guard: runbook link orphan detection (T230).
 *
 * Per FR-090m / FR-274. Every runbook page MUST be referenced from
 * at least one of:
 *   - archived SPEC-008 workflow or verification evidence
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
  join(ROOT, 'docs/ai/specs/SPEC-008-workflow.md'),
  join(ROOT, 'docs/ai/specs/SPEC-008-summary.md'),
  join(ROOT, 'docs/ai/specs/SPEC-008-verification-evidence.md'),
  join(ROOT, 'docs/ai/specs/SPEC-008-retrospective.md'),
  join(ROOT, 'src'),
  join(ROOT, 'tests'),
  join(ROOT, 'scripts'),
  join(ROOT, 'docs/observability'),
  join(ROOT, 'docs/operator-guides'),
  join(ROOT, 'docs/orchestration.md'),
];

const RUNBOOK_LINK_RE = /(?:docs\/runbook\/|\/runbook\/)([A-Za-z0-9_.-]+?)(?:\.md)?(?:#[A-Za-z0-9_.-]+)?(?=[`'")\s,}\]]|$)/g;

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

function findDeadRunbookLinks(haystack: string, pages: Set<string>): string[] {
  const dead = new Set<string>();
  for (const match of haystack.matchAll(RUNBOOK_LINK_RE)) {
    const rawName = match[1];
    if (!rawName || rawName.startsWith('docs/')) continue;
    const pageName = rawName.replace(/\.md$/, '');
    if (!pages.has(pageName)) {
      dead.add(match[0]);
    }
  }
  return [...dead].sort();
}

function main(): void {
  const pages = listRunbookPages();
  const pageSet = new Set(pages);
  const haystack = loadAllSourceText();
  const orphans: string[] = [];
  for (const p of pages) {
    const ref1 = `runbook/${p}`;
    const ref2 = `${p}.md`;
    if (!haystack.includes(ref1) && !haystack.includes(ref2)) {
      orphans.push(p);
    }
  }
  const deadLinks = findDeadRunbookLinks(haystack, pageSet);
  if (orphans.length > 0 || deadLinks.length > 0) {
    if (deadLinks.length > 0) {
      process.stderr.write(
        `runbook dead links:\n  - ${deadLinks.join('\n  - ')}\n`,
      );
    }
    if (orphans.length > 0) {
      process.stderr.write(
        `runbook orphans (no source/spec reference):\n  - ${orphans.join('\n  - ')}\n`,
      );
    }
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
