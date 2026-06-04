import { createHash } from 'node:crypto'
import { checkSafePlainText, isSanitizedFakeEvidenceKind } from './evidence'
import { FAKE_HARNESS_ADAPTER_REGISTRY } from './fixtures'
import {
  HARNESS_ADAPTER_CAPABILITY_KEYS,
  HARNESS_ADAPTER_MANIFEST_IDS,
  HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION,
  HARNESS_ADAPTER_REASON_CODES,
  HARNESS_MANIFEST_VALIDATION_SCHEMA_VERSION,
  type CapabilitySupport,
  type HarnessAdapterCapabilityKey,
  type HarnessAdapterManifest,
  type HarnessAdapterManifestId,
  type HarnessManifestValidationIssue,
  type HarnessManifestValidationResult,
} from './types'

const MAX_ISSUES = 8
const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'manifest_id',
  'display_name',
  'sandbox',
  'capabilities',
  'exposure',
  'provider_account_constraints',
  'policies',
  'evidence_descriptors',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function manifestDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function manifestIdFrom(value: unknown): string | null {
  return isPlainObject(value) && typeof value['manifest_id'] === 'string' ? value['manifest_id'] : null
}

function addIssue(
  issues: HarnessManifestValidationIssue[],
  issue: HarnessManifestValidationIssue,
): void {
  if (issues.length >= MAX_ISSUES) return
  issues.push(issue)
}

function issue(fieldPath: string, code: string, rejectedProperty?: string): HarnessManifestValidationIssue {
  return {
    field_path: fieldPath,
    code,
    reason_code: 'manifest_invalid',
    ...(rejectedProperty ? { rejected_property: rejectedProperty } : {}),
  }
}

function finishValidation(raw: unknown, issues: HarnessManifestValidationIssue[]): HarnessManifestValidationResult {
  const issueCount = issues.length
  const digest = isPlainObject(raw) ? manifestDigest(raw) : null
  return {
    ok: issueCount === 0,
    schema_version: HARNESS_MANIFEST_VALIDATION_SCHEMA_VERSION,
    ...(issueCount > 0 ? { error: 'manifest_invalid' as const } : {}),
    issues,
    diagnostics: {
      manifest_id: manifestIdFrom(raw),
      manifest_sha256: digest,
      issue_count: issues.length >= MAX_ISSUES ? issues.length + 1 : issueCount,
      truncated: issueCount >= MAX_ISSUES,
    },
    ...(digest ? { manifest_sha256: digest } : {}),
  }
}

function validateSupport(
  raw: unknown,
  fieldPath: string,
  issues: HarnessManifestValidationIssue[],
): raw is CapabilitySupport {
  if (!isPlainObject(raw)) {
    addIssue(issues, issue(fieldPath, 'support_object_required'))
    return false
  }
  const allowed = new Set([
    'state',
    'modes',
    'evidence_kinds',
    'unsupported_reason_code',
    'default_timeout_ms',
    'maximum_timeout_ms',
  ])
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) addIssue(issues, issue(`${fieldPath}.${key}`, 'unknown_property', key))
  }
  const state = raw['state']
  const unsupportedReasonCode = raw['unsupported_reason_code']
  const modes = raw['modes']
  const evidenceKinds = raw['evidence_kinds']
  if (state !== 'supported' && state !== 'unsupported') {
    addIssue(issues, issue(`${fieldPath}.state`, 'invalid_support_state'))
  }
  if (state === 'unsupported') {
    if (
      typeof unsupportedReasonCode !== 'string'
      || !(HARNESS_ADAPTER_REASON_CODES as readonly string[]).includes(unsupportedReasonCode)
    ) {
      addIssue(issues, issue(`${fieldPath}.unsupported_reason_code`, 'required_property_missing'))
    }
  }
  if (state === 'supported' && unsupportedReasonCode !== undefined) {
    addIssue(issues, issue(`${fieldPath}.unsupported_reason_code`, 'unsupported_reason_on_supported'))
  }
  if (modes !== undefined) validateBoundedStringArray(modes, `${fieldPath}.modes`, issues)
  if (evidenceKinds !== undefined) {
    if (!Array.isArray(evidenceKinds) || evidenceKinds.some((kind) => !isSanitizedFakeEvidenceKind(kind))) {
      addIssue(issues, issue(`${fieldPath}.evidence_kinds`, 'invalid_evidence_kinds'))
    }
  }
  return issues.length === 0 || state === 'supported' || state === 'unsupported'
}

function validateBoundedStringArray(
  raw: unknown,
  fieldPath: string,
  issues: HarnessManifestValidationIssue[],
): void {
  if (!Array.isArray(raw) || raw.length > 16) {
    addIssue(issues, issue(fieldPath, 'invalid_array'))
    return
  }
  raw.forEach((value, index) => {
    const check = checkSafePlainText(value)
    if (!check.ok) addIssue(issues, issue(`${fieldPath}[${index.toString()}]`, check.code ?? 'unsafe_text'))
  })
}

function validateRequiredSupportMap(
  raw: unknown,
  fieldPath: string,
  keys: readonly HarnessAdapterCapabilityKey[],
  issues: HarnessManifestValidationIssue[],
): void {
  if (!isPlainObject(raw)) {
    addIssue(issues, issue(fieldPath, 'map_not_object'))
    return
  }
  const keySet = new Set(keys)
  for (const key of Object.keys(raw)) {
    if (!keySet.has(key as HarnessAdapterCapabilityKey)) {
      addIssue(issues, issue(`${fieldPath}.${key}`, 'unknown_property', key))
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      addIssue(issues, issue(`${fieldPath}.${key}`, 'required_property_missing'))
      continue
    }
    validateSupport(raw[key], `${fieldPath}.${key}`, issues)
  }
}

function validateTextBearingValues(raw: unknown, fieldPath: string, issues: HarnessManifestValidationIssue[]): void {
  if (typeof raw === 'string') {
    const check = checkSafePlainText(raw)
    if (!check.ok) addIssue(issues, issue(fieldPath, 'unsafe_text'))
    return
  }
  if (Array.isArray(raw)) {
    raw.forEach((value, index) => {
      validateTextBearingValues(value, `${fieldPath}[${index.toString()}]`, issues)
    })
    return
  }
  if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      validateTextBearingValues(value, `${fieldPath}.${key}`, issues)
    }
  }
}

export function validateHarnessAdapterManifest(raw: unknown): HarnessManifestValidationResult {
  const issues: HarnessManifestValidationIssue[] = []
  if (!isPlainObject(raw)) return finishValidation(raw, [issue('manifest', 'manifest_not_object')])

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) addIssue(issues, issue(key, 'unknown_property', key))
  }

  if (raw['schema_version'] !== HARNESS_ADAPTER_MANIFEST_SCHEMA_VERSION) {
    addIssue(issues, issue('schema_version', 'invalid_schema_version'))
  }
  if (
    typeof raw['manifest_id'] !== 'string'
    || !(HARNESS_ADAPTER_MANIFEST_IDS as readonly string[]).includes(raw['manifest_id'])
  ) {
    addIssue(issues, issue('manifest_id', 'unknown_manifest_id'))
  }
  const displayNameCheck = checkSafePlainText(raw['display_name'])
  if (!displayNameCheck.ok) addIssue(issues, issue('display_name', 'unsafe_text'))

  const sandbox = raw['sandbox']
  if (!isPlainObject(sandbox)) {
    addIssue(issues, issue('sandbox', 'sandbox_not_object'))
  } else {
    validateSupport(sandbox['support'], 'sandbox.support', issues)
    if (sandbox['owner'] !== 'paddock' && sandbox['owner'] !== 'external_harness') {
      addIssue(issues, issue('sandbox.owner', 'invalid_owner'))
    }
    if (sandbox['filesystem_authority'] !== 'paddock_owned' && sandbox['filesystem_authority'] !== 'none') {
      addIssue(issues, issue('sandbox.filesystem_authority', 'invalid_filesystem_authority'))
    }
  }

  validateRequiredSupportMap(raw['capabilities'], 'capabilities', HARNESS_ADAPTER_CAPABILITY_KEYS, issues)

  const exposure = raw['exposure']
  if (!isPlainObject(exposure)) {
    addIssue(issues, issue('exposure', 'exposure_not_object'))
  } else {
    for (const key of ['mcp_exposure', 'tool_exposure', 'skills', 'plugins', 'memory'] as const) {
      validateSupport(exposure[key], `exposure.${key}`, issues)
    }
  }

  const providerAccountConstraints = raw['provider_account_constraints']
  if (!isPlainObject(providerAccountConstraints)) {
    addIssue(issues, issue('provider_account_constraints', 'provider_constraints_not_object'))
  } else {
    if (providerAccountConstraints['synthetic_only'] !== true) {
      addIssue(issues, issue('provider_account_constraints.synthetic_only', 'not_synthetic_only'))
    }
    validateSupport(providerAccountConstraints['support'], 'provider_account_constraints.support', issues)
  }

  const policies = raw['policies']
  if (!isPlainObject(policies)) {
    addIssue(issues, issue('policies', 'policies_not_object'))
  } else {
    for (const key of ['approval_policy', 'timeout_policy', 'user_input_policy'] as const) {
      const policy = policies[key]
      if (!isPlainObject(policy)) {
        addIssue(issues, issue(`policies.${key}`, 'policy_not_object'))
        continue
      }
      validateSupport(policy, `policies.${key}`, issues)
      validateBoundedStringArray(policy['modes'], `policies.${key}.modes`, issues)
    }
  }

  const evidenceDescriptors = raw['evidence_descriptors']
  if (!Array.isArray(evidenceDescriptors)) {
    addIssue(issues, issue('evidence_descriptors', 'invalid_evidence_descriptors'))
  } else {
    evidenceDescriptors.forEach((kind, index) => {
      if (!isSanitizedFakeEvidenceKind(kind)) {
        addIssue(issues, issue(`evidence_descriptors.${index.toString()}`, 'unsupported_evidence_kind'))
      }
    })
  }

  validateTextBearingValues(raw, 'manifest', issues)
  return finishValidation(raw, issues)
}

export function validateHarnessAdapterRegistry(
  rawRegistry: readonly unknown[] = FAKE_HARNESS_ADAPTER_REGISTRY,
): HarnessManifestValidationResult {
  const issues: HarnessManifestValidationIssue[] = []
  const seen = new Set<string>()
  const manifestIds = rawRegistry.map(manifestIdFrom).filter((value): value is string => value !== null)

  for (const manifest of rawRegistry) {
    const validation = validateHarnessAdapterManifest(manifest)
    for (const validationIssue of validation.issues) addIssue(issues, validationIssue)
    const id = manifestIdFrom(manifest)
    if (!id) continue
    if (seen.has(id)) addIssue(issues, issue(`registry.${id}`, 'duplicate_manifest_id'))
    seen.add(id)
    if (!(HARNESS_ADAPTER_MANIFEST_IDS as readonly string[]).includes(id)) {
      addIssue(issues, issue(`registry.${id}`, 'unknown_manifest_id'))
    }
  }

  for (const id of HARNESS_ADAPTER_MANIFEST_IDS) {
    if (!manifestIds.includes(id)) addIssue(issues, issue(`registry.${id}`, 'required_manifest_missing'))
  }

  return finishValidation({ manifest_id: null, registry_size: rawRegistry.length }, issues)
}

export function sortedValidFakeRegistry(
  rawRegistry: readonly HarnessAdapterManifest[] = FAKE_HARNESS_ADAPTER_REGISTRY,
): readonly HarnessAdapterManifest[] {
  return [...rawRegistry].sort((left, right) => left.manifest_id.localeCompare(right.manifest_id))
}

export function validateFakeManifestRegistry(
  rawRegistry: readonly unknown[] = FAKE_HARNESS_ADAPTER_REGISTRY,
):
  | { readonly ok: true; readonly manifests: readonly HarnessAdapterManifest[] }
  | (HarnessManifestValidationResult & { readonly ok: false }) {
  const validation = validateHarnessAdapterRegistry(rawRegistry)
  if (!validation.ok) return validation as HarnessManifestValidationResult & { readonly ok: false }
  return {
    ok: true,
    manifests: sortedValidFakeRegistry(rawRegistry as readonly HarnessAdapterManifest[]),
  }
}

export function isHarnessAdapterManifestId(value: unknown): value is HarnessAdapterManifestId {
  return typeof value === 'string' && (HARNESS_ADAPTER_MANIFEST_IDS as readonly string[]).includes(value)
}

export function isHarnessAdapterCapability(value: unknown): value is HarnessAdapterCapabilityKey {
  return typeof value === 'string' && (HARNESS_ADAPTER_CAPABILITY_KEYS as readonly string[]).includes(value)
}
