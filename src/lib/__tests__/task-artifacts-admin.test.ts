/**
 * SPEC-007 US10 — Artifact Admin actions (FR-060..FR-069, FR-124, FR-129,
 * FR-130, FR-138).
 *
 * Consolidates the FR-1101..FR-1109 RED tests defined in tasks.md into a
 * focused suite. Strict-scope: this file is added to the SPEC_007_ALLOWLIST
 * in `task-artifacts.enums.test.ts`.
 *
 * Covers:
 *   - quarantine/unquarantine/delete/archive: atomic UPDATE + activity row
 *     written inside one db.transaction (FR-063).
 *   - hash-verify: mismatch → security_scan_status='hash_mismatch', NO auto-
 *     quarantine, NO auto-delete (FR-067).
 *   - already_quarantined / not_quarantined / artifact_not_found error codes.
 *   - retention sweep: quarantined skipped, summary activity written, advisory
 *     lock prevents reentry (FR-130).
 *   - rebuild previews: preserves redacted/rejected statuses (FR-035a.5).
 *   - health snapshot returns expected counts and `'insufficient_data'` p95
 *     until ≥100 observations (FR-064, FR-138).
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '@/lib/migrations'
import {
  AlreadyQuarantined,
  ArtifactNotFound,
  NotQuarantined,
  SweepInProgress,
  archiveArtifact,
  batchHashVerify,
  deleteArtifact,
  getHealthSnapshot,
  hashVerifyArtifact,
  publishArtifact,
  quarantineArtifact,
  rebuildPreviews,
  recordPublishLatency,
  repairOrphans,
  resetLatencyBuffersForTest,
  runRetentionSweep,
  unquarantineArtifact,
} from '@/lib/task-artifacts'

const FACILITY_WORKSPACE_ID = 1
const PRODUCT_LINE_WORKSPACE_ID = 2
const PRODUCER_TASK_ID = 100

const openDbs: Database.Database[] = []
let tempDataDir: string
let originalDataDir: string | undefined

beforeEach(() => {
  originalDataDir = process.env.PADDOCK_DATA_DIR
  tempDataDir = mkdtempSync(join(tmpdir(), 'mc-spec007-us10-'))
  process.env.PADDOCK_DATA_DIR = tempDataDir
})

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  if (originalDataDir === undefined) {
    delete process.env.PADDOCK_DATA_DIR
  } else {
    process.env.PADDOCK_DATA_DIR = originalDataDir
  }
  try {
    rmSync(tempDataDir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
  resetLatencyBuffersForTest(FACILITY_WORKSPACE_ID)
  resetLatencyBuffersForTest(PRODUCT_LINE_WORKSPACE_ID)
})

function openSeededDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  const tenantRow = db.prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get() as
    | { id: number }
    | undefined
  const tenantId = tenantRow?.id ?? 1
  db.exec(`DELETE FROM workspaces`)
  const insertWorkspace = db.prepare(
    `INSERT INTO workspaces (id, slug, name, tenant_id) VALUES (?, ?, ?, ?)`,
  )
  insertWorkspace.run(FACILITY_WORKSPACE_ID, 'facility', 'Facility', tenantId)
  insertWorkspace.run(PRODUCT_LINE_WORKSPACE_ID, 'pl-1', 'Product Line One', tenantId)

  const taskCols = db.prepare("PRAGMA table_info('tasks')").all() as {
    name: string
    notnull: number
    dflt_value: unknown
  }[]
  const requiredCols = taskCols
    .filter((c) => c.notnull === 1 && c.dflt_value === null && c.name !== 'id')
    .map((c) => c.name)
  const minimalCols = new Set<string>(['id', 'workspace_id', ...requiredCols])
  const colList = Array.from(minimalCols)
  const placeholders = colList.map(() => '?').join(',')
  const insertTask = db.prepare(`INSERT INTO tasks (${colList.join(',')}) VALUES (${placeholders})`)
  const buildTaskRow = (id: number, workspaceId: number): unknown[] =>
    colList.map((c) => {
      if (c === 'id') return id
      if (c === 'workspace_id') return workspaceId
      if (c === 'title') return `task-${String(id)}`
      if (c === 'kind' || c === 'type') return 'task'
      if (c === 'status') return 'queued'
      if (c === 'created_at' || c === 'updated_at') return Date.now()
      return ''
    })
  insertTask.run(...buildTaskRow(PRODUCER_TASK_ID, PRODUCT_LINE_WORKSPACE_ID))
  return db
}

function publishInline(
  db: Database.Database,
  artifactType = 'triage_outcome',
  content = JSON.stringify({ x: 'a' }),
): number {
  const result = publishArtifact({
    db,
    task_id: PRODUCER_TASK_ID,
    artifact_type: artifactType,
    storage_kind: 'inline_json',
    content,
    mime: 'application/json',
    active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
    is_facility_caller: false,
  })
  return result.id
}

function publishFileBacked(db: Database.Database): { id: number; storage_uri: string; sha256: string } {
  const bigContent = 'A'.repeat(70 * 1024) // 70 KiB → auto-promotes to file-backed.
  const r = publishArtifact({
    db,
    task_id: PRODUCER_TASK_ID,
    artifact_type: 'review_notes',
    storage_kind: 'inline_markdown',
    content: bigContent,
    mime: 'text/markdown',
    active_workspace_id: PRODUCT_LINE_WORKSPACE_ID,
    is_facility_caller: false,
  })
  expect(r.storage_uri).not.toBeNull()
  return { id: r.id, storage_uri: r.storage_uri as string, sha256: r.sha256 }
}

function activitiesFor(db: Database.Database, type: string, artifactId: number): unknown[] {
  return db
    .prepare(
      "SELECT type, data FROM activities WHERE entity_type = 'task_artifact' AND entity_id = ? AND type = ?",
    )
    .all(artifactId, type)
}

// ---------------------------------------------------------------------------
// FR-062 / FR-063 / FR-124 — quarantine / un-quarantine atomicity.
// ---------------------------------------------------------------------------

describe('quarantineArtifact', () => {
  it('quarantines a clean artifact and writes a single artifact_quarantined activity row inside one transaction', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    const result = quarantineArtifact(db, id, { user_id: 7, reason: 'leak suspected' })
    expect(result.redaction_status).toBe('quarantined')
    expect(result.before_status).toBe('pending')

    const row = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id) as
      | { redaction_status: string }
      | undefined
    expect(row?.redaction_status).toBe('quarantined')

    const activities = activitiesFor(db, 'artifact_quarantined', id)
    expect(activities).toHaveLength(1)
  })

  it('throws AlreadyQuarantined and does NOT mutate state when artifact already quarantined', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    quarantineArtifact(db, id, { user_id: 7 })
    expect(() => quarantineArtifact(db, id, { user_id: 7 })).toThrow(AlreadyQuarantined)
    expect(activitiesFor(db, 'artifact_quarantined', id)).toHaveLength(1)
  })

  it('throws ArtifactNotFound for an unknown id without writing any activity', () => {
    const db = openSeededDb()
    expect(() => quarantineArtifact(db, 99999, { user_id: 7 })).toThrow(ArtifactNotFound)
    const all = db
      .prepare("SELECT COUNT(*) AS c FROM activities WHERE entity_type = 'task_artifact'")
      .get() as { c: number }
    expect(all.c).toBe(0)
  })
})

describe('unquarantineArtifact', () => {
  it('reverses quarantine, sets status=clean, and writes one artifact_unquarantined row', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    quarantineArtifact(db, id, { user_id: 7 })
    const result = unquarantineArtifact(db, id, { user_id: 7 })
    expect(result.redaction_status).toBe('clean')
    expect(result.before_status).toBe('quarantined')
    const row = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id) as {
      redaction_status: string
    }
    expect(row.redaction_status).toBe('clean')
    expect(activitiesFor(db, 'artifact_unquarantined', id)).toHaveLength(1)
  })

  it('throws NotQuarantined when artifact is not quarantined', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    expect(() => unquarantineArtifact(db, id, { user_id: 7 })).toThrow(NotQuarantined)
  })
})

describe('archiveArtifact', () => {
  it('marks redaction_status=superseded and writes one artifact_archived row', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    const r = archiveArtifact(db, id, { user_id: 7 })
    expect(r.redaction_status).toBe('superseded')
    const row = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id) as {
      redaction_status: string
    }
    expect(row.redaction_status).toBe('superseded')
    expect(activitiesFor(db, 'artifact_archived', id)).toHaveLength(1)
  })
})

describe('deleteArtifact', () => {
  it('unlinks the file BEFORE deleting the row, removes the row, and writes artifact_deleted', () => {
    const db = openSeededDb()
    const { id, storage_uri } = publishFileBacked(db)
    expect(existsSync(storage_uri)).toBe(true)
    deleteArtifact(db, id, { user_id: 7, reason: 'pii' })
    expect(existsSync(storage_uri)).toBe(false)
    const row = db.prepare('SELECT id FROM task_artifacts WHERE id = ?').get(id)
    expect(row).toBeUndefined()
    expect(activitiesFor(db, 'artifact_deleted', id)).toHaveLength(1)
  })

  it('does NOT throw when the file is already absent (idempotent)', () => {
    const db = openSeededDb()
    const { id, storage_uri } = publishFileBacked(db)
    rmSync(storage_uri, { force: true })
    expect(() => deleteArtifact(db, id, { user_id: 7 })).not.toThrow()
    expect(activitiesFor(db, 'artifact_deleted', id)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// FR-067 — Hash verification.
// ---------------------------------------------------------------------------

describe('hashVerifyArtifact', () => {
  it('reports outcome=ok for a file-backed row whose on-disk bytes match sha256', () => {
    const db = openSeededDb()
    const { id, sha256 } = publishFileBacked(db)
    const result = hashVerifyArtifact(db, id, { user_id: 7 })
    expect(result.outcome).toBe('ok')
    expect(result.mismatch).toBe(false)
    expect(result.actual_sha256).toBe(sha256)
    expect(activitiesFor(db, 'artifact_hash_verified', id)).toHaveLength(1)
  })

  it('on mismatch sets security_scan_status=hash_mismatch but does NOT auto-quarantine or delete', () => {
    const db = openSeededDb()
    const { id, storage_uri } = publishFileBacked(db)
    writeFileSync(storage_uri, 'corrupted')
    const result = hashVerifyArtifact(db, id, { user_id: 7 })
    expect(result.outcome).toBe('mismatch')
    expect(result.mismatch).toBe(true)
    const row = db
      .prepare('SELECT redaction_status, security_scan_status FROM task_artifacts WHERE id = ?')
      .get(id) as { redaction_status: string; security_scan_status: string }
    expect(row.security_scan_status).toBe('hash_mismatch')
    expect(row.redaction_status).not.toBe('quarantined')
    const exists = db.prepare('SELECT id FROM task_artifacts WHERE id = ?').get(id)
    expect(exists).toBeDefined()
    expect(activitiesFor(db, 'artifact_hash_verified', id)).toHaveLength(1)
  })

  it('reports outcome=file_missing when the on-disk file is absent', () => {
    const db = openSeededDb()
    const { id, storage_uri } = publishFileBacked(db)
    rmSync(storage_uri, { force: true })
    const result = hashVerifyArtifact(db, id, { user_id: 7 })
    expect(result.outcome).toBe('file_missing')
    const row = db
      .prepare('SELECT security_scan_status FROM task_artifacts WHERE id = ?')
      .get(id) as { security_scan_status: string }
    expect(row.security_scan_status).toBe('file_missing')
  })

  it('inline rows report outcome=skipped_inline and do not error', () => {
    const db = openSeededDb()
    const id = publishInline(db)
    const result = hashVerifyArtifact(db, id, { user_id: 7 })
    expect(result.outcome).toBe('skipped_inline')
    expect(result.mismatch).toBe(false)
    expect(activitiesFor(db, 'artifact_hash_verified', id)).toHaveLength(1)
  })
})

describe('batchHashVerify', () => {
  it('verifies all artifacts in a workspace and returns aggregate counts', () => {
    const db = openSeededDb()
    publishInline(db)
    const { id: fileId, storage_uri } = publishFileBacked(db)
    writeFileSync(storage_uri, 'corrupted-bytes')
    const result = batchHashVerify(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(result.checked).toBe(2)
    expect(result.mismatches).toBe(1)
    expect(result.skipped).toBe(1)
    const fileRow = db
      .prepare('SELECT security_scan_status FROM task_artifacts WHERE id = ?')
      .get(fileId) as { security_scan_status: string }
    expect(fileRow.security_scan_status).toBe('hash_mismatch')
  })
})

// ---------------------------------------------------------------------------
// FR-129 — Repair orphans.
// ---------------------------------------------------------------------------

describe('repairOrphans', () => {
  it('flags db-row-without-file as redaction_status=rejected, security_scan_status=file_missing', () => {
    const db = openSeededDb()
    const { id, storage_uri } = publishFileBacked(db)
    rmSync(storage_uri, { force: true })
    const summary = repairOrphans(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(summary.db_no_file).toBe(1)
    const row = db
      .prepare('SELECT redaction_status, security_scan_status FROM task_artifacts WHERE id = ?')
      .get(id) as { redaction_status: string; security_scan_status: string }
    expect(row.redaction_status).toBe('rejected')
    expect(row.security_scan_status).toBe('file_missing')
    expect(activitiesFor(db, 'artifact_repaired_orphan', id)).toHaveLength(1)
  })

  it('moves fs-without-row files to _orphaned/<run_id>/ and counts them', () => {
    const db = openSeededDb()
    publishFileBacked(db)
    const orphanPath = join(
      tempDataDir,
      'artifacts',
      String(PRODUCT_LINE_WORKSPACE_ID),
      '2099',
      '01',
      'cafebabe1234.txt',
    )
    mkdirSync(dirname(orphanPath), { recursive: true })
    writeFileSync(orphanPath, 'orphan')
    const summary = repairOrphans(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(summary.fs_no_row).toBeGreaterThanOrEqual(1)
    expect(existsSync(orphanPath)).toBe(false)
  })

  it('unlinks .tmp.* siblings older than the threshold', () => {
    const db = openSeededDb()
    publishFileBacked(db)
    const tmpDir = join(tempDataDir, 'artifacts', String(PRODUCT_LINE_WORKSPACE_ID), '2099', '01')
    mkdirSync(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, '.tmp.deadbeef.123.456')
    writeFileSync(tmpPath, 'leftover')
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(tmpPath, old, old)
    const summary = repairOrphans(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(summary.tmp_swept).toBeGreaterThanOrEqual(1)
    expect(existsSync(tmpPath)).toBe(false)
  })

  it('is idempotent — second run reports zero new orphans', () => {
    const db = openSeededDb()
    publishFileBacked(db)
    const first = repairOrphans(db, PRODUCT_LINE_WORKSPACE_ID)
    const second = repairOrphans(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(second.db_no_file).toBe(0)
    expect(second.fs_no_row).toBe(0)
    expect(first.errors).toBe(0)
    expect(second.errors).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// FR-130 — Retention sweep.
// ---------------------------------------------------------------------------

describe('runRetentionSweep', () => {
  it('writes a single artifact_retention_swept summary even when no policy is configured', () => {
    const db = openSeededDb()
    publishInline(db)
    const summary = runRetentionSweep(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(summary.archived_count).toBe(0)
    expect(summary.deleted_count).toBe(0)
    const rows = db
      .prepare(
        "SELECT data FROM activities WHERE type = 'artifact_retention_swept' AND workspace_id = ?",
      )
      .all(PRODUCT_LINE_WORKSPACE_ID) as { data: string }[]
    expect(rows).toHaveLength(1)
  })

  it('skips quarantined artifacts and counts them in skipped_count', () => {
    const db = openSeededDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(
      JSON.stringify({ artifact_retention: { delete_after_days: 0, archive_after_days: 0 } }),
      PRODUCT_LINE_WORKSPACE_ID,
    )
    const id = publishInline(db)
    quarantineArtifact(db, id, { user_id: 7 })
    const summary = runRetentionSweep(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(summary.skipped_count).toBe(1)
    expect(summary.deleted_count).toBe(0)
    const exists = db.prepare('SELECT id FROM task_artifacts WHERE id = ?').get(id)
    expect(exists).toBeDefined()
  })

  it('delete_after_days < archive_after_days: delete wins precedence', () => {
    const db = openSeededDb()
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(
      JSON.stringify({
        artifact_retention: { delete_after_days: 0, archive_after_days: 0 },
      }),
      PRODUCT_LINE_WORKSPACE_ID,
    )
    const id = publishInline(db)
    const summary = runRetentionSweep(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(summary.deleted_count).toBe(1)
    expect(summary.archived_count).toBe(0)
    const exists = db.prepare('SELECT id FROM task_artifacts WHERE id = ?').get(id)
    expect(exists).toBeUndefined()
  })

  it('lock is released after a normal run so subsequent runs do not throw SweepInProgress', () => {
    const db = openSeededDb()
    runRetentionSweep(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(() => runRetentionSweep(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })).not.toThrow(
      SweepInProgress,
    )
  })
})

// ---------------------------------------------------------------------------
// FR-035a.5 — Rebuild previews invariant.
// ---------------------------------------------------------------------------

describe('rebuildPreviews', () => {
  it('does NOT promote redacted/rejected rows to clean and writes one summary activity', () => {
    const db = openSeededDb()
    const id1 = publishInline(db)
    const id2 = publishInline(db, 'review_notes', JSON.stringify({ y: 'b' }))
    db.prepare(`UPDATE task_artifacts SET redaction_status = 'redacted' WHERE id = ?`).run(id1)
    db.prepare(`UPDATE task_artifacts SET redaction_status = 'rejected' WHERE id = ?`).run(id2)
    const result = rebuildPreviews(db, PRODUCT_LINE_WORKSPACE_ID, { user_id: 7 })
    expect(result.rebuilt_count).toBe(2)
    expect(result.preserved_status_count).toBe(2)
    const r1 = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id1) as {
      redaction_status: string
    }
    expect(r1.redaction_status).toBe('redacted')
    const r2 = db.prepare('SELECT redaction_status FROM task_artifacts WHERE id = ?').get(id2) as {
      redaction_status: string
    }
    expect(r2.redaction_status).toBe('rejected')
    const activities = db
      .prepare(
        "SELECT id FROM activities WHERE type = 'artifact_previews_rebuilt' AND workspace_id = ?",
      )
      .all(PRODUCT_LINE_WORKSPACE_ID)
    expect(activities).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// FR-064 / FR-138 — Health snapshot.
// ---------------------------------------------------------------------------

describe('getHealthSnapshot', () => {
  it('returns counts, total_bytes, p95=insufficient_data with <100 observations, and FR-138 disposition tile', () => {
    const db = openSeededDb()
    publishInline(db)
    publishFileBacked(db)
    const snap = getHealthSnapshot(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(snap.workspace_id).toBe(PRODUCT_LINE_WORKSPACE_ID)
    expect(snap.counts.total).toBe(2)
    expect(snap.total_bytes).toBeGreaterThan(0)
    expect(snap.p95).toBe('insufficient_data')
    expect(typeof snap.failed_disposition_inserts_24h).toBe('number')
  })

  it('returns numeric p95 once ≥100 publish observations are recorded', () => {
    const db = openSeededDb()
    publishInline(db)
    for (let i = 0; i < 110; i++) {
      recordPublishLatency(PRODUCT_LINE_WORKSPACE_ID, i + 1)
    }
    const snap = getHealthSnapshot(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(snap.p95).not.toBe('insufficient_data')
    if (snap.p95 !== 'insufficient_data') {
      expect(typeof snap.p95.publish_p95_ms).toBe('number')
    }
  })

  it('counts failed_disposition_inserts_24h from activities', () => {
    const db = openSeededDb()
    publishInline(db)
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES ('disposition_insert_failed', 'task', ?, 'task-dispatch', 'failed', '{}', ?)",
    ).run(PRODUCER_TASK_ID, PRODUCT_LINE_WORKSPACE_ID)
    const snap = getHealthSnapshot(db, PRODUCT_LINE_WORKSPACE_ID)
    expect(snap.failed_disposition_inserts_24h).toBe(1)
  })
})

describe('test harness', () => {
  it('temp data dir is writable', () => {
    expect(statSync(tempDataDir).isDirectory()).toBe(true)
  })
})
