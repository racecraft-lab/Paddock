type JsonSchema = {
  type?: string | string[]
  title?: string
  description?: string
  tags?: string[]
  'x-tags'?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema | JsonSchema[]
  additionalProperties?: JsonSchema | boolean
  enum?: unknown[]
  const?: unknown
  default?: unknown
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  nullable?: boolean
  minimum?: number
  maximum?: number
  pattern?: string
}

export type { JsonSchema }

/** Resolve the primary type from a schema node */
export function schemaType(schema: JsonSchema | undefined): string | undefined {
  if (!schema) return undefined
  if (Array.isArray(schema.type)) {
    const filtered = schema.type.filter(t => t !== 'null')
    return filtered[0] ?? schema.type[0]
  }
  if (schema.type) return schema.type
  if (schema.properties || schema.additionalProperties) return 'object'
  return undefined
}

/** Normalize union schemas (anyOf/oneOf) into a simpler form */
export function normalizeSchema(schema: JsonSchema): JsonSchema {
  if (!schema.anyOf && !schema.oneOf) return schema

  const union = schema.anyOf ?? schema.oneOf ?? []
  const literals: unknown[] = []
  const remaining: JsonSchema[] = []
  let nullable = false

  for (const entry of union) {
    if (!entry || typeof entry !== 'object') continue
    if (Array.isArray(entry.enum)) {
      for (const v of entry.enum) {
        if (v == null) { nullable = true; continue }
        if (!literals.some(ex => Object.is(ex, v))) literals.push(v)
      }
      continue
    }
    if ('const' in entry) {
      if (entry.const == null) { nullable = true; continue }
      literals.push(entry.const)
      continue
    }
    if (schemaType(entry) === 'null') { nullable = true; continue }
    remaining.push(entry)
  }

  if (literals.length > 0 && remaining.length === 0) {
    return { ...schema, enum: literals, nullable, anyOf: undefined, oneOf: undefined }
  }
  if (remaining.length === 1) {
    return { ...remaining[0], nullable, anyOf: undefined, oneOf: undefined, title: schema.title, description: schema.description }
  }
  return schema
}

/** Infer a field type string from a raw config value (schema-less fallback) */
export function inferFieldType(value: unknown): string {
  if (value == null) return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'string'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return 'string'
}

/** Collect all tags from a schema tree */
export function extractSchemaTags(schema: JsonSchema): string[] {
  const tags = new Set<string>()
  function walk(s: JsonSchema) {
    for (const t of (s['x-tags'] ?? s.tags ?? [])) {
      if (typeof t === 'string') tags.add(t.toLowerCase())
    }
    if (s.properties) {
      for (const child of Object.values(s.properties)) walk(child)
    }
    if (s.items && !Array.isArray(s.items)) walk(s.items)
  }
  walk(schema)
  return [...tags]
}
