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

import { createHash } from 'crypto'
import { detectSecrets } from './secret-detector'

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
  while (cap > 0 && (buf[cap]! & 0b1100_0000) === 0b1000_0000) {
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
  const content = input.content ?? ''
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
// Stubs for publishArtifact / getArtifact / getInlineContent (FR-020).
// Wired in US6 (T315..T326) and US9 (T611..T619).
// ---------------------------------------------------------------------------

export interface InlineContentRow {
  readonly storage_kind: string
  readonly content_json: string | null
  readonly content_markdown: string | null
}

/**
 * Returns the stored inline payload for an artifact row, or null when the
 * row is file-backed / external_uri (FR-020). US6 wires the real lookup
 * order (`content_json` for `inline_json`, `content_markdown` for
 * `inline_markdown`).
 */
export function getInlineContent(row: InlineContentRow): string | null {
  if (row.storage_kind === 'inline_json') return row.content_json
  if (row.storage_kind === 'inline_markdown') return row.content_markdown
  return null
}

export interface PublishArtifactInput {
  readonly task_id: number
  readonly artifact_type: string
  readonly storage_kind: string
}

export function publishArtifact(input: PublishArtifactInput): never {
  // Foundation stub — US6 (T315..T326) wires the real implementation.
  void input
  throw new Error('not_implemented')
}

export function getArtifact(id: number): never {
  // Foundation stub — US9 (T614..T617) wires the real implementation.
  void id
  throw new Error('not_implemented')
}
