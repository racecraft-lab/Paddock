import { describe, expect, it } from 'vitest'

import { OUTPUT_SCHEMA_LIMITS, validateTaskOutput } from '../output-schema-validator'

function schemaWithNestedObjects(depth: number): unknown {
  let schema: Record<string, unknown> = { type: 'string' }
  for (let index = 0; index < depth; index += 1) {
    schema = {
      type: 'object',
      properties: { value: schema },
      required: ['value'],
      additionalProperties: false,
    }
  }
  return schema
}

describe('validateTaskOutput bounds', () => {
  it('accepts compact structured output under the configured caps', () => {
    const result = validateTaskOutput({
      templateId: 31,
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pass'] },
          score: { type: 'number' },
        },
        required: ['status', 'score'],
        additionalProperties: false,
      },
      output: { status: 'pass', score: 0.97 },
    })

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.value).toEqual({ status: 'pass', score: 0.97 })
      expect(result.schemaSha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('rejects missing output without throwing or leaking a payload', () => {
    const result = validateTaskOutput({
      templateId: 32,
      schema: { type: 'object' },
      output: undefined,
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'output_missing',
      schemaSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(result).not.toHaveProperty('value')
    expect(JSON.stringify(result)).not.toContain('stack')
  })

  it('rejects oversized schema, output, depth, keys, arrays, strings, and patterns before AJV work', () => {
    const cases = [
      {
        name: 'schema bytes',
        schema: { type: 'object', description: 'x'.repeat(OUTPUT_SCHEMA_LIMITS.maxSchemaBytes) },
        output: {},
        reason: 'schema_over_limit',
      },
      {
        name: 'output bytes',
        schema: { type: 'object' },
        output: { data: 'x'.repeat(OUTPUT_SCHEMA_LIMITS.maxOutputBytes) },
        reason: 'output_over_limit',
      },
      {
        name: 'schema depth',
        schema: schemaWithNestedObjects(OUTPUT_SCHEMA_LIMITS.maxSchemaDepth + 1),
        output: {},
        reason: 'schema_over_limit',
      },
      {
        name: 'object keys',
        schema: { type: 'object' },
        output: Object.fromEntries(
          Array.from({ length: OUTPUT_SCHEMA_LIMITS.maxObjectKeys + 1 }, (_, index) => [`k${index}`, index]),
        ),
        reason: 'output_over_limit',
      },
      {
        name: 'array length',
        schema: { type: 'array', items: { type: 'number' } },
        output: Array.from({ length: OUTPUT_SCHEMA_LIMITS.maxArrayLength + 1 }, (_, index) => index),
        reason: 'output_over_limit',
      },
      {
        name: 'string length',
        schema: { type: 'string' },
        output: 'x'.repeat(OUTPUT_SCHEMA_LIMITS.maxStringLength + 1),
        reason: 'output_over_limit',
      },
      {
        name: 'pattern length',
        schema: { type: 'string', pattern: 'a'.repeat(OUTPUT_SCHEMA_LIMITS.maxPatternBytes + 1) },
        output: 'a',
        reason: 'pattern_unsafe',
      },
    ] as const

    for (const testCase of cases) {
      const result = validateTaskOutput({
        templateId: 33,
        schema: testCase.schema,
        output: testCase.output,
      })

      expect(result, testCase.name).toMatchObject({
        ok: false,
        reason: testCase.reason,
      })
      expect(JSON.stringify(result), testCase.name).not.toContain('x'.repeat(128))
    }
  })

  it('returns bounded schema_invalid for malformed schemas', () => {
    const result = validateTaskOutput({
      templateId: 34,
      schema: { type: 'definitely-not-json-schema' },
      output: 'value',
    })

    expect(result).toMatchObject({ ok: false, reason: 'schema_invalid' })
    if (result.ok) throw new Error('expected schema_invalid failure')
    expect(result.message.length).toBeLessThanOrEqual(240)
  })
})
