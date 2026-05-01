import { describe, expect, it } from 'vitest'

import { ROUTING_RULE_LIMITS, evaluateRoutingRules } from '../routing-rule-evaluator'

describe('evaluateRoutingRules budgets', () => {
  it('enforces pre-validation caps for rule count, expression bytes, token count, and nesting', () => {
    const cases = [
      {
        name: 'rules',
        rules: Array.from({ length: ROUTING_RULE_LIMITS.maxRoutingRules + 1 }, () => ({
          when: '$.ok == true',
          next_template_slug: 'next',
        })),
      },
      {
        name: 'expression bytes',
        rules: [{ when: `$.value == "${'x'.repeat(ROUTING_RULE_LIMITS.maxRoutingExpressionBytes)}"`, next_template_slug: 'next' }],
      },
      {
        name: 'tokens',
        rules: [
          {
            when: Array.from({ length: 130 }, () => '$.ok == true').join(' && '),
            next_template_slug: 'next',
          },
        ],
      },
      {
        name: 'nesting',
        rules: [
          {
            when: `${'!('.repeat(ROUTING_RULE_LIMITS.maxBooleanNestingDepth + 1)}$.ok == true${')'.repeat(
              ROUTING_RULE_LIMITS.maxBooleanNestingDepth + 1,
            )}`,
            next_template_slug: 'next',
          },
        ],
      },
    ] as const

    for (const testCase of cases) {
      const result = evaluateRoutingRules({ output: { ok: true, value: 'x' }, rules: [...testCase.rules] })

      expect(result, testCase.name).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })
    }
  })

  it('enforces JSONPath length, JSONPath result, literal size, and rule-evaluation budgets', () => {
    const resultPathLength = evaluateRoutingRules({
      output: { ok: true },
      rules: [{ when: `$.${'a'.repeat(ROUTING_RULE_LIMITS.maxJsonPathBytes)} == true`, next_template_slug: 'next' }],
    })
    expect(resultPathLength).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })

    const resultCount = evaluateRoutingRules({
      output: { values: Array.from({ length: ROUTING_RULE_LIMITS.maxJsonPathResults + 1 }, () => 'ready') },
      rules: [{ when: '$.values[*] == "ready"', next_template_slug: 'next' }],
    })
    expect(resultCount).toMatchObject({ ok: false, reason: 'routing_budget_exceeded' })

    const literalSize = evaluateRoutingRules({
      output: { value: 'x' },
      rules: [{ when: `$.value in ["${'x'.repeat(ROUTING_RULE_LIMITS.maxLiteralBytes)}"]`, next_template_slug: 'next' }],
    })
    expect(literalSize).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })

    const manyRules = evaluateRoutingRules({
      output: { value: 'no' },
      rules: Array.from({ length: ROUTING_RULE_LIMITS.maxRoutingRules }, (_, index) => ({
        when: `$.items[*] == "missing-${index}"`,
        next_template_slug: `next-${index}`,
      })),
      fallbackNextTemplateSlug: 'fallback',
    })
    expect(manyRules).toMatchObject({ ok: false, reason: 'routing_budget_exceeded' })
  })
})
