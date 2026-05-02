import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const TASK_STATUS_PATH = 'src/lib/task-status.ts'

describe('SPEC-005 config scope', () => {
  it('plans task-status for strict TypeScript checking', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.spec-strict.json', 'utf8')) as {
      include?: string[]
    }

    expect(tsconfig.include).toContain(TASK_STATUS_PATH)
  })

  it('plans task-status for strict linting', () => {
    const eslintConfig = readFileSync('eslint.config.mjs', 'utf8')

    expect(eslintConfig).toContain(`'${TASK_STATUS_PATH}'`)
  })
})
