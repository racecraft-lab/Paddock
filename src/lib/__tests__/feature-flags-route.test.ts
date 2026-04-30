import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireRole = vi.fn()
const mutationLimiter = vi.fn(() => null)
const getDatabase = vi.fn()
const logAuditEvent = vi.fn()
const ensureTenantWorkspaceAccess = vi.fn()
const getFeatureFlagAdminStates = vi.fn()
const getFeatureFlagPreflight = vi.fn()
const getFeatureFlagMutationBlockers = vi.fn()
const updateWorkspaceFeatureFlag = vi.fn()

vi.mock('@/lib/auth', () => ({ requireRole }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter }))
vi.mock('@/lib/db', () => ({ getDatabase, logAuditEvent }))
vi.mock('@/lib/workspaces', () => ({
  ensureTenantWorkspaceAccess,
  ForbiddenError: class ForbiddenError extends Error {
    readonly status = 403
  },
}))
vi.mock('@/lib/feature-flag-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flag-service')>()
  return {
    ...actual,
    getFeatureFlagAdminStates,
    getFeatureFlagPreflight,
    getFeatureFlagMutationBlockers,
    updateWorkspaceFeatureFlag,
  }
})

const adminUser = {
  id: 1,
  username: 'admin',
  role: 'admin',
  workspace_id: 1,
  tenant_id: 1,
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/feature-flags/FEATURE_WORKSPACE_SWITCHER', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    body: JSON.stringify(body),
  })
}

function featureFlagRequest(key: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/feature-flags/${key}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/feature-flags/[key]', () => {
  beforeEach(() => {
    vi.resetModules()
    requireRole.mockReturnValue({ user: adminUser })
    mutationLimiter.mockReturnValue(null)
    getDatabase.mockReturnValue({ transaction: vi.fn((fn) => () => fn()) })
    ensureTenantWorkspaceAccess.mockReturnValue({ id: 1 })
    getFeatureFlagAdminStates.mockReturnValue({
      flags: [{
        definition: { key: 'FEATURE_WORKSPACE_SWITCHER' },
        env_locked: false,
        evaluated_value: false,
      }],
    })
    getFeatureFlagPreflight.mockReturnValue({ can_enable: true, blockers: [], checks: [] })
    getFeatureFlagMutationBlockers.mockReturnValue([])
    updateWorkspaceFeatureFlag.mockReturnValue({ oldValue: null, newValue: true, flagsJson: '{}' })
    logAuditEvent.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects global API-key admin actors for writes', async () => {
    requireRole.mockReturnValue({
      user: { ...adminUser, id: 0, username: 'api' },
    })
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(request({ workspace_id: 1, value: true }), {
      params: Promise.resolve({ key: 'FEATURE_WORKSPACE_SWITCHER' }),
    })

    expect(response.status).toBe(403)
    expect(updateWorkspaceFeatureFlag).not.toHaveBeenCalled()
  })

  it('blocks enablement when shared preflight fails', async () => {
    getFeatureFlagPreflight.mockReturnValue({
      can_enable: false,
      blockers: ['FEATURE_GLOBAL_AEGIS must be enabled first'],
      checks: [],
    })
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(request({ workspace_id: 1, value: true }), {
      params: Promise.resolve({ key: 'FEATURE_WORKSPACE_SWITCHER' }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.blockers).toContain('FEATURE_GLOBAL_AEGIS must be enabled first')
    expect(updateWorkspaceFeatureFlag).not.toHaveBeenCalled()
  })

  it('blocks FEATURE_GLOBAL_AEGIS enablement until FEATURE_WORKSPACE_SWITCHER preflight passes', async () => {
    getFeatureFlagAdminStates.mockReturnValue({
      flags: [{
        definition: { key: 'FEATURE_GLOBAL_AEGIS' },
        env_locked: false,
        evaluated_value: false,
      }],
    })
    getFeatureFlagPreflight.mockReturnValue({
      can_enable: false,
      blockers: ['FEATURE_WORKSPACE_SWITCHER must be enabled first'],
      checks: [{
        id: 'dependencies',
        label: 'Flag dependencies',
        status: 'fail',
        detail: 'Requires FEATURE_WORKSPACE_SWITCHER',
      }],
    })
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(featureFlagRequest('FEATURE_GLOBAL_AEGIS', { workspace_id: 1, value: true, reason: 'canary' }), {
      params: Promise.resolve({ key: 'FEATURE_GLOBAL_AEGIS' }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.blockers).toContain('FEATURE_WORKSPACE_SWITCHER must be enabled first')
    expect(updateWorkspaceFeatureFlag).not.toHaveBeenCalled()
  })

  it('rejects disable when scope blockers apply (facility row protection)', async () => {
    // Finding F2: the disable path previously skipped scopeBlockers, allowing
    // a Product Line-scoped flag to be written to the real facility workspace row.
    getFeatureFlagAdminStates.mockReturnValue({
      flags: [{
        definition: { key: 'FEATURE_GLOBAL_AEGIS' },
        env_locked: false,
        evaluated_value: true,
      }],
    })
    getFeatureFlagMutationBlockers.mockReturnValue([
      'This flag must target a concrete Product Line workspace, not the facility workspace row',
    ])
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(featureFlagRequest('FEATURE_GLOBAL_AEGIS', { workspace_id: 1, value: false, reason: 'rollback' }), {
      params: Promise.resolve({ key: 'FEATURE_GLOBAL_AEGIS' }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.blockers).toContain('This flag must target a concrete Product Line workspace, not the facility workspace row')
    expect(updateWorkspaceFeatureFlag).not.toHaveBeenCalled()
  })

  it('allows disable when no mutation blockers apply', async () => {
    getFeatureFlagAdminStates.mockReturnValue({
      flags: [{
        definition: { key: 'FEATURE_WORKSPACE_SWITCHER' },
        env_locked: false,
        evaluated_value: true,
      }],
    })
    getFeatureFlagMutationBlockers.mockReturnValue([])
    updateWorkspaceFeatureFlag.mockReturnValue({ oldValue: true, newValue: false, flagsJson: '{}' })
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(request({ workspace_id: 1, value: false }), {
      params: Promise.resolve({ key: 'FEATURE_WORKSPACE_SWITCHER' }),
    })

    expect(response.status).toBe(200)
    expect(updateWorkspaceFeatureFlag).toHaveBeenCalledWith(expect.anything(), 1, 'FEATURE_WORKSPACE_SWITCHER', false)
  })

  it('updates exactly one flag and writes an audit event', async () => {
    getFeatureFlagAdminStates
      .mockReturnValueOnce({
        flags: [{
          definition: { key: 'FEATURE_WORKSPACE_SWITCHER' },
          env_locked: false,
          evaluated_value: false,
        }],
      })
      .mockReturnValueOnce({
        flags: [{
          definition: { key: 'FEATURE_WORKSPACE_SWITCHER' },
          env_locked: false,
          evaluated_value: true,
        }],
      })
    const { PATCH } = await import('@/app/api/feature-flags/[key]/route')

    const response = await PATCH(request({ workspace_id: 1, value: true, reason: 'canary' }), {
      params: Promise.resolve({ key: 'FEATURE_WORKSPACE_SWITCHER' }),
    })

    expect(response.status).toBe(200)
    expect(updateWorkspaceFeatureFlag).toHaveBeenCalledWith(expect.anything(), 1, 'FEATURE_WORKSPACE_SWITCHER', true)
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'feature_flag_update',
      target_type: 'workspace',
      target_id: 1,
      detail: expect.objectContaining({
        flag_key: 'FEATURE_WORKSPACE_SWITCHER',
        actor_kind: 'human_admin_session',
        reason: 'canary',
      }),
    }))
  })
})
