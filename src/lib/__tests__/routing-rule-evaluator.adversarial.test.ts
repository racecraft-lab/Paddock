import { describe, expect, it } from 'vitest'

import { evaluateRoutingRules } from '../routing-rule-evaluator'

describe('evaluateRoutingRules adversarial rejection', () => {
  it('rejects JSONPath filters, scripts, prototype access, and dynamic execution hooks before traversal', () => {
    const expressions = [
      '$[?(@.status=="ready")] == true',
      '$[(@.length-1)] == "x"',
      '$.constructor == "Object"',
      '$.__proto__ == "polluted"',
      'Function("return true") == true',
      'eval("$.status") == "ready"',
      'require("node:vm") == true',
    ]

    for (const when of expressions) {
      const result = evaluateRoutingRules({
        output: { status: 'ready' },
        rules: [{ when, next_template_slug: 'unsafe' }],
      })

      expect(result, when).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })
      if (result.ok) throw new Error('expected routing expression rejection')
      expect(result.message, when).not.toContain(when)
    }
  })

  it('rejects unsupported operators, arithmetic, bitwise syntax, regex right sides, and oversized literals', () => {
    const expressions = [
      '$.score >= 1',
      '$.score + 1 == 2',
      '$.flags & 1 == 1',
      '$.name == /admin/',
      `$.name == "${'x'.repeat(33000)}"`,
      '$.status contains "ready"',
    ]

    for (const when of expressions) {
      const result = evaluateRoutingRules({
        output: { score: 1, flags: 1, name: 'admin', status: 'ready' },
        rules: [{ when, next_template_slug: 'unsafe' }],
      })

      expect(result, when).toMatchObject({ ok: false, reason: 'routing_expression_rejected' })
      expect(JSON.stringify(result), when).not.toContain('admin')
    }
  })
})
