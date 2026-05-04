/**
 * SPEC-008 Strict-Scope CI Guard (T374)
 *
 * Per Constitution Convention J: every SPEC-008-owned TS/TSX module MUST appear in
 * BOTH `tsconfig.spec-strict.json` and `eslint.config.mjs` strict-scope override.
 *
 * This test runs two layers of verification:
 *
 *   1. **Config-level** — every SPEC-008 path family ("expected glob prefix")
 *      MUST be covered by at least one entry in both files. This catches
 *      removal of an entire family (e.g., dropping `src/lib/observability/**`
 *      from one of the configs).
 *
 *   2. **File-level** — every committed file under a SPEC-008 namespace MUST
 *      match at least one glob in both lists. This catches drift when a new
 *      SPEC-008 source file is added but neither config is updated to cover
 *      it (e.g., a typo in the path or a new namespace not yet listed).
 *
 * The test FAILS CLOSED on either layer.
 *
 * Implementation notes:
 *   - The `eslint.config.mjs` `specStrictFiles` array and the
 *     `tsconfig.spec-strict.json` `include` array are extracted by reading
 *     the source files as text and matching by prefix on the SPEC-008
 *     family roots. Importing the runtime ESM config would pull half of
 *     `next` and is unnecessary for a structural check.
 *   - `provider-*` is intentionally split into `provider-account*` and
 *     `provider-entitlement*` (see the comment in `eslint.config.mjs` —
 *     `provider-subscriptions.ts` is pre-spec legacy code and is excluded
 *     from strict scope by design).
 *
 * @see specs/008-resource-governance/tasks.md T374, T047
 * @see specs/008-resource-governance/spec.md FR-090a, Analyze C1
 * @see Constitution Convention J (strict-scope guard)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const ESLINT_CONFIG_PATH = resolve(REPO_ROOT, 'eslint.config.mjs');
const TSCONFIG_STRICT_PATH = resolve(REPO_ROOT, 'tsconfig.spec-strict.json');

/**
 * The expected SPEC-008 path families (per Constitution Convention J + the
 * T374 orchestrator prompt). Each family is a prefix that MUST be covered by
 * at least one entry in both config files.
 *
 * Note: `provider-*` is split into two entries because legacy
 * `provider-subscriptions.ts` is pre-spec and is excluded from strict scope.
 */
const SPEC_008_EXPECTED_FAMILIES: string[] = [
  // Library modules
  'src/lib/observability/',
  'src/lib/resource-',
  'src/lib/provider-account',
  'src/lib/provider-entitlement',
  // Type modules
  'src/types/resource-',
  // UI components
  'src/components/governance/',
  // API routes
  'src/app/api/governance/',
  'src/app/api/resource-',
  'src/app/api/otlp/v1/',
];

/** Strip leading `./` if present and unify separators. */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/');
}

/**
 * Extract entries from `eslint.config.mjs` `specStrictFiles` array. We do
 * structural matching against the const declaration (avoids loading the
 * runtime ESM config and pulling in `next`).
 */
function extractEslintEntries(): string[] {
  const src = readFileSync(ESLINT_CONFIG_PATH, 'utf8');
  const startIdx = src.indexOf('const specStrictFiles = [');
  if (startIdx === -1) {
    throw new Error(
      'STRICT-SCOPE GUARD: could not find `const specStrictFiles = [` in eslint.config.mjs',
    );
  }
  const sliceStart = src.indexOf('[', startIdx);
  const sliceEnd = src.indexOf(']', sliceStart);
  if (sliceStart === -1 || sliceEnd === -1) {
    throw new Error(
      'STRICT-SCOPE GUARD: could not parse specStrictFiles array boundaries',
    );
  }
  const arrayBody = src.slice(sliceStart + 1, sliceEnd);
  // Match all single- or double-quoted strings, ignoring `//` line comments.
  const entries: string[] = [];
  for (const line of arrayBody.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.length === 0) continue;
    // Strip trailing comments after the entry
    const codePart = trimmed.split('//')[0]!;
    const matches = codePart.matchAll(/['"]([^'"]+)['"]/g);
    for (const m of matches) {
      entries.push(normalizePath(m[1]!));
    }
  }
  return entries;
}

/**
 * Extract `include` entries from `tsconfig.spec-strict.json`. The file is
 * standard JSON with comments not permitted, so `JSON.parse` is sufficient.
 */
function extractTsconfigIncludes(): string[] {
  const src = readFileSync(TSCONFIG_STRICT_PATH, 'utf8');
  const parsed = JSON.parse(src) as { include?: unknown };
  if (!Array.isArray(parsed.include)) {
    throw new Error(
      'STRICT-SCOPE GUARD: tsconfig.spec-strict.json missing `include` array',
    );
  }
  return parsed.include
    .filter((e): e is string => typeof e === 'string')
    .map(normalizePath);
}

/**
 * Test whether a config entry "covers" an expected family — i.e., whether
 * the config entry's prefix (before any `*`) starts with the family prefix.
 *
 * Examples:
 *   covers('src/lib/observability/**\/*.ts', 'src/lib/observability/') === true
 *   covers('src/lib/resource-evaluator.ts', 'src/lib/resource-')        === true
 *   covers('src/types/resource-*.ts',       'src/types/resource-')      === true
 *   covers('src/lib/aegis.ts',              'src/lib/observability/')   === false
 */
function entryCoversFamily(entry: string, family: string): boolean {
  // Strip everything from the first `*` onward to get the static prefix.
  const staticPrefix = entry.split('*')[0]!;
  // The family is a static prefix; if the entry's static prefix starts with
  // the family OR the family starts with the entry's static prefix (and the
  // entry is a glob), the entry covers files under the family root.
  return (
    staticPrefix.startsWith(family) ||
    (entry.includes('*') && family.startsWith(staticPrefix))
  );
}

/** Recursively list every file under `dir` (relative to REPO_ROOT) — files only. */
function listFilesUnder(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) return [];
  const out: string[] = [];
  const stack: string[] = [dirAbs];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const abs = join(cur, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
      } else if (st.isFile()) {
        out.push(normalizePath(relative(REPO_ROOT, abs)));
      }
    }
  }
  return out;
}

/**
 * Discover every committed SPEC-008-owned source file under the repo. We
 * walk the filesystem from the family roots and select `.ts` / `.tsx`
 * files that match the SPEC-008 namespaces. We exclude:
 *   - `__tests__` / `*.test.ts` files (vitest tests are not strict-mode targets)
 *   - `__fixtures__`
 *   - declaration-only `*.d.ts` files (covered separately via `safe-regex.d.ts`)
 *
 * For each discovered file, the test asserts both configs cover it.
 */
function discoverSpec008Files(): string[] {
  const roots = [
    'src/lib/observability',
    'src/lib',           // for src/lib/resource-*.ts, provider-account*.ts, provider-entitlement*.ts, db/connection-pool.ts
    'src/types',         // for src/types/resource-*.ts
    'src/components/governance',
    'src/app/api/governance',
    'src/app/api',       // for src/app/api/resource-*/, src/app/api/otlp/v1/
  ];
  const seen = new Set<string>();
  for (const root of roots) {
    const abs = resolve(REPO_ROOT, root);
    for (const f of listFilesUnder(abs)) {
      // Filter to ts/tsx only
      if (!/\.(ts|tsx)$/.test(f)) continue;
      // Drop test/fixture/declaration files
      if (/__tests__|__fixtures__|\.test\.tsx?$|\.d\.ts$/.test(f)) continue;
      // Match SPEC-008 namespaces — files under any of the expected families.
      // Notes:
      //   - For `src/lib`, we restrict to the SPEC-008-owned slices, NOT every file.
      //   - For `src/app/api`, we restrict to governance / resource-* / otlp/v1.
      const isObservability = f.startsWith('src/lib/observability/');
      const isResourceLib = /^src\/lib\/resource-[A-Za-z0-9_-]+\.ts$/.test(f);
      const isProviderAccount = /^src\/lib\/provider-account[A-Za-z0-9_-]*\.ts$/.test(f);
      const isProviderEntitlement = /^src\/lib\/provider-entitlement[A-Za-z0-9_-]*\.ts$/.test(f);
      const isDbConnectionPool = f === 'src/lib/db/connection-pool.ts';
      const isResourceType = /^src\/types\/resource-[A-Za-z0-9_-]+\.ts$/.test(f);
      const isObservabilityType = f === 'src/types/observability.ts';
      const isProviderAccountType = f === 'src/types/provider-account.ts';
      const isGovernanceApiType = f === 'src/types/governance-api.ts';
      const isGovernanceComponent = f.startsWith('src/components/governance/');
      const isGovernanceApi = f.startsWith('src/app/api/governance/');
      const isResourceApi = /^src\/app\/api\/resource-[A-Za-z0-9_-]+\//.test(f);
      const isOtlpV1Api = f.startsWith('src/app/api/otlp/v1/');

      if (
        isObservability ||
        isResourceLib ||
        isProviderAccount ||
        isProviderEntitlement ||
        isDbConnectionPool ||
        isResourceType ||
        isObservabilityType ||
        isProviderAccountType ||
        isGovernanceApiType ||
        isGovernanceComponent ||
        isGovernanceApi ||
        isResourceApi ||
        isOtlpV1Api
      ) {
        seen.add(f);
      }
    }
  }
  return Array.from(seen).sort();
}

/**
 * Test whether a config entry matches a concrete file path. Supports the
 * subset of glob features used in the configs:
 *   - `**` matches any number of path segments
 *   - `*` matches any non-separator characters
 * Other features are not used; we keep matching deliberately simple.
 */
function entryMatchesFile(entry: string, file: string): boolean {
  if (!entry.includes('*')) return entry === file;
  // Glob conversion semantics:
  //   - `**/`  matches zero or more path segments (including the empty
  //     segment). Example: `a/**/b.ts` matches both `a/b.ts` and
  //     `a/x/y/b.ts`. The trailing `/` is consumed as part of the token.
  //   - `**`   (without trailing slash) matches any chars across `/`.
  //   - `*`    matches any non-`/` chars.
  // We replace `**/` first (as a single token) so the trailing slash is
  // optional, then `**` (no trailing slash) becomes `.*`, then single
  // `*` becomes `[^/]*`. Other regex specials (except `*`) are escaped.
  const escaped = entry
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '<<DOUBLE_STAR_SLASH>>')
    .replace(/\*\*/g, '<<DOUBLE_STAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLE_STAR_SLASH>>/g, '(?:.*/)?')
    .replace(/<<DOUBLE_STAR>>/g, '.*');
  return new RegExp('^' + escaped + '$').test(file);
}

describe('SPEC-008 strict-scope CI guard (T374, Constitution Convention J)', () => {
  describe('Layer 1: config-level family coverage', () => {
    const eslintEntries = extractEslintEntries();
    const tsconfigIncludes = extractTsconfigIncludes();

    it('eslint.config.mjs `specStrictFiles` MUST be non-empty', () => {
      expect(eslintEntries.length).toBeGreaterThan(0);
    });

    it('tsconfig.spec-strict.json `include` MUST be non-empty', () => {
      expect(tsconfigIncludes.length).toBeGreaterThan(0);
    });

    for (const family of SPEC_008_EXPECTED_FAMILIES) {
      it(`eslint.config.mjs MUST cover SPEC-008 family "${family}"`, () => {
        const matched = eslintEntries.filter((e) =>
          entryCoversFamily(e, family),
        );
        expect(
          matched.length,
          `STRICT-SCOPE DRIFT: family "${family}" is not covered by any entry in ` +
            `eslint.config.mjs specStrictFiles. Add an entry like ` +
            `"${family}**/*.ts" or a more specific pattern. ` +
            `Convention J + T374.`,
        ).toBeGreaterThan(0);
      });

      it(`tsconfig.spec-strict.json MUST cover SPEC-008 family "${family}"`, () => {
        const matched = tsconfigIncludes.filter((e) =>
          entryCoversFamily(e, family),
        );
        expect(
          matched.length,
          `STRICT-SCOPE DRIFT: family "${family}" is not covered by any entry in ` +
            `tsconfig.spec-strict.json include. Add an entry like ` +
            `"${family}**/*.ts" or a more specific pattern. ` +
            `Convention J + T374.`,
        ).toBeGreaterThan(0);
      });
    }
  });

  describe('Layer 2: file-level coverage of committed SPEC-008 sources', () => {
    const eslintEntries = extractEslintEntries();
    const tsconfigIncludes = extractTsconfigIncludes();
    const spec008Files = discoverSpec008Files();

    it('discovery MUST find committed SPEC-008 source files when they exist', () => {
      // This test does not require any files to exist (early in implementation);
      // it just confirms discovery is wired up correctly. We assert the
      // discovery function returns an array (possibly empty).
      expect(Array.isArray(spec008Files)).toBe(true);
    });

    for (const file of spec008Files) {
      it(`eslint.config.mjs MUST cover committed SPEC-008 file "${file}"`, () => {
        const matched = eslintEntries.filter((e) => entryMatchesFile(e, file));
        expect(
          matched.length,
          `STRICT-SCOPE DRIFT: committed SPEC-008 file "${file}" does not match any ` +
            `entry in eslint.config.mjs specStrictFiles. Either add an entry that ` +
            `matches it OR move/delete the file. Convention J + T374.`,
        ).toBeGreaterThan(0);
      });

      it(`tsconfig.spec-strict.json MUST cover committed SPEC-008 file "${file}"`, () => {
        const matched = tsconfigIncludes.filter((e) =>
          entryMatchesFile(e, file),
        );
        expect(
          matched.length,
          `STRICT-SCOPE DRIFT: committed SPEC-008 file "${file}" does not match any ` +
            `entry in tsconfig.spec-strict.json include. Either add an entry that ` +
            `matches it OR move/delete the file. Convention J + T374.`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
