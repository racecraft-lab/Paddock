import { describe, expect, it } from 'vitest'
import { resolveSeedAuthPassword } from '../db'

describe('resolveSeedAuthPassword', () => {
  it('returns AUTH_PASS when AUTH_PASS_B64 is not set', () => {
    const password = resolveSeedAuthPassword({ AUTH_PASS: 'plain-secret-123' } as unknown as NodeJS.ProcessEnv)
    expect(password).toBe('plain-secret-123')
  })

  it('prefers AUTH_PASS_B64 when present and valid', () => {
    const encoded = Buffer.from('secret#with#hash', 'utf8').toString('base64')
    const password = resolveSeedAuthPassword({
      AUTH_PASS: 'fallback-value',
      AUTH_PASS_B64: encoded,
    } as unknown as NodeJS.ProcessEnv)
    expect(password).toBe('secret#with#hash')
  })

  it('falls back to AUTH_PASS when AUTH_PASS_B64 is invalid', () => {
    const password = resolveSeedAuthPassword({
      AUTH_PASS: 'fallback-value',
      AUTH_PASS_B64: '%%%not-base64%%%',
    } as unknown as NodeJS.ProcessEnv)
    expect(password).toBe('fallback-value')
  })

  it('returns null when no password env var is set', () => {
    const password = resolveSeedAuthPassword({} as unknown as NodeJS.ProcessEnv)
    expect(password).toBeNull()
  })
})
