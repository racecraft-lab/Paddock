import { PRODUCT_LINE_SEED_SCHEMA_VERSION, type ProductLineSeedValidationError } from './types'

export const PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS = [
  'schema_version',
  'product_line',
  'github',
  'workflow_contract',
  'departments',
  'agent_assignments',
  'feature_flags',
  'governance_defaults',
  'safety_policy',
] as const

export const PRODUCT_LINE_SEED_ALLOWED_TOP_LEVEL_SECTIONS = new Set<string>(
  PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS,
)

export function validateProductLineSeedTopLevelShape(value: unknown): ProductLineSeedValidationError[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{
      code: 'CONFIG_SCHEMA_INVALID',
      path: '$',
      message: 'Product-line seed config must be a mapping.',
    }]
  }
  const record = value as Record<string, unknown>
  const errors: ProductLineSeedValidationError[] = []
  for (const section of PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!(section in record)) {
      errors.push({
        code: 'CONFIG_SCHEMA_INVALID',
        path: `$.${section}`,
        message: `Missing required top-level section: ${section}.`,
      })
    }
  }
  for (const section of Object.keys(record)) {
    if (!PRODUCT_LINE_SEED_ALLOWED_TOP_LEVEL_SECTIONS.has(section)) {
      errors.push({
        code: 'CONFIG_SCHEMA_INVALID',
        path: `$.${section}`,
        message: `Unknown top-level section: ${section}.`,
      })
    }
  }
  if (record['schema_version'] !== PRODUCT_LINE_SEED_SCHEMA_VERSION) {
    errors.push({
      code: 'CONFIG_SCHEMA_INVALID',
      path: '$.schema_version',
      message: `schema_version must be ${PRODUCT_LINE_SEED_SCHEMA_VERSION}.`,
    })
  }
  return errors
}
