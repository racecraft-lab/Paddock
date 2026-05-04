/**
 * SPEC-008 — T157 — defer:db_busy unit test.
 *
 * @see specs/008-resource-governance/tasks.md T157
 */

import { describe, expect, it } from 'vitest'
import {
  isDbBusyError,
  withDbBusyDefer,
} from '../resource-evaluator-db-busy'

describe('SPEC-008 T157 — defer:db_busy', () => {
  it('isDbBusyError matches SQLITE_BUSY codes and known messages', () => {
    expect(isDbBusyError(new Error('SQLITE_BUSY: database is locked'))).toBe(
      true,
    )
    const err = new Error('boom') as Error & { code?: string }
    err.code = 'SQLITE_BUSY_SNAPSHOT'
    expect(isDbBusyError(err)).toBe(true)
    expect(isDbBusyError(new Error('busy_timeout exceeded'))).toBe(true)
    expect(isDbBusyError('database is locked')).toBe(true)
  })

  it('isDbBusyError returns false for unrelated errors', () => {
    expect(isDbBusyError(null)).toBe(false)
    expect(isDbBusyError(new Error('NOT NULL constraint failed'))).toBe(false)
    expect(isDbBusyError('schema mismatch')).toBe(false)
  })

  it('withDbBusyDefer translates busy → defer:db_busy', () => {
    const out = withDbBusyDefer(() => {
      throw new Error('SQLITE_BUSY: locked')
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.result.decision).toBe('defer')
      expect(out.result.reason).toEqual({ kind: 'defer', code: 'defer:db_busy' })
      expect(out.result.retryable).toBe(true)
    }
  })

  it('withDbBusyDefer rethrows non-busy errors so fail-safe handles them', () => {
    expect(() =>
      withDbBusyDefer(() => {
        throw new Error('NOT NULL constraint failed')
      }),
    ).toThrow('NOT NULL constraint failed')
  })

  it('withDbBusyDefer returns the value on success', () => {
    const out = withDbBusyDefer(() => 42)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toBe(42)
  })
})
