import { createHash } from 'crypto'
import type { ClaimControlAction } from './task-claim-control-types'
import type Database from 'better-sqlite3'

type JsonRecord = Record<string, unknown>

export type ClaimControlIdempotencyLookup =
  | { readonly state: 'miss' }
  | { readonly state: 'expired' }
  | { readonly state: 'body_mismatch' }
  | {
      readonly state: 'hit'
      readonly responseBody: unknown
      readonly responseStatus: number
      readonly responseHeaders: JsonRecord | null
      readonly activityId: number | null
      readonly expiresAt: string
    }

export interface LookupClaimControlIdempotencyInput {
  readonly actorUserId: number
  readonly workspaceId: number
  readonly taskId: number
  readonly stageKey: string
  readonly idempotencyKeyHash: string
  readonly requestBodyHash: string
  readonly now: string
}

export interface RecordClaimControlIdempotencyInput extends Omit<LookupClaimControlIdempotencyInput, 'now'> {
  readonly action: ClaimControlAction
  readonly responseBody: unknown
  readonly responseStatus: number
  readonly responseHeaders: JsonRecord | null
  readonly activityId: number | null
  readonly createdAt: string
  readonly expiresAt: string
}

export function hashClaimControlIdempotencyKey(value: string): string {
  return sha256(value)
}

export function hashClaimControlRequestBody(value: unknown): string {
  return sha256(stableStringify(value))
}

export function lookupClaimControlIdempotency(
  db: Database.Database,
  input: LookupClaimControlIdempotencyInput,
): ClaimControlIdempotencyLookup {
  const row = db.prepare(`
    SELECT request_body_hash, response_body_json, response_status, response_headers_json,
           claim_control_activity_id, expires_at
    FROM task_claim_control_idempotency_keys
    WHERE actor_user_id = ?
      AND workspace_id = ?
      AND task_id = ?
      AND stage_key = ?
      AND idempotency_key_hash = ?
    LIMIT 1
  `).get(
    input.actorUserId,
    input.workspaceId,
    input.taskId,
    input.stageKey,
    input.idempotencyKeyHash,
  ) as {
    request_body_hash: string
    response_body_json: string
    response_status: number
    response_headers_json: string | null
    claim_control_activity_id: number | null
    expires_at: string
  } | undefined

  if (!row) return { state: 'miss' }
  if (row.request_body_hash !== input.requestBodyHash) return { state: 'body_mismatch' }
  if (row.expires_at <= input.now) return { state: 'expired' }

  return {
    state: 'hit',
    responseBody: parseJson(row.response_body_json),
    responseStatus: row.response_status,
    responseHeaders: row.response_headers_json === null ? null : parseJson(row.response_headers_json) as JsonRecord,
    activityId: row.claim_control_activity_id,
    expiresAt: row.expires_at,
  }
}

export function recordClaimControlIdempotency(
  db: Database.Database,
  input: RecordClaimControlIdempotencyInput,
): void {
  if (input.responseStatus < 200 || input.responseStatus > 299) return
  db.prepare(`
    INSERT INTO task_claim_control_idempotency_keys (
      actor_user_id,
      workspace_id,
      task_id,
      stage_key,
      idempotency_key_hash,
      action,
      request_body_hash,
      response_body_json,
      response_status,
      response_headers_json,
      claim_control_activity_id,
      created_at,
      expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.actorUserId,
    input.workspaceId,
    input.taskId,
    input.stageKey,
    input.idempotencyKeyHash,
    input.action,
    input.requestBodyHash,
    JSON.stringify(input.responseBody),
    input.responseStatus,
    input.responseHeaders === null ? null : JSON.stringify(input.responseHeaders),
    input.activityId,
    input.createdAt,
    input.expiresAt,
  )
}

export function pruneExpiredClaimControlIdempotency(db: Database.Database, now: string): number {
  return db.prepare(`
    DELETE FROM task_claim_control_idempotency_keys
    WHERE expires_at <= ?
  `).run(now).changes
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown
}
