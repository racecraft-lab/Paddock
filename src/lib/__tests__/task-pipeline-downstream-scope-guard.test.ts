import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ownedRuntimeFiles = [
  'src/lib/task-dispatch.ts',
  'src/app/api/quality-review/route.ts',
  'src/app/api/tasks/route.ts',
  'src/app/api/tasks/[id]/route.ts',
]

describe('SPEC-004 downstream scope guard', () => {
  it('does not implement later-spec terminal states, area routing, artifact publishing, governance, pilot, or CrabTrap behavior', () => {
    const source = ownedRuntimeFiles
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/\bready_for_owner\b/)
    expect(source).not.toMatch(/\barea:\*/)
    expect(source).not.toMatch(/\btask_artifacts\b/)
    expect(source).not.toMatch(/\btask_dispositions\b/)
    expect(source).not.toMatch(/\bresource_policies\b/)
    expect(source).not.toMatch(/\bPILOT_PRODUCT_LINE_A_E2E\b/)
    expect(source).not.toMatch(/\bCrabTrap\b/i)
  })
})
