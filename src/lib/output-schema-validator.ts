import { createHash } from 'node:crypto'
import Ajv, { type ValidateFunction } from 'ajv'
import safeRegexUntyped from 'safe-regex'

const safeRegex = safeRegexUntyped as (regex: RegExp) => boolean

export const OUTPUT_SCHEMA_LIMITS = {
  maxOutputBytes: 262144,
  maxSchemaBytes: 65536,
  maxSchemaDepth: 16,
  maxObjectKeys: 256,
  maxArrayLength: 1024,
  maxStringLength: 32768,
  maxPatternBytes: 256,
  maxValidationMs: 50,
  maxCompiledValidators: 256,
} as const

export type OutputSchemaValidationReason =
  | 'schema_invalid'
  | 'schema_unsupported'
  | 'schema_over_limit'
  | 'output_missing'
  | 'output_invalid'
  | 'output_over_limit'
  | 'pattern_unsafe'
  | 'validation_budget_exceeded'

export interface OutputSchemaValidationSuccess {
  ok: true
  value: unknown
  schemaSha256: string
}

export interface OutputSchemaValidationFailure {
  ok: false
  reason: OutputSchemaValidationReason
  message: string
  schemaSha256: string | null
}

export type OutputSchemaValidationResult =
  | OutputSchemaValidationSuccess
  | OutputSchemaValidationFailure

export interface ValidateTaskOutputOptions {
  templateId: number
  schema: unknown
  output: unknown
}

interface CacheEntry {
  validator: ValidateFunction
}

const ajv = new Ajv({
  strict: true,
  validateSchema: true,
  $data: false,
  validateFormats: false,
  allErrors: false,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
  addUsedSchema: false,
})

const validatorCache = new Map<string, CacheEntry>()
let cacheHits = 0
let cacheMisses = 0

const allowedSchemaKeywords = new Set([
  '$id',
  '$schema',
  '$ref',
  'additionalItems',
  'additionalProperties',
  'const',
  'default',
  'description',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'items',
  'maxItems',
  'maxLength',
  'maxProperties',
  'maximum',
  'minItems',
  'minLength',
  'minProperties',
  'minimum',
  'multipleOf',
  'not',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'title',
  'type',
])

export function clearOutputSchemaValidatorCacheForTests(): void {
  validatorCache.clear()
  cacheHits = 0
  cacheMisses = 0
}

export function getOutputSchemaValidatorCacheStatsForTests(): {
  size: number
  hits: number
  misses: number
  keys: string[]
} {
  return {
    size: validatorCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    keys: [...validatorCache.keys()],
  }
}

export function validateTaskOutput(options: ValidateTaskOutputOptions): OutputSchemaValidationResult {
  const schemaString = stableStringify(options.schema)
  if (schemaString === null) {
    return failure('schema_invalid', 'Output schema is not serializable', null)
  }

  const schemaSha256 = sha256(schemaString)
  if (byteLength(schemaString) > OUTPUT_SCHEMA_LIMITS.maxSchemaBytes) {
    return failure('schema_over_limit', 'Output schema exceeds size limit', schemaSha256)
  }

  const schemaLimit = inspectValue(options.schema, {
    mode: 'schema',
    depth: 0,
    seen: new Set<object>(),
    insideSchemaMap: false,
  })
  if (schemaLimit !== null) {
    return failure(schemaLimit.reason, schemaLimit.message, schemaSha256)
  }

  if (options.output === undefined || options.output === null) {
    return failure('output_missing', 'Task output is missing', schemaSha256)
  }

  const outputString = stableStringify(options.output)
  if (outputString === null) {
    return failure('output_invalid', 'Task output is not serializable', schemaSha256)
  }
  if (byteLength(outputString) > OUTPUT_SCHEMA_LIMITS.maxOutputBytes) {
    return failure('output_over_limit', 'Task output exceeds size limit', schemaSha256)
  }

  const outputLimit = inspectValue(options.output, {
    mode: 'output',
    depth: 0,
    seen: new Set<object>(),
    insideSchemaMap: false,
  })
  if (outputLimit !== null) {
    return failure(outputLimit.reason, outputLimit.message, schemaSha256)
  }

  const cacheKey = `${String(options.templateId)}:${schemaSha256}`
  const cached = validatorCache.get(cacheKey)
  let validator: ValidateFunction
  if (cached) {
    cacheHits += 1
    validatorCache.delete(cacheKey)
    validatorCache.set(cacheKey, cached)
    validator = cached.validator
  } else {
    cacheMisses += 1
    try {
      validator = ajv.compile(options.schema as Parameters<Ajv['compile']>[0])
    } catch (error) {
      const message = error instanceof Error && /unknown keyword|strict mode/i.test(error.message)
        ? 'Output schema uses unsupported JSON Schema features'
        : 'Output schema is invalid'
      const reason: OutputSchemaValidationReason = message.includes('unsupported') ? 'schema_unsupported' : 'schema_invalid'
      return failure(reason, message, schemaSha256)
    }
    validatorCache.set(cacheKey, { validator })
    evictOldestCacheEntries()
  }

  const start = performance.now()
  let valid = false
  try {
    valid = validator(options.output)
  } catch {
    return failure('output_invalid', 'Task output failed validation', schemaSha256)
  }
  const elapsed = performance.now() - start
  if (elapsed > OUTPUT_SCHEMA_LIMITS.maxValidationMs) {
    return failure('validation_budget_exceeded', 'Task output validation exceeded time budget', schemaSha256)
  }
  if (!valid) {
    return failure('output_invalid', 'Task output does not match schema', schemaSha256)
  }

  return {
    ok: true,
    value: boundedSuccessValue(options.output, outputString),
    schemaSha256,
  }
}

function evictOldestCacheEntries(): void {
  while (validatorCache.size > OUTPUT_SCHEMA_LIMITS.maxCompiledValidators) {
    const oldest = validatorCache.keys().next().value
    if (oldest === undefined) return
    validatorCache.delete(oldest)
  }
}

function boundedSuccessValue(value: unknown, serialized: string): unknown {
  if (byteLength(serialized) > 4096) return null
  return value
}

function failure(
  reason: OutputSchemaValidationReason,
  message: string,
  schemaSha256: string | null,
): OutputSchemaValidationFailure {
  return {
    ok: false,
    reason,
    message: message.slice(0, 240),
    schemaSha256,
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value: unknown): string | null {
  try {
    return JSON.stringify(sortForStableStringify(value))
  } catch {
    return null
  }
}

function sortForStableStringify(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) throw new Error('cycle')
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.map((item) => sortForStableStringify(item, seen))
    seen.delete(value)
    return result
  }

  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortForStableStringify((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return sorted
}

interface InspectState {
  mode: 'schema' | 'output'
  depth: number
  seen: Set<object>
  insideSchemaMap: boolean
}

function inspectValue(
  value: unknown,
  state: InspectState,
): { reason: OutputSchemaValidationReason; message: string } | null {
  if (typeof value === 'string') {
    if (state.mode === 'output' && value.length > OUTPUT_SCHEMA_LIMITS.maxStringLength) {
      return { reason: 'output_over_limit', message: 'Task output string exceeds length limit' }
    }
    return null
  }
  if (value === null || typeof value !== 'object') return null
  if (state.seen.has(value)) {
    return {
      reason: state.mode === 'schema' ? 'schema_invalid' : 'output_invalid',
      message: `${state.mode === 'schema' ? 'Output schema' : 'Task output'} contains a cycle`,
    }
  }

  if (state.depth > OUTPUT_SCHEMA_LIMITS.maxSchemaDepth) {
    return {
      reason: state.mode === 'schema' ? 'schema_over_limit' : 'output_over_limit',
      message: `${state.mode === 'schema' ? 'Output schema' : 'Task output'} exceeds depth limit`,
    }
  }

  state.seen.add(value)
  if (Array.isArray(value)) {
    if (value.length > OUTPUT_SCHEMA_LIMITS.maxArrayLength) {
      state.seen.delete(value)
      return {
        reason: state.mode === 'schema' ? 'schema_over_limit' : 'output_over_limit',
        message: `${state.mode === 'schema' ? 'Output schema' : 'Task output'} array exceeds length limit`,
      }
    }
    for (const item of value) {
      const result = inspectValue(item, { ...state, depth: state.depth + 1 })
      if (result) {
        state.seen.delete(value)
        return result
      }
    }
    state.seen.delete(value)
    return null
  }

  const objectValue = value as Record<string, unknown>
  const keys = Object.keys(objectValue)
  if (keys.length > OUTPUT_SCHEMA_LIMITS.maxObjectKeys) {
    state.seen.delete(value)
    return {
      reason: state.mode === 'schema' ? 'schema_over_limit' : 'output_over_limit',
      message: `${state.mode === 'schema' ? 'Output schema' : 'Task output'} object exceeds key limit`,
    }
  }

  for (const key of keys) {
    if (state.mode === 'schema') {
      if (key === '$data' || key === '$async') {
        state.seen.delete(value)
        return { reason: 'schema_unsupported', message: 'Output schema uses unsupported AJV features' }
      }
      if (key === '$ref' && typeof objectValue[key] === 'string' && !objectValue[key].startsWith('#')) {
        state.seen.delete(value)
        return { reason: 'schema_unsupported', message: 'Output schema uses unsupported remote references' }
      }
      if (!state.insideSchemaMap && !allowedSchemaKeywords.has(key)) {
        state.seen.delete(value)
        return { reason: 'schema_unsupported', message: 'Output schema uses unsupported JSON Schema keywords' }
      }
      if (key === 'pattern' && typeof objectValue[key] === 'string') {
        const safe = inspectPattern(objectValue[key])
        if (!safe) {
          state.seen.delete(value)
          return { reason: 'pattern_unsafe', message: 'Output schema pattern is outside the supported safe subset' }
        }
      }
    }

    const result = inspectValue(objectValue[key], {
      ...state,
      depth: state.depth + 1,
      insideSchemaMap: state.mode === 'schema' && isSchemaMapKeyword(key),
    })
    if (result) {
      state.seen.delete(value)
      return result
    }
  }

  state.seen.delete(value)
  return null
}

function isSchemaMapKeyword(key: string): boolean {
  return key === 'properties' || key === 'patternProperties' || key === 'definitions' || key === '$defs'
}

function inspectPattern(pattern: string): boolean {
  if (byteLength(pattern) > OUTPUT_SCHEMA_LIMITS.maxPatternBytes) return false
  if (/[|()]/.test(pattern)) return false
  if (/\(\?<?[=!]/.test(pattern)) return false
  if (/\\[1-9]|\\k</.test(pattern)) return false
  if (hasUnboundedWildcardOrQuantifier(pattern)) return false

  try {
    const regex = new RegExp(pattern)
    if (!safeRegex(regex)) return false
  } catch {
    return false
  }

  return true
}

function hasUnboundedWildcardOrQuantifier(pattern: string): boolean {
  let inClass = false
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const previous = index > 0 ? pattern[index - 1] : ''
    if (char === '[' && previous !== '\\') inClass = true
    if (char === ']' && previous !== '\\') inClass = false
    if (inClass) continue
    if (char === '*' || char === '+') return true
    if (char === '.' && (pattern[index + 1] === '*' || pattern[index + 1] === '+')) return true
  }
  return /\{\d+,\}/.test(pattern)
}
