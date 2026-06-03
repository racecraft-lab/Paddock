import {
  HARNESS_ADAPTER_CAPABILITY_KEYS,
  HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  type CapabilitySupport,
  type HarnessAdapterCapabilityKey,
  type HarnessAdapterManifest,
  type HarnessAdapterReasonCode,
} from './types'

const supported = (modes: readonly string[] = ['declared_fake']): CapabilitySupport => ({
  state: 'supported',
  modes,
  evidence_kinds: ['synthetic_summary', 'manifest_ref', 'capability_resolution_ref'],
})

const unsupported = (unsupportedReasonCode: HarnessAdapterReasonCode): CapabilitySupport => ({
  state: 'unsupported',
  unsupported_reason_code: unsupportedReasonCode,
})

const allCapabilities = (
  overrides: Partial<Record<HarnessAdapterCapabilityKey, CapabilitySupport>> = {},
): Record<HarnessAdapterCapabilityKey, CapabilitySupport> => {
  const entries = HARNESS_ADAPTER_CAPABILITY_KEYS.map((key) => [key, supported()] as const)
  return {
    ...Object.fromEntries(entries),
    ...overrides,
  } as Record<HarnessAdapterCapabilityKey, CapabilitySupport>
}

export const PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST: HarnessAdapterManifest = {
  schema_version: HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  manifest_id: 'paddock_owned_sandbox_fake',
  display_name: 'Paddock-owned sandbox fake',
  sandbox: {
    owner: 'paddock',
    filesystem_authority: 'paddock_owned',
    posture: 'paddock_owned_sandbox',
    support: supported(['paddock_owned_sandbox']),
  },
  capabilities: allCapabilities(),
  exposure: {
    mcp_exposure: supported(['bounded_manifest_only']),
    tool_exposure: supported(['declared_fake_tools_only']),
    skills: supported(['declared_fake_skills_only']),
    plugins: supported(['declared_fake_plugins_only']),
    memory: supported(['bounded_fake_memory_refs_only']),
  },
  provider_account_constraints: {
    synthetic_only: true,
    account_binding: 'none',
    support: supported(['no_provider_account']),
  },
  policies: {
    approval_policy: { ...supported(['not_required']), modes: ['not_required'] },
    timeout_policy: {
      ...supported(['bounded_runtime_budget']),
      modes: ['bounded_runtime_budget'],
      default_timeout_ms: 120000,
      maximum_timeout_ms: 600000,
    },
    user_input_policy: { ...supported(['not_required']), modes: ['not_required'] },
  },
  evidence_descriptors: [
    'synthetic_summary',
    'counter',
    'event_ref',
    'lifecycle_ref',
    'manifest_ref',
    'capability_resolution_ref',
    'fake_artifact_descriptor',
  ],
}

export const EXTERNAL_HARNESS_FAKE_MANIFEST: HarnessAdapterManifest = {
  schema_version: HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  manifest_id: 'external_harness_fake',
  display_name: 'External harness fake',
  sandbox: {
    owner: 'external_harness',
    filesystem_authority: 'none',
    posture: 'external_harness',
    support: supported(['external_harness_reference_only']),
  },
  capabilities: allCapabilities({
    launch: unsupported('capability_unsupported'),
    resume: unsupported('capability_unsupported'),
    stop: unsupported('capability_unsupported'),
    artifact_publication: unsupported('capability_unsupported'),
  }),
  exposure: {
    mcp_exposure: unsupported('capability_unsupported'),
    tool_exposure: unsupported('capability_unsupported'),
    skills: supported(['declared_external_skills']),
    plugins: supported(['declared_external_plugins']),
    memory: supported(['bounded_external_memory_refs']),
  },
  provider_account_constraints: {
    synthetic_only: true,
    account_binding: 'declared_external',
    support: supported(['declared_external_no_secret']),
  },
  policies: {
    approval_policy: { ...unsupported('approval_unsupported'), modes: [] },
    timeout_policy: {
      ...supported(['bounded_runtime_budget']),
      modes: ['bounded_runtime_budget'],
      default_timeout_ms: 60000,
      maximum_timeout_ms: 300000,
    },
    user_input_policy: { ...unsupported('user_input_unsupported'), modes: [] },
  },
  evidence_descriptors: [
    'synthetic_summary',
    'event_ref',
    'manifest_ref',
    'capability_resolution_ref',
  ],
}

export const FAKE_HARNESS_ADAPTER_REGISTRY = [
  EXTERNAL_HARNESS_FAKE_MANIFEST,
  PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST,
] as const satisfies readonly HarnessAdapterManifest[]

export const FAKE_HARNESS_ADAPTER_MANIFESTS = FAKE_HARNESS_ADAPTER_REGISTRY
