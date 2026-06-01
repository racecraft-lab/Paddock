/**
 * SPEC-007 US6 — Artifact Publish (Inline + File-Backed)
 *
 * Covers tasks T300..T312 + T315..T324 (TDD red-first authored before
 * implementation in `src/lib/task-artifacts.ts`).
 *
 * Strict scope: this test file lives under `src/lib/__tests__/` and is added
 * to the SPEC_007_ALLOWLIST in `task-artifacts.enums.test.ts`. The
 * implementation under test is in `src/lib/task-artifacts.ts`.
 *
 * Out of scope (deferred to later user stories):
 *   - `detectSecrets` integration (US8)
 *   - HTTP route + Error Code Matrix translation (US9)
 *   - Admin override + 423 metadata stub (US10)
 *
 * The publish function therefore throws TYPED Error subclasses with an
 * `error_code` property; the route layer (US9) translates them to HTTP
 * status codes. No HTTP semantics live in this library.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '@/lib/migrations'
import {
  EmptyPayload,
  ExternalUriRejected,
  InternalScanError,
  PayloadTooLarge,
  SecretDetectedError,
  SupersedeTargetAlreadySuperseded,
  UnsupportedMimeType,
  WorkspaceMismatch,
  getArtifactById,
  getP95Latencies,
  publishArtifact,
  recordPublishLatency,
  resetLatencyBuffersForTest,
} from '@/lib/task-artifacts'

// ---------------------------------------------------------------------------
// Test harness — temp DATA_DIR + in-memory SQLite + minimal seed.
// ---------------------------------------------------------------------------

const FACILITY_WORKSPACE_ID = 1
const PRODUCT_LINE_WORKSPACE_ID = 2
const OTHER_WORKSPACE_ID = 3
const PRODUCER_TASK_ID = 100
const OTHER_PRODUCER_TASK_ID = 101

const openDbs: Database.Database[] = []
let tempDataDir: string
let originalDataDir: string | undefined

beforeEach(() => {
  originalDataDir = process.env.MISSION_CONTROL_DATA_DIR
  tempDataDir = mkdtempSync(join(tmpdir(), 'mc-spec007-us6-'))
  process.env.MISSION_CONTROL_DATA_DIR = tempDataDir
})

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  if (originalDataDir === undefined) {
    delete process.env.MISSION_CONTROL_DATA_DIR
  } else {
    process.env.MISSION_CONTROL_DATA_DIR = originalDataDir
  }
  try {
    rmSync(tempDataDir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup.
  }
  resetLatencyBuffersForTest(FACILITY_WORKSPACE_ID)
  resetLatencyBuffersForTest(PRODUCT_LINE_WORKSPACE_ID)
  resetLatencyBuffersForTest(OTHER_WORKSPACE_ID)
})

function walkAllFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkAllFiles(full))
    else out.push(full)
  }
  return out
}

function openSeededDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  // Use whichever default tenant_id the migrations already seeded.
  const tenantRow = db.prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get() as
    | { id: number }
    | undefined
  const tenantId = tenantRow?.id ?? 1
  // Reset workspaces so we can re-seed with the exact IDs the tests use.
  db.exec(`DELETE FROM workspaces`)
  const insertWorkspace = db.prepare(
    `INSERT INTO workspaces (id, slug, name, tenant_id) VALUES (?, ?, ?, ?)`,
  )
  insertWorkspace.run(FACILITY_WORKSPACE_ID, 'facility', 'Facility', tenantId)
  insertWorkspace.run(PRODUCT_LINE_WORKSPACE_ID, 'pl-1', 'Product Line One', tenantId)
  insertWorkspace.run(OTHER_WORKSPACE_ID, 'pl-2', 'Product Line Two', tenantId)

  // Seed tasks: PRODUCER_TASK_ID under PRODUCT_LINE_WORKSPACE_ID,
  // OTHER_PRODUCER_TASK_ID under OTHER_WORKSPACE_ID.
  // The production `tasks` table is wide; seed only required columns.
  const taskCols = db
    .prepare("PRAGMA table_info('tasks')")
    .all() as { name: string; notnull: number; dflt_value: unknown }[]
  const required = taskCols
    .filter((c) => c.notnull === 1 && c.dflt_value === null && c.name !== 'id')
    .map((c) => c.name)
  // Build a minimal INSERT that supplies id + workspace_id and any other NOT NULL
  // columns without defaults. Use literals.
  const minimalCols = new Set<string>(['id', 'workspace_id', ...required])
  const colList = Array.from(minimalCols)
  const placeholders = colList.map(() => '?').join(',')
  const insertTask = db.prepare(`INSERT INTO tasks (${colList.join(',')}) VALUES (${placeholders})`)
  function buildTaskRow(id: number, workspaceId: number): unknown[] {
    return colList.map((c) => {
      if (c === 'id') return id
      if (c === 'workspace_id') return workspaceId
      if (c === 'title') return `task-${String(id)}`
      if (c === 'kind' || c === 'type') return 'task'
      if (c === 'status') return 'queued'
      if (c === 'created_at' || c === 'updated_at') return Date.now()
      return ''
    })
  }
  insertTask.run(...buildTaskRow(PRODUCER_TASK_ID, PRODUCT_LINE_WORKSPACE_ID))
  insertTask.run(...buildTaskRow(OTHER_PRODUCER_TASK_ID, OTHER_WORKSPACE_ID))
  return db
}

// ---------------------------------------------------------------------------
// T300/T315 — happy path: inline JSON / inline Markdown / file-promotion.
// ---------------------------------------------------------------------------

describe('publishArtifact: inline storage_kind split (T300, FR-020, FR-021)', () => {
  it('1 KiB inline JSON → row with storage_kind=inline_json, content_json populated, content_markdown NULL', () => {
    const db = openSeededDb()
    const content = JSON.stringify({ x: 'a'.repeat(900) })
    const result = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      content,
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(typeof result.id).toBe('number')
    expect(typeof result.sha256).toBe('string')
    expect(result.byte_size).toBe(Buffer.byteLength(content, 'utf8'))
    expect(result.storage_uri).toBeNull()
    const row = db.prepare('SELECT * FROM task_artifacts WHERE id = ?').get(result.id) as {
      storage_kind: string
      content_json: string | null
      content_markdown: string | null
      byte_size: number
      sha256: string
      workspace_id: number
    }
    expect(row.storage_kind).toBe('inline_json')
    expect(row.content_json).toBe(content)
    expect(row.content_markdown).toBeNull()
    expect(row.workspace_id).toBe(PRODUCT_LINE_WORKSPACE_ID)
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('1 KiB inline Markdown → content_markdown populated, content_json NULL', () => {
    const db = openSeededDb()
    const content = '# heading\n' + 'word '.repeat(200)
    const result = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content,
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const row = db.prepare('SELECT * FROM task_artifacts WHERE id = ?').get(result.id) as {
      storage_kind: string
      content_json: string | null
      content_markdown: string | null
    }
    expect(row.storage_kind).toBe('inline_markdown')
    expect(row.content_markdown).toBe(content)
    expect(row.content_json).toBeNull()
  })

  it('inline at exactly 64 KiB stays inline; > 64 KiB auto-promotes to file', () => {
    const db = openSeededDb()
    // ~64 KiB inline (slightly under to leave room for JSON wrapping).
    const inlineResult = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      content: JSON.stringify({ x: 'a'.repeat(60 * 1024) }),
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const inlineRow = db.prepare('SELECT * FROM task_artifacts WHERE id = ?').get(inlineResult.id) as {
      storage_kind: string
      content_json: string | null
      storage_uri: string | null
    }
    expect(inlineRow.storage_kind).toBe('inline_json')
    expect(inlineRow.content_json).not.toBeNull()
    expect(inlineRow.storage_uri).toBeNull()

    const over64 = 'b'.repeat(70 * 1024) // 70 KiB
    const promoteResult = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_markdown',
      content: over64,
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const promoteRow = db
      .prepare('SELECT * FROM task_artifacts WHERE id = ?')
      .get(promoteResult.id) as {
      storage_kind: string
      content_json: string | null
      content_markdown: string | null
      storage_uri: string | null
    }
    expect(promoteRow.storage_kind).toBe('file')
    expect(promoteRow.content_json).toBeNull()
    expect(promoteRow.content_markdown).toBeNull()
    expect(promoteRow.storage_uri).not.toBeNull()
    expect(existsSync(promoteRow.storage_uri ?? '')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T301/T316 — atomic file write under <DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.
// ---------------------------------------------------------------------------

describe('publishArtifact: file-backed atomic write (T301, FR-022)', () => {
  it('canonical path is <DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>', () => {
    const db = openSeededDb()
    const fileBytes = Buffer.from('hello world ' + 'x'.repeat(2048), 'utf8')
    const result = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'pr_diff',
      storage_kind: 'file',
      file: { bytes: fileBytes, original_filename: 'patch.txt' },
      mime: 'text/plain',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(result.storage_uri).toBeTruthy()
    const uri = result.storage_uri ?? ''
    const expectedPrefix = join(tempDataDir, 'artifacts', String(PRODUCT_LINE_WORKSPACE_ID))
    expect(uri.startsWith(expectedPrefix)).toBe(true)
    expect(/\/\d{4}\/\d{2}\/[0-9a-f]{64}/.test(uri)).toBe(true)
    expect(existsSync(uri)).toBe(true)
    const onDisk = readFileSync(uri)
    expect(onDisk.equals(fileBytes)).toBe(true)
    expect(statSync(uri).size).toBe(fileBytes.byteLength)
    // No leftover temp files in the shard dir.
    const shardDir = uri.slice(0, uri.lastIndexOf('/'))
    const entries = readdirSync(shardDir)
    expect(entries.some((e: string) => e.startsWith('.tmp.'))).toBe(false)
  })

  it('temp path resides under the shard dir (NEVER /tmp) — verified by absence of .tmp orphans', () => {
    const db = openSeededDb()
    const fileBytes = Buffer.from('payload-' + 'z'.repeat(1000), 'utf8')
    publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'pr_diff',
      storage_kind: 'file',
      file: { bytes: fileBytes, original_filename: 'p.txt' },
      mime: 'text/plain',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const all = walkAllFiles(tempDataDir)
    expect(all.every((p: string) => !p.includes('/.tmp.'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T302 — fs.link EEXIST loser path (concurrent same-content publish).
// ---------------------------------------------------------------------------

describe('publishArtifact: fs.link EEXIST loser path (T302, FR-023)', () => {
  it('two concurrent publishes of identical content → 1 canonical file + 2 rows pointing at same storage_uri', () => {
    const db = openSeededDb()
    const fileBytes = Buffer.from('identical-content-' + 'y'.repeat(4096), 'utf8')
    const first = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'pr_diff',
      storage_kind: 'file',
      file: { bytes: fileBytes, original_filename: 'a.txt' },
      mime: 'text/plain',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const second = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'pr_diff',
      storage_kind: 'file',
      file: { bytes: fileBytes, original_filename: 'b.txt' },
      mime: 'text/plain',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(first.storage_uri).toBe(second.storage_uri)
    expect(first.sha256).toBe(second.sha256)
    expect(first.id).not.toBe(second.id)
    expect(existsSync(first.storage_uri ?? '')).toBe(true)
    const rows = db
      .prepare('SELECT id, storage_uri FROM task_artifacts WHERE storage_uri = ?')
      .all(first.storage_uri) as { id: number; storage_uri: string }[]
    expect(rows.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// T306 — external_uri rejection.
// ---------------------------------------------------------------------------

describe('publishArtifact: external_uri rejection (T306, FR-020)', () => {
  it('throws ExternalUriRejected (error_code=external_uri_rejected) for storage_kind=external_uri', () => {
    const db = openSeededDb()
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'external_uri',
        mime: 'application/json',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ExternalUriRejected)
    expect((caught as ExternalUriRejected).error_code).toBe('external_uri_rejected')
  })
})

// ---------------------------------------------------------------------------
// T304 — file size cap (25 MiB).
// ---------------------------------------------------------------------------

describe('publishArtifact: payload too large (T304, FR-024)', () => {
  it('throws PayloadTooLarge (error_code=payload_too_large) when file > 25 MiB', () => {
    const db = openSeededDb()
    const fileBytes = Buffer.alloc(25 * 1024 * 1024 + 1, 0x61)
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: fileBytes, original_filename: 'big.bin' },
        mime: 'application/zip',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PayloadTooLarge)
    expect((caught as PayloadTooLarge).error_code).toBe('payload_too_large')
    expect((caught as PayloadTooLarge).limit_bytes).toBe(25 * 1024 * 1024)
  })
})

// ---------------------------------------------------------------------------
// T305 — MIME allowlist (415).
// ---------------------------------------------------------------------------

describe('publishArtifact: MIME allowlist (T305, FR-025)', () => {
  it('throws UnsupportedMimeType (error_code=unsupported_media_type) for text/x-python', () => {
    const db = openSeededDb()
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: Buffer.from('print(1)\n', 'utf8'), original_filename: 'a.py' },
        mime: 'text/x-python',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnsupportedMimeType)
    expect((caught as UnsupportedMimeType).error_code).toBe('unsupported_media_type')
  })

  it('accepts every MIME in the allowlist', () => {
    const allowed = [
      'text/plain',
      'text/markdown',
      'application/json',
      'application/x-yaml',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'application/zip',
    ]
    const db = openSeededDb()
    for (const mime of allowed) {
      const r = publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: Buffer.from('x:' + mime, 'utf8') },
        mime,
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
      expect(typeof r.id).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// T307 — empty payload rejection.
// ---------------------------------------------------------------------------

describe('publishArtifact: empty payload rejection (T307, CHK080)', () => {
  it('throws EmptyPayload for empty inline content', () => {
    const db = openSeededDb()
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'review_notes',
        storage_kind: 'inline_markdown',
        content: '',
        mime: 'text/markdown',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(EmptyPayload)
    expect((caught as EmptyPayload).error_code).toBe('empty_payload')
  })

  it('throws EmptyPayload for zero-byte file', () => {
    const db = openSeededDb()
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: Buffer.alloc(0), original_filename: 'empty.txt' },
        mime: 'text/plain',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(EmptyPayload)
  })
})

// ---------------------------------------------------------------------------
// T308 — workspace isolation (FR-026).
// ---------------------------------------------------------------------------

describe('publishArtifact: workspace isolation (T308, FR-026)', () => {
  it('non-Facility caller whose active_workspace_id ≠ producer workspace_id → throws WorkspaceMismatch', () => {
    const db = openSeededDb()
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID, // belongs to PRODUCT_LINE_WORKSPACE_ID
        artifact_type: 'review_notes',
        storage_kind: 'inline_markdown',
        content: '# hi',
        mime: 'text/markdown',
        active_workspace_id: OTHER_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(WorkspaceMismatch)
    expect((caught as WorkspaceMismatch).error_code).toBe('workspace_mismatch')
  })

  it('Facility caller is allowed to publish across workspaces (row stored under producer workspace_id)', () => {
    const db = openSeededDb()
    const result = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# facility cross-publish',
      mime: 'text/markdown',
      active_workspace_id: FACILITY_WORKSPACE_ID,
      is_facility_caller: true,
    })
    const row = db.prepare('SELECT workspace_id FROM task_artifacts WHERE id = ?').get(result.id) as {
      workspace_id: number
    }
    expect(row.workspace_id).toBe(PRODUCT_LINE_WORKSPACE_ID)
  })
})

// ---------------------------------------------------------------------------
// T309 — supersedes single-transaction (FR-027).
// ---------------------------------------------------------------------------

describe('publishArtifact: supersedes single-transaction (T309, FR-027)', () => {
  it('successful supersede: new row inserted + predecessor.redaction_status=superseded inside one transaction', () => {
    const db = openSeededDb()
    const first = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# v1',
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const second = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# v2',
      mime: 'text/markdown',
      supersedes: first.id,
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const oldRow = db
      .prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?')
      .get(first.id) as { redaction_status: string }
    const newRow = db
      .prepare('SELECT supersedes_artifact_id, redaction_status FROM task_artifacts WHERE id = ?')
      .get(second.id) as { supersedes_artifact_id: number | null; redaction_status: string }
    expect(oldRow.redaction_status).toBe('superseded')
    expect(newRow.supersedes_artifact_id).toBe(first.id)
    expect(newRow.redaction_status).not.toBe('superseded')
  })

  it('second supersede of the same predecessor → throws SupersedeTargetAlreadySuperseded', () => {
    const db = openSeededDb()
    const a1 = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# v1',
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# v2',
      mime: 'text/markdown',
      supersedes: a1.id,
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'review_notes',
        storage_kind: 'inline_markdown',
        content: '# v3-also-targets-a1',
        mime: 'text/markdown',
        supersedes: a1.id,
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SupersedeTargetAlreadySuperseded)
    expect((caught as SupersedeTargetAlreadySuperseded).error_code).toBe(
      'supersede_target_already_superseded',
    )
  })
})

// ---------------------------------------------------------------------------
// T312 / FR-028 — p95 ring buffer is updated on success only.
// ---------------------------------------------------------------------------

describe('publishArtifact: p95 ring-buffer update (T312, FR-028)', () => {
  it('successful publish appends to publish ring (workspace-scoped)', () => {
    const db = openSeededDb()
    resetLatencyBuffersForTest(PRODUCT_LINE_WORKSPACE_ID)
    // Pre-fill the ring with 99 observations so the next successful publish
    // tips us across the MIN_OBSERVATIONS_FOR_P95 (100) threshold and
    // getP95Latencies switches from 'insufficient_data' to a real snapshot.
    for (let i = 0; i < 99; i++) recordPublishLatency(PRODUCT_LINE_WORKSPACE_ID, i + 1)
    expect(getP95Latencies(PRODUCT_LINE_WORKSPACE_ID)).toBe('insufficient_data')
    publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# perf check',
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(getP95Latencies(PRODUCT_LINE_WORKSPACE_ID)).not.toBe('insufficient_data')
  })

  it('failed publish does NOT append to the publish ring', () => {
    const db = openSeededDb()
    resetLatencyBuffersForTest(PRODUCT_LINE_WORKSPACE_ID)
    for (let i = 0; i < 99; i++) recordPublishLatency(PRODUCT_LINE_WORKSPACE_ID, i + 1)
    expect(getP95Latencies(PRODUCT_LINE_WORKSPACE_ID)).toBe('insufficient_data')
    try {
      publishArtifact({
        db,
        task_id: PRODUCER_TASK_ID,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: Buffer.from('x', 'utf8') },
        mime: 'text/x-python', // not allowlisted → failure
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch {
      /* expected */
    }
    expect(getP95Latencies(PRODUCT_LINE_WORKSPACE_ID)).toBe('insufficient_data')
  })
})

// ---------------------------------------------------------------------------
// Lookup helper — getArtifactById.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// US8 — Detector enforcement at publish (FR-032/033/034/132/141).
// Adds workflow_templates seed + findings paths against publishArtifact.
// ---------------------------------------------------------------------------

const TEMPLATE_ID_REJECT = 901 // allow_redacted_artifacts = 0
const TEMPLATE_ID_ALLOW = 902 // allow_redacted_artifacts = 1
const TASK_REJECT = 200 // tasks.workflow_template_id → TEMPLATE_ID_REJECT
const TASK_ALLOW = 201 // tasks.workflow_template_id → TEMPLATE_ID_ALLOW
// AWS-shaped fake key (matches `aws-access-key-id` rule). NOT a real secret.
const FAKE_AKIA = 'AKIAIOSFODNN7EXAMPLE'

function seedUs8Fixtures(db: Database.Database): void {
  // workflow_templates rows + tasks pointing at them.
  db.prepare(
    `INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, allow_redacted_artifacts) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(TEMPLATE_ID_REJECT, 'reject-tmpl', 'p', PRODUCT_LINE_WORKSPACE_ID, 'reject-tmpl', 0)
  db.prepare(
    `INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, allow_redacted_artifacts) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(TEMPLATE_ID_ALLOW, 'allow-tmpl', 'p', PRODUCT_LINE_WORKSPACE_ID, 'allow-tmpl', 1)

  // Discover required NOT NULL columns once and reuse the same builder as
  // the harness above.
  const taskCols = db
    .prepare("PRAGMA table_info('tasks')")
    .all() as { name: string; notnull: number; dflt_value: unknown }[]
  const required = taskCols
    .filter((c) => c.notnull === 1 && c.dflt_value === null && c.name !== 'id')
    .map((c) => c.name)
  const minimalCols = new Set<string>(['id', 'workspace_id', 'workflow_template_id', ...required])
  const colList = Array.from(minimalCols)
  const placeholders = colList.map(() => '?').join(',')
  const insertTask = db.prepare(`INSERT INTO tasks (${colList.join(',')}) VALUES (${placeholders})`)
  function row(id: number, templateId: number): unknown[] {
    return colList.map((c) => {
      if (c === 'id') return id
      if (c === 'workspace_id') return PRODUCT_LINE_WORKSPACE_ID
      if (c === 'workflow_template_id') return templateId
      if (c === 'title') return `task-${String(id)}`
      if (c === 'kind' || c === 'type') return 'task'
      if (c === 'status') return 'queued'
      if (c === 'created_at' || c === 'updated_at') return Date.now()
      return ''
    })
  }
  insertTask.run(...row(TASK_REJECT, TEMPLATE_ID_REJECT))
  insertTask.run(...row(TASK_ALLOW, TEMPLATE_ID_ALLOW))
}

function countSecurityViolation(db: Database.Database, taskId: number): number {
  const r = db
    .prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = 'security_violation' AND entity_type = 'task' AND entity_id = ?",
    )
    .get(taskId) as { n: number }
  return r.n
}

function countScanError(db: Database.Database, taskId: number): number {
  const r = db
    .prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = 'security_violation_scan_error' AND entity_type = 'task' AND entity_id = ?",
    )
    .get(taskId) as { n: number }
  return r.n
}

function countArtifactRows(db: Database.Database, taskId: number): number {
  const r = db
    .prepare('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id = ?')
    .get(taskId) as { n: number }
  return r.n
}

describe('publishArtifact: US8 detector enforcement (FR-032/033/034/132/141)', () => {
  it('clean content (no findings) → publishes normally with redaction_status=pending', () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    const result = publishArtifact({
      db,
      task_id: TASK_REJECT,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: '# clean content with no secrets',
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(result.redaction_status).toBe('pending')
    expect(result.security_scan_status).toBe('pending')
    expect(countSecurityViolation(db, TASK_REJECT)).toBe(0)
    expect(countArtifactRows(db, TASK_REJECT)).toBe(1)
  })

  it('findings + binary MIME (image/png) → SecretDetectedError, no file written, no row, security_violation activity', () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    // image/png with embedded ASCII secret. Even allow_redacted=1 would reject
    // (binaries always reject per FR-034). Use the allow-template to prove
    // binary path bypasses the redact-and-store gate.
    const fileBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG header
      Buffer.from(` leak: ${FAKE_AKIA} `, 'utf8'),
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
    ])
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: TASK_ALLOW,
        artifact_type: 'pr_diff',
        storage_kind: 'file',
        file: { bytes: fileBytes, original_filename: 'leak.png' },
        mime: 'image/png',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SecretDetectedError)
    const e = caught as SecretDetectedError
    expect(e.code).toBe('secret_detected')
    expect(e.findings).toBeGreaterThanOrEqual(1)
    expect(typeof e.redacted_preview).toBe('string')
    // FR-034: binary content is scan-only; the detector intentionally does
    // NOT redact bytes (round-trip would corrupt the file). The preview is
    // a UTF-8 view of original bytes and may contain ASCII secrets — the
    // important guarantee is that the binary is NEVER STORED, not that the
    // 422 body is sanitized for binary. Verify rejection + audit trail.
    expect(countArtifactRows(db, TASK_ALLOW)).toBe(0)
    expect(countSecurityViolation(db, TASK_ALLOW)).toBe(1)
  })

  it('findings + text MIME + allow_redacted=0 → SecretDetectedError, no row inserted, security_violation activity', () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: TASK_REJECT,
        artifact_type: 'review_notes',
        storage_kind: 'inline_markdown',
        content: `notes\nkey: ${FAKE_AKIA}\n`,
        mime: 'text/markdown',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SecretDetectedError)
    expect((caught as SecretDetectedError).code).toBe('secret_detected')
    expect((caught as SecretDetectedError).redacted_preview).not.toContain(FAKE_AKIA)
    expect(countArtifactRows(db, TASK_REJECT)).toBe(0)
    expect(countSecurityViolation(db, TASK_REJECT)).toBe(1)
  })

  it('findings + text MIME + allow_redacted=1 → publishes with redaction_status=redacted, stored content == redacted, security_violation activity', () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    const original = `# leaked\nkey: ${FAKE_AKIA}\n`
    const result = publishArtifact({
      db,
      task_id: TASK_ALLOW,
      artifact_type: 'review_notes',
      storage_kind: 'inline_markdown',
      content: original,
      mime: 'text/markdown',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    expect(result.redaction_status).toBe('redacted')
    expect(result.security_scan_status).toBe('scanned_with_findings')
    const row = db
      .prepare(
        'SELECT content_markdown, redaction_status, security_scan_status, sha256 FROM task_artifacts WHERE id = ?',
      )
      .get(result.id) as {
      content_markdown: string | null
      redaction_status: string
      security_scan_status: string
      sha256: string
    }
    expect(row.redaction_status).toBe('redacted')
    expect(row.security_scan_status).toBe('scanned_with_findings')
    expect(row.content_markdown).not.toContain(FAKE_AKIA)
    expect(row.content_markdown).toContain('<REDACTED:aws-access-key-id>')
    // sha256 is over the redacted bytes (storage integrity).
    expect(row.sha256).toBe(result.sha256)
    expect(countSecurityViolation(db, TASK_ALLOW)).toBe(1)
  })

  it('detector throws → InternalScanError + security_violation_scan_error activity, no file/row', async () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    // Stub the detector to throw via vi.spyOn on the loaded module.
    const detectorMod = await import('@/lib/secret-detector')
    const spy = vi.spyOn(detectorMod, 'detectSecrets').mockImplementation(() => {
      throw new detectorMod.DetectorScanError('boom')
    })
    let caught: unknown
    try {
      publishArtifact({
        db,
        task_id: TASK_REJECT,
        artifact_type: 'review_notes',
        storage_kind: 'inline_markdown',
        content: '# clean enough',
        mime: 'text/markdown',
        active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
        is_facility_caller: false,
      })
    } catch (err) {
      caught = err
    } finally {
      spy.mockRestore()
    }
    expect(caught).toBeInstanceOf(InternalScanError)
    expect((caught as InternalScanError).code).toBe('internal_scan_error')
    expect(countArtifactRows(db, TASK_REJECT)).toBe(0)
    expect(countSecurityViolation(db, TASK_REJECT)).toBe(0)
    expect(countScanError(db, TASK_REJECT)).toBe(1)
  })

  it('throttle: two publishes with findings within 60s for same task → only ONE security_violation row', () => {
    const db = openSeededDb()
    seedUs8Fixtures(db)
    // Two consecutive rejects on the same task (allow_redacted=0).
    for (let i = 0; i < 2; i++) {
      try {
        publishArtifact({
          db,
          task_id: TASK_REJECT,
          artifact_type: 'review_notes',
          storage_kind: 'inline_markdown',
          content: `attempt-${String(i)} ${FAKE_AKIA}`,
          mime: 'text/markdown',
          active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
          is_facility_caller: false,
        })
      } catch {
        /* expected SecretDetectedError */
      }
    }
    // Both attempts had findings; throttle keys on (type, entity_id) within 60s.
    expect(countSecurityViolation(db, TASK_REJECT)).toBe(1)
    expect(countArtifactRows(db, TASK_REJECT)).toBe(0)
  })
})

describe('getArtifactById', () => {
  it('returns the row for an existing id, null otherwise', () => {
    const db = openSeededDb()
    const result = publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      content: '{}',
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })
    const row = getArtifactById(db, result.id)
    expect(row).not.toBeNull()
    expect(row?.id).toBe(result.id)
    expect(row?.workspace_id).toBe(PRODUCT_LINE_WORKSPACE_ID)
    expect(getArtifactById(db, 99_999_999)).toBeNull()
  })
})

describe('publishArtifact: SPEC-009C3 evidence envelope', () => {
  function c3Envelope(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema_version: 'spec-009c3.v1',
      artifact_type: 'review_verdict',
      stage: 'review',
      produced_at: '2026-05-16T00:00:00.000Z',
      producer_task_id: PRODUCER_TASK_ID,
      workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      root_issue: {
        task_id: 10,
        github_repo: 'racecraft-lab/Paddock',
        github_issue_number: 99,
      },
      pr_dev_task: {
        task_id: PRODUCER_TASK_ID,
        github_repo: 'racecraft-lab/Paddock',
        github_pr_number: 42,
        pr_identity_source: 'fixture',
      },
      summary: 'bounded summary',
      verdict: 'pass',
      reviewer: 'review-agent',
      blocking_findings: [],
      ...overrides,
    })
  }

  it('rejects unsupported review verdict values before inserting an artifact row', () => {
    const db = openSeededDb()

    expect(() => publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'review_verdict',
      schema_version: 'spec-009c3.v1',
      storage_kind: 'inline_json',
      content: c3Envelope({ verdict: 'maybe' }),
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })).toThrow(/spec-009c3/)

    expect(countArtifactRows(db, PRODUCER_TASK_ID)).toBe(0)
  })

  it('rejects dev verification evidence without PR identity on the readiness subject', () => {
    const db = openSeededDb()

    expect(() => publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'dev_verification',
      schema_version: 'spec-009c3.v1',
      storage_kind: 'inline_json',
      content: c3Envelope({
        artifact_type: 'dev_verification',
        stage: 'dev_implementation',
        commit: 'abcdef123456',
        branch: '009c3-remediation-ready-for-owner',
        checks: [{ command: 'pnpm test', result: 'pass' }],
        residual_risk: 'none',
        pr_identity_source: 'fixture',
        pr_dev_task: {
          task_id: PRODUCER_TASK_ID,
          github_repo: 'racecraft-lab/Paddock',
          pr_identity_source: 'fixture',
        },
      }),
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })).toThrow(/spec-009c3/)

    expect(countArtifactRows(db, PRODUCER_TASK_ID)).toBe(0)
  })

  it('requires aegis approval artifacts to reference a canonical aegis quality review row', () => {
    const db = openSeededDb()

    expect(() => publishArtifact({
      db,
      task_id: PRODUCER_TASK_ID,
      artifact_type: 'aegis_approval',
      schema_version: 'spec-009c3.v1',
      storage_kind: 'inline_json',
      content: c3Envelope({
        artifact_type: 'aegis_approval',
        stage: 'aegis',
        quality_review_id: 7001,
        reviewer: 'aegis',
        status: 'approved',
        reason: 'approved',
      }),
      mime: 'application/json',
      active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
      is_facility_caller: false,
    })).toThrow(/spec-009c3/)

    expect(countArtifactRows(db, PRODUCER_TASK_ID)).toBe(0)
  })
})
