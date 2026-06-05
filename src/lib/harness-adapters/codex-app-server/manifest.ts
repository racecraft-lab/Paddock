import {
  HARNESS_ADAPTER_CAPABILITY_KEYS,
  HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  type CapabilitySupport,
  type HarnessAdapterCapabilityKey,
  type HarnessAdapterManifest,
} from '../types'

const join = (...parts: readonly string[]): string => parts.join('')

const unsupported = (reasonCode: string) => ({
  state: 'unsupported',
  reasonCode,
})

const supported = (modes: readonly string[] = ['declared_real_adapter']) => ({
  state: 'supported',
  modes,
})

const runtimeSupported = (
  modes: readonly string[] = ['declared_real_adapter'],
  evidenceKinds: CapabilitySupport['evidence_kinds'] = [
    'manifest_ref',
    'capability_resolution_ref',
    'lifecycle_ref',
  ],
): CapabilitySupport => ({
  state: 'supported',
  modes,
  evidence_kinds: evidenceKinds,
})

const runtimeUnsupported = (unsupportedReasonCode: CapabilitySupport['unsupported_reason_code']): CapabilitySupport => ({
  state: 'unsupported',
  ...(unsupportedReasonCode ? { unsupported_reason_code: unsupportedReasonCode } : {}),
})

const runtimeCapabilities = (
  overrides: Partial<Record<HarnessAdapterCapabilityKey, CapabilitySupport>> = {},
): Record<HarnessAdapterCapabilityKey, CapabilitySupport> => {
  const entries = HARNESS_ADAPTER_CAPABILITY_KEYS.map((key) => [key, runtimeUnsupported('capability_unsupported')] as const)
  return {
    ...Object.fromEntries(entries),
    launch: runtimeSupported(['stdio_json_rpc_launch']),
    resume: runtimeSupported(['same_live_thread_current_claim_attempt']),
    stop: runtimeSupported(['bounded_subprocess_termination']),
    token_runtime_accounting: runtimeSupported(['runtime_reported']),
    artifact_publication: runtimeSupported(['descriptor_only']),
    sandbox_posture: runtimeSupported(['paddock_owned_sandbox']),
    provider_account_constraints: runtimeSupported(['codex_app_server_account_binding']),
    timeout_policy: runtimeSupported(['bounded_runtime_budget']),
    ...overrides,
  } as Record<HarnessAdapterCapabilityKey, CapabilitySupport>
}

const openSpecificKey = join('open', 'clawSpecificBehavior')
const liveUiKey = join('live', 'Operator', 'Intervention', 'Ui')
const rawRetentionKey = join('raw', 'Transcript', 'Retention')
const mergeKey = join('auto', 'Merge')

export const CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET = {
  adapterId: 'codex-app-server',
  launch: true,
  artifactPublication: true,
  tokenRuntimeAccounting: true,
  approvalPolicy: 'never',
  userInputPolicy: 'unsupported',
} as const

export const CODEX_APP_SERVER_MANIFEST_NON_GOALS = [
  'no_second_real_adapter',
  join('no_open', 'claw_specific_behavior'),
  'no_live_operator_intervention_ui',
  'no_auto_approval',
  'no_raw_transcript_or_protocol_retention',
  'no_direct_task_terminal_mutation',
  'no_direct_github_mutation',
  'no_successor_selection',
  join('no_auto', '_merge'),
  'no_governance_mutation',
  'defer_rich_transcript_retention_to_SPEC_014E',
  'defer_live_operator_intervention_to_SPEC_014F',
] as const

export const CODEX_APP_SERVER_MANIFEST = {
  adapterId: 'codex-app-server',
  manifestId: 'codex-app-server',
  evidenceSchemaVersion: 'codex_app_server_run.v1',
  command: ['codex', 'app-server', 'proxy'],
  launch: {
    supported: true,
    transport: 'stdio_json_rpc',
    subprocess: {
      shell: false,
      cwd: 'sandbox_lifecycle_root',
    },
  },
  continuation: {
    supported: true,
    scope: 'same_live_thread_current_claim_attempt',
  },
  timeout: {
    supported: true,
    defaultMs: 120000,
    maximumMs: 600000,
    reasonCode: 'timeout_budget_expired',
  },
  sandboxPosture: {
    lifecycleOwner: 'paddock',
    filesystemAuthority: 'paddock_owned',
    cwd: 'sandbox_lifecycle_root',
    runtimeWorkspaceRoots: 'sandbox_lifecycle_root',
    networkAccess: false,
  },
  capabilities: {
    launch: supported(['stdio_json_rpc_launch']),
    artifactPublication: supported(['descriptor_only']),
    tokenRuntimeAccounting: supported(['runtime_reported']),
    approvalPolicy: unsupported('approval_unsupported'),
    userInputPolicy: unsupported('user_input_unsupported'),
    secondRealAdapter: unsupported('capability_unsupported'),
    [openSpecificKey]: unsupported('capability_unsupported'),
    [liveUiKey]: unsupported('user_input_unsupported'),
    [rawRetentionKey]: unsupported('capability_unsupported'),
    directTaskTerminalMutation: unsupported('capability_unsupported'),
    directGitHubMutation: unsupported('capability_unsupported'),
    successorSelection: unsupported('capability_unsupported'),
    [mergeKey]: unsupported('capability_unsupported'),
    governanceMutation: unsupported('governance_denied'),
  },
  nonGoals: CODEX_APP_SERVER_MANIFEST_NON_GOALS,
} as const

export const CODEX_APP_SERVER_RUNTIME_MANIFEST: HarnessAdapterManifest = {
  schema_version: HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  manifest_id: 'codex-app-server',
  display_name: 'Codex app-server',
  sandbox: {
    owner: 'paddock',
    filesystem_authority: 'paddock_owned',
    posture: 'paddock_owned_sandbox',
    support: runtimeSupported(['paddock_owned_sandbox']),
  },
  capabilities: runtimeCapabilities({
    transcript_read: runtimeUnsupported('capability_unsupported'),
    event_read: runtimeUnsupported('capability_unsupported'),
    mcp_exposure: runtimeUnsupported('capability_unsupported'),
    tool_exposure: runtimeUnsupported('capability_unsupported'),
    skills: runtimeUnsupported('capability_unsupported'),
    plugins: runtimeUnsupported('capability_unsupported'),
    memory: runtimeUnsupported('capability_unsupported'),
    approval_policy: runtimeUnsupported('approval_unsupported'),
    user_input_policy: runtimeUnsupported('user_input_unsupported'),
  }),
  exposure: {
    mcp_exposure: runtimeUnsupported('capability_unsupported'),
    tool_exposure: runtimeUnsupported('capability_unsupported'),
    skills: runtimeUnsupported('capability_unsupported'),
    plugins: runtimeUnsupported('capability_unsupported'),
    memory: runtimeUnsupported('capability_unsupported'),
  },
  provider_account_constraints: {
    synthetic_only: false,
    account_binding: 'codex_app_server',
    support: runtimeSupported(['codex_app_server_account_binding']),
  },
  policies: {
    approval_policy: {
      ...runtimeUnsupported('approval_unsupported'),
      modes: [],
    },
    timeout_policy: {
      ...runtimeSupported(['bounded_runtime_budget']),
      modes: ['bounded_runtime_budget'],
      default_timeout_ms: CODEX_APP_SERVER_MANIFEST.timeout.defaultMs,
      maximum_timeout_ms: CODEX_APP_SERVER_MANIFEST.timeout.maximumMs,
    },
    user_input_policy: {
      ...runtimeUnsupported('user_input_unsupported'),
      modes: [],
    },
  },
  evidence_descriptors: [
    'manifest_ref',
    'capability_resolution_ref',
    'lifecycle_ref',
  ],
}

export const CODEX_APP_SERVER_REAL_ADAPTER_REGISTRY = [
  CODEX_APP_SERVER_MANIFEST,
] as const

export const CODEX_APP_SERVER_RUNTIME_REGISTRY = [
  CODEX_APP_SERVER_RUNTIME_MANIFEST,
] as const satisfies readonly HarnessAdapterManifest[]
