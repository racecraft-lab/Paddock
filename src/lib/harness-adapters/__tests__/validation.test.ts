import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_HARNESS_FAKE_MANIFEST,
  FAKE_HARNESS_ADAPTER_REGISTRY,
  PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
} from '../fixtures'
import {
  HARNESS_ADAPTER_CAPABILITY_KEYS,
  FAKE_HARNESS_ADAPTER_MANIFEST_IDS,
  HARNESS_ADAPTER_MANIFEST_IDS,
  HARNESS_ADAPTER_REASON_CODES,
  SANITIZED_FAKE_EVIDENCE_KINDS,
} from '../types'
import {
  sortedValidFakeRegistry,
  validateHarnessAdapterManifest,
  validateHarnessAdapterRegistry,
} from '../validation'

describe('SPEC-014B harness adapter manifest validation', () => {
  it('exports the closed public vocabularies for manifests, capabilities, reasons, and evidence', () => {
    expect(HARNESS_ADAPTER_MANIFEST_IDS).toEqual([
      'codex-app-server',
      'external_harness_fake',
      'paddock_owned_sandbox_fake',
    ])
    expect(FAKE_HARNESS_ADAPTER_MANIFEST_IDS).toEqual(['external_harness_fake', 'paddock_owned_sandbox_fake'])
    expect(HARNESS_ADAPTER_CAPABILITY_KEYS).toContain('launch')
    expect(HARNESS_ADAPTER_CAPABILITY_KEYS).toContain('timeout_policy')
    expect(HARNESS_ADAPTER_REASON_CODES).toEqual([
      'feature_disabled',
      'manifest_invalid',
      'adapter_unassigned',
      'capability_unsupported',
      'governance_denied',
      'task_ineligible',
      'sandbox_lifecycle_missing',
      'approval_unsupported',
      'user_input_unsupported',
      'timeout_budget_expired',
      'authorization_denied',
      'sanitized_evidence_rejected',
    ])
    expect(SANITIZED_FAKE_EVIDENCE_KINDS).toContain('lifecycle_ref')
  })

  it('validates both required fake postures and keeps registry order deterministic', () => {
    expect(validateHarnessAdapterManifest(PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST)).toMatchObject({ ok: true })
    expect(validateHarnessAdapterManifest(EXTERNAL_HARNESS_FAKE_MANIFEST)).toMatchObject({ ok: true })
    expect(validateHarnessAdapterRegistry(FAKE_HARNESS_ADAPTER_REGISTRY)).toMatchObject({ ok: true })
    expect(sortedValidFakeRegistry().map((manifest) => manifest.manifest_id)).toEqual([
      'external_harness_fake',
      'paddock_owned_sandbox_fake',
    ])
  })

  it('fails closed for missing declarations, boolean/null support, unknown properties, and missing unsupported reasons', () => {
    const manifest = {
      ...PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
      metadata: { unsafe: 'extension maps are forbidden' },
      capabilities: {
        ...PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST.capabilities,
        launch: true,
        resume: null,
        stop: { state: 'unsupported' },
      },
    }
    delete (manifest.capabilities as Partial<typeof manifest.capabilities>).memory

    const result = validateHarnessAdapterManifest(manifest)
    expect(result.ok).toBe(false)
    const codes = result.issues.map((issue) => issue.code)
    expect(codes).toContain('unknown_property')
    expect(codes).toContain('support_object_required')
    expect(codes).toContain('required_property_missing')
  })

  it('fails closed for duplicate, missing, and unknown manifest ids', () => {
    expect(validateHarnessAdapterRegistry([
      PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
      PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
    ])).toMatchObject({ ok: false })

    expect(validateHarnessAdapterRegistry([
      PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
    ])).toMatchObject({ ok: false })

    expect(validateHarnessAdapterRegistry([
      PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
      { ...EXTERNAL_HARNESS_FAKE_MANIFEST, manifest_id: 'codex_real_harness' },
    ])).toMatchObject({ ok: false })
  })

  it('bounds validation diagnostics without exposing raw unsafe values', () => {
    const result = validateHarnessAdapterManifest({
      ...PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
      display_name: 'Bearer abcdefghijklmnopqrstuvwxyz1234567890',
      evidence_descriptors: ['synthetic_summary', 'raw_transcript'],
    })

    expect(result.ok).toBe(false)
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('unsafe_text')
    expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890')
    expect(serialized).not.toContain('/Users/')
    expect(result.diagnostics.issue_count).toBe(result.issues.length)
  })
})
