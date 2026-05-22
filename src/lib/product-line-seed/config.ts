import { readFileSync } from 'node:fs'
import { parseAllDocuments } from 'yaml'
import { validateProductLineSeedTopLevelShape } from './schema'
import {
  BLOCKED_SIDE_EFFECTS,
  CONFIG_OWNED_SURFACES,
  FR020_PRESERVED_SURFACES,
  type ProductLineSeedConfig,
  type ProductLineSeedErrorCode,
  type ProductLineSeedValidationError,
} from './types'

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

  validateObject(config['product_line'], '$.product_line', ['slug', 'display_name', 'agent_prefix'], errors)
  validateStringField(config['product_line'], 'slug', '$.product_line.slug', errors)
  validateStringField(config['product_line'], 'display_name', '$.product_line.display_name', errors)
  validateStringField(config['product_line'], 'agent_prefix', '$.product_line.agent_prefix', errors)

  validateObject(config['github'], '$.github', ['owner', 'repo', 'full_name'], errors)
  validateStringField(config['github'], 'owner', '$.github.owner', errors)
  validateStringField(config['github'], 'repo', '$.github.repo', errors)
  validateStringField(config['github'], 'full_name', '$.github.full_name', errors)
  if (isRecord(config['github'])) {
    const owner = config['github']['owner']
    const repo = config['github']['repo']
    if (typeof owner === 'string' && typeof repo === 'string') {
      const expectedFullName = `${owner}/${repo}`
      if (config['github']['full_name'] !== expectedFullName) {
        errors.push(error('CONFIG_SCHEMA_INVALID', '$.github.full_name', `github.full_name must equal ${expectedFullName}.`))
      }
    }
  }

  validateObject(config['workflow_contract'], '$.workflow_contract', ['family', 'path', 'required_slugs'], errors)
  validateStringField(config['workflow_contract'], 'family', '$.workflow_contract.family', errors)
  validateStringField(config['workflow_contract'], 'path', '$.workflow_contract.path', errors)
  validateStringArrayField(config['workflow_contract'], 'required_slugs', '$.workflow_contract.required_slugs', errors)

  validateDepartments(config['departments'], typeof config['github'] === 'object' && config['github'] !== null
    ? (config['github'] as Record<string, unknown>)['full_name']
    : null, errors)
  validateAgentAssignments(config['agent_assignments'], config['departments'], errors)
  validateFeatureFlags(config['feature_flags'], errors)
  validateGovernanceDefaults(config['governance_defaults'], errors)
  validateSafetyPolicy(config['safety_policy'], errors)

  return errors
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
    validateUniqueString(department['slug'], `${path}.slug`, slugs, errors)
    validateStringField(department, 'name', `${path}.name`, errors)
    validateUniqueString(department['ticket_prefix'], `${path}.ticket_prefix`, ticketPrefixes, errors)
    validateStringField(department, 'area_slug', `${path}.area_slug`, errors)
    if (department['github_repo'] !== null && typeof department['github_repo'] !== 'string') {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.github_repo`, 'github_repo must be a string or null.'))
    }
    if (typeof department['github_repo'] === 'string' && typeof githubFullName === 'string' && department['github_repo'] !== githubFullName) {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.github_repo`, 'department github_repo must match declared GitHub ownership or be null.'))
    }
    validateBooleanField(department, 'github_sync_enabled', `${path}.github_sync_enabled`, errors)
    validateBooleanField(department, 'is_triage_project', `${path}.is_triage_project`, errors)
    validateBooleanField(department, 'is_repo_sync_owner', `${path}.is_repo_sync_owner`, errors)
  }
}

function validateAgentAssignments(value: unknown, departments: unknown, errors: ProductLineSeedValidationError[]): void {
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
    validateUniqueString(assignment['agent_key'], `${path}.agent_key`, agentKeys, errors)
    validateStringField(assignment, 'role', `${path}.role`, errors)
    validateStringField(assignment, 'department_slug', `${path}.department_slug`, errors)
    if (typeof assignment['department_slug'] === 'string' && !departmentSlugs.has(assignment['department_slug'])) {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.department_slug`, 'assignment department_slug must reference a declared department.'))
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
    if (assignment['scope'] !== 'facility_global') errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.scope`, 'shared support scope must be facility_global.'))
    validateStringField(assignment, 'shared_support_role', `${path}.shared_support_role`, errors)
    validateStringField(assignment, 'agent_name', `${path}.agent_name`, errors)
  }
}

function validateFeatureFlags(value: unknown, errors: ProductLineSeedValidationError[]): void {
  validateObject(value, '$.feature_flags', ['enabled', 'disabled_or_absent', 'owned_keys'], errors, ['owned_keys'])
  if (!isRecord(value)) return
  const enabled = validateStringArrayField(value, 'enabled', '$.feature_flags.enabled', errors)
  const disabled = validateStringArrayField(value, 'disabled_or_absent', '$.feature_flags.disabled_or_absent', errors)
  validateStringArrayField(value, 'owned_keys', '$.feature_flags.owned_keys', errors, true)
  const enabledSet = new Set<string>()
  for (const [index, flag] of enabled.entries()) {
    if (enabledSet.has(flag)) errors.push(error('CONFIG_SCHEMA_INVALID', `$.feature_flags.enabled[${String(index)}]`, `Duplicate enabled feature flag: ${flag}.`))
    enabledSet.add(flag)
  }
  const disabledSet = new Set<string>()
  for (const [index, flag] of disabled.entries()) {
    if (disabledSet.has(flag)) errors.push(error('CONFIG_SCHEMA_INVALID', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Duplicate disabled_or_absent feature flag: ${flag}.`))
    if (enabledSet.has(flag)) errors.push(error('CONFIG_SCHEMA_INVALID', `$.feature_flags.disabled_or_absent[${String(index)}]`, `Feature flag cannot be both enabled and disabled_or_absent: ${flag}.`))
    disabledSet.add(flag)
  }
}

function validateGovernanceDefaults(value: unknown, errors: ProductLineSeedValidationError[]): void {
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
    validateUniqueString(policy['identity'], `${path}.identity`, identities, errors)
    validateStringField(policy, 'policy_type', `${path}.policy_type`, errors)
    validateStringField(policy, 'limit_kind', `${path}.limit_kind`, errors)
    if (policy['limit_value'] !== null && typeof policy['limit_value'] !== 'number') {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.limit_value`, 'limit_value must be a number or null.'))
    }
    if (policy['period'] !== null && typeof policy['period'] !== 'string') {
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.period`, 'period must be a string or null.'))
    }
    validateStringField(policy, 'timezone', `${path}.timezone`, errors)
    validateStringField(policy, 'enforcement', `${path}.enforcement`, errors)
    validateBooleanField(policy, 'enabled', `${path}.enabled`, errors)
    validateBooleanField(policy, 'default_template', `${path}.default_template`, errors)
  }
}

function validateSafetyPolicy(value: unknown, errors: ProductLineSeedValidationError[]): void {
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
  validateExactStringArray(value['blocked_side_effects'], [...BLOCKED_SIDE_EFFECTS], '$.safety_policy.blocked_side_effects', errors)
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
      errors.push(error('CONFIG_SCHEMA_INVALID', `${path}.${field}`, `Unknown field: ${field}.`))
    }
  }
}

function validateString(value: unknown, path: string, errors: ProductLineSeedValidationError[]): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must be a non-empty string.`))
    return null
  }
  return value
}

function validateStringField(value: unknown, field: string, path: string, errors: ProductLineSeedValidationError[]): string | null {
  return isRecord(value) ? validateString(value[field], path, errors) : null
}

function validateUniqueString(value: unknown, path: string, seen: Set<string>, errors: ProductLineSeedValidationError[]): void {
  const normalized = validateString(value, path, errors)
  if (!normalized) return
  if (seen.has(normalized)) {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `Duplicate declaration: ${normalized}.`))
  }
  seen.add(normalized)
}

function validateBooleanField(value: Record<string, unknown>, field: string, path: string, errors: ProductLineSeedValidationError[]): void {
  if (typeof value[field] !== 'boolean') {
    errors.push(error('CONFIG_SCHEMA_INVALID', path, `${path} must be a boolean.`))
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
