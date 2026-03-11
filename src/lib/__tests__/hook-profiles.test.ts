import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPrepare = vi.fn(() => ({ get: mockGet }))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({ prepare: mockPrepare }),
}))

import {
  getActiveProfile,
  shouldScanSecrets,
  shouldAuditMcpCalls,
  shouldBlockOnSecretDetection,
  getRateLimitMultiplier,
} from '@/lib/hook-profiles'

describe('getActiveProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns standard profile by default', () => {
    mockGet.mockReturnValue(undefined)
    const profile = getActiveProfile()
    expect(profile.level).toBe('standard')
    expect(profile.scanSecrets).toBe(true)
    expect(profile.auditMcpCalls).toBe(true)
    expect(profile.blockOnSecretDetection).toBe(false)
    expect(profile.rateLimitMultiplier).toBe(1.0)
  })

  it('returns minimal profile when set', () => {
    mockGet.mockReturnValue({ value: 'minimal' })
    const profile = getActiveProfile()
    expect(profile.level).toBe('minimal')
    expect(profile.scanSecrets).toBe(false)
    expect(profile.auditMcpCalls).toBe(false)
    expect(profile.blockOnSecretDetection).toBe(false)
    expect(profile.rateLimitMultiplier).toBe(2.0)
  })

  it('returns strict profile when set', () => {
    mockGet.mockReturnValue({ value: 'strict' })
    const profile = getActiveProfile()
    expect(profile.level).toBe('strict')
    expect(profile.scanSecrets).toBe(true)
    expect(profile.auditMcpCalls).toBe(true)
    expect(profile.blockOnSecretDetection).toBe(true)
    expect(profile.rateLimitMultiplier).toBe(0.5)
  })

  it('falls back to standard for unknown profile value', () => {
    mockGet.mockReturnValue({ value: 'nonexistent' })
    const profile = getActiveProfile()
    expect(profile.level).toBe('standard')
  })
})

describe('shouldScanSecrets', () => {
  it('returns true for standard profile', () => {
    mockGet.mockReturnValue({ value: 'standard' })
    expect(shouldScanSecrets()).toBe(true)
  })

  it('returns false for minimal profile', () => {
    mockGet.mockReturnValue({ value: 'minimal' })
    expect(shouldScanSecrets()).toBe(false)
  })

  it('returns true for strict profile', () => {
    mockGet.mockReturnValue({ value: 'strict' })
    expect(shouldScanSecrets()).toBe(true)
  })
})

describe('shouldAuditMcpCalls', () => {
  it('returns false for minimal profile', () => {
    mockGet.mockReturnValue({ value: 'minimal' })
    expect(shouldAuditMcpCalls()).toBe(false)
  })

  it('returns true for standard profile', () => {
    mockGet.mockReturnValue({ value: 'standard' })
    expect(shouldAuditMcpCalls()).toBe(true)
  })
})

describe('shouldBlockOnSecretDetection', () => {
  it('returns false for standard profile', () => {
    mockGet.mockReturnValue({ value: 'standard' })
    expect(shouldBlockOnSecretDetection()).toBe(false)
  })

  it('returns true for strict profile', () => {
    mockGet.mockReturnValue({ value: 'strict' })
    expect(shouldBlockOnSecretDetection()).toBe(true)
  })
})

describe('getRateLimitMultiplier', () => {
  it('returns 1.0 for standard', () => {
    mockGet.mockReturnValue({ value: 'standard' })
    expect(getRateLimitMultiplier()).toBe(1.0)
  })

  it('returns 2.0 for minimal', () => {
    mockGet.mockReturnValue({ value: 'minimal' })
    expect(getRateLimitMultiplier()).toBe(2.0)
  })

  it('returns 0.5 for strict', () => {
    mockGet.mockReturnValue({ value: 'strict' })
    expect(getRateLimitMultiplier()).toBe(0.5)
  })
})
