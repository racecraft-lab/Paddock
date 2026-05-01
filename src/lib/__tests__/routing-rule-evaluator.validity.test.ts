import { describe, expect, it } from 'vitest'

import { evaluateRoutingRules } from '../routing-rule-evaluator'

describe('evaluateRoutingRules validity', () => {
  it('evaluates the allowlisted boolean grammar in rule order', () => {
    const result = evaluateRoutingRules({
      output: { status: 'ready', score: 9, tags: ['security', 'p1'], approved: true },
      rules: [
        { when: '$.status == "blocked"', next_template_slug: 'blocked-review' },
        {
          when: '$.status == "ready" && $.score in [8, 9, 10] && !($.approved == false)',
          next_template_slug: 'ready-review',
        },
      ],
      fallbackNextTemplateSlug: 'fallback-review',
    })

    expect(result).toEqual({ ok: true, nextTemplateSlug: 'ready-review', matchedRuleIndex: 1 })
  })

  it('falls back or terminates on static no-match outcomes', () => {
    expect(
      evaluateRoutingRules({
        output: { status: 'done' },
        rules: [{ when: '$.status == "blocked"', next_template_slug: 'blocked-review' }],
        fallbackNextTemplateSlug: 'fallback-review',
      }),
    ).toEqual({ ok: true, nextTemplateSlug: 'fallback-review', matchedRuleIndex: null })

    expect(
      evaluateRoutingRules({
        output: { status: 'done' },
        rules: [{ when: '$.status == "blocked"', next_template_slug: 'blocked-review' }],
      }),
    ).toEqual({ ok: true, nextTemplateSlug: null, matchedRuleIndex: null })
  })

  it('rejects malformed JSONPath and stays bounded on unknown shapes', () => {
    const cases = ['$.missing[', '$..constructor', '$["__proto__"]']

    for (const when of cases) {
      const result = evaluateRoutingRules({
        output: Object.create(null) as unknown,
        rules: [{ when, next_template_slug: 'unsafe' }],
      })

      expect(result).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })
      expect(JSON.stringify(result)).not.toContain('Object.create')
    }
  })
})
