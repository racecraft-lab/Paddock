import { describe, expect, it } from 'vitest'
import {
  assertSafeLifecyclePayload,
  serializeLifecycleEnvelope,
  validateLifecycleControlPatch,
} from '../github-sync-lifecycle-api'
import {
  DEFAULT_REPO,
  DEFAULT_WORKSPACE_ID,
  LIFECYCLE_NOW_ISO,
} from './fixtures/github-sync-lifecycle-fixtures'

describe('github sync lifecycle API validation', () => {
  it('accepts bounded enable requests and applies default limits', () => {
    const parsed = validateLifecycleControlPatch({
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      enabled: true,
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toMatchObject({
      workspace_id: DEFAULT_WORKSPACE_ID,
      github_repo: DEFAULT_REPO,
      enabled: true,
      interval_seconds: 300,
      max_pages: 10,
      max_issues: 1000,
      max_duration_seconds: 45,
    })
  })

  it('rejects out-of-bound lifecycle controls with stable error codes', () => {
    expect(validateLifecycleControlPatch({ workspace_id: 0, github_repo: DEFAULT_REPO })).toEqual({
      ok: false,
      status: 400,
      code: 'workspace_id_required',
      error: 'workspace_id is required',
    })
    expect(validateLifecycleControlPatch({ workspace_id: 1, github_repo: '', enabled: true })).toEqual({
      ok: false,
      status: 400,
      code: 'github_repo_required',
      error: 'github_repo is required',
    })
    expect(validateLifecycleControlPatch({
      workspace_id: 1,
      github_repo: DEFAULT_REPO,
      interval_seconds: 59,
    })).toMatchObject({ ok: false, code: 'interval_out_of_bounds' })
  })

  it('serializes a versioned envelope with safe lifecycle fields only', () => {
    const envelope = serializeLifecycleEnvelope({
      generated_at: LIFECYCLE_NOW_ISO,
      flag: { key: 'FEATURE_GITHUB_SYNC_AUTOMATION', enabled: false, reason: 'default_off' },
      scopes: [],
      scheduler_task_registered: true,
      schema_version: '077_github_sync_lifecycle',
    })

    expect(envelope).toEqual({
      version: 'github_sync_lifecycle.v1',
      generated_at: LIFECYCLE_NOW_ISO,
      flag: { key: 'FEATURE_GITHUB_SYNC_AUTOMATION', enabled: false, reason: 'default_off' },
      scopes: [],
      diagnostics: {
        scheduler_task_registered: true,
        schema_version: '077_github_sync_lifecycle',
        telemetry_service: 'none',
      },
    })
  })

  it('rejects unsafe diagnostic payload fields and secret-shaped values', () => {
    expect(() => { assertSafeLifecyclePayload({
      failure_category: 'github_http_5xx',
      authorization: 'Bearer ghp_1234567890abcdef1234567890abcdef1234',
    }); }).toThrow(/unsafe lifecycle field/)

    expect(() => { assertSafeLifecyclePayload({
      sanitized_message: 'GitHub said token ghp_1234567890abcdef1234567890abcdef1234 failed',
    }); }).toThrow(/secret-shaped lifecycle value/)
  })
})
