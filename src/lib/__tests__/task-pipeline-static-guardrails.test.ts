import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const strictScopeFiles = ['src/lib/output-schema-validator.ts', 'src/lib/routing-rule-evaluator.ts'] as const

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('Task pipeline static guardrails', () => {
  it('excludes ajv-formats imports and registration from strict-scope validator code', () => {
    const validator = source('src/lib/output-schema-validator.ts')

    expect(validator).not.toMatch(/ajv-formats/)
    expect(validator).toMatch(/validateFormats\s*:\s*false/)
    expect(validator).toMatch(/\$data\s*:\s*false/)
  })

  it('keeps unsafe execution primitives out of validator and routing evaluator source', () => {
    const combined = strictScopeFiles.map((path) => source(path)).join('\n')

    expect(combined).not.toMatch(/\beval\s*\(/)
    expect(combined).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/)
    expect(combined).not.toMatch(/from\s+['"]node:vm['"]|from\s+['"]vm['"]|require\(['"]vm['"]\)/)
    expect(combined).not.toMatch(/from\s+['"]vm2['"]|require\(['"]vm2['"]\)/)
    expect(combined).not.toMatch(/\bwith\s*\(/)
    expect(combined).not.toMatch(/require\s*\(\s*[^'"]/)
  })

  it('documents conservative pattern enforcement and JSONPath script rejection in source', () => {
    expect(source('src/lib/output-schema-validator.ts')).toMatch(/pattern_unsafe/)
    expect(source('src/lib/routing-rule-evaluator.ts')).toMatch(/routing_expression_rejected/)
    expect(source('src/lib/routing-rule-evaluator.ts')).toMatch(/eval\s*:\s*false/)
  })
})
