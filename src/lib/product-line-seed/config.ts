import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { parseAllDocuments } from 'yaml'
import {
  getFeatureFlagCascadePrerequisites,
  isFeatureFlagKey,
} from '../feature-flags.ts'
import { loadWorkflowContractFromFile } from '../workflow-contracts/yaml-loader.ts'
import { validateProductLineSeedTopLevelShape } from './schema.ts'
import {
  BLOCKED_SIDE_EFFECTS,
  CONFIG_OWNED_SURFACES,
  FR020_PRESERVED_SURFACES,
  PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS,
  PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS,
  PRODUCT_LINE_B_SMOKE_OWNED_FLAGS,
  type ProductLineSeedConfig,
  type ProductLineSeedErrorCode,
  type ProductLineSeedValidationError,
} from './types.ts'

const RESERVED_DISABLED_OR_ABSENT_FLAGS = new Set([
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
  'FEATURE_PRODUCT_LINE_B_DISPATCH',
  'PILOT_PRODUCT_LINE_B_SMOKE',
])
const SLUG_SAFE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PRODUCT_LINE_B_SLUG = 'product-line-b'
const PRODUCT_LINE_B_AGENT_PREFIX = 'plb-platform'

export class ProductLineSeedConfigNotImplementedError extends Error {
  constructor(action: string) {
    super(`${action} will be implemented by the SPEC-010A validation tasks.`)
    this.name = 'ProductLineSeedConfigNotImplementedError'
  }
}

export class ProductLineSeedConfigValidationError extends Error {
  readonly errors: ProductLineSeedValidationError[]

  constructor(errors: ProductLineSeedValidationError[]) {
    super(`${errors[0]?.code ?? 'CONFIG_SCHEMA_INVALID'}: ${errors[0]?.message ?? 'Product-line seed config is invalid.'}`)
    this.name = 'ProductLineSeedConfigValidationError'
    this.errors = errors
  }
}

export function loadProductLineSeedConfigFromFile(path: string): ProductLineSeedConfig {
  return loadProductLineSeedConfigFromString(readFileSync(path, 'utf8'), path)
}

export function loadProductLineSeedConfigFromString(source: string, path = '<inline>'): ProductLineSeedConfig {
  const unsafeErrors = classifyUnsafeProductLineSeedYamlSyntax(source, path)
  if (unsafeErrors.length > 0) {
    throw new ProductLineSeedConfigValidationError(unsafeErrors)
  }

  const documents = parseAllDocuments(source, {
    version: '1.2',
    uniqueKeys: true,
    merge: false,
    keepSourceTokens: true,
  })
  if (documents.length !== 1) {
    throw new ProductLineSeedConfigValidationError([error('CONFIG_PARSE_FAILED', path, 'Product-line seed YAML must contain exactly one document.')])
  }
  const document = documents[0]
  if (!document) {
    throw new ProductLineSeedConfigValidationError([error('CONFIG_PARSE_FAILED', path, 'Product-line seed YAML is empty.')])
  }
  if (document.errors.length > 0) {
    throw new ProductLineSeedConfigValidationError([
      error('CONFIG_PARSE_FAILED', path, `Product-line seed YAML failed to parse: ${document.errors[0]?.message ?? 'unknown error'}`),
    ])
  }

  const parsed = document.toJS({ maxAliasCount: 0 }) as unknown
  const validationErrors = validateProductLineSeedConfig(parsed)
  if (validationErrors.length > 0) {
    throw new ProductLineSeedConfigValidationError(validationErrors)
  }
  return parsed as ProductLineSeedConfig
}

export function classifyUnsafeProductLineSeedYamlSyntax(
  source: string,
  path = '<inline>',
): ProductLineSeedValidationError[] {
  const errors: ProductLineSeedValidationError[] = []
  const add = (message: string): void => {
    if (errors.length === 0) errors.push(error('CONFIG_UNSAFE_YAML_SYNTAX', path, message))
  }

  const explicitDocumentMarkers = [...source.matchAll(/^---\s*$/gm)]
  const hasMidStreamDocumentMarker = explicitDocumentMarkers.some((match) => match.index !== 0)
  if (explicitDocumentMarkers.length > 1 || hasMidStreamDocumentMarker || /(?:^|\n)\.\.\.\s*(?:\n|$)[\s\S]*(?:^|\n)---\s*$/m.test(source)) {
    add('Product-line seed YAML must not use multi-document streams.')
  }
  if (/(^|\s)![A-Za-z!<]/.test(source)) {
    add('Product-line seed YAML must not use custom or executable tags.')
  }
  if (/(^|\s)&[A-Za-z0-9_-]+/.test(source)) {
    add('Product-line seed YAML must not use anchors.')
  }
  if (/(^|\s)\*[A-Za-z0-9_-]+/.test(source)) {
    add('Product-line seed YAML must not use aliases.')
  }
  if (/^\s*<<:/m.test(source)) {
    add('Product-line seed YAML must not use merge keys.')
  }
  if (/!!(?:js|python|ruby)\//i.test(source) || /function\s*\(|process\.env|constructor\s*:/i.test(source)) {
    add('Product-line seed YAML must not declare executable constructs.')
  }
  if (/^\s*(?:\$ref|remote_ref|remote_reference|include|import|url|href)\s*:\s*['"]?https?:\/\//im.test(source)) {
    add('Product-line seed YAML must not declare remote references.')
  }

  return errors
}

export function validateProductLineSeedConfig(config: unknown): ProductLineSeedValidationError[] {
  const errors = validateProductLineSeedTopLevelShape(config)
  if (!isRecord(config)) return errors

  validateObject(config['product_line'], '$.product_line', ['slug', 'display_name', 'agent_prefix', 'disabled_by_default'], errors, ['disabled_by_default'])
  validateStringField(config['product_line'], 'slug', '$.product_line.slug', errors, 'PRODUCT_LINE_IDENTITY_INVALID')
  validateStringField(config['product_line'], 'display_name', '$.product_line.display_name', errors)
  const agentPrefix = validateStringField(config['product_line'], 'agent_prefix', '$.product_line.agent_prefix', errors, 'AGENT_PREFIX_INVALID')
  if (agentPrefix && !SLUG_SAFE_PATTERN.test(agentPrefix)) {
    errors.push(error('AGENT_PREFIX_INVALID', '$.product_line.agent_prefix', 'agent_prefix must be slug-safe lowercase text.'))
  }
  const productLineSlug = isRecord(config['product_line']) && typeof config['product_line']['slug'] === 'string'
    ? config['product_line']['slug']
    : null
  validateProductLineBIdentity(config['product_line'], errors)

  validateObject(config['github'], '$.github', ['owner', 'repo', 'full_name'], errors)
  validateStringField(config['github'], 'owner', '$.github.owner', errors, 'GITHUB_OWNER_REPO_INVALID')
  validateStringField(config['github'], 'repo', '$.github.repo', errors, 'GITHUB_OWNER_REPO_INVALID')
  validateStringField(config['github'], 'full_name', '$.github.full_name', errors, 'GITHUB_OWNER_REPO_INVALID')
  if (isRecord(config['github'])) {
    const owner = config['github']['owner']
    const repo = config['github']['repo']
    if (typeof owner === 'string') {
      const expectedFullName = typeof repo === 'string' ? `${owner}/${repo}` : `${owner}/${String(repo)}`
      if (typeof config['github']['full_name'] === 'string' && config['github']['full_name'] !== expectedFullName) {
        errors.push(error('GITHUB_OWNER_REPO_INVALID', '$.github.full_name', `github.full_name must equal ${expectedFullName}.`))
      }
    }
  }

  validateObject(config['workflow_contract'], '$.workflow_contract', ['family', 'path', 'required_slugs'], errors)
  validateStringField(config['workflow_contract'], 'family', '$.workflow_contract.family', errors)
  validateStringField(config['workflow_contract'], 'path', '$.workflow_contract.path', errors)
  validateStringArrayField(config['workflow_contract'], 'required_slugs', '$.workflow_contract.required_slugs', errors)
  validateWorkflowContractDeclaration(config['workflow_contract'], isRecord(config['github']) ? config['github']['full_name'] : null, errors)

  validateDepartments(config['departments'], typeof config['github'] === 'object' && config['github'] !== null
    ? (config['github'] as Record<string, unknown>)['full_name']
    : null, errors)
  validateAgentAssignments(
    config['agent_assignments'],
    config['departments'],
    agentPrefix,
    productLineSlug,
    errors,
  )
  validateFeatureFlags(config['feature_flags'], productLineSlug, errors)
  const allowBlockingGovernance = isRecord(config['safety_policy'])
    ? config['safety_policy']['allow_first_intake_blocking_governance'] === true
    : false
  validateGovernanceDefaults(config['governance_defaults'], allowBlockingGovernance, errors)
  validateSafetyPolicy(config['safety_policy'], productLineSlug, errors)

  return errors
}

function validateProductLineBIdentity(value: unknown, errors: ProductLineSeedValidationError[]): void {
  if (!isRecord(value) || value['slug'] !== PRODUCT_LINE_B_SLUG) return
  if (value['display_name'] !== 'Product Line B') {
    errors.push(error('PRODUCT_LINE_IDENTITY_INVALID', '$.product_line.display_name', 'Product Line B display_name must be Product Line B.'))
  }
  if (value['agent_prefix'] !== PRODUCT_LINE_B_AGENT_PREFIX) {
    errors.push(error('AGENT_PREFIX_INVALID', '$.product_line.agent_prefix', 'Product Line B agent_prefix must be plb-platform.'))
  }
  if (value['disabled_by_default'] !== true) {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.product_line.disabled_by_default', 'Product Line B must declare disabled_by_default: true.'))
  }
}

function validateWorkflowContractDeclaration(
  value: unknown,
  githubFullName: unknown,
  errors: ProductLineSeedValidationError[],
): void {
  if (!isRecord(value)) return
  if (value['family'] !== 'paddock') {
    errors.push(error('UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY', '$.workflow_contract.family', 'SPEC-010A supports only the paddock workflow contract family.'))
    return
  }
  if (typeof value['path'] !== 'string') return
  if (!isAllowedWorkflowContractPath(value['path'])) {
    errors.push(error('WORKFLOW_CONTRACT_PATH_INVALID', '$.workflow_contract.path', 'Workflow contract path must be repo-relative or an explicit test fixture path.'))
    return
  }
  let contract: ReturnType<typeof loadWorkflowContractFromFile>
  try {
    contract = loadWorkflowContractFromFile(value['path'])
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : 'Workflow contract could not be loaded.'
    const code: ProductLineSeedErrorCode = /failed to parse|must contain exactly one document|must have a mapping root|must not use|prompt bodies/i.test(message)
      ? 'WORKFLOW_CONTRACT_PARSE_FAILED'
      : 'WORKFLOW_CONTRACT_PATH_INVALID'
    errors.push(error(code, '$.workflow_contract.path', message))
    return
  }
  if (contract.family !== 'paddock') {
    errors.push(error('UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY', '$.workflow_contract.family', 'Workflow contract file family must be paddock.'))
  }
  if (!Array.isArray(contract.templates)) {
    errors.push(error('WORKFLOW_CONTRACT_PARSE_FAILED', '$.workflow_contract.path', 'Workflow contract templates must be an array.'))
    return
  }
  if (typeof githubFullName === 'string') {
    const mismatchedTemplate = contract.templates.find((template) => template.tracker?.repo && template.tracker.repo !== githubFullName)
    if (mismatchedTemplate) {
      errors.push(error('WORKFLOW_CONTRACT_REPO_MISMATCH', '$.workflow_contract.path', `Workflow contract tracker repo does not match declared ownership for ${mismatchedTemplate.slug}.`))
    }
  }
  const contractSlugs = new Set(contract.templates.map((template) => template.slug))
  const seenRequiredSlugs = new Set<string>()
  const requiredSlugs = Array.isArray(value['required_slugs']) ? value['required_slugs'] : []
  for (const [index, slug] of requiredSlugs.entries()) {
    if (typeof slug === 'string' && seenRequiredSlugs.has(slug)) {
      errors.push(error('WORKFLOW_CONTRACT_REQUIRED_SLUG_AMBIGUOUS', `$.workflow_contract.required_slugs[${String(index)}]`, `Required workflow slug is duplicated or ambiguous: ${slug}.`))
    }
    if (typeof slug === 'string') seenRequiredSlugs.add(slug)
    if (typeof slug === 'string' && !contractSlugs.has(slug)) {
      errors.push(error('WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING', `$.workflow_contract.required_slugs[${String(index)}]`, `Required workflow slug is missing from contract: ${slug}.`))
    }
  }
}

function isAllowedWorkflowContractPath(path: string): boolean {
  if (path.includes('\0') || path.startsWith('../') || path.includes('/../')) return false
  if (isAbsolute(path)) return true
  return path.startsWith('docs/ai/workflows/') && path.endsWith('.yaml')
}

function validateDepartments(value: unknown, githubFullName: unknown, errors: ProductLineSeedValidationError[]): void {
  if (!Array.isArray(value)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.departments', 'departments must be an array.'))
    return
  }
  const slugs = new Set<string>()
  const ticketPrefixes = new Set<string>()
  for (const [index, department] of value.entries()) {
    const path = `$.departments[${String(index)}]`
    validateObject(department, path, [
      'slug',
      'name',
      'ticket_prefix',
      'area_slug',
      'github_repo',
      'github_sync_enabled',
      'is_triage_project',
      'is_repo_sync_owner',
    ], errors)
    if (!isRecord(department)) continue
    validateUniqueString(department['slug'], `${path}.slug`, slugs, errors, 'DEPARTMENT_INVALID')
    validateStringField(department, 'name', `${path}.name`, errors, 'DEPARTMENT_INVALID')
    validateUniqueString(department['ticket_prefix'], `${path}.ticket_prefix`, ticketPrefixes, errors, 'DEPARTMENT_INVALID')
    validateStringField(department, 'area_slug', `${path}.area_slug`, errors, 'DEPARTMENT_INVALID')
    if (department['github_repo'] !== null && typeof department['github_repo'] !== 'string') {
      errors.push(error('DEPARTMENT_INVALID', `${path}.github_repo`, 'github_repo must be a string or null.'))
    }
    if (typeof department['github_repo'] === 'string' && typeof githubFullName === 'string' && department['github_repo'] !== githubFullName) {
      errors.push(error('DEPARTMENT_GITHUB_REPO_MISMATCH', `${path}.github_repo`, 'department github_repo must match declared GitHub ownership or be null.'))
    }
    validateBooleanField(department, 'github_sync_enabled', `${path}.github_sync_enabled`, errors, 'DEPARTMENT_INVALID')
    validateBooleanField(department, 'is_triage_project', `${path}.is_triage_project`, errors, 'DEPARTMENT_INVALID')
    validateBooleanField(department, 'is_repo_sync_owner', `${path}.is_repo_sync_owner`, errors, 'DEPARTMENT_INVALID')
  }
}

function validateAgentAssignments(
  value: unknown,
  departments: unknown,
  agentPrefix: string | null,
  productLineSlug: string | null,
  errors: ProductLineSeedValidationError[],
): void {
  validateObject(value, '$.agent_assignments', ['product_line_assignments', 'shared_support'], errors, ['shared_support'])
  if (!isRecord(value)) return

  const departmentSlugs = new Set<string>(
    Array.isArray(departments)
      ? departments.filter(isRecord).map((department) => department['slug']).filter((slug): slug is string => typeof slug === 'string')
      : [],
  )
  const assignments = value['product_line_assignments']
  if (!Array.isArray(assignments)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.agent_assignments.product_line_assignments', 'product_line_assignments must be an array.'))
    return
  }
  const agentKeys = new Set<string>()
  for (const [index, assignment] of assignments.entries()) {
    const path = `$.agent_assignments.product_line_assignments[${String(index)}]`
    validateObject(assignment, path, ['agent_key', 'role', 'department_slug'], errors)
    if (!isRecord(assignment)) continue
    validateUniqueString(assignment['agent_key'], `${path}.agent_key`, agentKeys, errors, 'AGENT_KEY_INVALID')
    if (typeof assignment['agent_key'] === 'string') {
      if (!SLUG_SAFE_PATTERN.test(assignment['agent_key'])) {
        errors.push(error('AGENT_KEY_INVALID', `${path}.agent_key`, 'agent_key must be slug-safe lowercase text.'))
      }
      if (productLineSlug === PRODUCT_LINE_B_SLUG) {
        if (!assignment['agent_key'].startsWith(`${PRODUCT_LINE_B_AGENT_PREFIX}-`)) {
          errors.push(error('AGENT_KEY_INVALID', `${path}.agent_key`, 'Product Line B agent_key must use a plb-platform-* logical assignment name.'))
        }
      } else if (
        (agentPrefix && assignment['agent_key'].startsWith(`${agentPrefix}-`)) ||
        (productLineSlug && assignment['agent_key'].startsWith(`${productLineSlug}-`))
      ) {
        errors.push(error('AGENT_KEY_INVALID', `${path}.agent_key`, 'agent_key must not include the product-line agent prefix.'))
      }
    }
    validateStringField(assignment, 'role', `${path}.role`, errors)
    validateStringField(assignment, 'department_slug', `${path}.department_slug`, errors)
    if (typeof assignment['department_slug'] === 'string' && !departmentSlugs.has(assignment['department_slug'])) {
      errors.push(error('AGENT_ASSIGNMENT_DEPARTMENT_MISSING', `${path}.department_slug`, 'assignment department_slug must reference a declared department.'))
    }
  }

  const sharedSupport = value['shared_support']
  if (sharedSupport === undefined) return
  if (!Array.isArray(sharedSupport)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.agent_assignments.shared_support', 'shared_support must be an array when present.'))
    return
  }
  for (const [index, assignment] of sharedSupport.entries()) {
    const path = `$.agent_assignments.shared_support[${String(index)}]`
    validateObject(assignment, path, ['scope', 'shared_support_role', 'agent_name'], errors)
    if (!isRecord(assignment)) continue
    if (assignment['scope'] !== 'facility_global') errors.push(error('SHARED_SUPPORT_ASSIGNMENT_INVALID', `${path}.scope`, 'shared support scope must be facility_global.'))
    validateStringField(assignment, 'shared_support_role', `${path}.shared_support_role`, errors, 'SHARED_SUPPORT_ASSIGNMENT_INVALID')
    validateStringField(assignment, 'agent_name', `${path}.agent_name`, errors, 'SHARED_SUPPORT_ASSIGNMENT_INVALID')
  }
}

function validateFeatureFlags(value: unknown, productLineSlug: string | null, errors: ProductLineSeedValidationError[]): void {
  validateObject(value, '$.feature_flags', [
    'enabled',
    'disabled_or_absent',
    'owned_keys',
    'smoke_owned',
    'paused_or_forbidden',
  ], errors, ['owned_keys', 'smoke_owned', 'paused_or_forbidden'])
  if (!isRecord(value)) return
  const enabled = validateStringArrayField(value, 'enabled', '$.feature_flags.enabled', errors)
  const disabled = validateStringArrayField(value, 'disabled_or_absent', '$.feature_flags.disabled_or_absent', errors)
  validateStringArrayField(value, 'owned_keys', '$.feature_flags.owned_keys', errors, true)
  const smokeOwned = validateStringArrayField(value, 'smoke_owned', '$.feature_flags.smoke_owned', errors, true)
  const pausedOrForbidden = validateStringArrayField(value, 'paused_or_forbidden', '$.feature_flags.paused_or_forbidden', errors, true)
  if (productLineSlug === PRODUCT_LINE_B_SLUG) {
    validateExactStringArray(smokeOwned, [...PRODUCT_LINE_B_SMOKE_OWNED_FLAGS], '$.feature_flags.smoke_owned', errors)
    validateExactStringArray(pausedOrForbidden, [...PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS], '$.feature_flags.paused_or_forbidden', errors)
  }
  const enabledSet = new Set<string>()
  for (const [index, flag] of enabled.entries()) {
    if (enabledSet.has(flag)) errors.push(error('FEATURE_FLAG_DUPLICATE', `$.feature_flags.enabled[${String(index)}]`, `Duplicate enabled feature flag: ${flag}.`))
    if (!isFeatureFlagKey(flag) && !RESERVED_DISABLED_OR_ABSENT_FLAGS.has(flag)) errors.push(error('FEATURE_FLAG_UNKNOWN_ENABLED', `$.feature_flags.enabled[${String(index)}]`, `Unknown enabled feature flag: ${flag}.`))
    if (RESERVED_DISABLED_OR_ABSENT_FLAGS.has(flag)) errors.push(error('FEATURE_FLAG_RESERVED_FUTURE_ENABLED', `$.feature_flags.enabled[${String(index)}]`, `Reserved disabled_or_absent feature flag must not be enabled: ${flag}.`))
    if (process.env[flag] === '0') errors.push(error('FEATURE_FLAG_ENV_FORCE_OFF', `$.feature_flags.enabled[${String(index)}]`, `Feature flag is forced OFF by environment: ${flag}.`))
    enabledSet.add(flag)
  }
  const disabledSet = new Set<string>()
  for (const [index, flag] of disabled.entries()) {
    if (disabledSet.has(flag)) errors.push(error('FEATURE_FLAG_DUPLICATE', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Duplicate disabled_or_absent feature flag: ${flag}.`))
    if (enabledSet.has(flag)) {
      errors.push(error('FEATURE_FLAG_CONFLICT', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Feature flag cannot be both enabled and disabled_or_absent: ${flag}.`))
      errors.push(error('CONFIG_CONFLICTING_DECLARATION', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Feature flag cannot be both enabled and disabled_or_absent: ${flag}.`))
    }
    if (!isFeatureFlagKey(flag) && !RESERVED_DISABLED_OR_ABSENT_FLAGS.has(flag)) {
      errors.push(error('FEATURE_FLAG_UNKNOWN_DISABLED_OR_ABSENT', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Unknown disabled_or_absent feature flag: ${flag}.`))
    }
    disabledSet.add(flag)
  }
  for (const flag of enabled) {
    if (!isFeatureFlagKey(flag)) continue
    const missing = getFeatureFlagCascadePrerequisites(flag).filter((prerequisite) => !enabledSet.has(prerequisite))
    if (missing.length > 0) {
      errors.push(error('FEATURE_FLAG_CASCADE_PREREQUISITE_MISSING', '$.feature_flags.enabled', `Feature flag ${flag} is missing cascade prerequisites: ${missing.join(', ')}.`))
    }
  }
}

function validateGovernanceDefaults(value: unknown, allowBlockingGovernance: boolean, errors: ProductLineSeedValidationError[]): void {
  if (!Array.isArray(value)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.governance_defaults', 'governance_defaults must be an array.'))
    return
  }
  const identities = new Set<string>()
  for (const [index, policy] of value.entries()) {
    const path = `$.governance_defaults[${String(index)}]`
    validateObject(policy, path, [
      'identity',
      'notes',
      'policy_type',
      'limit_kind',
      'limit_value',
      'period',
      'timezone',
      'enforcement',
      'enabled',
      'default_template',
      'first_intake_blocking_reason',
    ], errors, ['notes', 'first_intake_blocking_reason'])
    if (!isRecord(policy)) continue
    validateUniqueString(policy['identity'], `${path}.identity`, identities, errors, 'GOVERNANCE_POLICY_INVALID', 'GOVERNANCE_POLICY_IDENTITY_DUPLICATE')
    validateStringField(policy, 'policy_type', `${path}.policy_type`, errors, 'GOVERNANCE_POLICY_INVALID')
    validateStringField(policy, 'limit_kind', `${path}.limit_kind`, errors, 'GOVERNANCE_POLICY_INVALID')
    if (policy['limit_value'] !== null && typeof policy['limit_value'] !== 'number') {
      errors.push(error('GOVERNANCE_POLICY_INVALID', `${path}.limit_value`, 'limit_value must be a number or null.'))
    }
    if (policy['period'] !== null && typeof policy['period'] !== 'string') {
      errors.push(error('GOVERNANCE_POLICY_INVALID', `${path}.period`, 'period must be a string or null.'))
    }
    validateStringField(policy, 'timezone', `${path}.timezone`, errors, 'GOVERNANCE_POLICY_INVALID')
    validateStringField(policy, 'enforcement', `${path}.enforcement`, errors, 'GOVERNANCE_POLICY_INVALID')
    validateBooleanField(policy, 'enabled', `${path}.enabled`, errors, 'GOVERNANCE_POLICY_INVALID')
    validateBooleanField(policy, 'default_template', `${path}.default_template`, errors, 'GOVERNANCE_POLICY_INVALID')
    const blocksFirstIntake = policy['enabled'] === true && (
      policy['policy_type'] === 'blackout' ||
      policy['policy_type'] === 'degraded_window' ||
      policy['policy_type'] === 'wip_limit' ||
      policy['enforcement'] !== 'alert'
    )
    if (blocksFirstIntake && (!allowBlockingGovernance || typeof policy['first_intake_blocking_reason'] !== 'string' || policy['first_intake_blocking_reason'].length === 0)) {
      errors.push(error('GOVERNANCE_FIRST_INTAKE_BLOCKING', `${path}.first_intake_blocking_reason`, 'First-intake-blocking governance requires an explicit allowance and per-policy reason.'))
    }
  }
}

function validateSafetyPolicy(value: unknown, productLineSlug: string | null, errors: ProductLineSeedValidationError[]): void {
  validateObject(value, '$.safety_policy', [
    'existing_target',
    'allow_first_intake_blocking_governance',
    'config_owned_surfaces',
    'preserved_surfaces',
    'blocked_side_effects',
  ], errors)
  if (!isRecord(value)) return
  if (value['existing_target'] !== 'refuse_unless_allow_existing') {
    errors.push(error('CONFIG_SCHEMA_INVALID', '$.safety_policy.existing_target', 'existing_target must be refuse_unless_allow_existing.'))
  }
  validateBooleanField(value, 'allow_first_intake_blocking_governance', '$.safety_policy.allow_first_intake_blocking_governance', errors)
  validateExactStringArray(value['config_owned_surfaces'], [...CONFIG_OWNED_SURFACES], '$.safety_policy.config_owned_surfaces', errors)
  validateExactStringArray(value['preserved_surfaces'], [...FR020_PRESERVED_SURFACES], '$.safety_policy.preserved_surfaces', errors)
  validateExactStringArray(
    value['blocked_side_effects'],
    productLineSlug === PRODUCT_LINE_B_SLUG ? [...PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS] : [...BLOCKED_SIDE_EFFECTS],
    '$.safety_policy.blocked_side_effects',
    errors,
  )
}

function validateObject(
  value: unknown,
  path: string,
  allowedFields: string[],
  errors: ProductLineSeedValidationError[],
  optionalFields: string[] = [],
): void {
  if (!isRecord(value)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must be a mapping.`))
    return
  }
  const optional = new Set(optionalFields)
  for (const field of allowedFields) {
    if (!optional.has(field) && !(field in value)) {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.${field}`, `Missing required field: ${field}.`))
    }
  }
  const allowed = new Set(allowedFields)
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(error('CONFIG_UNKNOWN_FIELD', `${path}.${field}`, `Unknown field: ${field}.`))
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  errors: ProductLineSeedValidationError[],
  code: ProductLineSeedErrorCode = 'CONFIG_FIELD_TYPE_INVALID',
): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(error(code, path, `${path} must be a non-empty string.`))
    return null
  }
  return value
}

function validateStringField(
  value: unknown,
  field: string,
  path: string,
  errors: ProductLineSeedValidationError[],
  code: ProductLineSeedErrorCode = 'CONFIG_FIELD_TYPE_INVALID',
): string | null {
  return isRecord(value) ? validateString(value[field], path, errors, code) : null
}

function validateUniqueString(
  value: unknown,
  path: string,
  seen: Set<string>,
  errors: ProductLineSeedValidationError[],
  invalidCode: ProductLineSeedErrorCode = 'CONFIG_FIELD_TYPE_INVALID',
  duplicateCode: ProductLineSeedErrorCode = 'CONFIG_DUPLICATE_DECLARATION',
): void {
  const normalized = validateString(value, path, errors, invalidCode)
  if (!normalized) return
  if (seen.has(normalized)) {
    errors.push(error(duplicateCode, path, `Duplicate declaration: ${normalized}.`))
  }
  seen.add(normalized)
}

function validateBooleanField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: ProductLineSeedValidationError[],
  code: ProductLineSeedErrorCode = 'CONFIG_FIELD_TYPE_INVALID',
): void {
  if (typeof value[field] !== 'boolean') {
    errors.push(error(code, path, `${path} must be a boolean.`))
  }
}

function validateStringArrayField(
  value: unknown,
  field: string,
  path: string,
  errors: ProductLineSeedValidationError[],
  optional = false,
): string[] {
  if (!isRecord(value)) return []
  const candidate = value[field]
  if (candidate === undefined && optional) return []
  if (!Array.isArray(candidate)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must be an array.`))
    return []
  }
  return candidate.flatMap((item, index) => {
    if (typeof item === 'string' && item.length > 0) return [item]
    const itemPath = `${path}[${String(index)}]`
    errors.push(error('CONFIG_SCHEMA_INVALID', itemPath, `${itemPath} must be a non-empty string.`))
    return []
  })
}

function validateExactStringArray(
  value: unknown,
  expected: string[],
  path: string,
  errors: ProductLineSeedValidationError[],
): void {
  if (!Array.isArray(value)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must be an array.`))
    return
  }
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must match the reviewed SPEC-010A safety constants.`))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function error(code: ProductLineSeedErrorCode, path: string, message: string): ProductLineSeedValidationError {
  return { code, path, message }
}
