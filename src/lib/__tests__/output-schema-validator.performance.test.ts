import { describe, expect, it } from 'vitest'

import {
  OUTPUT_SCHEMA_LIMITS,
  clearOutputSchemaValidatorCacheForTests,
  getOutputSchemaValidatorCacheStatsForTests,
  validateTaskOutput,
} from '../output-schema-validator'

describe('validateTaskOutput cache and fixed-corpus performance', () => {
  it('caches compiled validators by template and schema hash with LRU eviction at 256 entries', () => {
    clearOutputSchemaValidatorCacheForTests()

    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    }

    expect(validateTaskOutput({ templateId: 61, schema, output: { ok: true } })).toMatchObject({ ok: true })
    expect(validateTaskOutput({ templateId: 61, schema, output: { ok: false } })).toMatchObject({ ok: true })
    expect(getOutputSchemaValidatorCacheStatsForTests()).toMatchObject({ size: 1, hits: 1, misses: 1 })

    for (let index = 0; index <= OUTPUT_SCHEMA_LIMITS.maxCompiledValidators; index += 1) {
      validateTaskOutput({
        templateId: 1000 + index,
        schema: {
          type: 'object',
          properties: { [`field_${index}`]: { type: 'number' } },
          required: [`field_${index}`],
          additionalProperties: false,
        },
        output: { [`field_${index}`]: index },
      })
    }

    const stats = getOutputSchemaValidatorCacheStatsForTests()
    expect(stats.size).toBeLessThanOrEqual(OUTPUT_SCHEMA_LIMITS.maxCompiledValidators)
    expect(stats.keys.some((key) => key.startsWith('61:'))).toBe(false)
  })

  it('keeps p95 validation latency under the configured budget for the fixed corpus', () => {
    clearOutputSchemaValidatorCacheForTests()
    const schema = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'warn'] },
        id: { type: 'string', pattern: '^TASK-[0-9]{1,5}$' },
      },
      required: ['status', 'id'],
      additionalProperties: false,
    }
    const durations: number[] = []

    for (let index = 0; index < 40; index += 1) {
      const start = performance.now()
      const result = validateTaskOutput({
        templateId: 62,
        schema,
        output: { status: index % 2 === 0 ? 'ok' : 'warn', id: `TASK-${index}` },
      })
      durations.push(performance.now() - start)
      expect(result).toMatchObject({ ok: true })
    }

    const p95 = durations.sort((left, right) => left - right)[Math.floor(durations.length * 0.95)]
    expect(p95).toBeLessThan(OUTPUT_SCHEMA_LIMITS.maxValidationMs)
  })
})
