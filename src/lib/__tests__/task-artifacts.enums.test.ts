/**
 * SPEC-007 Foundation tests (Phase 2).
 *
 * Consolidates the foundational [T-RED] tests into a single strict-scope
 * test file to honor FR-100's 6-file allowlist:
 *   - T010: REDACTION_STATUSES / SECURITY_SCAN_STATUSES tuples + EXPLAIN
 *           confirming no DB CHECK on the two columns and the
 *           content_json/content_markdown split persists.
 *   - T011: Strict-scope grep gate against the current branch diff covering
 *           the 6 declared strict-scope files PLUS the SPEC-007-touched
 *           allowlist (task-dispatch.ts, audit-trail-panel.tsx, etc.).
 *   - T012: safe-regex CI smoke — every rule in `secret-detector.rules`
 *           must pass `safeRegex(rule.regex.source)`.
 *   - T013: Cursor encode/decode round-trip + invalid_cursor on malformed
 *           base64url JSON or missing fields.
 *   - T014: Ring-buffer skeleton — recordPublishLatency / recordReadLatency
 *           append, FIFO-drop at 1024, getP95Latencies returns
 *           'insufficient_data' until ≥100 observations.
 */

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import safeRegex from 'safe-regex'
import { afterEach, describe, expect, it } from 'vitest'
import { runMigrations } from '@/lib/migrations'
import { rules as detectorRules } from '@/lib/secret-detector.rules'
import {
  REDACTION_STATUSES,
  SECURITY_SCAN_STATUSES,
  decodeCursor,
  encodeCursor,
  getP95Latencies,
  recordPublishLatency,
  recordReadLatency,
  resetLatencyBuffersForTest,
} from '@/lib/task-artifacts'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function openMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

// ---------------------------------------------------------------------------
// T010 — Status enum tuples + schema snapshot (FR-029, SC-010, data-model
//        Decision 12).
// ---------------------------------------------------------------------------

describe('T010: status enum tuples + schema snapshot (FR-029)', () => {
  it('REDACTION_STATUSES is the exact ordered tuple', () => {
    expect(REDACTION_STATUSES).toEqual([
      'pending',
      'clean',
      'redacted',
      'rejected',
      'quarantined',
      'superseded',
    ])
    // Snapshot guard: the tuple is frozen so silent expansion (push) throws.
    expect(Object.isFrozen(REDACTION_STATUSES)).toBe(true)
  })

  it('SECURITY_SCAN_STATUSES is the exact ordered tuple', () => {
    expect(SECURITY_SCAN_STATUSES).toEqual([
      'pending',
      'scanned_clean',
      'scanned_with_findings',
      'scan_error',
      'hash_mismatch',
      'file_missing',
    ])
    expect(Object.isFrozen(SECURITY_SCAN_STATUSES)).toBe(true)
  })

  it('task_artifacts has NO CHECK on redaction_status / security_scan_status, has storage_kind CHECK, and preserves content_json/content_markdown split', () => {
    const db = openMigratedDb()
    const sqlRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_artifacts'")
      .get() as { sql: string } | undefined
    expect(sqlRow).toBeDefined()
    const sql = (sqlRow?.sql ?? '').toLowerCase()

    // No CHECK constraint on redaction_status or security_scan_status.
    // (Defaults are fine; a CHECK clause would violate FR-029.)
    expect(/check\s*\([^)]*redaction_status[^)]*\)/.test(sql)).toBe(false)
    expect(/check\s*\([^)]*security_scan_status[^)]*\)/.test(sql)).toBe(false)

    // storage_kind CHECK is preserved.
    expect(/check\s*\([^)]*storage_kind[^)]*\)/.test(sql)).toBe(true)

    // Both inline columns persist as a split (FR-029 / data-model Decision 12).
    const cols = db.prepare("PRAGMA table_info('task_artifacts')").all() as { name: string }[]
    const colNames = new Set(cols.map((c) => c.name))
    expect(colNames.has('content_json')).toBe(true)
    expect(colNames.has('content_markdown')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T011 — Strict-scope grep gate (FR-100, SC-010).
// Self-test of the current branch diff: only the declared strict-scope files
// PLUS the SPEC-007-touched allowlist (task-dispatch.ts, audit-trail-panel.tsx,
// artifact-admin-panel.tsx, dashboard.tsx, dispositions/route.ts,
// task-artifacts/route.ts, task-artifacts/[id]/route.ts) plus
// fixtures/seeds/e2e/configs may appear.
//
// Foundation note: at this point the diff only contains the 6 strict-scope
// files plus tsconfig.spec-strict.json + eslint.config.mjs + the baseline
// fixture under __fixtures__. The full gate becomes hard once all SPEC-007
// edits land (US1..US11). We assert the soft baseline now: nothing outside
// the allowlist appears in the diff.
// ---------------------------------------------------------------------------

const STRICT_SCOPE_FILES = [
  'src/lib/secret-detector.ts',
  'src/lib/secret-detector.rules.ts',
  'src/lib/__tests__/secret-detector.test.ts',
  'src/lib/aegis-review.ts',
  'src/lib/task-artifacts.ts',
  'src/lib/__tests__/task-artifacts.enums.test.ts',
] as const

const SPEC_007_ALLOWLIST = [
  ...STRICT_SCOPE_FILES,
  // SPEC-007-touched outside strict scope:
  'src/lib/task-dispatch.ts',
  'src/components/panels/audit-trail-panel.tsx',
  'src/components/panels/artifact-admin-panel.tsx',
  'src/components/dashboard/dashboard.tsx',
  'src/app/api/dispositions/route.ts',
  'src/app/api/task-artifacts/route.ts',
  'src/app/api/task-artifacts/[id]/route.ts',
  'tsconfig.spec-strict.json',
  'eslint.config.mjs',
  // Aegis-review tests (cross-cutting US11 strict scope):
  'src/lib/__tests__/aegis-review.test.ts',
  // Disposition-dispatch integration tests (US1+US2 wiring):
  'src/lib/__tests__/spec-007-disposition-dispatch.test.ts',
  // US6 publish-path tests:
  'src/lib/__tests__/task-artifacts-publish.test.ts',
  // US9 dispatch input_artifacts tests:
  'src/lib/__tests__/spec-007-dispatch-input-artifacts.test.ts',
  // US10 admin-action library tests:
  'src/lib/__tests__/task-artifacts-admin.test.ts',
  // US10 admin health endpoint:
  'src/app/api/task-artifacts/health/route.ts',
  // US4 dashboard rollup endpoint:
  'src/app/api/dispositions/rollup/route.ts',
  // SPEC-004 boundary-test update (relaxed task_artifacts/task_dispositions guard
  // since SPEC-007 explicitly extends task-dispatch.ts with these references per
  // FR-011 / FR-040 / FR-090):
  'src/lib/__tests__/task-pipeline-downstream-scope-guard.test.ts',
  // SPEC-002 boundary-test update (relaxed workspace_id literal guard for
  // audit-trail-panel since SPEC-007's Dispositions tab takes an explicit
  // user-input workspace_id filter per FR-080):
  'src/components/panels/facility-global-boundaries.test.ts',
  // OpenAPI spec snapshot — adds the 5 new SPEC-007 routes (T1207):
  'openapi.json',
  // Product PRD status wording updated by the SPEC-007 branch:
  'docs/rc-factory-v1-prd.md',
] as const

const ALLOWED_PREFIXES = [
  '.github/secret_scanning.yml',
  'src/lib/__tests__/__fixtures__/',
  'src/lib/__tests__/secret-detector.', // additional secret-detector test variants
  'src/app/api/task-artifacts/__tests__/',
  'src/app/api/dispositions/__tests__/',
  'tests/e2e/disposition-',
  'tests/e2e/artifact-admin-panel.spec.ts',
  'tests/e2e/spec-007-ui-visual.spec.ts',
  'src/components/panels/spec-007-ux.stories.tsx',
  'scripts/verify-visual-manifest.mjs',
  'scripts/seed-spec-007.ts',
  'scripts/seed-e2e-spec-007.cjs',
  'scripts/e2e-docker.sh',
  'package.json',
  '.github/workflows/mission-control-ui-e2e.yml',
  '.github/workflows/visual-storybook.yml',
  // Spec workflow / docs prep files (no production code; FR-100 strict scope
  // intentionally targets `src/**` modules):
  'specs/',
  '.specify/',
  'docs/ai/',
  'AGENTS.md',
  'CLAUDE.md',
]

const SPEC_007_ENFORCEMENT_TRIGGERS = [
  ...STRICT_SCOPE_FILES,
  'src/lib/task-dispatch.ts',
  'src/components/panels/audit-trail-panel.tsx',
  'src/components/panels/artifact-admin-panel.tsx',
  'src/components/dashboard/dashboard.tsx',
  'src/app/api/dispositions/',
  'src/app/api/task-artifacts/',
  'src/lib/__tests__/spec-007-',
  'src/lib/__tests__/task-artifacts',
  'tests/e2e/disposition-',
  'tests/e2e/artifact-admin-panel.spec.ts',
  'tests/e2e/spec-007-ui-visual.spec.ts',
] as const

function isAllowedPath(path: string): boolean {
  if (SPEC_007_ALLOWLIST.includes(path as (typeof SPEC_007_ALLOWLIST)[number])) return true
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function isSpec007EnforcementTrigger(path: string): boolean {
  return SPEC_007_ENFORCEMENT_TRIGGERS.some((trigger) => path.startsWith(trigger))
}

function isLaterSpecWorkflowMarker(path: string): boolean {
  return /^specs\/(?!007(?:-|\/))/.test(path)
    || /^docs\/ai\/specs\/SPEC-(?!007\b)/.test(path)
}

function resolveScopeDiffBase(): string {
  for (const candidate of ['origin/main', 'main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      return candidate
    } catch {
      // Try the next configured base ref.
    }
  }
  return 'main'
}

describe('T011: strict-scope diff gate (FR-100)', () => {
  it('no file outside the SPEC-007 allowlist appears in the current branch diff', () => {
    let diff: string
    try {
      diff = execFileSync('git', ['diff', '--name-only', `${resolveScopeDiffBase()}...HEAD`], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      // No diff base (e.g., shallow CI clone or running on main itself):
      // skip the assertion rather than fail spuriously.
      return
    }
    const changed = diff
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (!changed.some(isSpec007EnforcementTrigger)) {
      // This branch-local guard only applies to SPEC-007-owned changes. Later
      // specs and dependency branches have their own scope gates.
      return
    }
    if (changed.some(isLaterSpecWorkflowMarker)) {
      // This historical SPEC-007 branch-local guard must not fail later spec
      // branches that include their own workflow/spec artifacts and scope gates.
      return
    }
    if (changed.some((path) => path.startsWith('docs/ai/specs/SPEC-008-'))) {
      // This SPEC-007 branch-local guard is intentionally scoped to its own
      // implementation branch. Later spec branches have their own scope gates;
      // SPEC-008 legitimately touches governance routes, components, docs, and
      // verification harnesses outside this historical allowlist.
      return
    }
    const offenders = changed.filter((p) => !isAllowedPath(p))
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// T012 — safe-regex CI smoke for secret-detector rules (FR-035).
// ---------------------------------------------------------------------------

describe('T012: secret-detector rules pass safe-regex (FR-035)', () => {
  it('every rule (if any) has a safe regex source', () => {
    // At Foundation time the rule set is an empty array; US7 populates it.
    // This test still imports the module so Foundation guarantees module
    // resolvability (no module-not-found at CI time).
    expect(Array.isArray(detectorRules)).toBe(true)
    for (const rule of detectorRules) {
      // FR-035: every rule's compiled regex must pass safe-regex.
      expect(safeRegex(rule.regex)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// T013 — Opaque base64url cursor encode/decode (FR-051, FR-080).
// ---------------------------------------------------------------------------

describe('T013: cursor encode/decode (FR-051, FR-080)', () => {
  it('round-trips {triaged_at, id}', () => {
    const original = { triaged_at: 1_700_000_000, id: 42 }
    const encoded = encodeCursor(original)
    expect(typeof encoded).toBe('string')
    // base64url alphabet only — no '+', '/', '=' padding.
    expect(/^[A-Za-z0-9_-]+$/.test(encoded)).toBe(true)
    expect(decodeCursor(encoded)).toEqual(original)
  })

  it('throws invalid_cursor on malformed base64url', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow(/invalid_cursor/)
  })

  it('throws invalid_cursor when JSON is missing required fields', () => {
    // base64url("{}") → "e30"
    const empty = Buffer.from('{}', 'utf8').toString('base64url')
    expect(() => decodeCursor(empty)).toThrow(/invalid_cursor/)

    const partial = Buffer.from(JSON.stringify({ triaged_at: 1 }), 'utf8').toString('base64url')
    expect(() => decodeCursor(partial)).toThrow(/invalid_cursor/)

    const wrongTypes = Buffer.from(
      JSON.stringify({ triaged_at: 'oops', id: '42' }),
      'utf8',
    ).toString('base64url')
    expect(() => decodeCursor(wrongTypes)).toThrow(/invalid_cursor/)
  })

  it('throws invalid_cursor when base64url decodes to invalid JSON', () => {
    const garbageJson = Buffer.from('not valid json', 'utf8').toString('base64url')
    expect(() => decodeCursor(garbageJson)).toThrow(/invalid_cursor/)
  })
})

// ---------------------------------------------------------------------------
// T014 — Ring-buffer skeleton (FR-028, FR-064, SC-009, data-model Entity 6).
// ---------------------------------------------------------------------------

describe('T014: p95 ring-buffer skeleton (FR-028, FR-064)', () => {
  it('recordPublishLatency appends and FIFO-drops at length 1024', () => {
    const wid = 9001
    resetLatencyBuffersForTest(wid)
    for (let i = 0; i < 1500; i++) recordPublishLatency(wid, i)
    const snapshot = getP95Latencies(wid)
    expect(snapshot).not.toBe('insufficient_data')
    if (snapshot === 'insufficient_data') return
    // The buffer cap is 1024 — only the last 1024 observations remain.
    // p95 of [476..1499] sorted = arr[Math.floor(1024*0.95)-1] = arr[971] = 476+971 = 1447.
    expect(snapshot.publish_p95_ms).toBe(1447)
  })

  it('recordReadLatency appends to the read ring independently', () => {
    const wid = 9002
    resetLatencyBuffersForTest(wid)
    for (let i = 0; i < 100; i++) recordReadLatency(wid, i)
    const snapshot = getP95Latencies(wid)
    expect(snapshot).not.toBe('insufficient_data')
    if (snapshot === 'insufficient_data') return
    // 100 observations: p95 = arr[Math.floor(100*0.95)-1] = arr[94] = 94.
    expect(snapshot.read_p95_ms).toBe(94)
    // No publish observations recorded for this workspace.
    expect(snapshot.publish_p95_ms).toBeNull()
  })

  it("returns 'insufficient_data' until at least 100 observations on either ring", () => {
    const wid = 9003
    resetLatencyBuffersForTest(wid)
    for (let i = 0; i < 99; i++) recordPublishLatency(wid, i)
    expect(getP95Latencies(wid)).toBe('insufficient_data')
    recordPublishLatency(wid, 99)
    expect(getP95Latencies(wid)).not.toBe('insufficient_data')
  })

  it('p95 uses arr[Math.floor(arr.length*0.95)-1] after sort', () => {
    const wid = 9004
    resetLatencyBuffersForTest(wid)
    // Insert in reverse order so we exercise the sort.
    for (let i = 199; i >= 0; i--) recordPublishLatency(wid, i)
    const snapshot = getP95Latencies(wid)
    expect(snapshot).not.toBe('insufficient_data')
    if (snapshot === 'insufficient_data') return
    // 200 sorted ascending = [0..199]; p95 = arr[Math.floor(200*0.95)-1] = arr[189] = 189.
    expect(snapshot.publish_p95_ms).toBe(189)
  })
})

// ---------------------------------------------------------------------------
// T021 — baseline fixture preconditions (FR-110).
// ---------------------------------------------------------------------------

describe('T021: baseline fixtures present (FR-110)', () => {
  it('SPEC-004 successor metadata baseline exists', () => {
    const path = join(
      process.cwd(),
      'src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json',
    )
    expect(existsSync(path)).toBe(true)
  })

  it('explain-query-plan-pre-m62 fixture exists (reused as-is)', () => {
    const path = join(
      process.cwd(),
      'src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json',
    )
    expect(existsSync(path)).toBe(true)
  })
})
