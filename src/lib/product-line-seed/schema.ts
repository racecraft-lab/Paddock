import {
  BLOCKED_SIDE_EFFECTS,
  CONFIG_OWNED_SURFACES,
  FR020_PRESERVED_SURFACES,
  PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS,
  PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS,
  PRODUCT_LINE_B_SMOKE_OWNED_FLAGS,
  PRODUCT_LINE_SEED_SCHEMA_VERSION,
  type ProductLineSeedValidationError,
} from './types.ts'

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

const stringSchema = { type: 'string', minLength: 1 } as const
const booleanSchema = { type: 'boolean' } as const
const nullableStringSchema = { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] } as const
const nullableNumberSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const
const slugSafeStringSchema = { type: 'string', minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } as const
const stringArraySchema = {
  type: 'array',
  items: stringSchema,
} as const

export const PRODUCT_LINE_B_AGENT_KEY_PATTERN = '^plb-platform-[a-z0-9]+(?:-[a-z0-9]+)*$'

const ALL_BLOCKED_SIDE_EFFECTS = [
  ...new Set([...BLOCKED_SIDE_EFFECTS, ...PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS]),
]

export const PRODUCT_LINE_SEED_CONFIG_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS,
  properties: {
    schema_version: { const: PRODUCT_LINE_SEED_SCHEMA_VERSION },
    product_line: {
      type: 'object',
      additionalProperties: false,
      required: ['slug', 'display_name', 'agent_prefix'],
      properties: {
        slug: slugSafeStringSchema,
        display_name: stringSchema,
        agent_prefix: slugSafeStringSchema,
        disabled_by_default: booleanSchema,
      },
    },
    github: {
      type: 'object',
      additionalProperties: false,
      required: ['owner', 'repo', 'full_name'],
      properties: {
        owner: { const: 'racecraft-lab' },
        repo: { const: 'Paddock' },
        full_name: { const: 'racecraft-lab/Paddock' },
      },
    },
    workflow_contract: {
      type: 'object',
      additionalProperties: false,
      required: ['family', 'path', 'required_slugs'],
      properties: {
        family: stringSchema,
        path: stringSchema,
        required_slugs: stringArraySchema,
      },
    },
    departments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'slug',
          'name',
          'ticket_prefix',
          'area_slug',
          'github_repo',
          'github_sync_enabled',
          'is_triage_project',
          'is_repo_sync_owner',
        ],
        properties: {
          slug: stringSchema,
          name: stringSchema,
          ticket_prefix: stringSchema,
          area_slug: stringSchema,
          github_repo: nullableStringSchema,
          github_sync_enabled: booleanSchema,
          is_triage_project: booleanSchema,
          is_repo_sync_owner: booleanSchema,
        },
      },
    },
    agent_assignments: {
      type: 'object',
      additionalProperties: false,
      required: ['product_line_assignments'],
      properties: {
        product_line_assignments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['agent_key', 'role', 'department_slug'],
            properties: {
              agent_key: slugSafeStringSchema,
              role: stringSchema,
              department_slug: stringSchema,
            },
          },
        },
        shared_support: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['scope', 'shared_support_role', 'agent_name'],
            properties: {
              scope: { const: 'facility_global' },
              shared_support_role: stringSchema,
              agent_name: stringSchema,
            },
          },
        },
      },
    },
    feature_flags: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled', 'disabled_or_absent'],
      properties: {
        enabled: stringArraySchema,
        disabled_or_absent: stringArraySchema,
        owned_keys: stringArraySchema,
        smoke_owned: {
          type: 'array',
          items: { enum: [...PRODUCT_LINE_B_SMOKE_OWNED_FLAGS] },
          uniqueItems: true,
        },
        paused_or_forbidden: {
          type: 'array',
          items: { enum: [...PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS] },
          uniqueItems: true,
        },
      },
    },
    governance_defaults: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'identity',
          'policy_type',
          'limit_kind',
          'limit_value',
          'period',
          'timezone',
          'enforcement',
          'enabled',
          'default_template',
        ],
        properties: {
          identity: stringSchema,
          notes: stringSchema,
          policy_type: { enum: ['wip_limit', 'budget', 'blackout', 'degraded_window'] },
          limit_kind: stringSchema,
          limit_value: nullableNumberSchema,
          period: nullableStringSchema,
          timezone: stringSchema,
          enforcement: { enum: ['alert', 'defer', 'pause_new_work', 'block_dispatch', 'require_override'] },
          enabled: booleanSchema,
          default_template: booleanSchema,
          first_intake_blocking_reason: stringSchema,
        },
      },
    },
    safety_policy: {
      type: 'object',
      additionalProperties: false,
      required: [
        'existing_target',
        'allow_first_intake_blocking_governance',
        'config_owned_surfaces',
        'preserved_surfaces',
        'blocked_side_effects',
      ],
      properties: {
        existing_target: { const: 'refuse_unless_allow_existing' },
        allow_first_intake_blocking_governance: booleanSchema,
        config_owned_surfaces: { type: 'array', items: { enum: [...CONFIG_OWNED_SURFACES] } },
        preserved_surfaces: { type: 'array', items: { enum: [...FR020_PRESERVED_SURFACES] } },
        blocked_side_effects: { type: 'array', items: { enum: [...ALL_BLOCKED_SIDE_EFFECTS] } },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: {
          product_line: {
            type: 'object',
            required: ['slug'],
            properties: {
              slug: { const: 'product-line-b' },
            },
          },
        },
      },
      then: {
        properties: {
          product_line: {
            required: ['slug', 'display_name', 'agent_prefix', 'disabled_by_default'],
            properties: {
              slug: { const: 'product-line-b' },
              display_name: { const: 'Product Line B' },
              agent_prefix: { const: 'plb-platform' },
              disabled_by_default: { const: true },
            },
          },
          github: {
            properties: {
              owner: { const: 'racecraft-lab' },
              repo: { const: 'Paddock' },
              full_name: { const: 'racecraft-lab/Paddock' },
            },
          },
          agent_assignments: {
            properties: {
              product_line_assignments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    agent_key: { pattern: PRODUCT_LINE_B_AGENT_KEY_PATTERN },
                  },
                },
              },
            },
          },
          feature_flags: {
            required: ['smoke_owned', 'paused_or_forbidden'],
            properties: {
              smoke_owned: {
                type: 'array',
                items: { enum: [...PRODUCT_LINE_B_SMOKE_OWNED_FLAGS] },
                uniqueItems: true,
              },
              paused_or_forbidden: {
                type: 'array',
                items: { enum: [...PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS] },
                uniqueItems: true,
              },
            },
          },
        },
      },
    },
  ],
} as const

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
