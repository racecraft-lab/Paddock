import { describe, expect, it } from 'vitest'

import { validateTaskOutput } from '../output-schema-validator'

describe('validateTaskOutput conservative pattern subset', () => {
  it('accepts literals, anchors, character classes, and bounded quantifiers', () => {
    const schema = {
      type: 'object',
      properties: {
        ticket: { type: 'string', pattern: '^TASK-[0-9]{2,4}$' },
        slug: { type: 'string', pattern: '^[a-z][a-z0-9_-]{2,12}$' },
      },
      required: ['ticket', 'slug'],
      additionalProperties: false,
    }

    expect(
      validateTaskOutput({
        templateId: 51,
        schema,
        output: { ticket: 'TASK-042', slug: 'route_2' },
      }),
    ).toMatchObject({ ok: true })

    expect(
      validateTaskOutput({
        templateId: 51,
        schema,
        output: { ticket: 'TASK-ABCDE', slug: 'route_2' },
      }),
    ).toMatchObject({ ok: false, reason: 'output_invalid' })
  })

  it('rejects nested quantifiers, lookaround, backreferences, unbounded wildcards, and ambiguous alternation', () => {
    const nestedQuantifierPattern = ['^(', 'a+', ')+$'].join('')
    const patterns = [
      nestedQuantifierPattern,
      '^(?=safe).+$',
      '^(a)\\1$',
      '^.*secret$',
      '^(foo|foobar)$',
      '^(foo|bar|baz)$',
    ]

    for (const pattern of patterns) {
      const result = validateTaskOutput({
        templateId: 52,
        schema: { type: 'string', pattern },
        output: 'foobar',
      })

      expect(result, pattern).toMatchObject({ ok: false, reason: 'pattern_unsafe' })
    }
  })

  it('returns a validation-budget result without exposing the candidate output', () => {
    const output = 'x'.repeat(32000)
    const result = validateTaskOutput({
      templateId: 53,
      schema: { type: 'string', pattern: '^[x]{1,32768}$' },
      output,
    })

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain(output)
  })
})
