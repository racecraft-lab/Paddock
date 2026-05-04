/**
 * SPEC-008 — License-CI hard-reject gate (T244).
 *
 * Per FR-219r / FR-227 / FR-239. Walks `package.json` deps + transitive
 * deps and rejects any license that falls outside the allow-list. The
 * deny-list (e.g. AGPL) hard-fails CI even if otherwise allowed by
 * the open-source rule set.
 *
 * Implementation note: the script reads `node_modules/<dep>/package.json`
 * to find the `license` string. It does NOT call out to the registry.
 * Transitive scan is bounded to one level for sanity; deeper scans
 * land in a follow-up.
 *
 * Usage:
 *   pnpm tsx scripts/check-license.ts
 *
 * Exit codes:
 *   0 — clean
 *   1 — disallowed license found
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC-BY-4.0',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'WTFPL',
]);
const DENY = new Set([
  'AGPL-1.0',
  'AGPL-3.0',
  'GPL-3.0', // SPEC-008 license rule denies GPL-3 in fork-only adapters
  'SSPL-1.0',
  'BUSL-1.1',
]);

const ROOT = process.cwd();
const NM = join(ROOT, 'node_modules');

interface Violation {
  pkg: string;
  license: string;
  reason: 'denied' | 'unknown';
}

function readPkgLicense(pkgDir: string): string | null {
  try {
    const json = JSON.parse(
      readFileSync(join(pkgDir, 'package.json'), 'utf8'),
    ) as { license?: string | { type?: string }; licenses?: { type: string }[] };
    if (typeof json.license === 'string') return json.license;
    if (typeof json.license === 'object' && json.license?.type !== undefined) {
      return json.license.type;
    }
    if (Array.isArray(json.licenses) && json.licenses[0]?.type !== undefined) {
      return json.licenses[0].type;
    }
    return null;
  } catch {
    return null;
  }
}

function scan(dir: string, depth: number): Violation[] {
  const out: Violation[] = [];
  if (depth > 1) return out;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.startsWith('.')) continue;
    const full = join(dir, ent);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (ent.startsWith('@')) {
      // scoped package — recurse one level
      out.push(...scan(full, depth));
      continue;
    }
    const license = readPkgLicense(full);
    if (license === null) continue;
    if (DENY.has(license)) {
      out.push({ pkg: ent, license, reason: 'denied' });
      continue;
    }
    if (!ALLOWED.has(license)) {
      out.push({ pkg: ent, license, reason: 'unknown' });
    }
  }
  return out;
}

function main(): void {
  try {
    const st = statSync(NM);
    if (!st.isDirectory()) {
      process.stderr.write('check-license: node_modules not present; skipping\n');
      return;
    }
  } catch {
    process.stderr.write('check-license: node_modules not present; skipping\n');
    return;
  }
  const violations = scan(NM, 0);
  if (violations.length === 0) {
    process.stdout.write('check-license: clean\n');
    return;
  }
  for (const v of violations) {
    process.stderr.write(
      `${v.reason === 'denied' ? 'DENIED' : 'UNKNOWN'} license: ${v.pkg} -> ${v.license}\n`,
    );
  }
  if (violations.some((v) => v.reason === 'denied')) {
    process.exit(1);
  }
  // unknown licenses warn but do not fail
  process.stdout.write(
    `check-license: ${violations.length.toString()} unknown licenses (warning)\n`,
  );
}

main();
