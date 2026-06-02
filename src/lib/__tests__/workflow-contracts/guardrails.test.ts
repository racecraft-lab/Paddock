import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? filesUnder(full) : [full]
  })
}

describe('workflow contract guardrails', () => {
  it('does not import forbidden runtime execution surfaces', () => {
    const root = path.join(process.cwd(), 'src/lib/workflow-contracts')
    const source = filesUnder(root).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toMatch(/from ['"][^'"]*(resource-governance|github-sync|task-dispatch|scheduler|harness|spawn)/)
    expect(source).not.toContain('PILOT_PADDOCK_E2E')
  })
})
