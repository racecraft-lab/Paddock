import { describe, expect, it } from 'vitest'
import {
  normalizeSchema,
  inferFieldType,
  extractSchemaTags,
  schemaType,
} from '@/lib/config-schema-utils'

describe('normalizeSchema', () => {
  it('passes through a simple string schema', () => {
    const s = { type: 'string' as const }
    expect(normalizeSchema(s)).toBe(s)
    expect(schemaType(normalizeSchema(s))).toBe('string')
  })

  it('preserves number constraints', () => {
    const s = { type: 'number' as const, minimum: 0, maximum: 100 }
    const result = normalizeSchema(s)
    expect(result).toBe(s)
    expect(result.minimum).toBe(0)
    expect(result.maximum).toBe(100)
  })

  it('passes through a boolean schema', () => {
    const s = { type: 'boolean' as const }
    expect(normalizeSchema(s)).toBe(s)
    expect(schemaType(normalizeSchema(s))).toBe('boolean')
  })

  it('converts enum variants into enumValues', () => {
    const s = { anyOf: [{ const: 'a' }, { const: 'b' }, { const: 'c' }] }
    const result = normalizeSchema(s)
    expect(result.enum).toEqual(['a', 'b', 'c'])
    expect(result.anyOf).toBeUndefined()
  })

  it('passes through array with string items', () => {
    const s = { type: 'array' as const, items: { type: 'string' as const } }
    const result = normalizeSchema(s)
    expect(result).toBe(s)
    expect(schemaType(result)).toBe('array')
  })

  it('passes through object with properties', () => {
    const s = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        age: { type: 'number' as const },
      },
    }
    const result = normalizeSchema(s)
    expect(result).toBe(s)
    expect(schemaType(result)).toBe('object')
    expect(result.properties).toBeDefined()
  })

  it('resolves anyOf with null to nullable string', () => {
    const s = {
      title: 'Optional Name',
      anyOf: [{ type: 'string' as const }, { type: 'null' as const }],
    }
    const result = normalizeSchema(s)
    expect(result.nullable).toBe(true)
    expect(schemaType(result)).toBe('string')
    expect(result.anyOf).toBeUndefined()
    expect(result.title).toBe('Optional Name')
  })

  it('resolves oneOf with null to nullable type', () => {
    const s = {
      description: 'Nullable number',
      oneOf: [{ type: 'number' as const }, { type: 'null' as const }],
    }
    const result = normalizeSchema(s)
    expect(result.nullable).toBe(true)
    expect(schemaType(result)).toBe('number')
  })

  it('collapses enum entries with null into nullable enum', () => {
    const s = {
      anyOf: [{ enum: ['x', 'y', null] }],
    }
    const result = normalizeSchema(s)
    expect(result.enum).toEqual(['x', 'y'])
    expect(result.nullable).toBe(true)
  })

  it('returns original schema when union cannot be simplified', () => {
    const s = {
      anyOf: [
        { type: 'string' as const },
        { type: 'number' as const },
      ],
    }
    const result = normalizeSchema(s)
    expect(result).toBe(s)
  })
})

describe('inferFieldType', () => {
  it('infers string from a string value', () => {
    expect(inferFieldType('hello')).toBe('string')
  })

  it('infers number from a numeric value', () => {
    expect(inferFieldType(42)).toBe('number')
  })

  it('infers boolean from a boolean value', () => {
    expect(inferFieldType(true)).toBe('boolean')
  })

  it('infers array from an array value', () => {
    expect(inferFieldType([1, 2, 3])).toBe('array')
  })

  it('infers object from a plain object', () => {
    expect(inferFieldType({ a: 1 })).toBe('object')
  })

  it('defaults to string for null', () => {
    expect(inferFieldType(null)).toBe('string')
  })

  it('defaults to string for undefined', () => {
    expect(inferFieldType(undefined)).toBe('string')
  })
})

describe('extractSchemaTags', () => {
  it('extracts x-tags from schema', () => {
    const s = { 'x-tags': ['security', 'auth'] }
    expect(extractSchemaTags(s)).toEqual(['security', 'auth'])
  })

  it('extracts tags field when x-tags is absent', () => {
    const s = { tags: ['network'] }
    expect(extractSchemaTags(s)).toEqual(['network'])
  })

  it('returns empty array for schema without tags', () => {
    const s = { type: 'string' as const }
    expect(extractSchemaTags(s)).toEqual([])
  })

  it('collects tags from nested properties', () => {
    const s = {
      type: 'object' as const,
      'x-tags': ['top'],
      properties: {
        child: { type: 'string' as const, 'x-tags': ['nested'] },
      },
    }
    const tags = extractSchemaTags(s)
    expect(tags).toContain('top')
    expect(tags).toContain('nested')
  })

  it('collects tags from array items', () => {
    const s = {
      type: 'array' as const,
      items: { type: 'string' as const, 'x-tags': ['item-tag'] },
    }
    expect(extractSchemaTags(s)).toEqual(['item-tag'])
  })

  it('lowercases all tags', () => {
    const s = { 'x-tags': ['Security', 'AUTH'] }
    expect(extractSchemaTags(s)).toEqual(['security', 'auth'])
  })

  it('deduplicates tags', () => {
    const s = {
      type: 'object' as const,
      'x-tags': ['auth'],
      properties: {
        child: { type: 'string' as const, 'x-tags': ['Auth'] },
      },
    }
    expect(extractSchemaTags(s)).toEqual(['auth'])
  })
})

describe('schemaType', () => {
  it('returns undefined for undefined schema', () => {
    expect(schemaType(undefined)).toBeUndefined()
  })

  it('returns type from simple schema', () => {
    expect(schemaType({ type: 'string' })).toBe('string')
  })

  it('filters null from type array', () => {
    expect(schemaType({ type: ['string', 'null'] })).toBe('string')
  })

  it('infers object from properties', () => {
    expect(schemaType({ properties: { a: { type: 'string' } } })).toBe('object')
  })

  it('infers object from additionalProperties', () => {
    expect(schemaType({ additionalProperties: { type: 'string' } })).toBe('object')
  })
})
