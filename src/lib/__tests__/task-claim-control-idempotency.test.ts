import { afterEach, describe, expect, it } from 'vitest'
import {
  hashClaimControlIdempotencyKey,
  hashClaimControlRequestBody,
  lookupClaimControlIdempotency,
  pruneExpiredClaimControlIdempotency,
  recordClaimControlIdempotency,
} from '../task-claim-control-idempotency'
import { openTaskClaimDb } from './task-claim-reconciliation-fixtures'

const openDbs: ReturnType<typeof openTaskClaimDb>[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function db() {
  const claimDb = openTaskClaimDb()
  openDbs.push(claimDb)
  return claimDb
}

describe('task claim-control idempotency helpers', () => {
  it('hashes opaque idempotency keys without preserving raw key material', () => {
    const hash = hashClaimControlIdempotencyKey('raw-click-token-123')

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(hash).not.toContain('raw-click-token-123')
    expect(hashClaimControlIdempotencyKey('raw-click-token-123')).toBe(hash)
  })

  it('hashes canonical request bodies independent of key order', () => {
    const first = hashClaimControlRequestBody({
      stage_key: 'dev',
      action: 'retry',
      expected: { attempt_id: '7', attempt_status: 'failed' },
    })
    const second = hashClaimControlRequestBody({
      expected: { attempt_status: 'failed', attempt_id: '7' },
      action: 'retry',
      stage_key: 'dev',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('records and replays successful responses for the same actor/task/stage/body', () => {
    const claimDb = db()
    const now = '2026-05-28T00:00:00.000Z'
    const expiresAt = '2026-05-29T00:00:00.000Z'
    const requestBodyHash = hashClaimControlRequestBody({ action: 'retry', stage_key: 'dev' })
    const keyHash = hashClaimControlIdempotencyKey('retry-key')

    recordClaimControlIdempotency(claimDb, {
      actorUserId: 1,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      idempotencyKeyHash: keyHash,
      action: 'retry',
      requestBodyHash,
      responseBody: { schema_version: 'task_claim_control.v1', outcome: 'retry_ready' },
      responseStatus: 200,
      responseHeaders: { 'x-test': 'kept' },
      activityId: 55,
      createdAt: now,
      expiresAt,
    })

    const replay = lookupClaimControlIdempotency(claimDb, {
      actorUserId: 1,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      idempotencyKeyHash: keyHash,
      requestBodyHash,
      now,
    })

    expect(replay).toEqual({
      state: 'hit',
      responseBody: { schema_version: 'task_claim_control.v1', outcome: 'retry_ready' },
      responseStatus: 200,
      responseHeaders: { 'x-test': 'kept' },
      activityId: 55,
      expiresAt,
    })
  })

  it('distinguishes body mismatches from expired or missing records', () => {
    const claimDb = db()
    const keyHash = hashClaimControlIdempotencyKey('retry-key')
    recordClaimControlIdempotency(claimDb, {
      actorUserId: 1,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      idempotencyKeyHash: keyHash,
      action: 'retry',
      requestBodyHash: 'sha256:body-a',
      responseBody: { ok: true },
      responseStatus: 200,
      responseHeaders: null,
      activityId: null,
      createdAt: '2026-05-28T00:00:00.000Z',
      expiresAt: '2026-05-29T00:00:00.000Z',
    })

    expect(lookupClaimControlIdempotency(claimDb, {
      actorUserId: 1,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      idempotencyKeyHash: keyHash,
      requestBodyHash: 'sha256:body-b',
      now: '2026-05-28T01:00:00.000Z',
    })).toEqual({ state: 'body_mismatch' })

    expect(lookupClaimControlIdempotency(claimDb, {
      actorUserId: 1,
      workspaceId: 1,
      taskId: 100,
      stageKey: 'dev',
      idempotencyKeyHash: keyHash,
      requestBodyHash: 'sha256:body-a',
      now: '2026-05-30T00:00:00.000Z',
    })).toEqual({ state: 'expired' })

    expect(pruneExpiredClaimControlIdempotency(claimDb, '2026-05-30T00:00:00.000Z')).toBe(1)
  })
})
