import { describe, expect, it } from 'vitest'

import { validateTaskOutput } from '../output-schema-validator'

describe('validateTaskOutput AJV safety profile', () => {
  it('does not mutate output by applying defaults, coercion, or additional-property removal', () => {
    const output = { count: '7', extra: 'kept' }
    const result = validateTaskOutput({
      templateId: 41,
      schema: {
        type: 'object',
        properties: {
          count: { type: 'number' },
          defaulted: { type: 'string', default: 'unsafe' },
        },
        required: ['count'],
        additionalProperties: false,
      },
      output,
    })

    expect(result).toMatchObject({ ok: false, reason: 'output_invalid' })
    expect(output).toEqual({ count: '7', extra: 'kept' })
    expect(JSON.stringify(result)).not.toContain('extra')
  })

  it('uses strict schema validation and rejects unsupported AJV features', () => {
    const cases = [
      {
        name: '$data',
        schema: { type: 'object', const: { $data: '1/value' } },
      },
      {
        name: 'async',
        schema: { $async: true, type: 'object' },
      },
      {
        name: 'remote ref',
        schema: { $ref: 'https://example.com/schema.json' },
      },
      {
        name: 'custom keyword',
        schema: { type: 'string', transform: ['trim'] },
      },
    ]

    for (const testCase of cases) {
      const result = validateTaskOutput({
        templateId: 42,
        schema: testCase.schema,
        output: 'value',
      })

      expect(result, testCase.name).toMatchObject({ ok: false })
      expect(['schema_invalid', 'schema_unsupported']).toContain(result.ok ? 'unexpected' : result.reason)
      expect(JSON.stringify(result), testCase.name).not.toContain('https://example.com/schema.json')
    }
  })

  it('does not register formats or report exhaustive error internals', () => {
    const output = { email: 'not-an-email', age: 'old', enabled: 'yes' }
    const result = validateTaskOutput({
      templateId: 43,
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          age: { type: 'number' },
          enabled: { type: 'boolean' },
        },
        required: ['email', 'age', 'enabled'],
        additionalProperties: false,
      },
      output,
    })

    expect(result).toMatchObject({ ok: false, reason: 'output_invalid' })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('not-an-email')
    expect(serialized).not.toContain('enabled')
  })
})
