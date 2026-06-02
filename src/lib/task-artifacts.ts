/**
 * SPEC-007 task-artifacts core module.
 *
 * Foundation phase exports:
 *   - REDACTION_STATUSES / SECURITY_SCAN_STATUSES — frozen tuples (FR-029).
 *   - publishArtifact / getArtifact / getInlineContent — stubs throwing
 *     `not_implemented`. Wired by US6 (T315..T326) and US9 (T611..T619).
 *   - recordPublishLatency / recordReadLatency / getP95Latencies —
 *     `Map<workspace_id, {publish, read}>` ring buffer, capacity 1024 per
 *     metric, p95 = `arr[Math.floor(arr.length*0.95)-1]` after sort.
 *     Returns 'insufficient_data' until ≥100 observations on either ring
 *     (FR-028, FR-064, SC-009, data-model Entity 6).
 *   - encodeCursor / decodeCursor — opaque base64url JSON {triaged_at, id}
 *     (FR-051, FR-080). Throws `invalid_cursor` HttpError-shaped Error on
 *     malformed input.
 *
 * The module is strict-scope and MUST avoid filesystem and database
 * side-effects until US6 lands.
 */

import { createHash, randomBytes } from 'crypto'
import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'fs'
import { createRequire } from 'node:module'
import { join } from 'path'
import { cwd } from 'process'
import { detectSecrets, DetectorScanError } from './secret-detector'
import type Database from 'better-sqlite3'

const runtimeRequire = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Status enum tuples (FR-029).
// ---------------------------------------------------------------------------

export const REDACTION_STATUSES = Object.freeze([
  'pending',
  'clean',
  'redacted',
  'rejected',
  'quarantined',
  'superseded',
] as const)

export type RedactionStatus = (typeof REDACTION_STATUSES)[number]

export const SECURITY_SCAN_STATUSES = Object.freeze([
  'pending',
  'scanned_clean',
  'scanned_with_findings',
  'scan_error',
  'hash_mismatch',
  'file_missing',
] as const)

export type SecurityScanStatus = (typeof SECURITY_SCAN_STATUSES)[number]

// ---------------------------------------------------------------------------
// p95 ring-buffer skeleton (FR-028, FR-064, SC-009).
// ---------------------------------------------------------------------------

const RING_CAPACITY = 1024
const MIN_OBSERVATIONS_FOR_P95 = 100

interface LatencyBuffers {
  readonly publish: number[]
  readonly read: number[]
}

const buffers = new Map<number, LatencyBuffers>()

function ringFor(workspaceId: number): LatencyBuffers {
  let b = buffers.get(workspaceId)
  if (b === undefined) {
    b = { publish: [], read: [] }
    buffers.set(workspaceId, b)
  }
  return b
}

function appendWithCap(buf: number[], value: number): void {
  buf.push(value)
  if (buf.length > RING_CAPACITY) {
    // FIFO drop — remove the oldest observation.
    buf.splice(0, buf.length - RING_CAPACITY)
  }
}

export function recordPublishLatency(workspaceId: number, latencyMs: number): void {
  appendWithCap(ringFor(workspaceId).publish, latencyMs)
}

export function recordReadLatency(workspaceId: number, latencyMs: number): void {
  appendWithCap(ringFor(workspaceId).read, latencyMs)
}

export interface P95Snapshot {
  readonly publish_p95_ms: number | null
  readonly read_p95_ms: number | null
}

function p95(buf: readonly number[]): number | null {
  if (buf.length < MIN_OBSERVATIONS_FOR_P95) return null
  const sorted = [...buf].sort((a, b) => a - b)
  const index = Math.floor(sorted.length * 0.95) - 1
  return sorted[index] ?? null
}

export function getP95Latencies(workspaceId: number): P95Snapshot | 'insufficient_data' {
  const b = buffers.get(workspaceId)
  if (b === undefined) return 'insufficient_data'
  const publishCount = b.publish.length
  const readCount = b.read.length
  if (publishCount < MIN_OBSERVATIONS_FOR_P95 && readCount < MIN_OBSERVATIONS_FOR_P95) {
    return 'insufficient_data'
  }
  return {
    publish_p95_ms: p95(b.publish),
    read_p95_ms: p95(b.read),
  }
}

/**
 * Test-only helper to clear the ring for a single workspace. NEVER call from
 * production code — the buffers are intentionally process-local and durable.
 */
export function resetLatencyBuffersForTest(workspaceId: number): void {
  buffers.delete(workspaceId)
}

// ---------------------------------------------------------------------------
// Opaque base64url cursor (FR-051, FR-080).
// Located here (rather than in `src/app/api/dispositions/route.ts`) because
// the API route file has not been authored yet and the FR-100 strict-scope
// allowlist forbids spinning up additional helper modules in Foundation.
// `dispositions/route.ts` will import these symbols in US3.
// ---------------------------------------------------------------------------

export interface DispositionCursor {
  readonly triaged_at: number
  readonly id: number
}

export class InvalidCursorError extends Error {
  readonly status = 400
  readonly code = 'invalid_cursor'
  constructor(message = 'invalid_cursor') {
    super(message)
    this.name = 'InvalidCursorError'
  }
}

export function encodeCursor(cursor: DispositionCursor): string {
  const json = JSON.stringify({ triaged_at: cursor.triaged_at, id: cursor.id })
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function decodeCursor(token: string): DispositionCursor {
  if (typeof token !== 'string' || token.length === 0) {
    throw new InvalidCursorError()
  }
  // base64url alphabet: [A-Za-z0-9_-]+. Reject anything else outright.
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new InvalidCursorError()
  }
  let json: string
  try {
    json = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw new InvalidCursorError()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new InvalidCursorError()
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new InvalidCursorError()
  }
  const obj = parsed as Record<string, unknown>
  const triagedAt = obj['triaged_at']
  const id = obj['id']
  if (typeof triagedAt !== 'number' || !Number.isFinite(triagedAt)) {
    throw new InvalidCursorError()
  }
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new InvalidCursorError()
  }
  return { triaged_at: triagedAt, id }
}

// ---------------------------------------------------------------------------
// Disposition validation-failure sanitization (FR-013, FR-133).
// ---------------------------------------------------------------------------

const EXCERPT_BYTE_CAP = 4 * 1024 // FR-013 redacted_excerpt ≤ 4 KiB UTF-8.
const PAYLOAD_BYTE_CAP = 16 * 1024 // FR-133 total payload ≤ 16 KiB serialized.
const TRUNCATION_THRESHOLD = 16 * 1024 // FR-013: truncated:true when byte_size > 16 KiB.

export interface DispositionFailurePayloadInput {
  readonly rule: string
  readonly violation: string
  readonly field: string
  readonly content: string
  /**
   * MIME type used by the secret detector. Default 'application/json' which
   * triggers text-based redaction. The disposition diagnostic record is always
   * derived from a JSON-encoded agent output blob.
   */
  readonly mime?: string
}

export interface DispositionFailurePayload {
  readonly rule: string
  readonly violation: string
  readonly field: string
  readonly content_sha256: string
  readonly byte_size: number
  readonly redacted_excerpt: string
  readonly truncated: boolean
}

/**
 * Truncate a string to at most `capBytes` UTF-8 bytes WITHOUT splitting a
 * surrogate pair or producing invalid UTF-8. The implementation slices by
 * code-point boundaries (TextEncoder/Decoder round-trip), then drops trailing
 * bytes until the result decodes cleanly.
 */
function truncateUtf8(input: string, capBytes: number): string {
  const enc = new TextEncoder()
  const buf = enc.encode(input)
  if (buf.byteLength <= capBytes) return input
  // Walk back to a UTF-8 boundary: any byte 0x80..0xBF is a continuation; back
  // up until we land on a leading byte (or the cap itself if already aligned).
  let cap = capBytes
  while (cap > 0) {
    const byte = buf[cap]
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) break
    cap--
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, cap))
}

/**
 * Build the FR-013 sanitized diagnostic payload for a disposition validation
 * failure. The resulting payload is bounded ≤ 16 KiB serialized (FR-133) and
 * NEVER contains the raw matched substring of any detector finding —
 * Constitution Principle XIII enforces `<REDACTED:{rule_id}>` substitution.
 */
export function sanitizeDispositionFailurePayload(
  input: DispositionFailurePayloadInput,
): DispositionFailurePayload {
  const content = input.content
  const byteSize = Buffer.byteLength(content, 'utf8')
  const sha = createHash('sha256').update(content, 'utf8').digest('hex')
  // Run secret detector on the raw content; substitute <REDACTED:rule> tokens.
  // The detector ALWAYS returns the redaction substituted form for text-mode
  // MIMEs. We force `application/json` (text-like) by default so even unknown
  // payloads receive token substitution rather than leak the raw substring.
  let scrubbed: string
  try {
    const result = detectSecrets(content, input.mime ?? 'application/json')
    scrubbed = typeof result.redacted === 'string' ? result.redacted : content
  } catch {
    // Detector failed closed: redact the entire excerpt to avoid leaking.
    scrubbed = '<REDACTED:detector_error>'
  }
  // Trim excerpt to ≤4 KiB.
  let excerpt = truncateUtf8(scrubbed, EXCERPT_BYTE_CAP)
  const truncated = byteSize > TRUNCATION_THRESHOLD

  // Final hard cap on total serialized payload (FR-133). Trim excerpt iteratively.
  let payload: DispositionFailurePayload = {
    rule: input.rule,
    violation: input.violation,
    field: input.field,
    content_sha256: sha,
    byte_size: byteSize,
    redacted_excerpt: excerpt,
    truncated,
  }
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > PAYLOAD_BYTE_CAP && excerpt.length > 0) {
    excerpt = truncateUtf8(excerpt, Math.max(0, Buffer.byteLength(excerpt, 'utf8') - 256))
    payload = { ...payload, redacted_excerpt: excerpt }
  }
  return payload
}

// ---------------------------------------------------------------------------
// US6 — Artifact Publish (FR-020 through FR-029).
// ---------------------------------------------------------------------------

export interface InlineContentRow {
  readonly storage_kind: string
  readonly content_json: string | null
  readonly content_markdown: string | null
}

/**
 * Returns the stored inline payload for an artifact row, or null when the
 * row is file-backed / external_uri (FR-020).
 */
export function getInlineContent(row: InlineContentRow): string | null {
  if (row.storage_kind === 'inline_json') return row.content_json
  if (row.storage_kind === 'inline_markdown') return row.content_markdown
  return null
}

// ---- Constants & allowlists ------------------------------------------------

export const INLINE_BYTE_LIMIT = 64 * 1024 // FR-021
export const FILE_BYTE_LIMIT = 25 * 1024 * 1024 // FR-024

/** FR-025 MIME allowlist. */
export const MIME_ALLOWLIST: readonly string[] = Object.freeze([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/x-yaml',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'application/zip',
])

const MIME_TO_EXT: Readonly<Record<string, string>> = Object.freeze({
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/json': 'json',
  'application/x-yaml': 'yaml',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'application/zip': 'zip',
})

// ---- Typed errors (route layer translates to HTTP) -------------------------

export class ExternalUriRejected extends Error {
  readonly error_code = 'external_uri_rejected'
  constructor(message = 'external_uri_rejected') {
    super(message)
    this.name = 'ExternalUriRejected'
  }
}

export class PayloadTooLarge extends Error {
  readonly error_code = 'payload_too_large'
  readonly limit_bytes: number
  constructor(limitBytes: number, message = 'payload_too_large') {
    super(message)
    this.name = 'PayloadTooLarge'
    this.limit_bytes = limitBytes
  }
}

export class UnsupportedMimeType extends Error {
  readonly error_code = 'unsupported_media_type'
  readonly mime: string
  constructor(mime: string, message = 'unsupported_media_type') {
    super(message)
    this.name = 'UnsupportedMimeType'
    this.mime = mime
  }
}

export class EmptyPayload extends Error {
  readonly error_code = 'empty_payload'
  constructor(message = 'empty_payload') {
    super(message)
    this.name = 'EmptyPayload'
  }
}

export class WorkspaceMismatch extends Error {
  readonly error_code = 'workspace_mismatch'
  constructor(message = 'workspace_mismatch') {
    super(message)
    this.name = 'WorkspaceMismatch'
  }
}

export class SupersedeTargetNotFound extends Error {
  readonly error_code = 'artifact_not_found'
  constructor(message = 'artifact_not_found') {
    super(message)
    this.name = 'SupersedeTargetNotFound'
  }
}

export class SupersedesCrossTask extends Error {
  readonly error_code = 'supersedes_cross_task'
  constructor(message = 'supersedes_cross_task') {
    super(message)
    this.name = 'SupersedesCrossTask'
  }
}

export class SupersedeTargetAlreadySuperseded extends Error {
  readonly error_code = 'supersede_target_already_superseded'
  readonly supersedes_id: number
  readonly current_status: string
  constructor(supersedesId: number, currentStatus: string, message = 'supersede_target_already_superseded') {
    super(message)
    this.name = 'SupersedeTargetAlreadySuperseded'
    this.supersedes_id = supersedesId
    this.current_status = currentStatus
  }
}

export class CannotSupersedeQuarantined extends Error {
  readonly error_code = 'cannot_supersede_quarantined'
  constructor(message = 'cannot_supersede_quarantined') {
    super(message)
    this.name = 'CannotSupersedeQuarantined'
  }
}

export class TaskNotFound extends Error {
  readonly error_code = 'task_not_found'
  constructor(message = 'task_not_found') {
    super(message)
    this.name = 'TaskNotFound'
  }
}

export class InternalStorageError extends Error {
  readonly error_code = 'internal_storage_error'
  readonly cause_code: string | undefined
  constructor(causeCode?: string, message = 'internal_storage_error') {
    super(message)
    this.name = 'InternalStorageError'
    this.cause_code = causeCode
  }
}

/**
 * SPEC-007 US8 — secret detector enforcement (FR-032, FR-141).
 * Thrown when `detectSecrets` reports findings ≥ 1 AND the detected payload
 * cannot be redact-and-stored (binary MIME, or template's
 * `allow_redacted_artifacts=0`). The route layer (US9) maps this to HTTP 422
 * with body `{error: 'secret_detected', redacted_preview, findings}`.
 *
 * `redacted_preview` is bounded to ≤ 4 KiB UTF-8 (FR-013-equivalent cap) and
 * NEVER contains the raw matched substring — the underlying detector already
 * substitutes `<REDACTED:{rule_id}>` for text MIMEs (Constitution Principle
 * XIII). For binary MIMEs the detector returns scan-only output; the
 * `redacted_preview` is a UTF-8 view of those bytes, intentionally lossy.
 */
export class SecretDetectedError extends Error {
  readonly status = 422
  readonly code = 'secret_detected'
  readonly error_code = 'secret_detected'
  constructor(
    public readonly redacted_preview: string,
    public readonly findings: number,
  ) {
    super('secret_detected')
    this.name = 'SecretDetectedError'
  }
}

/**
 * SPEC-007 US8 — fail-closed wrapper around `detectSecrets` (FR-132).
 * Thrown when the detector itself raises (returned via `DetectorScanError`).
 * The route layer (US9) maps this to HTTP 500 `internal_scan_error`. The
 * `evidence` field is for activity payload only — never surfaced to the API
 * response body.
 */
export class InternalScanError extends Error {
  readonly status = 500
  readonly code = 'internal_scan_error'
  readonly error_code = 'internal_scan_error'
  constructor(
    message: string,
    public readonly evidence: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'InternalScanError'
  }
}

export class Spec009C3ArtifactValidationError extends Error {
  readonly status = 422
  readonly code = 'spec009c3_artifact_invalid'
  readonly error_code = 'spec009c3_artifact_invalid'
  constructor(message = 'spec-009c3 artifact validation failed') {
    super(message)
    this.name = 'Spec009C3ArtifactValidationError'
  }
}

// ---- publishArtifact -------------------------------------------------------

export type StorageKind = 'inline_json' | 'inline_markdown' | 'file' | 'external_uri'

export interface PublishArtifactFileInput {
  readonly bytes: Buffer
  readonly original_filename?: string
}

export interface PublishArtifactInput {
  readonly task_id: number
  readonly artifact_type: string
  readonly storage_kind: StorageKind
  readonly content?: string
  readonly file?: PublishArtifactFileInput
  readonly mime: string
  readonly schema_version?: string
  readonly supersedes?: number
  /** Caller's currently active workspace (route layer supplies; FR-026). */
  readonly active_workspace_id: number
  /** True when the caller's session is Facility-scoped (FR-026 passthrough). */
  readonly is_facility_caller: boolean
  /** Optional db handle; defaults to the runtime singleton. */
  readonly db?: Database.Database
  /** Optional producer agent id for activity attribution. */
  readonly producer_agent_id?: number
  /** Optional workflow_template_slug for chain provenance. */
  readonly workflow_template_slug?: string
}

export interface PublishArtifactResult {
  readonly id: number
  readonly sha256: string
  readonly storage_uri: string | null
  readonly byte_size: number
  readonly redaction_status: RedactionStatus
  readonly security_scan_status: SecurityScanStatus
}

interface TaskRow {
  readonly id: number
  readonly workspace_id: number
}

interface ArtifactRow {
  readonly id: number
  readonly task_id: number
  readonly workspace_id: number
  readonly artifact_type: string
  readonly storage_kind: string
  readonly storage_uri: string | null
  readonly redaction_status: RedactionStatus
  readonly security_scan_status: SecurityScanStatus
  readonly sha256: string | null
  readonly byte_size: number | null
  readonly content_json: string | null
  readonly content_markdown: string | null
  readonly mime_type: string | null
  readonly preview_text: string | null
  readonly supersedes_artifact_id: number | null
}

function getRuntimeDatabase(): () => Database.Database {
  return (runtimeRequire('./db') as { getDatabase: () => Database.Database }).getDatabase
}

function resolveDb(input: PublishArtifactInput): Database.Database {
  if (input.db !== undefined) return input.db
  return getRuntimeDatabase()()
}

function resolveDataDir(): string {
  const env = process.env['PADDOCK_DATA_DIR']
  if (typeof env === 'string' && env.length > 0) return env
  return join(cwd(), '.data')
}

function utcShard(now: number): { yyyy: string; mm: string } {
  const d = new Date(now)
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return { yyyy, mm }
}

function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'bin'
}

function fetchTaskWorkspace(db: Database.Database, taskId: number): TaskRow | null {
  const row = db.prepare('SELECT id, workspace_id FROM tasks WHERE id = ?').get(taskId) as
    | TaskRow
    | undefined
  return row ?? null
}

function fetchArtifactRow(db: Database.Database, id: number): ArtifactRow | null {
  const row = db
    .prepare(
      `SELECT id, task_id, workspace_id, artifact_type, storage_kind, storage_uri,
              redaction_status, security_scan_status, sha256, byte_size,
              content_json, content_markdown, mime_type, preview_text,
              supersedes_artifact_id
       FROM task_artifacts WHERE id = ?`,
    )
    .get(id) as ArtifactRow | undefined
  return row ?? null
}

/** Public lookup helper — same shape as fetchArtifactRow, exported for callers. */
export function getArtifactById(db: Database.Database, id: number): ArtifactRow | null {
  return fetchArtifactRow(db, id)
}

interface AtomicWriteResult {
  readonly canonicalPath: string
  readonly winnerWroteFile: boolean
}

/**
 * FR-022 atomic write protocol. Returns the canonical path on success.
 * Throws InternalStorageError on any non-EEXIST failure.
 */
function atomicWriteFile(
  shardDir: string,
  bytes: Buffer,
  sha256: string,
  ext: string,
): AtomicWriteResult {
  mkdirSync(shardDir, { recursive: true })
  const canonical = join(shardDir, `${sha256}.${ext}`)
  const tmpName = `.tmp.${sha256}.${String(process.pid)}.${randomBytes(6).toString('hex')}`
  const tmpPath = join(shardDir, tmpName)

  // Step 1: write bytes to temp.
  let fd: number | undefined
  try {
    fd = openSync(tmpPath, 'wx')
    writeSync(fd, bytes, 0, bytes.byteLength, 0)
    fsyncSync(fd)
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* best-effort */
      }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      /* best-effort */
    }
    const code = (err as { code?: string }).code
    throw new InternalStorageError(code, `temp_write_failed${code !== undefined ? ':' + code : ''}`)
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* best-effort */
      }
    }
  }

  // Step 2: link temp → canonical (atomic on POSIX).
  let winnerWroteFile = true
  try {
    linkSync(tmpPath, canonical)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'EEXIST') {
      // FR-023 EEXIST loser path: re-read canonical, hash-assert.
      try {
        unlinkSync(tmpPath)
      } catch {
        /* best-effort */
      }
      const existing = readFileSync(canonical)
      const existingHash = createHash('sha256').update(existing).digest('hex')
      if (existingHash !== sha256) {
        throw new InternalStorageError(
          'hash_mismatch',
          'artifact_hash_verification_failed',
        )
      }
      winnerWroteFile = false
      return { canonicalPath: canonical, winnerWroteFile }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      /* best-effort */
    }
    throw new InternalStorageError(code, `link_failed${code !== undefined ? ':' + code : ''}`)
  }

  // Step 3: unlink temp now that link succeeded.
  try {
    unlinkSync(tmpPath)
  } catch {
    // Non-fatal: temp may have been removed by another process.
  }

  // Step 4: fsync parent dir for durability of the link.
  try {
    const dirFd = openSync(shardDir, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  } catch {
    // Some platforms (e.g. Windows or certain FS types) reject fsync on a
    // directory descriptor. Treat as best-effort — the link is durable
    // through journaled metadata on extN/APFS.
  }
  return { canonicalPath: canonical, winnerWroteFile }
}

/**
 * SPEC-007 US8 throttle helper (FR-032 / FR-141 / FR-132).
 *
 * Identical SQL shape to the FR-014 disposition throttle in
 * `src/lib/task-dispatch.ts:writeThrottledInsertFailure`: 1 row per
 * `(activity_type, task_id)` per 60s window, keyed off
 * `activities.created_at >= unixepoch() - 60`.
 *
 * Suppresses ALL write failures via `logger.warn` so that an activities
 * insert fault NEVER bubbles back into the publish path (the publish
 * already failed/redacted by the time we land here — losing the audit row
 * is preferable to surfacing a 500 to the agent).
 */
function writeThrottledSecurityActivity(
  db: Database.Database,
  activityType: 'security_violation' | 'security_violation_scan_error',
  taskId: number,
  workspaceId: number,
  payload: Record<string, unknown>,
): void {
  try {
    const recent = db
      .prepare(
        "SELECT id FROM activities WHERE type = ? AND entity_type = 'task' AND entity_id = ? AND created_at >= unixepoch() - 60 LIMIT 1",
      )
      .get(activityType, taskId) as { id: number } | undefined
    if (recent !== undefined) return
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, 'task', ?, 'task-artifacts', ?, ?, ?)",
    ).run(
      activityType,
      taskId,
      activityType === 'security_violation'
        ? 'Secret detector findings on artifact publish'
        : 'Secret detector internal error on artifact publish',
      JSON.stringify(payload),
      workspaceId,
    )
  } catch (innerErr) {
    // Suppress activities-write failures so a missing audit row never bubbles
    // back into the publish path. Use console.warn to keep the strict-scope
    // module free of external `logger` import (avoids tsconfig.spec-strict
    // include leakage for SPEC-007 task-artifacts.ts).
    console.warn({
      event: 'security_activity_write_failed',
      task_id: taskId,
      activity_type: activityType,
      error: innerErr instanceof Error ? innerErr.message : String(innerErr),
    })
  }
}

/**
 * SPEC-007 US8 — resolve `workflow_templates.allow_redacted_artifacts` for a
 * given task (FR-033). Returns `0` (the safe default — reject) when the task
 * row, the template join, or the column is missing.
 */
function resolveAllowRedactedArtifacts(
  db: Database.Database,
  taskId: number,
): number {
  try {
    const row = db
      .prepare(
        `SELECT wt.allow_redacted_artifacts AS allow_redacted_artifacts
           FROM tasks t
           JOIN workflow_templates wt ON wt.id = t.workflow_template_id
          WHERE t.id = ?`,
      )
      .get(taskId) as { allow_redacted_artifacts: number | null } | undefined
    if (row === undefined) return 0
    const v = row.allow_redacted_artifacts
    return typeof v === 'number' && v === 1 ? 1 : 0
  } catch {
    // Defensive: a malformed schema or missing FK should fail closed (reject).
    return 0
  }
}

/**
 * SPEC-007 US8 — text-like MIME predicate (FR-033).
 * Mirrors the detector's `isTextMime` set but intentionally narrower — only
 * the subset where we are willing to redact-and-store. PDFs, ZIPs, images
 * remain binary and ALWAYS reject on findings (FR-034).
 */
function isRedactableTextMime(mime: string): boolean {
  const lower = mime.toLowerCase()
  if (lower.startsWith('text/')) return true
  return lower === 'application/json' || lower === 'application/x-yaml'
}

/**
 * Build the FR-141 activity payload shape: `{task_id, mime, byte_size,
 * findings: Array<{rule_id, line_number?, char_offset?}>}`. NEVER includes
 * the matched substring.
 */
function buildSecretViolationPayload(
  taskId: number,
  mime: string,
  byteSize: number,
  findings: readonly { rule_id: string; line_number?: number; char_offset?: number }[],
): Record<string, unknown> {
  return {
    task_id: taskId,
    mime,
    byte_size: byteSize,
    findings: findings.map((f) => ({
      rule_id: f.rule_id,
      ...(typeof f.line_number === 'number' ? { line_number: f.line_number } : {}),
      ...(typeof f.char_offset === 'number' ? { char_offset: f.char_offset } : {}),
    })),
  }
}

/**
 * Pre-INSERT validation order per CHK034 (the subset we own here — flag/auth
 * happen at the route layer; everything from external_uri onward is library
 * scope). Throws typed errors that the route layer maps to HTTP statuses.
 */
function validateInputs(input: PublishArtifactInput): void {
  // FR-020: external_uri rejection (before any other parsing).
  if (input.storage_kind === 'external_uri') {
    throw new ExternalUriRejected()
  }
  // Storage_kind sanity: schema accepts only the four enum values; after the
  // external_uri rejection above, the type narrows to inline_json |
  // inline_markdown | file. A defensive runtime check still rejects any
  // out-of-band value injected by a non-typed caller (eslint flags the dead
  // type-only branch — `as string` defeats the narrowing for a true runtime
  // guard).
  const sk: string = input.storage_kind as string
  if (sk !== 'inline_json' && sk !== 'inline_markdown' && sk !== 'file') {
    throw new ExternalUriRejected('unsupported_storage_kind')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  const candidate = value[key]
  return typeof candidate === 'string' && candidate.trim().length > 0
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key])
}

function failSpec009C3(reason: string): never {
  throw new Spec009C3ArtifactValidationError(`spec-009c3 artifact validation failed: ${reason}`)
}

function validateNoSecretBearingKeys(value: unknown, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateNoSecretBearingKeys(item, `${path}[${String(index)}]`)
    })
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase()
    if (
      lower.includes('secret')
      || lower.includes('token')
      || lower.includes('credential')
      || lower.includes('connection_string')
      || lower === 'password'
      || lower === 'raw_log'
      || lower === 'raw_logs'
      || lower === 'raw_source'
    ) {
      failSpec009C3(`forbidden sensitive key ${path}${key}`)
    }
    validateNoSecretBearingKeys(child, `${path}${key}.`)
  }
}

function validateSpec009C3ArtifactInput(
  db: Database.Database,
  input: PublishArtifactInput,
  producerWorkspaceId: number,
): void {
  if (input.schema_version !== 'spec-009c3.v1') return
  if (input.storage_kind !== 'inline_json') failSpec009C3('storage_kind must be inline_json')
  if (input.mime !== 'application/json') failSpec009C3('mime must be application/json')
  if (input.content === undefined || input.content.trim() === '') failSpec009C3('content is required')

  let payload: unknown
  try {
    payload = JSON.parse(input.content)
  } catch {
    failSpec009C3('content must be valid JSON')
  }
  if (!isRecord(payload)) failSpec009C3('payload must be an object')
  validateNoSecretBearingKeys(payload)

  const artifactType = typeof payload['artifact_type'] === 'string' ? payload['artifact_type'] : ''
  if (artifactType !== input.artifact_type) failSpec009C3('artifact_type mismatch')
  if (payload['schema_version'] !== undefined && payload['schema_version'] !== 'spec-009c3.v1') {
    failSpec009C3('payload schema_version mismatch')
  }
  for (const key of ['artifact_type', 'stage', 'produced_at', 'summary']) {
    if (!hasString(payload, key)) failSpec009C3(`missing ${key}`)
  }
  for (const key of ['producer_task_id', 'workspace_id']) {
    if (!hasNumber(payload, key)) failSpec009C3(`missing ${key}`)
  }
  if (payload['workspace_id'] !== producerWorkspaceId) failSpec009C3('workspace_id mismatch')
  if (payload['producer_task_id'] !== input.task_id) failSpec009C3('producer_task_id mismatch')
  const rootIssue = payload['root_issue']
  if (!isRecord(rootIssue)) failSpec009C3('missing root_issue')
  if (!hasNumber(rootIssue, 'task_id') || !hasString(rootIssue, 'github_repo') || !hasNumber(rootIssue, 'github_issue_number')) {
    failSpec009C3('root_issue identity is incomplete')
  }
  const prDevTask = payload['pr_dev_task']
  if (!isRecord(prDevTask)) failSpec009C3('missing pr_dev_task')
  if (
    prDevTask['task_id'] !== input.task_id
    || !hasString(prDevTask, 'github_repo')
    || !hasNumber(prDevTask, 'github_pr_number')
  ) {
    failSpec009C3('pr_dev_task identity is incomplete')
  }

  switch (artifactType) {
    case 'remediation_plan':
      for (const key of ['problem_statement', 'planned_changes', 'verification_plan', 'risk_notes']) {
        if (payload[key] === undefined) failSpec009C3(`missing ${key}`)
      }
      break
    case 'dev_verification':
      for (const key of ['commit', 'branch', 'checks', 'residual_risk', 'pr_identity_source']) {
        if (payload[key] === undefined) failSpec009C3(`missing ${key}`)
      }
      break
    case 'review_verdict':
      if (payload['verdict'] !== 'pass' && payload['verdict'] !== 'fix') failSpec009C3('unsupported review verdict')
      if (!hasString(payload, 'reviewer')) failSpec009C3('missing reviewer')
      if (!Array.isArray(payload['blocking_findings'])) failSpec009C3('missing blocking_findings')
      break
    case 'aegis_approval': {
      if (!hasNumber(payload, 'quality_review_id')) failSpec009C3('missing quality_review_id')
      if (payload['reviewer'] !== 'aegis') failSpec009C3('reviewer must be aegis')
      if (payload['status'] !== 'approved' && payload['status'] !== 'rejected') failSpec009C3('unsupported aegis status')
      if (!hasString(payload, 'reason')) failSpec009C3('missing reason')
      const row = db.prepare(`
        SELECT id FROM quality_reviews
        WHERE id = ? AND task_id = ? AND workspace_id = ? AND reviewer = 'aegis' AND status = ?
      `).get(payload['quality_review_id'], input.task_id, producerWorkspaceId, payload['status']) as { id: number } | undefined
      if (!row) failSpec009C3('canonical aegis quality review row not found')
      break
    }
    case 'governance_evidence':
      if (!Array.isArray(payload['stage_decisions'])) failSpec009C3('missing stage_decisions')
      if (typeof payload['readiness_blocked'] !== 'boolean') failSpec009C3('missing readiness_blocked')
      break
    default:
      failSpec009C3('unsupported artifact_type')
  }
}

/**
 * publishArtifact — US6 core (FR-020, FR-021, FR-022, FR-023, FR-024, FR-025,
 * FR-026, FR-027, FR-028).
 *
 * Validation order (CHK034 within library scope):
 *   1. external_uri → ExternalUriRejected.
 *   2. workspace authorization (FR-026) → WorkspaceMismatch.
 *   3. supersede target lookup (existence/cross-task/quarantined).
 *   4. size cap (FR-024) → PayloadTooLarge.
 *   5. MIME allowlist (FR-025) → UnsupportedMimeType.
 *   6. inline → file auto-promotion (FR-021) when inline > 64 KiB.
 *   7. atomic write (FR-022) for file-backed.
 *   8. INSERT (+ supersede UPDATE) inside one transaction (FR-027).
 *   9. p95 ring-buffer recording on success (FR-028).
 *
 * Detector integration (FR-030+) is intentionally OUT OF SCOPE for US6 — the
 * call site lives in this function but is wired by US8.
 */
export function publishArtifact(input: PublishArtifactInput): PublishArtifactResult {
  const start = Date.now()
  validateInputs(input)
  const db = resolveDb(input)

  // Resolve producer task → authoritative workspace_id (FR-026).
  const task = fetchTaskWorkspace(db, input.task_id)
  if (task === null) {
    throw new TaskNotFound()
  }
  const producerWorkspaceId = task.workspace_id

  // FR-026: non-Facility callers must publish into their active workspace.
  if (!input.is_facility_caller && input.active_workspace_id !== producerWorkspaceId) {
    throw new WorkspaceMismatch()
  }

  validateSpec009C3ArtifactInput(db, input, producerWorkspaceId)

  // Materialize content into a Buffer (file) or string (inline) early for
  // size/MIME checks. Auto-promote inline > 64 KiB to file. external_uri /
  // unknown storage_kind values were rejected up front in validateInputs.
  let storageKind: 'inline_json' | 'inline_markdown' | 'file' =
    input.storage_kind === 'inline_json'
      ? 'inline_json'
      : input.storage_kind === 'inline_markdown'
        ? 'inline_markdown'
        : 'file'
  let inlineString: string | null = null
  let fileBytes: Buffer | null = null

  if (storageKind === 'file') {
    if (input.file === undefined) {
      throw new EmptyPayload('missing_file_payload')
    }
    fileBytes = input.file.bytes
    if (fileBytes.byteLength === 0) {
      throw new EmptyPayload()
    }
    if (fileBytes.byteLength > FILE_BYTE_LIMIT) {
      throw new PayloadTooLarge(FILE_BYTE_LIMIT)
    }
  } else {
    // inline_json or inline_markdown
    const text = input.content ?? ''
    const utf8Bytes = Buffer.byteLength(text, 'utf8')
    if (utf8Bytes === 0) {
      throw new EmptyPayload()
    }
    if (utf8Bytes > INLINE_BYTE_LIMIT) {
      // FR-021 auto-promotion to file storage.
      storageKind = 'file'
      fileBytes = Buffer.from(text, 'utf8')
      if (fileBytes.byteLength > FILE_BYTE_LIMIT) {
        throw new PayloadTooLarge(FILE_BYTE_LIMIT)
      }
    } else {
      inlineString = text
    }
  }

  // FR-025 MIME allowlist (size/cap precedes MIME per CHK034).
  if (!MIME_ALLOWLIST.includes(input.mime)) {
    throw new UnsupportedMimeType(input.mime)
  }

  // Resolve supersedes target if specified. Validate existence + same task.
  // Final 'quarantined'/'superseded' check happens INSIDE the transaction
  // to avoid TOCTOU (FR-027 / CHK069 / CHK071).
  let supersedesRow: ArtifactRow | null = null
  if (typeof input.supersedes === 'number') {
    supersedesRow = fetchArtifactRow(db, input.supersedes)
    if (supersedesRow === null) {
      throw new SupersedeTargetNotFound()
    }
    if (supersedesRow.task_id !== input.task_id) {
      throw new SupersedesCrossTask()
    }
    if (supersedesRow.workspace_id !== producerWorkspaceId) {
      // Cross-workspace target: non-Facility caller masks as not_found
      // (codebase precedent: tasks/[id]/route.ts:117-123). Library returns
      // NotFound; the route layer can decide to mask further if needed.
      throw new SupersedeTargetNotFound()
    }
  }

  // -------------------------------------------------------------------------
  // SPEC-007 US8 — Secret detector enforcement (FR-032/033/034/035a/132/141).
  //
  // Runs AFTER content materialization but BEFORE hash compute and atomic
  // write. The detector's `redacted` output may swap our content variable
  // (text MIMEs only); the hash and write below operate on whatever ends up
  // being stored, so a redacted-and-stored artifact is internally consistent
  // (sha256 == hash(redacted_text)).
  //
  // Three branches:
  //   (a) findings == 0 → pass through (status stays pending/pending).
  //   (b) findings ≥ 1 AND template allows AND text-like MIME → swap to
  //       redacted content, mark redaction_status='redacted', security_scan
  //       _status='scanned_with_findings'. Throttled `security_violation`
  //       activity. Continue to hash + write of redacted bytes.
  //   (c) findings ≥ 1 otherwise (binary OR not allowed) → throw
  //       SecretDetectedError. Throttled `security_violation` activity. NO
  //       file write. NO row insert.
  //
  // Detector throws are caught and re-thrown as InternalScanError (FR-132)
  // with a throttled `security_violation_scan_error` activity. NEVER swallowed.
  // -------------------------------------------------------------------------
  let redactionStatusFinal: RedactionStatus = 'pending'
  let securityScanStatusFinal: SecurityScanStatus = 'pending'
  {
    const detectorInput: string | Buffer =
      storageKind === 'file'
        ? (fileBytes ?? Buffer.alloc(0))
        : (inlineString ?? '')
    const detectorByteSize: number =
      typeof detectorInput === 'string'
        ? Buffer.byteLength(detectorInput, 'utf8')
        : detectorInput.byteLength

    let detectorResult
    try {
      detectorResult = detectSecrets(detectorInput, input.mime)
    } catch (err) {
      // FR-132 fail-closed: detector itself raised. Write throttled
      // `security_violation_scan_error` activity (NEVER `security_violation`
      // — different audit class), then re-throw as typed InternalScanError.
      writeThrottledSecurityActivity(
        db,
        'security_violation_scan_error',
        input.task_id,
        producerWorkspaceId,
        {
          task_id: input.task_id,
          mime: input.mime,
          byte_size: detectorByteSize,
          error_class:
            err instanceof DetectorScanError ? 'DetectorScanError' : err instanceof Error ? err.name : 'unknown',
        },
      )
      throw new InternalScanError('detector_threw', {
        task_id: input.task_id,
        mime: input.mime,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if (detectorResult.findings.length > 0) {
      const allowRedacted = resolveAllowRedactedArtifacts(db, input.task_id)
      const isText = isRedactableTextMime(input.mime)
      const canRedactAndStore = allowRedacted === 1 && isText && typeof detectorResult.redacted === 'string'

      // Always write the FR-141 violation activity (throttled). The forensic
      // trail is identical for both reject and redact-and-store branches.
      writeThrottledSecurityActivity(
        db,
        'security_violation',
        input.task_id,
        producerWorkspaceId,
        buildSecretViolationPayload(
          input.task_id,
          input.mime,
          detectorByteSize,
          detectorResult.findings,
        ),
      )

      if (canRedactAndStore) {
        // Branch (b): swap content to redacted form. Hash + write below
        // recompute against the redacted bytes so on-disk == sha256.
        const redactedText = detectorResult.redacted as string
        if (storageKind === 'file') {
          fileBytes = Buffer.from(redactedText, 'utf8')
        } else {
          inlineString = redactedText
        }
        redactionStatusFinal = 'redacted'
        securityScanStatusFinal = 'scanned_with_findings'
      } else {
        // Branch (c): always-reject. Build a ≤ 4 KiB UTF-8 preview of the
        // redacted view (text MIMEs already substituted; binary view is a
        // lossy UTF-8 decode of the original bytes — intentional, since
        // FR-034 forbids binary redaction round-trips).
        const previewSource: string =
          typeof detectorResult.redacted === 'string'
            ? detectorResult.redacted
            : detectorResult.redacted.toString('utf8')
        const preview = truncateUtf8(previewSource, EXCERPT_BYTE_CAP)
        throw new SecretDetectedError(preview, detectorResult.findings.length)
      }
    }
  }

  // Compute hash + byte_size for both inline and file.
  let sha256Hex: string
  let byteSize: number
  let storageUri: string | null = null

  if (storageKind === 'file') {
    if (fileBytes === null) {
      throw new InternalStorageError('missing_file_bytes_invariant')
    }
    sha256Hex = createHash('sha256').update(fileBytes).digest('hex').toLowerCase()
    byteSize = fileBytes.byteLength

    // FR-022 atomic write.
    const dataDir = resolveDataDir()
    const { yyyy, mm } = utcShard(start)
    const shardDir = join(dataDir, 'artifacts', String(producerWorkspaceId), yyyy, mm)
    const ext = extForMime(input.mime)
    const writeResult = atomicWriteFile(shardDir, fileBytes, sha256Hex, ext)
    storageUri = writeResult.canonicalPath
  } else {
    // inline path
    if (inlineString === null) {
      throw new InternalStorageError('missing_inline_string_invariant')
    }
    sha256Hex = createHash('sha256').update(inlineString, 'utf8').digest('hex').toLowerCase()
    byteSize = Buffer.byteLength(inlineString, 'utf8')
  }

  // Inline column split: FR-029 / data-model Decision 12.
  const contentJson = storageKind === 'inline_json' ? inlineString : null
  const contentMarkdown = storageKind === 'inline_markdown' ? inlineString : null

  // FR-027 single-transaction INSERT (+ optional supersede UPDATE).
  const tx = db.transaction(() => {
    if (typeof input.supersedes === 'number' && supersedesRow !== null) {
      // Re-read predecessor inside the transaction (CHK069/71 TOCTOU guard).
      const fresh = fetchArtifactRow(db, input.supersedes)
      if (fresh === null) {
        throw new SupersedeTargetNotFound()
      }
      if (fresh.redaction_status === 'superseded') {
        throw new SupersedeTargetAlreadySuperseded(fresh.id, fresh.redaction_status)
      }
      if (fresh.redaction_status === 'quarantined') {
        throw new CannotSupersedeQuarantined()
      }
      // Mark predecessor superseded.
      db.prepare(
        `UPDATE task_artifacts SET redaction_status = 'superseded' WHERE id = ?`,
      ).run(input.supersedes)
    }

    const insert = db.prepare(`
      INSERT INTO task_artifacts (
        task_id, workspace_id, project_id, producer_agent_id,
        workflow_template_slug, artifact_type, schema_version,
        storage_kind, content_json, content_markdown, storage_uri,
        original_filename, mime_type, byte_size, sha256, preview_text,
        redaction_status, security_scan_status, supersedes_artifact_id
      ) VALUES (
        @task_id, @workspace_id, NULL, @producer_agent_id,
        @workflow_template_slug, @artifact_type, @schema_version,
        @storage_kind, @content_json, @content_markdown, @storage_uri,
        @original_filename, @mime_type, @byte_size, @sha256, @preview_text,
        @redaction_status, @security_scan_status, @supersedes_artifact_id
      )
    `)
    const info = insert.run({
      task_id: input.task_id,
      workspace_id: producerWorkspaceId,
      producer_agent_id: input.producer_agent_id ?? null,
      workflow_template_slug: input.workflow_template_slug ?? null,
      artifact_type: input.artifact_type,
      schema_version: input.schema_version ?? null,
      storage_kind: storageKind,
      content_json: contentJson,
      content_markdown: contentMarkdown,
      storage_uri: storageUri,
      original_filename: input.file?.original_filename ?? null,
      mime_type: input.mime,
      byte_size: byteSize,
      sha256: sha256Hex,
      preview_text: null, // US9 wires preview_text materialization (FR-042).
      redaction_status: redactionStatusFinal,
      security_scan_status: securityScanStatusFinal,
      supersedes_artifact_id: input.supersedes ?? null,
    })
    return Number(info.lastInsertRowid)
  })

  const newId = tx()

  // FR-028 ring-buffer update on success (and only success).
  recordPublishLatency(producerWorkspaceId, Date.now() - start)

  return {
    id: newId,
    sha256: sha256Hex,
    storage_uri: storageUri,
    byte_size: byteSize,
    redaction_status: redactionStatusFinal,
    security_scan_status: securityScanStatusFinal,
  }
}

// ---------------------------------------------------------------------------
// US10 — Admin actions (FR-060..FR-069, FR-124, FR-129, FR-130, FR-138).
//
// Every destructive admin action is wrapped in a single `db.transaction()`
// with one activity row per mutation (FR-063). Filesystem side-effects (delete,
// archive move, orphan move, retention move) happen BEFORE the transaction
// opens so a partial FS step never produces a phantom "applied" DB row.
// ---------------------------------------------------------------------------

export const ADMIN_ACTIVITY_TYPES = Object.freeze([
  'artifact_quarantined',
  'artifact_unquarantined',
  'artifact_deleted',
  'artifact_archived',
  'artifact_hash_verified',
  'artifact_repaired_orphan',
  'artifact_previews_rebuilt',
  'artifact_retention_swept',
] as const)

export type AdminActivityType = (typeof ADMIN_ACTIVITY_TYPES)[number]

export class ArtifactNotFound extends Error {
  readonly status = 404
  readonly error_code = 'artifact_not_found'
  constructor(message = 'artifact_not_found') {
    super(message)
    this.name = 'ArtifactNotFound'
  }
}

export class AlreadyQuarantined extends Error {
  readonly status = 409
  readonly error_code = 'already_quarantined'
  constructor(message = 'already_quarantined') {
    super(message)
    this.name = 'AlreadyQuarantined'
  }
}

export class NotQuarantined extends Error {
  readonly status = 409
  readonly error_code = 'not_quarantined'
  constructor(message = 'not_quarantined') {
    super(message)
    this.name = 'NotQuarantined'
  }
}

export class SweepInProgress extends Error {
  readonly status = 409
  readonly error_code = 'sweep_in_progress'
  constructor(message = 'sweep_in_progress') {
    super(message)
    this.name = 'SweepInProgress'
  }
}

export interface AdminActorContext {
  readonly user_id?: number | null
  readonly session_id?: number | string | null
  readonly reason?: string | null
}

interface AdminActivityPayload {
  readonly artifact_id: number
  readonly actor_session_id: number | string | null
  readonly actor_user_id: number | null
  readonly reason: string | null
  readonly before_status: RedactionStatus | null
  readonly after_status: RedactionStatus | null
  readonly extra?: Record<string, unknown>
}

function writeAdminActivity(
  db: Database.Database,
  type: AdminActivityType,
  artifactId: number,
  workspaceId: number,
  payload: AdminActivityPayload,
): void {
  // Activity payload bounded to ≤16 KiB (FR-133 family limit). Production
  // payloads stay small; defensive truncation only.
  const data: Record<string, unknown> = {
    artifact_id: payload.artifact_id,
    actor_session_id: payload.actor_session_id,
    actor_user_id: payload.actor_user_id,
    reason: payload.reason,
    before_status: payload.before_status,
    after_status: payload.after_status,
    ...(payload.extra ?? {}),
  }
  let json = JSON.stringify(data)
  if (Buffer.byteLength(json, 'utf8') > PAYLOAD_BYTE_CAP) {
    // Hard cap — drop `extra` and `reason` if oversized (FR-133).
    json = JSON.stringify({
      artifact_id: payload.artifact_id,
      actor_session_id: payload.actor_session_id,
      actor_user_id: payload.actor_user_id,
      before_status: payload.before_status,
      after_status: payload.after_status,
      truncated: true,
    })
  }
  db.prepare(
    "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, 'task_artifact', ?, 'task-artifacts-admin', ?, ?, ?)",
  ).run(type, artifactId, type, json, workspaceId)
}

function fetchArtifactOrThrow(db: Database.Database, id: number): ArtifactRow {
  const row = fetchArtifactRow(db, id)
  if (row === null) throw new ArtifactNotFound()
  return row
}

export interface QuarantineResult {
  readonly id: number
  readonly redaction_status: RedactionStatus
  readonly before_status: RedactionStatus
}

/**
 * FR-062 / FR-063 / FR-124: quarantine an artifact.
 * Atomic: UPDATE + activity INSERT inside one db.transaction.
 */
export function quarantineArtifact(
  db: Database.Database,
  artifactId: number,
  actor: AdminActorContext,
): QuarantineResult {
  const tx = db.transaction(() => {
    const row = fetchArtifactOrThrow(db, artifactId)
    if (row.redaction_status === 'quarantined') {
      throw new AlreadyQuarantined()
    }
    const before = row.redaction_status
    db.prepare(`UPDATE task_artifacts SET redaction_status = 'quarantined' WHERE id = ?`).run(
      artifactId,
    )
    writeAdminActivity(db, 'artifact_quarantined', artifactId, row.workspace_id, {
      artifact_id: artifactId,
      actor_session_id: actor.session_id ?? null,
      actor_user_id: actor.user_id ?? null,
      reason: actor.reason ?? null,
      before_status: before,
      after_status: 'quarantined',
    })
    return { id: artifactId, redaction_status: 'quarantined' as RedactionStatus, before_status: before }
  })
  return tx()
}

/**
 * FR-062 / FR-063 / FR-124: un-quarantine an artifact.
 * Restores `redaction_status` to `'clean'` (the simplest safe restore — admins
 * can re-route via supersede if they need a different state). Atomic.
 */
export function unquarantineArtifact(
  db: Database.Database,
  artifactId: number,
  actor: AdminActorContext,
): QuarantineResult {
  const tx = db.transaction(() => {
    const row = fetchArtifactOrThrow(db, artifactId)
    if (row.redaction_status !== 'quarantined') {
      throw new NotQuarantined()
    }
    const before = row.redaction_status
    db.prepare(`UPDATE task_artifacts SET redaction_status = 'clean' WHERE id = ?`).run(artifactId)
    writeAdminActivity(db, 'artifact_unquarantined', artifactId, row.workspace_id, {
      artifact_id: artifactId,
      actor_session_id: actor.session_id ?? null,
      actor_user_id: actor.user_id ?? null,
      reason: actor.reason ?? null,
      before_status: before,
      after_status: 'clean',
    })
    return { id: artifactId, redaction_status: 'clean' as RedactionStatus, before_status: before }
  })
  return tx()
}

/**
 * FR-062 / FR-063: delete an artifact. The on-disk file (if any) is unlinked
 * BEFORE the transaction opens (FR-127 ordering — never leave a phantom DB
 * row referencing a vanished file). DB row is deleted (CASCADE-safe — no
 * downstream FK references task_artifacts.id outside of supersedes_artifact_id
 * which is nullable). Activity row recorded with the prior status.
 */
export function deleteArtifact(
  db: Database.Database,
  artifactId: number,
  actor: AdminActorContext,
): { id: number; deleted: true; before_status: RedactionStatus } {
  const row = fetchArtifactOrThrow(db, artifactId)
  // FS step BEFORE tx (FR-127 ordering).
  if (row.storage_kind === 'file' && typeof row.storage_uri === 'string' && row.storage_uri.length > 0) {
    try {
      unlinkSync(row.storage_uri)
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      if (code !== 'ENOENT') {
        throw new InternalStorageError(code, 'delete_unlink_failed')
      }
      // Already absent — proceed to DB row deletion.
    }
  }
  const before = row.redaction_status
  const tx = db.transaction(() => {
    // Re-confirm the row still exists; abort if a concurrent admin already
    // deleted it.
    const fresh = fetchArtifactRow(db, artifactId)
    if (fresh === null) throw new ArtifactNotFound()
    db.prepare('DELETE FROM task_artifacts WHERE id = ?').run(artifactId)
    writeAdminActivity(db, 'artifact_deleted', artifactId, row.workspace_id, {
      artifact_id: artifactId,
      actor_session_id: actor.session_id ?? null,
      actor_user_id: actor.user_id ?? null,
      reason: actor.reason ?? null,
      before_status: before,
      after_status: null,
    })
  })
  tx()
  return { id: artifactId, deleted: true, before_status: before }
}

/**
 * FR-062 / FR-063: archive an artifact. Marks `redaction_status='superseded'`
 * (closest semantic match to "archived" without adding a new enum value to
 * REDACTION_STATUSES; M058 has no `archived_at` column). The on-disk file is
 * retained — archive is a soft state, not a destructive op. An
 * `artifact_archived` activity row is written for audit.
 */
export function archiveArtifact(
  db: Database.Database,
  artifactId: number,
  actor: AdminActorContext,
): QuarantineResult {
  const tx = db.transaction(() => {
    const row = fetchArtifactOrThrow(db, artifactId)
    const before = row.redaction_status
    if (before !== 'superseded') {
      db.prepare(`UPDATE task_artifacts SET redaction_status = 'superseded' WHERE id = ?`).run(
        artifactId,
      )
    }
    writeAdminActivity(db, 'artifact_archived', artifactId, row.workspace_id, {
      artifact_id: artifactId,
      actor_session_id: actor.session_id ?? null,
      actor_user_id: actor.user_id ?? null,
      reason: actor.reason ?? null,
      before_status: before,
      after_status: 'superseded',
    })
    return { id: artifactId, redaction_status: 'superseded' as RedactionStatus, before_status: before }
  })
  return tx()
}

export interface HashVerifyResult {
  readonly id: number
  readonly expected_sha256: string | null
  readonly actual_sha256: string | null
  readonly mismatch: boolean
  readonly outcome: 'ok' | 'mismatch' | 'skipped_external_uri' | 'skipped_inline' | 'file_missing'
}

/**
 * FR-067 / FR-112: hash-verify a single artifact. Re-hashes the on-disk file
 * (file-backed only) and compares to `task_artifacts.sha256`. On mismatch:
 * sets `security_scan_status='hash_mismatch'`, writes an
 * `artifact_hash_verified` activity row with `mismatch:true`. NEVER auto-
 * quarantines and NEVER auto-deletes (FR-067 — quarantine remains an explicit
 * admin action).
 *
 * For `external_uri` rows the operation is a no-op writing
 * `outcome='skipped_external_uri'` per FR-112. For inline rows it writes
 * `outcome='skipped_inline'` since there is no FS to verify against.
 */
export function hashVerifyArtifact(
  db: Database.Database,
  artifactId: number,
  actor: AdminActorContext,
): HashVerifyResult {
  const row = fetchArtifactOrThrow(db, artifactId)

  // External URI: no FS work; record skipped activity.
  if (row.storage_kind === 'external_uri') {
    const tx = db.transaction(() => {
      writeAdminActivity(db, 'artifact_hash_verified', artifactId, row.workspace_id, {
        artifact_id: artifactId,
        actor_session_id: actor.session_id ?? null,
        actor_user_id: actor.user_id ?? null,
        reason: actor.reason ?? null,
        before_status: row.redaction_status,
        after_status: row.redaction_status,
        extra: { outcome: 'skipped_external_uri', expected_sha256: row.sha256 },
      })
    })
    tx()
    return {
      id: artifactId,
      expected_sha256: row.sha256,
      actual_sha256: null,
      mismatch: false,
      outcome: 'skipped_external_uri',
    }
  }

  // Inline rows: nothing to re-hash (the canonical bytes ARE the row data;
  // they cannot drift). Record an activity for audit completeness.
  if (row.storage_kind !== 'file') {
    const tx = db.transaction(() => {
      writeAdminActivity(db, 'artifact_hash_verified', artifactId, row.workspace_id, {
        artifact_id: artifactId,
        actor_session_id: actor.session_id ?? null,
        actor_user_id: actor.user_id ?? null,
        reason: actor.reason ?? null,
        before_status: row.redaction_status,
        after_status: row.redaction_status,
        extra: { outcome: 'skipped_inline', expected_sha256: row.sha256 },
      })
    })
    tx()
    return {
      id: artifactId,
      expected_sha256: row.sha256,
      actual_sha256: null,
      mismatch: false,
      outcome: 'skipped_inline',
    }
  }

  // File-backed: re-hash and compare.
  const storageUri = row.storage_uri
  if (typeof storageUri !== 'string' || storageUri.length === 0) {
    // No FS path on a file-kind row — treat as missing.
    const tx = db.transaction(() => {
      db.prepare(`UPDATE task_artifacts SET security_scan_status = 'file_missing' WHERE id = ?`).run(
        artifactId,
      )
      writeAdminActivity(db, 'artifact_hash_verified', artifactId, row.workspace_id, {
        artifact_id: artifactId,
        actor_session_id: actor.session_id ?? null,
        actor_user_id: actor.user_id ?? null,
        reason: actor.reason ?? null,
        before_status: row.redaction_status,
        after_status: row.redaction_status,
        extra: { outcome: 'file_missing', expected_sha256: row.sha256 },
      })
    })
    tx()
    return {
      id: artifactId,
      expected_sha256: row.sha256,
      actual_sha256: null,
      mismatch: false,
      outcome: 'file_missing',
    }
  }

  let bytes: Buffer
  try {
    bytes = readFileSync(storageUri)
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code === 'ENOENT') {
      const tx = db.transaction(() => {
        db.prepare(`UPDATE task_artifacts SET security_scan_status = 'file_missing' WHERE id = ?`).run(
          artifactId,
        )
        writeAdminActivity(db, 'artifact_hash_verified', artifactId, row.workspace_id, {
          artifact_id: artifactId,
          actor_session_id: actor.session_id ?? null,
          actor_user_id: actor.user_id ?? null,
          reason: actor.reason ?? null,
          before_status: row.redaction_status,
          after_status: row.redaction_status,
          extra: { outcome: 'file_missing', expected_sha256: row.sha256 },
        })
      })
      tx()
      return {
        id: artifactId,
        expected_sha256: row.sha256,
        actual_sha256: null,
        mismatch: false,
        outcome: 'file_missing',
      }
    }
    throw new InternalStorageError(code, 'hash_verify_read_failed')
  }
  const actual = createHash('sha256').update(bytes).digest('hex').toLowerCase()
  const mismatch = row.sha256 !== null && actual !== row.sha256
  const tx = db.transaction(() => {
    if (mismatch) {
      db.prepare(`UPDATE task_artifacts SET security_scan_status = 'hash_mismatch' WHERE id = ?`).run(
        artifactId,
      )
    }
    writeAdminActivity(db, 'artifact_hash_verified', artifactId, row.workspace_id, {
      artifact_id: artifactId,
      actor_session_id: actor.session_id ?? null,
      actor_user_id: actor.user_id ?? null,
      reason: actor.reason ?? null,
      before_status: row.redaction_status,
      after_status: row.redaction_status,
      extra: {
        outcome: mismatch ? 'mismatch' : 'ok',
        expected_sha256: row.sha256,
        actual_sha256: actual,
        mismatch,
      },
    })
  })
  tx()
  return {
    id: artifactId,
    expected_sha256: row.sha256,
    actual_sha256: actual,
    mismatch,
    outcome: mismatch ? 'mismatch' : 'ok',
  }
}

export interface BatchHashVerifyResult {
  readonly checked: number
  readonly mismatches: number
  readonly skipped: number
  readonly missing: number
  readonly results: readonly HashVerifyResult[]
}

/**
 * Batch hash-verify across a workspace. Each row is verified in its own
 * transaction (catch-log-continue) so a single failure cannot poison the
 * batch. Returns counts plus the per-row results array.
 */
export function batchHashVerify(
  db: Database.Database,
  workspaceId: number,
  actor: AdminActorContext,
): BatchHashVerifyResult {
  const ids = db
    .prepare('SELECT id FROM task_artifacts WHERE workspace_id = ? ORDER BY id ASC')
    .all(workspaceId) as { id: number }[]
  const results: HashVerifyResult[] = []
  let mismatches = 0
  let skipped = 0
  let missing = 0
  for (const row of ids) {
    try {
      const r = hashVerifyArtifact(db, row.id, actor)
      results.push(r)
      if (r.outcome === 'mismatch') mismatches++
      else if (r.outcome === 'skipped_external_uri' || r.outcome === 'skipped_inline') skipped++
      else if (r.outcome === 'file_missing') missing++
    } catch (err) {
      console.warn({
        event: 'batch_hash_verify_row_failed',
        artifact_id: row.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { checked: ids.length, mismatches, skipped, missing, results }
}

// ---------------------------------------------------------------------------
// FR-129 — Repair orphans (DB-no-file / FS-no-row / .tmp.* / workspace
// isolation). Per-row transactions so a single failure does not poison the
// sweep. Idempotent.
// ---------------------------------------------------------------------------

export interface OrphanRepairSummary {
  readonly run_id: string
  readonly db_no_file: number
  readonly fs_no_row: number
  readonly tmp_swept: number
  readonly workspace_violations: number
  readonly errors: number
}

/**
 * Walk all task_artifacts rows in the workspace and reconcile against the FS:
 *   - Class (a) DB row no file → flag as `redaction_status='rejected'`,
 *     `security_scan_status='file_missing'`. Activity `artifact_repaired_orphan`.
 *   - Class (b) FS file no row → move to `<DATA_DIR>/artifacts/_orphaned/<run_id>/`.
 *   - Class (c) `.tmp.*` siblings older than 1h threshold → unlink.
 *   - Class (d) Workspace-isolation violation (file under workspace_A's
 *     tree but row references workspace_B) → also moves to `_orphaned/` AND
 *     writes `artifact_workspace_isolation_violation` activity.
 *
 * Idempotent: re-runs without state mutation when nothing is wrong.
 */
export function repairOrphans(db: Database.Database, workspaceId: number): OrphanRepairSummary {
  // Lazy require keeps strict-scope module import surface narrow.
  const fs = runtimeRequire('fs') as typeof import('fs')
  const path = runtimeRequire('path') as typeof import('path')

  const runId = `${String(Math.floor(Date.now() / 1000))}-${randomBytes(4).toString('hex')}`
  const dataDir = resolveDataDir()
  const wsRoot = path.join(dataDir, 'artifacts', String(workspaceId))
  const orphanedRoot = path.join(dataDir, 'artifacts', '_orphaned', runId)

  let dbNoFile = 0
  let fsNoRow = 0
  let tmpSwept = 0
  let wsViolations = 0
  let errors = 0

  const TMP_AGE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

  // --- Class (a): DB rows whose file is missing ---------------------------
  const fileRows = db
    .prepare(
      `SELECT id, storage_uri, redaction_status, workspace_id FROM task_artifacts WHERE workspace_id = ? AND storage_kind = 'file'`,
    )
    .all(workspaceId) as {
    id: number
    storage_uri: string | null
    redaction_status: RedactionStatus
    workspace_id: number
  }[]
  for (const r of fileRows) {
    try {
      const uri = r.storage_uri
      if (typeof uri !== 'string' || uri.length === 0 || !fs.existsSync(uri)) {
        dbNoFile++
        const tx = db.transaction(() => {
          db.prepare(
            `UPDATE task_artifacts SET redaction_status = 'rejected', security_scan_status = 'file_missing' WHERE id = ?`,
          ).run(r.id)
          writeAdminActivity(db, 'artifact_repaired_orphan', r.id, r.workspace_id, {
            artifact_id: r.id,
            actor_session_id: null,
            actor_user_id: null,
            reason: 'db_no_file',
            before_status: r.redaction_status,
            after_status: 'rejected',
            extra: { run_id: runId, class: 'db_no_file', storage_uri: uri ?? null },
          })
        })
        tx()
      }
    } catch (err) {
      errors++
      console.warn({
        event: 'orphan_repair_db_no_file_failed',
        artifact_id: r.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // --- Class (b/c/d): walk the workspace tree -----------------------------
  if (fs.existsSync(wsRoot)) {
    const stack: string[] = [wsRoot]
    while (stack.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above guarantees non-undefined
      const dir = stack.pop()!
      let entries: import('fs').Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        errors++
        console.warn({
          event: 'orphan_repair_readdir_failed',
          dir,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
          continue
        }
        // Class (c): .tmp.* siblings.
        if (entry.name.startsWith('.tmp.')) {
          try {
            const st = fs.statSync(full)
            const ageMs = Date.now() - st.mtimeMs
            if (ageMs >= TMP_AGE_THRESHOLD_MS) {
              fs.unlinkSync(full)
              tmpSwept++
            }
          } catch (err) {
            errors++
            console.warn({
              event: 'orphan_repair_tmp_unlink_failed',
              file: full,
              error: err instanceof Error ? err.message : String(err),
            })
          }
          continue
        }
        // Class (b/d): file with no row OR row in wrong workspace.
        try {
          const matchRow = db
            .prepare(`SELECT id, workspace_id FROM task_artifacts WHERE storage_uri = ?`)
            .get(full) as { id: number; workspace_id: number } | undefined
          const inWsTreeButRowMismatch =
            matchRow !== undefined && matchRow.workspace_id !== workspaceId
          const noRow = matchRow === undefined
          if (noRow || inWsTreeButRowMismatch) {
            // Move to _orphaned/.
            const relativeFromDataDir = path.relative(path.join(dataDir, 'artifacts'), full)
            let dest = path.join(orphanedRoot, relativeFromDataDir)
            try {
              fs.mkdirSync(path.dirname(dest), { recursive: true })
            } catch {
              /* best-effort */
            }
            // Collision suffix.
            if (fs.existsSync(dest)) {
              dest = `${dest}.${String(Date.now() * 1000)}.collision`
            }
            try {
              fs.renameSync(full, dest)
            } catch (err) {
              const code = (err as { code?: string } | null)?.code
              if (code === 'EXDEV') {
                // Cross-device: fallback to copy-then-unlink.
                fs.copyFileSync(full, dest)
                fs.unlinkSync(full)
              } else {
                throw err
              }
            }
            if (noRow) {
              fsNoRow++
            } else if (matchRow.workspace_id !== workspaceId) {
              wsViolations++
              const violationRowId = matchRow.id
              const tx = db.transaction(() => {
                writeAdminActivity(db, 'artifact_repaired_orphan', violationRowId, workspaceId, {
                  artifact_id: violationRowId,
                  actor_session_id: null,
                  actor_user_id: null,
                  reason: 'workspace_isolation_violation',
                  before_status: null,
                  after_status: null,
                  extra: {
                    run_id: runId,
                    class: 'workspace_isolation_violation',
                    moved_to: dest,
                    expected_workspace_id: matchRow.workspace_id,
                    matched_row_id: violationRowId,
                    found_in_workspace_tree: workspaceId,
                  },
                })
              })
              tx()
            }
          }
        } catch (err) {
          errors++
          console.warn({
            event: 'orphan_repair_file_handler_failed',
            file: full,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  return {
    run_id: runId,
    db_no_file: dbNoFile,
    fs_no_row: fsNoRow,
    tmp_swept: tmpSwept,
    workspace_violations: wsViolations,
    errors,
  }
}

// ---------------------------------------------------------------------------
// FR-130 — Retention sweep. Per-row transaction isolation; one summary
// activity row at completion. Advisory lock prevents concurrent sweeps.
// NEVER auto-cron — admin-triggered only.
// ---------------------------------------------------------------------------

const sweepLocks = new Map<number, boolean>()

export interface RetentionPolicy {
  readonly keep_days?: number
  readonly archive_after_days?: number
  readonly delete_after_days?: number
}

export interface RetentionSweepSummary {
  readonly workspace_id: number
  readonly started_at: number
  readonly finished_at: number
  readonly archived_count: number
  readonly deleted_count: number
  readonly skipped_count: number
  readonly failed_count: number
  readonly policy: RetentionPolicy
  readonly sample_failure_reason?: string
}

interface ResolvedRetentionPolicy {
  archive_after_seconds: number | null
  delete_after_seconds: number | null
}

function resolveRetentionPolicy(
  db: Database.Database,
  workspaceId: number,
): { policy: RetentionPolicy; resolved: ResolvedRetentionPolicy } {
  // Pull `feature_flags.artifact_retention` (FR-130 source of truth).
  const row = db
    .prepare('SELECT feature_flags FROM workspaces WHERE id = ?')
    .get(workspaceId) as { feature_flags: string | null } | undefined
  if (row?.feature_flags == null) {
    return { policy: {}, resolved: { archive_after_seconds: null, delete_after_seconds: null } }
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(row.feature_flags) as Record<string, unknown>
  } catch {
    return { policy: {}, resolved: { archive_after_seconds: null, delete_after_seconds: null } }
  }
  const ar = parsed['artifact_retention']
  if (ar === null || typeof ar !== 'object') {
    return { policy: {}, resolved: { archive_after_seconds: null, delete_after_seconds: null } }
  }
  const arRecord = ar as Record<string, unknown>
  const policy: RetentionPolicy = {
    ...(typeof arRecord['keep_days'] === 'number' ? { keep_days: arRecord['keep_days'] } : {}),
    ...(typeof arRecord['archive_after_days'] === 'number'
      ? { archive_after_days: arRecord['archive_after_days'] }
      : {}),
    ...(typeof arRecord['delete_after_days'] === 'number'
      ? { delete_after_days: arRecord['delete_after_days'] }
      : {}),
  }
  return {
    policy,
    resolved: {
      archive_after_seconds:
        typeof policy.archive_after_days === 'number' ? policy.archive_after_days * 86400 : null,
      delete_after_seconds:
        typeof policy.delete_after_days === 'number' ? policy.delete_after_days * 86400 : null,
    },
  }
}

interface SweepCandidate {
  id: number
  redaction_status: RedactionStatus
  storage_kind: string
  storage_uri: string | null
  age_seconds: number
}

export function runRetentionSweep(
  db: Database.Database,
  workspaceId: number,
  actor: AdminActorContext,
): RetentionSweepSummary {
  if (sweepLocks.get(workspaceId) === true) {
    throw new SweepInProgress()
  }
  sweepLocks.set(workspaceId, true)
  try {
    const startedAt = Math.floor(Date.now() / 1000)
    const { policy, resolved } = resolveRetentionPolicy(db, workspaceId)
    let archived = 0
    let deleted = 0
    let skipped = 0
    let failed = 0
    let sampleFailureReason: string | undefined

    if (resolved.archive_after_seconds === null && resolved.delete_after_seconds === null) {
      const finishedAt = Math.floor(Date.now() / 1000)
      // Still record an end-of-sweep summary for audit completeness.
      const tx = db.transaction(() => {
        db.prepare(
          "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES ('artifact_retention_swept', 'workspace', ?, 'task-artifacts-admin', 'Retention sweep (no policy)', ?, ?)",
        ).run(
          workspaceId,
          JSON.stringify({
            workspace_id: workspaceId,
            started_at: startedAt,
            finished_at: finishedAt,
            archived_count: 0,
            deleted_count: 0,
            skipped_count: 0,
            failed_count: 0,
            policy,
          }),
          workspaceId,
        )
      })
      tx()
      return {
        workspace_id: workspaceId,
        started_at: startedAt,
        finished_at: finishedAt,
        archived_count: 0,
        deleted_count: 0,
        skipped_count: 0,
        failed_count: 0,
        policy,
      }
    }

    const candidates = db
      .prepare(
        `SELECT id, redaction_status, storage_kind, storage_uri,
                CAST((unixepoch() - unixepoch(created_at)) AS INTEGER) AS age_seconds
           FROM task_artifacts
          WHERE workspace_id = ?
          ORDER BY id ASC`,
      )
      .all(workspaceId) as SweepCandidate[]

    for (const c of candidates) {
      // Quarantined skipped + counted (FR-130 explicit).
      if (c.redaction_status === 'quarantined') {
        skipped++
        continue
      }
      const eligibleDelete =
        resolved.delete_after_seconds !== null && c.age_seconds >= resolved.delete_after_seconds
      const eligibleArchive =
        resolved.archive_after_seconds !== null && c.age_seconds >= resolved.archive_after_seconds
      try {
        // FR-130: delete wins precedence over archive when both apply.
        if (eligibleDelete) {
          deleteArtifact(db, c.id, { ...actor, reason: actor.reason ?? 'retention_delete' })
          deleted++
        } else if (eligibleArchive) {
          archiveArtifact(db, c.id, { ...actor, reason: actor.reason ?? 'retention_archive' })
          archived++
        } else {
          skipped++
        }
      } catch (err) {
        failed++
        sampleFailureReason ??= err instanceof Error ? err.message : String(err)
      }
    }

    const finishedAt = Math.floor(Date.now() / 1000)
    const tx = db.transaction(() => {
      db.prepare(
        "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES ('artifact_retention_swept', 'workspace', ?, 'task-artifacts-admin', 'Retention sweep complete', ?, ?)",
      ).run(
        workspaceId,
        JSON.stringify({
          workspace_id: workspaceId,
          started_at: startedAt,
          finished_at: finishedAt,
          archived_count: archived,
          deleted_count: deleted,
          skipped_count: skipped,
          failed_count: failed,
          policy,
          ...(sampleFailureReason !== undefined ? { sample_failure_reason: sampleFailureReason } : {}),
        }),
        workspaceId,
      )
    })
    tx()
    return {
      workspace_id: workspaceId,
      started_at: startedAt,
      finished_at: finishedAt,
      archived_count: archived,
      deleted_count: deleted,
      skipped_count: skipped,
      failed_count: failed,
      policy,
      ...(sampleFailureReason !== undefined ? { sample_failure_reason: sampleFailureReason } : {}),
    }
  } finally {
    sweepLocks.delete(workspaceId)
  }
}

/**
 * FR-035a.5: rebuild previews for a workspace WITHOUT re-running the detector
 * and WITHOUT promoting `'redacted'`/`'rejected'` rows back to `'clean'`.
 * v1: writes a single summary `artifact_previews_rebuilt` activity. Real
 * preview-text materialization is a US9-adjacent concern; this admin action
 * is the audit anchor for the operator workflow.
 */
export function rebuildPreviews(
  db: Database.Database,
  workspaceId: number,
  actor: AdminActorContext,
): { workspace_id: number; rebuilt_count: number; preserved_status_count: number } {
  const rows = db
    .prepare(
      `SELECT id, redaction_status FROM task_artifacts WHERE workspace_id = ? ORDER BY id ASC`,
    )
    .all(workspaceId) as { id: number; redaction_status: RedactionStatus }[]
  // Invariant: status column unchanged (FR-035a.5). We never touch it here.
  const preserved = rows.filter(
    (r) => r.redaction_status === 'redacted' || r.redaction_status === 'rejected',
  ).length
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES ('artifact_previews_rebuilt', 'workspace', ?, 'task-artifacts-admin', 'Previews rebuilt', ?, ?)",
    ).run(
      workspaceId,
      JSON.stringify({
        workspace_id: workspaceId,
        rebuilt_count: rows.length,
        preserved_status_count: preserved,
        actor_session_id: actor.session_id ?? null,
        actor_user_id: actor.user_id ?? null,
        reason: actor.reason ?? null,
      }),
      workspaceId,
    )
  })
  tx()
  return { workspace_id: workspaceId, rebuilt_count: rows.length, preserved_status_count: preserved }
}

// ---------------------------------------------------------------------------
// FR-064 / FR-138 — Health snapshot.
// ---------------------------------------------------------------------------

export interface HealthSnapshot {
  readonly workspace_id: number
  readonly counts: {
    total: number
    by_redaction_status: Record<string, number>
    by_security_scan_status: Record<string, number>
  }
  readonly total_bytes: number
  readonly failed_publishes_24h: number
  readonly failed_scans_24h: number
  readonly failed_reads_24h: number
  readonly failed_disposition_inserts_24h: number
  readonly orphan_count: number
  readonly free_space_bytes: number | null
  readonly p95: P95Snapshot | 'insufficient_data'
}

function countActivitiesLast24h(
  db: Database.Database,
  workspaceId: number,
  type: string,
): number {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM activities WHERE workspace_id = ? AND type = ? AND created_at >= unixepoch() - 86400`,
      )
      .get(workspaceId, type) as { c: number } | undefined
    return row?.c ?? 0
  } catch {
    return 0
  }
}

function countOrphans(db: Database.Database, workspaceId: number): number {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM task_artifacts
           WHERE workspace_id = ?
             AND storage_kind = 'file'
             AND security_scan_status = 'file_missing'`,
      )
      .get(workspaceId) as { c: number } | undefined
    return row?.c ?? 0
  } catch {
    return 0
  }
}

function freeSpaceBytes(): number | null {
  try {
    const fs = runtimeRequire('fs') as typeof import('fs')
    const dataDir = resolveDataDir()
    if (!fs.existsSync(dataDir)) return null
    type StatfsLike = (path: string) => { bavail: number | bigint; bsize: number | bigint }
    const fsAny = fs as unknown as { statfsSync?: StatfsLike }
    const fn = fsAny.statfsSync
    if (typeof fn !== 'function') return null
    const stats = fn(dataDir)
    const bavail = typeof stats.bavail === 'bigint' ? Number(stats.bavail) : stats.bavail
    const bsize = typeof stats.bsize === 'bigint' ? Number(stats.bsize) : stats.bsize
    return bavail * bsize
  } catch {
    return null
  }
}

export function getHealthSnapshot(db: Database.Database, workspaceId: number): HealthSnapshot {
  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(byte_size), 0) AS total_bytes
         FROM task_artifacts WHERE workspace_id = ?`,
    )
    .get(workspaceId) as { total: number; total_bytes: number } | undefined
  const total = totalsRow?.total ?? 0
  const totalBytes = totalsRow?.total_bytes ?? 0

  const redactionRows = db
    .prepare(
      `SELECT redaction_status AS k, COUNT(*) AS c FROM task_artifacts WHERE workspace_id = ? GROUP BY redaction_status`,
    )
    .all(workspaceId) as { k: string; c: number }[]
  const securityRows = db
    .prepare(
      `SELECT security_scan_status AS k, COUNT(*) AS c FROM task_artifacts WHERE workspace_id = ? GROUP BY security_scan_status`,
    )
    .all(workspaceId) as { k: string; c: number }[]

  const byRedaction: Record<string, number> = {}
  for (const r of redactionRows) byRedaction[r.k] = r.c
  const bySecurity: Record<string, number> = {}
  for (const r of securityRows) bySecurity[r.k] = r.c

  return {
    workspace_id: workspaceId,
    counts: {
      total,
      by_redaction_status: byRedaction,
      by_security_scan_status: bySecurity,
    },
    total_bytes: totalBytes,
    failed_publishes_24h: countActivitiesLast24h(db, workspaceId, 'artifact_publish_failed'),
    failed_scans_24h: countActivitiesLast24h(db, workspaceId, 'security_violation_scan_error'),
    failed_reads_24h: countActivitiesLast24h(db, workspaceId, 'artifact_read_failed'),
    failed_disposition_inserts_24h: countActivitiesLast24h(
      db,
      workspaceId,
      'disposition_insert_failed',
    ),
    orphan_count: countOrphans(db, workspaceId),
    free_space_bytes: freeSpaceBytes(),
    p95: getP95Latencies(workspaceId),
  }
}
