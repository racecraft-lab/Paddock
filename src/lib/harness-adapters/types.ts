export const HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION = 'harness_adapter_manifest.v1'
export const HARNESS_MANIFEST_VALIDATION_SCHEMA_VERSION = 'harness_manifest_validation.v1'
export const RUNTIME_INVENTORY_SCHEMA_VERSION = 'runtime_inventory.v1'
export const RUNTIME_INVENTORY_ERROR_SCHEMA_VERSION = 'runtime_inventory_error.v1'
export const CAPABILITY_RESOLUTION_SCHEMA_VERSION = 'capability_resolution.v1'
export const SANITIZED_FAKE_EVIDENCE_SCHEMA_VERSION = 'sanitized_fake_evidence.v1'

export const HARNESS_ADAPTER_MANIFEST_IDS = [
  'codex-app-server',
  'external_harness_fake',
  'paddock_owned_sandbox_fake',
] as const
export type HarnessAdapterManifestId = (typeof HARNESS_ADAPTER_MANIFEST_IDS)[number]

export const FAKE_HARNESS_ADAPTER_MANIFEST_IDS = [
  'external_harness_fake',
  'paddock_owned_sandbox_fake',
] as const satisfies readonly HarnessAdapterManifestId[]

export const HARNESS_ADAPTER_REASON_CODES = [
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
] as const
export type HarnessAdapterReasonCode = (typeof HARNESS_ADAPTER_REASON_CODES)[number]

export const HARNESS_ADAPTER_REASON_PRECEDENCE = [
  'feature_disabled',
  'manifest_invalid',
  'adapter_unassigned',
  'capability_unsupported',
  'approval_unsupported',
  'user_input_unsupported',
  'timeout_budget_expired',
  'governance_denied',
  'task_ineligible',
  'sandbox_lifecycle_missing',
  'authorization_denied',
  'sanitized_evidence_rejected',
] as const satisfies readonly HarnessAdapterReasonCode[]

export const HARNESS_ADAPTER_CAPABILITY_KEYS = [
  'launch',
  'resume',
  'stop',
  'transcript_read',
  'event_read',
  'token_runtime_accounting',
  'artifact_publication',
  'sandbox_posture',
  'mcp_exposure',
  'tool_exposure',
  'skills',
  'plugins',
  'memory',
  'provider_account_constraints',
  'approval_policy',
  'timeout_policy',
  'user_input_policy',
] as const
export type HarnessAdapterCapabilityKey = (typeof HARNESS_ADAPTER_CAPABILITY_KEYS)[number]

export const HARNESS_ADAPTER_STATES = [
  'visible',
  'unassigned',
  'assigned',
  'eligible',
  'blocked',
] as const
export type HarnessAdapterState = (typeof HARNESS_ADAPTER_STATES)[number]

export const SANITIZED_FAKE_EVIDENCE_KINDS = [
  'synthetic_summary',
  'counter',
  'event_ref',
  'lifecycle_ref',
  'manifest_ref',
  'capability_resolution_ref',
  'fake_artifact_descriptor',
] as const
export type SanitizedFakeEvidenceKind = (typeof SANITIZED_FAKE_EVIDENCE_KINDS)[number]

export interface CapabilitySupport {
  readonly state: 'supported' | 'unsupported'
  readonly modes?: readonly string[]
  readonly evidence_kinds?: readonly SanitizedFakeEvidenceKind[]
  readonly unsupported_reason_code?: HarnessAdapterReasonCode
}

export interface RuntimePolicyDeclaration {
  readonly state: CapabilitySupport['state']
  readonly modes: readonly string[]
  readonly evidence_kinds?: readonly SanitizedFakeEvidenceKind[]
  readonly unsupported_reason_code?: HarnessAdapterReasonCode
}

export interface TimeoutPolicyDeclaration extends RuntimePolicyDeclaration {
  readonly default_timeout_ms: number
  readonly maximum_timeout_ms: number
}

export interface HarnessAdapterManifest {
  readonly schema_version: typeof HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION
  readonly manifest_id: HarnessAdapterManifestId
  readonly display_name: string
  readonly sandbox: {
    readonly owner: 'paddock' | 'external_harness'
    readonly filesystem_authority: 'paddock_owned' | 'none'
    readonly posture: 'paddock_owned_sandbox' | 'external_harness'
    readonly support: CapabilitySupport
  }
  readonly capabilities: Record<HarnessAdapterCapabilityKey, CapabilitySupport>
  readonly exposure: {
    readonly mcp_exposure: CapabilitySupport
    readonly tool_exposure: CapabilitySupport
    readonly skills: CapabilitySupport
    readonly plugins: CapabilitySupport
    readonly memory: CapabilitySupport
  }
  readonly provider_account_constraints: {
    readonly synthetic_only: boolean
    readonly account_binding: 'none' | 'declared_external' | 'codex_app_server'
    readonly support: CapabilitySupport
  }
  readonly policies: {
    readonly approval_policy: RuntimePolicyDeclaration
    readonly timeout_policy: TimeoutPolicyDeclaration
    readonly user_input_policy: RuntimePolicyDeclaration
  }
  readonly evidence_descriptors: readonly SanitizedFakeEvidenceKind[]
}

export interface HarnessManifestValidationIssue {
  readonly field_path: string
  readonly code: string
  readonly reason_code: 'manifest_invalid'
  readonly evidence_kind?: SanitizedFakeEvidenceKind
  readonly rejected_property?: string
}

export interface HarnessManifestValidationResult {
  readonly ok: boolean
  readonly schema_version: typeof HARNESS_MANIFEST_VALIDATION_SCHEMA_VERSION
  readonly error?: 'manifest_invalid'
  readonly issues: readonly HarnessManifestValidationIssue[]
  readonly diagnostics: {
    readonly manifest_id: string | null
    readonly manifest_sha256: string | null
    readonly issue_count: number
    readonly truncated: boolean
  }
  readonly manifest_sha256?: string
}

export interface SanitizedFakeEvidence {
  readonly schema_version: typeof SANITIZED_FAKE_EVIDENCE_SCHEMA_VERSION
  readonly kind: SanitizedFakeEvidenceKind
  readonly label: string
  readonly ref: string
  readonly summary?: string
  readonly count?: number
  readonly digest?: string
  readonly mime_type?: string
  readonly byte_count?: number
}

export interface RuntimeInventoryGate {
  readonly gate:
    | 'feature_flag'
    | 'manifest_validation'
    | 'assignment'
    | 'capability'
    | 'approval_policy'
    | 'timeout_policy'
    | 'user_input_policy'
    | 'governance'
    | 'task'
    | 'sandbox_lifecycle'
    | 'authorization'
    | 'evidence_safety'
  readonly status: 'passed' | 'failed' | 'not_evaluated'
  readonly reason_code?: HarnessAdapterReasonCode
  readonly detail?: string
}

export interface RuntimeInventoryAssignment {
  readonly status: 'assigned' | 'unassigned' | 'not_evaluated'
  readonly project_id: string | null
  readonly role: string | null
  readonly agent_name: string | null
}

export interface SandboxLifecycleReference {
  readonly id: string
  readonly owner: 'paddock' | 'openclaw' | 'external_harness'
  readonly status: string
  readonly stage_key: string
  readonly updated_at: string
}

export interface CapabilityResolutionPacket {
  readonly schema_version: typeof CAPABILITY_RESOLUTION_SCHEMA_VERSION
  readonly manifest_id: HarnessAdapterManifestId
  readonly requested_capability: HarnessAdapterCapabilityKey
  readonly supported: boolean
  readonly policy: {
    readonly approval: 'supported' | 'unsupported' | 'not_evaluated'
    readonly timeout: 'supported' | 'expired' | 'unsupported' | 'not_evaluated'
    readonly user_input: 'supported' | 'unsupported' | 'not_evaluated'
  }
  readonly reason_codes: readonly HarnessAdapterReasonCode[]
}

export interface RuntimeInventoryEntry {
  readonly id: string
  readonly state: HarnessAdapterState
  readonly selected_manifest: {
    readonly manifest_id: HarnessAdapterManifestId
    readonly display_name: string
    readonly validation: Pick<HarnessManifestValidationResult, 'ok' | 'issues' | 'diagnostics'>
  }
  readonly assignment: RuntimeInventoryAssignment
  readonly capability_resolution: CapabilityResolutionPacket
  readonly eligibility_gates: readonly RuntimeInventoryGate[]
  readonly sandbox_lifecycle_refs: readonly SandboxLifecycleReference[]
  readonly sanitized_fake_evidence: readonly SanitizedFakeEvidence[]
  readonly rejection_metadata?: {
    readonly field_path: string
    readonly evidence_kind: SanitizedFakeEvidenceKind | null
    readonly reason_code: 'sanitized_evidence_rejected'
  }
  readonly reason_codes: readonly HarnessAdapterReasonCode[]
}

export interface RuntimeInventoryEnvelope {
  readonly schema_version: typeof RUNTIME_INVENTORY_SCHEMA_VERSION
  readonly generated_at: string
  readonly scope: {
    readonly kind: 'legacy' | 'productLine' | 'facility'
    readonly workspace_id: string | null
    readonly workspace_ids: readonly string[]
  }
  readonly feature_flag: {
    readonly name: 'FEATURE_AGENT_RUNNER_SANDBOXES'
    readonly enabled: boolean
    readonly source: 'workspace'
  }
  readonly entries: readonly RuntimeInventoryEntry[]
  readonly summary: Record<HarnessAdapterState | 'total', number>
  readonly diagnostics: {
    readonly truncated: boolean
    readonly warnings: readonly string[]
  }
}
