import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ownedRuntimeFiles = [
  'src/lib/task-dispatch.ts',
  'src/app/api/quality-review/route.ts',
  'src/app/api/tasks/route.ts',
  'src/app/api/tasks/[id]/route.ts',
]

describe('Task pipeline downstream scope guard', () => {
  it('does not implement later-spec terminal states, area routing, artifact publishing, governance, pilot, or CrabTrap behavior', () => {
    const source = ownedRuntimeFiles
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/\bready_for_owner\b/)
    expect(source).not.toMatch(/\barea:\*/)
    // SPEC-007 lands disposition logging + artifact dispatch hooks in task-dispatch.ts
    // (FR-011 runPostCommitDispositionInsert; FR-040 metadata.input_artifacts; FR-090
    // evaluateSpec007AegisSignals pre-flight). The previous "no task_artifacts /
    // task_dispositions" guard was a SPEC-004-era constraint that SPEC-007 explicitly
    // supersedes — task-dispatch.ts is the documented integration point per FR-011/FR-040.
    // The legitimate boundary checks remaining (ready_for_owner, area routing,
    // resource_policies, pilot, CrabTrap) all still hold.
    expect(source).not.toMatch(/\bresource_policies\b/)
    expect(source).not.toMatch(/\bPILOT_PRODUCT_LINE_A_E2E\b/)
    expect(source).not.toMatch(/\bCrabTrap\b/i)
  })
})
